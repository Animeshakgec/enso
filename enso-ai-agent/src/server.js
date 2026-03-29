
import express from 'express';
import { runAgent } from './agent.js';
import { verifySlackSignature, postThinking, updateMessage, postMessage } from './slack.js';
import { disconnectMCP } from './mcpClient.js';
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;


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


app.use((req, res, next) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    req.rawBody = raw;
    try { req.body = JSON.parse(raw); }
    catch { req.body = {}; }
    next();
  });
});

const processedEvents = new Set();

function isDuplicate(eventId) {
  if (!eventId || processedEvents.has(eventId)) return true;
  processedEvents.add(eventId);
  setTimeout(() => processedEvents.delete(eventId), 5 * 60 * 1000);
  return false;
}
// ── Slack Events endpoint ─────────────────────────────────────────────────────

app.post('/slack/events', async (req, res) => {
  const body = req.body;
  if (body.type === 'url_verification') {
    console.log('✅ Slack URL verified');
    return res.json({ challenge: body.challenge });
  }

  if (!verifySlackSignature(req)) {
    console.warn('⚠ Invalid Slack signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  res.status(200).send('OK');

  const event = body.event;
  if (!event) return;

  if (event.type !== 'message') return;

  if (event.bot_id || event.subtype === 'bot_message') return;

  const userMessage = event.text?.trim();
  if (!userMessage) return;


  if (isDuplicate(body.event_id)) {
    console.log(`↩ Duplicate event skipped: ${body.event_id}`);
    return;
  }

  const channel = event.channel;
  const threadTs = event.thread_ts || event.ts;

  console.log(`\n💬 [${new Date().toLocaleTimeString()}] "${userMessage}"`);

  setImmediate(async () => {
    let thinkingMsg;
    try {
      thinkingMsg = await postThinking({ channel, threadTs });
    } catch (err) {
      console.error('Could not post thinking message:', err.message);
    }

    let reply;
    try {
      reply = await runAgent(userMessage);
    } catch (err) {
      reply = `❌ Error: ${err.message}`;
      console.error('Agent error:', err);
    }

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


process.on('SIGINT', async () => { await disconnectMCP(); process.exit(0); });
process.on('SIGTERM', async () => { await disconnectMCP(); process.exit(0); });

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
