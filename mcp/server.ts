// Stdio MCP server. stdout is the protocol channel — never console.log here or in tools.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as settings from './tools/settings.ts';
import * as changelog from './tools/changelog.ts';
import * as baselines from './tools/baselines.ts';
import * as oib from './tools/oib.ts';
import * as extras from './tools/extras.ts';
import pkg from './package.json' with { type: 'json' };

const server = new McpServer({ name: 'intune-settings-catalog-viewer', title: 'Intune Settings Catalog Viewer', version: pkg.version });
for (const m of [settings, changelog, baselines, oib, extras]) m.register(server);
await server.connect(new StdioServerTransport());
