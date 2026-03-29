
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

export function verifySlackSignature(req) {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  const rawBody = req.rawBody;

  if (!timestamp || !signature || !rawBody) return false;


  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;
  const expected = 'v0=' + crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex');


  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}


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


export async function postThinking({ channel, threadTs = null }) {
  return postMessage({ channel, text: '_🤔 Thinking..._', threadTs });
}

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
