// src/server.js
// Express webhook server — the single entry point.
//
// Slack sends POST /slack/events for every message.
// We verify the signature, ACK with 200 immediately,
// then run the Gemini agent in the background and post the reply.

import express from 'express';
import { runAgent } from './agent.js';
import { verifySlackSignature, postThinking, updateMessage, postMessage } from './slack.js';
import { disconnectMCP } from './mcpClient.js';
import * as dotenv from 'dotenv';
dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Validate required env vars on startup ────────────────────────────────────

const REQUIRED = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'GEMINI_API_KEY',
  'ENSO_BASE_URL',
  'ENSO_CLIENT_KEY',
  'ENSO_CLIENT_SECRET',
  'ENSO_USERNAME',
  'MCP_SERVER_PATH',
];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ── Raw body middleware ────────────────────────────────────────────────────────
// Must come BEFORE express.json().
// Captures raw bytes as a string so verifySlackSignature() can recompute the HMAC.

app.use((req, res, next) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    req.rawBody = raw;
    try   { req.body = JSON.parse(raw); }
    catch { req.body = {}; }
    next();
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────
// Slack retries events if your server is slow to respond (agent can take > 3 s).
// We track event IDs we've already handled and skip duplicates.

const processedEvents = new Set();

function isDuplicate(eventId) {
  if (!eventId || processedEvents.has(eventId)) return true;
  processedEvents.add(eventId);
  setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000);
  return false;
}

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    model:     process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    mcpServer: process.env.MCP_SERVER_PATH || 'not set',
    timestamp: new Date().toISOString(),
  });
});

// ── Slack Events endpoint ─────────────────────────────────────────────────────

app.post('/slack/events', async (req, res) => {
  const body = req.body;

  // ── URL verification (one-time during Slack app setup) ────────────────────
  if (body.type === 'url_verification') {
    console.log('✅ Slack URL verified');
    return res.json({ challenge: body.challenge });
  }

  // ── Signature check ────────────────────────────────────────────────────────
  if (!verifySlackSignature(req)) {
    console.warn('⚠ Invalid Slack signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── ACK Slack immediately (must respond within 3 s) ───────────────────────
  res.status(200).send('OK');

  const event = body.event;
  if (!event) return;

  // Only handle plain text messages
  if (event.type !== 'message') return;

  // Skip bot messages — prevents the agent replying to itself
  if (event.bot_id || event.subtype === 'bot_message') return;

  const userMessage = event.text?.trim();
  if (!userMessage) return;

  // Skip duplicates (Slack retries)
  if (isDuplicate(body.event_id)) {
    console.log(`↩ Duplicate event skipped: ${body.event_id}`);
    return;
  }

  const channel  = event.channel;
  const threadTs = event.thread_ts || event.ts; // reply in same thread

  console.log(`\n💬 [${new Date().toLocaleTimeString()}] "${userMessage}"`);

  // ── Process after ACK ─────────────────────────────────────────────────────
  setImmediate(async () => {

    // Post "Thinking..." for immediate user feedback
    let thinkingMsg;
    try {
      thinkingMsg = await postThinking({ channel, threadTs });
    } catch (err) {
      console.error('Could not post thinking message:', err.message);
    }

    // Run the Gemini agent (may take several seconds with multiple tool calls)
    let reply;
    try {
      reply = await runAgent(userMessage);
    } catch (err) {
      reply = `❌ Error: ${err.message}`;
      console.error('Agent error:', err);
    }

    // Replace "Thinking..." with the real reply
    try {
      if (thinkingMsg?.ts) {
        await updateMessage({ channel, ts: thinkingMsg.ts, text: reply });
      } else {
        await postMessage({ channel, text: reply, threadTs });
      }
    } catch (err) {
      console.error('Could not update message:', err.message);
      try { await postMessage({ channel, text: reply, threadTs }); } catch { /* ignore */ }
    }

    console.log(`✅ Replied: ${reply.slice(0, 120)}`);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGINT',  async () => { await disconnectMCP(); process.exit(0); });
process.on('SIGTERM', async () => { await disconnectMCP(); process.exit(0); });

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
🤖 Enso AI Agent running
   → Webhook:  http://localhost:${PORT}/slack/events
   → Health:   http://localhost:${PORT}/health
   → Model:    ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}
   → MCP:      ${process.env.MCP_SERVER_PATH}
  `);
});

export default app;
