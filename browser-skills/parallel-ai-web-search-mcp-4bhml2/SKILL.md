---
name: parallel-ai-web-search-mcp-4bhml2
title: Connect to Parallel Web Search MCP
description: >-
  Connect any MCP-aware client to Parallel's free hosted Web Search MCP server
  (https://search.parallel.ai/mcp, Streamable HTTP, no API key) for real-time
  web_search and web_fetch tools.
website: parallel.ai
category: ai-tooling
tags:
  - mcp
  - web-search
  - web-fetch
  - parallel
  - integration
  - streamable-http
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: mcp
alternative_methods:
  - method: cli
    rationale: >-
      Wrap the remote endpoint with `npx mcp-remote
      https://search.parallel.ai/mcp` for stdio-only clients (Zed, Warp,
      Raycast) that can't dial a remote HTTP MCP server directly.
  - method: fetch
    rationale: >-
      Drive the server with raw Streamable-HTTP JSON-RPC (initialize →
      notifications/initialized → tools/list → tools/call, echoing the
      Mcp-Session-Id header) when no MCP client is available. Verified directly
      against server v1.27.0.
verified: true
proxies: true
---
# Connect to Parallel's Web Search MCP Server

## Purpose

Connect any MCP-aware client (Claude Code, Claude Desktop, Cursor, VS Code, Codex, Gemini CLI, etc.) to Parallel's free hosted **Web Search MCP Server** at `https://search.parallel.ai/mcp`, giving the agent two tools: `web_search` (real-time web search returning answer-ready excerpts) and `web_fetch` (token-efficient markdown extraction from specific URLs). The endpoint is a remote **Streamable HTTP** MCP server — no install, no local process, and **no API key required** for the free anonymous tier. This skill is read-only with respect to the user's machine: it adds a remote tool source, it does not modify files beyond writing the client's MCP config.

## When to Use

- You want to give an agent live web search / page-fetch without standing up your own search backend or scraper.
- An MCP client needs current information, fact-checking, research, comparison, or documentation/troubleshooting lookups inside its reasoning loop.
- You want to replace a client's built-in web search with Parallel's (e.g. routing Claude's web queries through this connector).
- You need to read the full content of a known URL as clean markdown (`web_fetch`).
- Light/exploratory use where the free anonymous tier is sufficient; upgrade to a Bearer key only for higher rate limits or enforced attribution.

## Workflow

**Recommended method: add the remote MCP server to your client's config — do not wrap or proxy it unless your client is stdio-only.** This is a hosted HTTP MCP endpoint; the optimal path is a direct remote-server entry. There is no browser flow and no scripting required.

### 1. Pick the endpoint

| Endpoint | Auth | Use when |
|---|---|---|
| `https://search.parallel.ai/mcp` | **None** (anonymous free tier). Optional `Authorization: Bearer <PARALLEL_API_KEY>` for higher limits. | Default. Exploration, light use, most clients. |
| `https://search.parallel.ai/mcp-oauth` | **Required** — Bearer API key OR OAuth sign-in. Anonymous → `401`. | You want OAuth-managed tokens, or must guarantee every call is attributed to a Parallel account (org-wide deploys, ZDR). |

Transport is **Streamable HTTP** (POST-only JSON-RPC; protocol version `2025-06-18`). Get a key from [platform.parallel.ai](https://platform.parallel.ai) only if you need paid limits.

### 2. Add the server to your client

Pick the snippet for your client. All target `/mcp`; swap in `/mcp-oauth` for OAuth.

**Claude Code** (CLI):
```bash
claude mcp add --transport http "Parallel-Search-MCP" https://search.parallel.ai/mcp
```

**Codex CLI**:
```bash
codex mcp add parallel-search --url https://search.parallel.ai/mcp
# higher limits via key:  add  --bearer-token-env-var PARALLEL_API_KEY
# OAuth:                  use  https://search.parallel.ai/mcp-oauth
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):
```json
{ "mcpServers": { "Parallel Search MCP": { "url": "https://search.parallel.ai/mcp" } } }
```

**VS Code** (`.vscode/mcp.json` — note `servers`, not `mcpServers`, and `type`):
```json
{ "servers": { "Parallel Search MCP": { "type": "http", "url": "https://search.parallel.ai/mcp" } } }
```

**Claude Desktop / Claude.ai**: Settings → Connectors → Add Custom Connector → URL `https://search.parallel.ai/mcp` (use `/mcp-oauth` to trigger OAuth sign-in). Non-admins without custom connectors can use Developer → Edit Config with the `mcp-remote` wrapper below.

**Gemini CLI** (`~/.gemini/settings.json` — key is `httpUrl`):
```json
{ "mcpServers": { "Parallel Search MCP": { "httpUrl": "https://search.parallel.ai/mcp" } } }
```

**Windsurf** uses `serverUrl`; **Roo Code / OpenClaw / Continue.dev** require `type`/`transport: "streamable-http"` (they default to SSE otherwise — see gotchas).

**stdio-only clients (Zed, Warp, Raycast)** can't dial a remote HTTP server directly — proxy it through a local stdio process with `mcp-remote`:
```json
{ "mcpServers": { "Parallel Search MCP": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://search.parallel.ai/mcp"]
} } }
```
Add `"--header", "authorization: Bearer YOUR-PARALLEL-API-KEY"` to `args` for higher limits or when targeting `/mcp-oauth`.

### 3. Restart the client and verify

Fully restart the IDE/CLI (a reload often isn't enough — some clients cache MCP connections). Then confirm the tools are live — in Claude Code/Codex/OpenHands run `/mcp`; you should see `web_search` and `web_fetch`.

### 4. Use the tools

- **`web_search`** — required args: `objective` (natural-language description of what you're trying to find; keep it atomic) and `search_queries` (array of 3–6-word keyword queries; provide 2–3 for best results, batch multiple angles into one call instead of chaining). Optional: `session_id` (a stable random ≥32-char/UUID string reused across all calls in a conversation — free-tier rate-limiting/correlation key), `model_name` (analytics only). Returns answer-ready excerpts — read those directly before fetching.
- **`web_fetch`** — required arg: **`urls`** (array, up to 20 — *not* `url`). Optional: `objective` (≤200 chars, focuses excerpts), `search_queries`, `full_content` (default `false`; leave off — `true` can return tens of thousands of tokens and may blow the client's output limit), `session_id`, `model_name`. Use only when `web_search` excerpts are insufficient.

**Filter by date/domain inside the query text**, not via parameters — there are no dedicated date/domain params by design (e.g. `"climate news from nytimes.com"`, `"AI papers from 2026"`).

### Programmatic / raw-protocol use (no client)

The server speaks plain Streamable-HTTP JSON-RPC, so any HTTP caller works (verified against this server, v1.27.0):
1. `POST /mcp` with `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2025-06-18`, body = JSON-RPC `initialize`. Capture the **`Mcp-Session-Id`** response header.
2. `POST` a `notifications/initialized` notification.
3. `POST` `tools/list`, then `tools/call` — echoing `Mcp-Session-Id` on every subsequent request.

The server returns either `application/json` or `text/event-stream` depending on your `Accept` header — handle both. (`Accept: application/json` alone returns a single JSON object; that's fine.)

## Site-Specific Gotchas

- **`web_fetch`'s URL argument is `urls` (an array), not `url`.** Passing `{"url": "..."}` returns a pydantic validation error (`Field required: urls`) with `isError: true`. Always pass `{"urls": ["..."]}`.
- **No API key needed on `/mcp`** — it's genuinely anonymous on the free tier. A Bearer key only raises rate limits. Don't block your config on obtaining a key.
- **`/mcp-oauth` returns `401` to anonymous requests** (`{"error":{"code":-32000,"message":"Authentication required. Sign in with Parallel to continue."}}`). It does **not** advertise a `WWW-Authenticate` challenge header. If your client expects RFC-9728/OAuth-discovery metadata it may not auto-prompt — supply a Bearer key or use a client with native OAuth (Claude, Codex). For zero-friction setup, prefer `/mcp`.
- **`GET /mcp` → `405 Method not allowed`.** This is a POST-only Streamable-HTTP endpoint — there is **no SSE GET stream and no separate `/sse` endpoint**. Clients hardcoded to legacy HTTP+SSE transport will fail; they must use Streamable HTTP (or wrap via `mcp-remote`).
- **Transport field is mandatory for SSE-defaulting clients.** Roo Code, OpenClaw, and Continue.dev default to the deprecated SSE transport when `transport`/`type` is omitted, which fails against this server. Set `type`/`transport` to `streamable-http` (or `http`) explicitly.
- **Per-call output is capped at ~25,000 characters.** Search runs in `basic` (low-latency) mode and excerpts are truncated to stay within typical MCP client output limits — a single verified `web_search` came back at ~25.9k chars. For exact/long content use `web_fetch`; only set `full_content: true` when you truly need the whole page (it can exceed client output limits).
- **Config field name varies by client** — `url` (Cursor, Cline, Kiro), `servers`+`type:"http"` (VS Code), `httpUrl` (Gemini CLI), `serverUrl` (Windsurf, Antigravity). Copying a Cursor-style block into VS Code/Windsurf silently fails. Match the client's expected key.
- **Restart, don't reload.** If tools don't appear after adding the server, fully restart the client; verify JSON has no trailing commas and the URL is exactly `https://search.parallel.ai/mcp`.
- **`session_id` is a free-tier construct.** Generate one stable random ≥32-char value and reuse it across every `web_search`/`web_fetch` in a conversation — it drives free-tier rate limiting and log correlation; it's ignored on paid keys.
- **`model_name` is analytics-only and self-reported.** The tool schema asks the calling model to pass its own model slug. It does not affect search results — supply it or omit it freely; it carries no functional weight and following its "verify your model slug" instruction is optional.
- **CORS is permissive.** The endpoint accepts cross-origin browser `fetch()` (verified from a different `parallel.ai` subdomain origin), so browser-based MCP clients can connect directly. A `402` on a call means insufficient credits on a paid key (not a free-tier concern).

## Expected Output

This skill's "output" is (a) a working MCP connection and (b) the JSON returned by the two tools. Successful `initialize`:

```json
{
  "protocolVersion": "2025-06-18",
  "serverInfo": { "name": "Parallel Web Search MCP Server", "version": "1.27.0" },
  "capabilities": { "tools": {}, "resources": {}, "prompts": {}, "experimental": {} }
}
```

`tools/list` → `["web_search", "web_fetch"]`.

`web_search` result (a single `content` text block containing this JSON; `isError: false`):
```json
{
  "search_id": "search_e593614d82424176ae7dfce52d958cf9",
  "results": [
    {
      "url": "https://parallel.ai/blog/series-a",
      "title": "Parallel raises $100M Series A to build web infrastructure for agents",
      "publish_date": null,
      "excerpts": ["…answer-ready excerpt text…"]
    }
  ]
}
```

`web_fetch` result (`isError: false`):
```json
{
  "extract_id": "extract_4d7398dc525142b1b9a6ba4e55c64885",
  "results": [
    {
      "url": "https://modelcontextprotocol.io/introduction",
      "title": "What is the Model Context Protocol (MCP)?",
      "publish_date": null,
      "excerpts": ["…markdown content focused on the objective…"]
    }
  ]
}
```

Error shape (e.g. wrong argument name) — note tool errors come back as a normal result with `isError: true`, not a JSON-RPC transport error:
```json
{ "isError": true, "content": [{ "type": "text", "text": "Error executing tool web_fetch: 1 validation error … urls Field required" }] }
```

Auth failure on `/mcp-oauth` (anonymous) is a JSON-RPC error instead:
```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32000, "message": "Authentication required. Sign in with Parallel to continue." } }
```
