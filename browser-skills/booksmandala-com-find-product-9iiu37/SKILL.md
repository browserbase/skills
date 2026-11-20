---
name: booksmandala-com-find-product-9iiu37
title: Find a Book on Books Mandala
description: >-
  Find a book in Books Mandala's catalog by title, author, or ISBN and return
  its price, stock, ISBN, genres, and URL — via the official no-auth MCP server,
  the key-gated REST API, or a stealth browser fallback.
website: booksmandala.com
category: ecommerce
tags:
  - books
  - bookstore
  - nepal
  - mcp
  - catalog
  - product-search
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: mcp
alternative_methods:
  - method: api
    rationale: >-
      Official REST API (booksmandala.com/api/agent/v1) returns structured JSON
      Book objects in native NPR, but every catalog endpoint requires an
      X-API-Key (free for non-commercial use, requested by email). Use it when
      you have a key and need typed fields; the public /docs OpenAPI spec needs
      no key.
  - method: browser
    rationale: >-
      Last-resort fallback when MCP/REST are unavailable. Storefront is behind
      Cloudflare (needs --verified --proxies), search is a Ctrl+K modal (no
      /search?q= route), and prices default to USD — ~6x more turns and cost
      than the MCP path.
verified: true
proxies: true
---
# Find a Book on Books Mandala

## Purpose

Find a book in Books Mandala's catalog (Nepal's largest online bookstore, 50,000+ titles) by title, author, or ISBN, and return its product details — title, author(s), price, stock status, ISBN, genres, and the canonical product URL. Especially useful for discovering Nepali-origin books from anywhere in the world (the store ships internationally). Read-only: this skill discovers and reads product data; it never adds to cart, logs in, or checks out.

## When to Use

- Look up a specific book by title/author/ISBN and read its price, stock, and details.
- Discover Nepali literature, Nepali-language books, and South Asian titles for buyers outside Nepal.
- Browse a genre, an author's catalog, current bestsellers, or new arrivals.
- Bulk/programmatic catalog access where you'd otherwise scrape the storefront — Books Mandala publishes an official agent MCP and REST API, both faster and more reliable than browsing.

## Workflow

Books Mandala officially supports AI agents: there is a **public, no-auth MCP server** (recommended) and a **key-gated REST API** (alternative). Both are documented at `https://booksmandala.com/agent-api`. Lead with the MCP — it requires no API key and returns LLM-ready text. Only fall back to the browser when you cannot speak MCP.

### Recommended: MCP (no API key)

Endpoint: `https://bm-agent-mcp.booksmandala.workers.dev/mcp` (Streamable HTTP / JSON-RPC 2.0, source: `github.com/mandalatech/bm-agent-mcp`).

1. **Connect.** If you are an MCP-capable client (Claude Desktop, Cursor, Windsurf, etc.), add the server URL to your MCP config — no key needed:
   ```json
   { "mcpServers": { "books-mandala": { "url": "https://bm-agent-mcp.booksmandala.workers.dev/mcp" } } }
   ```
2. **Handshake (raw HTTP clients).** Three-step MCP handshake; `Accept` must include `text/event-stream` (responses are SSE: `event: message\ndata: {json}`):
   - `POST` `method: "initialize"` → capture the `Mcp-Session-Id` response header.
   - `POST` `method: "notifications/initialized"` (echo `Mcp-Session-Id` on this and every later call).
   - `POST` `method: "tools/list"` to confirm the 7 tools.
3. **Call a tool** via `method: "tools/call"`. The 7 tools:
   - `search_books` — `{ "query": "<title|author|isbn>" }` → up to 20 results/page (text). Use for "find a book".
   - `get_book` — full details for one book (by ISBN or slug).
   - `list_genres` — all 177 genres.
   - `browse_genre` — books within a genre.
   - `bestsellers` — current bestsellers.
   - `new_arrivals` — recently added titles.
   - `get_author` — author profile + their catalog.
4. **Read the result.** Tool results are `content[].text` — a markdown-ish block per book (title, author, "Price: NPR … | In/Out of Stock", ISBN, Genres, description, "Buy: <url>"). Parse the text, or use `get_book` for a single canonical record.

### Alternative: REST API (requires a free API key)

Base URL `https://booksmandala.com/api/agent/v1`; auth via `X-API-Key` header; 100 req/min per key; JSON responses (structured `Book` objects, prices in native NPR). **Keys are free for non-commercial use but must be requested by email** (see the "Get an API Key" section at `/agent-api`). Without a key, catalog endpoints return `401 {"error":"API key required..."}`.

- `GET /search?q=<query>` — search by title/author/ISBN.
- `GET /books/{isbn-or-slug}` — full book detail.
- `GET /genres`, `GET /genres/{slug}/books`, `GET /bestsellers`, `GET /new-arrivals`, `GET /authors/{slug}`.
- `GET /docs` and `GET /health` are **public (no key)** — `/docs` is the machine-readable OpenAPI 3.0.3 spec; use it to learn exact schemas.

