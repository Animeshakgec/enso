#!/usr/bin/env node

import "dotenv/config";

import { McpServer }
    from "@modelcontextprotocol/sdk/server/mcp.js";

import { StdioServerTransport }
    from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTools } from "./registry.js";

// ✅ create MCP server
const server = new McpServer({
    name: "mcp-server",
    version: "1.0.0"
});

// ✅ register all tools
await registerTools(server);

// ✅ create stdio transport
const transport = new StdioServerTransport();

// ✅ connect MCP server
await server.connect(transport);

// ⚠️ MCP RULE: ONLY stderr logging allowed
console.error("✅ Enso MCP Server running");
