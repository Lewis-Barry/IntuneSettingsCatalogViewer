# Intune Settings Catalog Viewer — MCP server

An [MCP](https://modelcontextprotocol.io) server that lets an AI assistant (Claude Code,
Claude Desktop, VS Code, Codex, Cursor, …) answer questions about the data behind
[intunesettings.app](https://intunesettings.app) — without opening the site or Microsoft Learn:

- *"Which settings were released last week?"*
- *"What's the default for 'Prevent enabling lock screen camera', and what do the MS baseline and OIB recommend?"*
- *"What changed between Windows security baseline 24H2 and 25H2?"*
- *"Is this setting Enterprise-only? Does it work on AVD multi-session?"*

It reads the data files straight from this repo on GitHub (refreshed daily at 06:00 UTC) and
keeps them in memory for the session. No credentials, no tenant access, nothing written to disk.

## Install

Requires **Node.js 22+**. Step-by-step instructions with copy buttons are on
[intunesettings.app/mcp](https://intunesettings.app/mcp/).

**Claude Code**
```bash
claude mcp add intune-settings-catalog-viewer -- npx -y intune-settings-catalog-viewer-mcp
```

**Claude Desktop** — Settings → Developer → Edit Config, add to `claude_desktop_config.json`, then fully quit and reopen Claude Desktop:
```json
{
  "mcpServers": {
    "intune-settings-catalog-viewer": {
      "command": "npx",
      "args": ["-y", "intune-settings-catalog-viewer-mcp"]
    }
  }
}
```

**VS Code** — add to `.vscode/mcp.json` (or run *MCP: Add Server*):
```json
{
  "servers": {
    "intune-settings-catalog-viewer": {
      "command": "npx",
      "args": ["-y", "intune-settings-catalog-viewer-mcp"]
    }
  }
}
```

**Codex**
```bash
codex mcp add intune-settings-catalog-viewer -- npx -y intune-settings-catalog-viewer-mcp
```

**Cursor / other clients** — use the Claude Desktop JSON above (`mcpServers` block).

The first settings question in a session downloads ~5 MB (gzip) from GitHub and takes a few
seconds; after that answers are instant.

## Tools

| Tool | Answers |
|------|---------|
| `search_settings` | Find settings by keyword (name, keywords, CSP path, description) |
| `get_setting` | Everything about one setting: default, options, CSP path, SKUs, OS versions, parent/children, and which MS baselines / OIB policies configure it |
| `list_categories` | Browse the category tree |
| `list_changes` | What was added / removed / changed between two dates |
| `changelog_summary` | AI summary for a changelog day or month |
| `list_baselines` | Microsoft security baseline families and versions |
| `get_baseline` | Settings and values in one baseline version |
| `compare_baseline_versions` | Diff two versions of a baseline |
| `oib_lookup` | OpenIntuneBaseline policies, or diff two OIB releases |
| `compliance_settings` | Classic compliance policy properties and allowed values |
| `windows_sku_availability` | Windows editions per setting; Enterprise-only / AVD multi-session |

## Configuration

| Env var | Default | Use |
|---------|---------|-----|
| `INTUNE_MCP_REPO` | `Lewis-Barry/IntuneSettingsCatalogViewer` | Read data from a fork |
| `INTUNE_MCP_REF` | `main` | Branch, tag or commit |

## Development

```bash
cd mcp
npm install
npm run check   # self-check against real data (needs network)
npm start       # run the server from source on stdio
npm run build   # bundle to dist/server.js (what the npm package ships)
```

To use your working copy in a client, point it at the source instead of the npm package, e.g.
`claude mcp add intune-settings-catalog-viewer -- npx tsx /path/to/IntuneSettingsCatalogViewer/mcp/server.ts`.

The package bundles `../src/lib` (types and diff logic shared with the site) into
`dist/server.js`, which is why it is built with esbuild before publishing.

Tool code lives in `tools/*.ts`; each module exports `register(server)` and `selfCheck()`.
Types and diff logic are imported read-only from `../src/lib`. Never write to stdout in
server code — it is the MCP channel.