### Browser fallback (last resort)

Use only if MCP and REST are both unavailable. The storefront is behind Cloudflare — drive it with a stealth session (`--verified --proxies`); zero 403s were observed with stealth on across testing.

1. Open `https://booksmandala.com/` in the stealth session.
2. **Search is a Ctrl+K command palette, not a URL.** `/search?q=` returns 404. Click the header button labelled "What do you want to read ?" (or press `Ctrl+K`), type the query, and wait ~2s for instant results to render under the input.
3. Click the best-matching result, or navigate directly to the book detail page at `https://booksmandala.com/books/{slug-id}` (e.g. `/books/palpasa-cafe-2739`).
4. Snapshot the detail page and extract title, author, price, stock, ISBN, and genres (breadcrumb shows `Home > {Genre} > {Title}`).
5. **Currency**: the storefront defaults to USD ($). To read the native price, open the header `$ USD` toggle and pick `रु NPR`. (The MCP/REST always return NPR directly — another reason to prefer them.)

## Site-Specific Gotchas

- **MCP needs no key; REST does.** The MCP worker (`bm-agent-mcp.booksmandala.workers.dev`) is fully open. The REST API (`booksmandala.com/api/agent/v1`) returns `401` on every catalog endpoint without `X-API-Key`. Don't burn time trying to call REST `/search` keyless — only `/docs` and `/health` are public there.
- **MCP transport is Streamable HTTP with SSE responses.** You must send `Accept: application/json, text/event-stream`, complete the `initialize` → `notifications/initialized` handshake, and echo the `Mcp-Session-Id` header returned by `initialize` on all subsequent requests. Skipping the `initialized` notification or the session header breaks `tools/call`.
- **MCP returns prose, not JSON.** `search_books`/`get_book` return human-readable text in `content[].text` (great for LLMs, not for strict parsing). If you need structured fields, parse the text or use the REST API (with a key) whose `Book` schema is fully typed.
- **Browser search is a modal, not a query-string route.** `https://booksmandala.com/search?q=...` 404s. Search only exists as the Ctrl+K command palette overlay. Don't try to deep-link a search.
- **URL conventions**: book detail `=/books/{slug-id}`; genre listing `=/books/genres/{slug}` (optional `?sub_genres={sub}`); author `=/author/{slug}`; plus static `/best-sellers`, `/new-arrivals`, `/used-books`. Book slugs end in a numeric id (e.g. `karnali-blues-49722`).
- **Currency display defaults to USD on the storefront.** The visible `$` price is a converted display; the native/canonical price is NPR. The header `$ USD ⇄ रु NPR` toggle changes it. APIs always return NPR (`price` like `"NPR 595"`, plus numeric `price_value`).
- **Cloudflare on the storefront.** Browser access needs `--verified --proxies`; with stealth on, no blocks were seen across testing. The MCP worker and the public `/docs`/`llms.txt` endpoints were reachable without stealth.
- **Discovery files exist**: `/llms.txt`, `/llms-full.txt`, `/ai-plugin.json`, and the OpenAPI JSON at `/api/agent/v1/docs` — use these to learn catalog taxonomy and exact schemas.
- **Catalog scope**: phase 1 (discovery/browsing) is live; ordering, payment, and stock-realtime are roadmap items, so this skill is read-only by design.
- **ISBN vs. example values**: read the ISBN from the live record — illustrative ISBNs in any prompt may differ from the catalog's actual value.

## Expected Output

A single found book (normalized shape — populate from MCP text, REST JSON, or page extraction):

```json
{
  "success": true,
  "query": "Palpasa Cafe",
  "book": {
    "title": "Palpasa Cafe",
    "author": "Narayan Wagle",
    "price": "NPR 595",
    "price_value": 595,
    "currency": "NPR",
    "in_stock": true,
    "isbn": "9789937905855",
    "genres": ["Nepali", "Nepali Literature"],
    "url": "https://booksmandala.com/books/palpasa-cafe-2739"
  },
  "error_reasoning": null
}
```

MCP `search_books` returns a multi-result text block (one record per match, up to 20/page):

```
Found 20 results for "nepal" (page 1):

**Nepal**
by Richard I'Anson
Price: NPR 400 | Out of Stock
ISBN: 9781741793765
Genres: Nepali, Books on Nepal

<description...>

Buy: https://booksmandala.com/nepal-2448

---
...
```

No match found:

```json
{ "success": false, "query": "asdfqwer", "book": null, "error_reasoning": "No results returned for the query." }
```

Anti-bot / unavailable (browser path):

```json
{ "success": false, "query": "Palpasa Cafe", "book": null, "error_reasoning": "Cloudflare challenge / block encountered; retry with a verified residential-proxy session." }
```
