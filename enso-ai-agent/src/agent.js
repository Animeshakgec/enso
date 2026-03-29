
import { GoogleGenAI } from '@google/genai';
import { getMCPToolsForGemini, callMCPTool } from './mcpClient.js';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const MAX_ROUNDS = 10;

const auth = {
  loggedIn: false,
  expiresAt: null, // ms epoch
};

// ── Login ─────────────────────────────────────────────────────────────────────

async function ensoLogin() {
  const clientKey = process.env.ENSO_CLIENT_KEY;
  const clientSecret = process.env.ENSO_CLIENT_SECRET;
  const username = process.env.ENSO_USERNAME;

  if (!clientKey || !clientSecret || !username) {
    throw new Error(
      'Missing ENSO_CLIENT_KEY / ENSO_CLIENT_SECRET / ENSO_USERNAME in .env'
    );
  }

  console.log('🔐 Logging in to Enso...');
  const result = await callMCPTool('enso_login', { clientKey, clientSecret, username });

  if (!result.includes('Login successful')) {
    throw new Error(`Enso login failed:\n${result}`);
  }

  const match = result.match(/Token expires at:\s*(\S+)/);
  auth.loggedIn = true;
  auth.expiresAt = match ? new Date(match[1]).getTime() : Date.now() + 3540_000;

  console.log('✅ Enso login successful. Expires:', new Date(auth.expiresAt).toISOString());
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function ensoRefresh() {
  console.log('🔄 Refreshing Enso token...');
  const result = await callMCPTool('enso_refresh_token', {});

  if (result.includes('Token refreshed')) {
    const match = result.match(/Expires at:\s*(\S+)/);
    auth.expiresAt = match ? new Date(match[1]).getTime() : Date.now() + 3540_000;
    console.log('✅ Token refreshed. Expires:', new Date(auth.expiresAt).toISOString());
    return true;
  }

  console.warn('⚠ Token refresh failed:', result);
  return false;
}

async function ensureAuth() {
  // Not logged in yet → full login
  if (!auth.loggedIn) {
    await ensoLogin();
    return;
  }

  // Token expires within the next 60 seconds → refresh
  const expired = !auth.expiresAt || Date.now() >= auth.expiresAt - 60_000;
  if (expired) {
    const ok = await ensoRefresh();
    if (!ok) {
      // Refresh failed → re-login
      auth.loggedIn = false;
      auth.expiresAt = null;
      await ensoLogin();
    }
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `
You are an intelligent assistant for the Enso platform, connected via Slack.
You can manage contracts, customers, entities, invoices, metering, and more.

Rules:
- ALWAYS use tools to get real data — never make up values.
- You are already authenticated; do NOT call enso_login or enso_refresh_token yourself.
- Format responses clearly for Slack:
  • Use *bold* for headings
  • Use bullet points for lists
  • Use emoji where helpful 📄 ✅ ❌ 💰
- Keep replies concise — Slack is not a document editor.
- Today's date: ${new Date().toISOString().split('T')[0]}
- If a tool returns an error, explain it clearly and suggest a fix.
`.trim();

// ── Tool cache — loaded once per process ──────────────────────────────────────

let cachedTools = null;

async function getTools() {
  if (!cachedTools) {
    cachedTools = await getMCPToolsForGemini();
    const count = cachedTools[0]?.functionDeclarations?.length ?? 0;
    console.log(`📦 Loaded ${count} MCP tools`);
  }
  return cachedTools;
}

// ── Main agent entry point ────────────────────────────────────────────────────

/**
 * Run the Gemini agentic loop for one Slack message.
 *
 * @param {string} userMessage - Raw text from Slack
 * @returns {Promise<string>}  - Final reply to post back to Slack
 */
export async function runAgent(userMessage) {
  // 1. Ensure the Enso token is fresh before we start
  await ensureAuth();

  // 2. Load tools (cached after first call)
  const tools = await getTools();

  // 3. Build initial contents
  const contents = [
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;

    // ── Call Gemini ──────────────────────────────────────────────────────────
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools,
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) return 'No response from Gemini. Please try again.';

    const parts = candidate.content?.parts ?? [];
    contents.push({ role: 'model', parts });
    const fnCallParts = parts.filter((p) => p.functionCall);

    if (fnCallParts.length === 0) {
      // No tool calls → model is done; return text
      const reply = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('\n')
        .trim();
      return reply || 'Done.';
    }
    const fnResponseParts = [];

    for (const part of fnCallParts) {
      const { name, args } = part.functionCall;
      console.log(`  🔧 ${name}(${JSON.stringify(args)})`);

      let result;
      try {
        result = await callMCPTool(name, args ?? {});
      } catch (err) {
        result = `ERROR calling ${name}: ${err.message}`;
        console.error(`  ❌ Tool error (${name}):`, err.message);
      }

      console.log(`  ✓ ${String(result).slice(0, 160)}`);

      fnResponseParts.push({
        functionResponse: {
          name,
          response: { result: String(result) },
        },
      });
    }
    contents.push({ role: 'function', parts: fnResponseParts });

  }

  return 'Sorry, I took too many steps. Please try a simpler request.';
}
