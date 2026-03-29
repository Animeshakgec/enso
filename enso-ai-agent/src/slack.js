// src/slack.js
// Slack helpers: signature verification + message posting/updating.
// No Socket Mode — uses plain webhook (Express) approach.
// Only needs SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET.

import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN     = process.env.SLACK_BOT_TOKEN;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// ── Verify Slack's HMAC-SHA256 signature ──────────────────────────────────────
//
// Every Slack webhook includes:
//   X-Slack-Request-Timestamp  — unix timestamp when Slack sent it
//   X-Slack-Signature          — HMAC-SHA256 of "v0:{timestamp}:{rawBody}"
//
// We recompute the HMAC using our Signing Secret.
// If it matches → request is from Slack.  If not → reject it.

export function verifySlackSignature(req) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  const rawBody   = req.rawBody; // captured in server.js before JSON parsing

  if (!timestamp || !signature || !rawBody) return false;

  // Reject requests older than 5 minutes — prevents replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  // Recompute expected signature
  const expected = 'v0=' + crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex');

  // Constant-time comparison prevents timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Post a new message to a Slack channel ─────────────────────────────────────

export async function postMessage({ channel, text, threadTs = null }) {
  if (!BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN not set in .env');

  const body = {
    channel,
    text,
    unfurl_links: false,
    unfurl_media: false,
  };

  if (threadTs) body.thread_ts = threadTs;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(`Slack postMessage error: ${json.error}`);
  return json;
}

// ── Post a "Thinking..." placeholder ─────────────────────────────────────────
// Gives the user immediate feedback while the agent works.
// Replaced by the real answer via updateMessage().

export async function postThinking({ channel, threadTs = null }) {
  return postMessage({ channel, text: '_🤔 Thinking..._', threadTs });
}

// ── Replace an existing message with new text ─────────────────────────────────
// Swaps "Thinking..." → real reply so the user sees one clean message.

export async function updateMessage({ channel, ts, text }) {
  if (!BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN not set in .env');

  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, ts, text }),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(`Slack updateMessage error: ${json.error}`);
  return json;
}
