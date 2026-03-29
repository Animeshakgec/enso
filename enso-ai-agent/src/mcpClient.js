// src/mcpClient.js

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as dotenv from 'dotenv';
dotenv.config();

let mcpClient = null;
let mcpTransport = null;

export async function connectMCP() {
  if (mcpClient) return mcpClient;

  const serverPath = process.env.MCP_SERVER_PATH;
  if (!serverPath) {
    throw new Error('MCP_SERVER_PATH is not set in .env');
  }

  console.log(`🔌 Spawning MCP server: ${serverPath}`);

  mcpTransport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: { ...process.env },
  });

  mcpClient = new Client(
    { name: 'enso-ai-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  await mcpClient.connect(mcpTransport);
  console.log('✅ MCP server connected');
  return mcpClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini rejects these JSON Schema keywords with 400 Bad Request.
// The MCP SDK's Zod-generated schemas include both of them everywhere —
// at the top level AND deeply nested inside properties / array items.
// We must strip them recursively through the entire schema tree.
// ─────────────────────────────────────────────────────────────────────────────
const STRIP_KEYS = new Set(['$schema', 'additionalProperties']);

function cleanSchema(node) {
  // Only process plain objects — leave primitives, arrays of primitives alone
  if (node === null || node === undefined) return node;

  if (Array.isArray(node)) {
    return node.map(cleanSchema);
  }

  if (typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (STRIP_KEYS.has(k)) continue;   // ← drop the forbidden key
      out[k] = cleanSchema(v);           // ← recurse into every value
    }
    return out;
  }

  return node; // string, number, boolean — return as-is
}

export async function getMCPToolsForGemini() {
  const client = await connectMCP();
  const { tools } = await client.listTools();

  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: cleanSchema(t.inputSchema) ?? { type: 'object', properties: {} },
  }));

  return [{ functionDeclarations }];
}

export async function callMCPTool(toolName, toolArgs) {
  const client = await connectMCP();

  const result = await client.callTool({
    name: toolName,
    arguments: toolArgs,
  });

  return result.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n') || '(no result)';
}

export async function disconnectMCP() {
  if (mcpTransport) {
    await mcpTransport.close();
    mcpClient = null;
    mcpTransport = null;
    console.log('MCP server disconnected');
  }
}