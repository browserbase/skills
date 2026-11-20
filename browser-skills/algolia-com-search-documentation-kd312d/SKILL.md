---
name: algolia-com-search-documentation-kd312d
title: Algolia Documentation Search
description: >-
  Search algolia.com/doc for documentation pages matching a free-text query and
  return ranked hits with section hierarchy, snippets, and direct anchor URLs —
  via the public hosted DocSearch API, with a per-page markdown fallback.
website: algolia.com
category: developer-docs
tags:
  - algolia
  - documentation
  - search
  - docsearch
  - mintlify
  - developer-docs
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      Algolia publishes a first-party LLM-targeted index at
      https://www.algolia.com/doc/llms.txt (~295 KB) and serves clean markdown
      for every doc URL via a trailing .md suffix. Best path when you want full
      page content rather than ranked snippets.
  - method: browser
    rationale: >-
      The on-site Ctrl+K search modal calls the exact same DocSearch endpoint as
      the API path — 3-6 s slower per query and produces no additional
      information. Use only if the host network policy blocks *.algolia.net but
      allows algolia.com.
verified: true
proxies: true
---
# Algolia Documentation Search

## Purpose

Search the Algolia documentation at `algolia.com/doc` for pages matching a free-text query, and return ranked results with section hierarchy, content snippets, and direct URLs (with anchor) into the docs. Optionally retrieve full markdown content for any matched page. Read-only — never edits content, never authenticates as a user.

## When to Use

- Agent-side lookup: "find the Algolia docs page on synonyms / personalization / faceted search / `aroundLatLng`."
- Pull the canonical Algolia explanation of an API parameter, ranking criterion, or feature into another generation step (RAG-style context retrieval).
- Bulk discovery — enumerate every page covering a topic (e.g. "all guides referencing `attributesForFaceting`").
- Programmatic substitute for a human typing into the `Ctrl+K` search box on `algolia.com/doc`.

Use the *Algolia MCP Server* skill (`algolia.com/mcp-server` if/when published) instead if the user already has it wired up — it covers the same surface plus authenticated dashboard operations. This skill is the unauthenticated, zero-setup alternative.

## Workflow

Algolia documentation has **three** stacked, fully-public retrieval surfaces — none require auth, an account, or stealth. Prefer them in this order; each subsequent one is a richer/heavier fallback for the previous.

### 1. Hosted DocSearch API (recommended primary path — same data the on-site search box returns)

Algolia hosts its own documentation on Mintlify and runs Algolia DocSearch v4 on top. The public credentials are baked into the docs page and are designed to be hit directly from any client:

| Field | Value |
|---|---|
| Application ID | `H467ZOT0O1` |
| Search-only API key | `8cd74d06fd7f9f83e33838376e92ddb3` |
| Endpoint host | `https://h467zot0o1-dsn.algolia.net` |
| Primary index | `Algolia Mintlify Docs` (30,489 records — one per section/anchor; what the on-site search box uses) |
| Markdown-content index | `algolia-docs-markdown` (1,842 records — one per page, full body text) |

**Request:**

```bash
curl -X POST \
  'https://h467zot0o1-dsn.algolia.net/1/indexes/Algolia%20Mintlify%20Docs/query?x-algolia-api-key=8cd74d06fd7f9f83e33838376e92ddb3&x-algolia-application-id=H467ZOT0O1' \
  -H 'Content-Type: application/json' \
  --data '{
    "query": "faceted search",
    "hitsPerPage": 10,
    "attributesToRetrieve": ["hierarchy","url","url_without_anchor","content","type","objectID","weight"],
    "attributesToSnippet": ["content:30"]
  }'
```

The index name must be URL-encoded (`Algolia%20Mintlify%20Docs`, not `Algolia+Mintlify+Docs`). Default `hitsPerPage` is 20; you can request up to ~1000. Pagination via `page=N` (zero-indexed).

**Response shape (per hit, abridged):**

```json
{
  "url": "https://www.algolia.com/doc/guides/.../auto-selected-facets#see-also",
  "url_without_anchor": "https://www.algolia.com/doc/guides/.../auto-selected-facets",
  "anchor": "see-also",
  "type": "content",        // or "lvl0".."lvl6" — a hit on a section heading
  "hierarchy": {
    "lvl0": "Guides > Solutions > Ecommerce",
    "lvl1": "Auto-selected facets",
    "lvl2": "​See also",
    "lvl3": null, "lvl4": null, "lvl5": null, "lvl6": null
  },
  "content": "Filter suggestions\r\nGuided search\r\n...",
  "objectID": "21-https://www.algolia.com/doc/guides/...",
  "weight": { "pageRank": 100, "level": 70, "position": 20 },
  "_snippetResult": { "content": { "value": "... <span class=\"algolia-docsearch-suggestion--highlight\">faceted</span> <span class=\"...\">search</span> ...", "matchLevel": "full" } },
  "_highlightResult": { "content": { "value": "...", "matchedWords": ["faceted","search"] } }
}
```

Top-level response also has `nbHits`, `page`, `nbPages`, `hitsPerPage`, `processingTimeMS`. **Zero true matches → `nbHits: 0` and `hits: []`.** Algolia applies typo tolerance + prefix matching aggressively, so a single fuzzy hit may come back even for a near-garbage query — gate on `nbHits >= 1` AND `_highlightResult.*.matchLevel !== "none"` if you want strict relevance.

**Group `hits[]` by `url_without_anchor`** when presenting to a user — DocSearch indexes by section, so a long page can produce ~5 hits in a single query. The `weight.pageRank` (0–100) and `weight.level` give you a sort key; the first hit per page is the strongest.

### 2. `llms.txt` index + per-page `.md` (recommended for full-content retrieval)

Algolia publishes a **first-party, LLM-targeted documentation index** at `https://www.algolia.com/doc/llms.txt` (~295 KB, plain text). Every doc page is listed as:

```
- [Page Title](https://algolia.com/doc/<path>.md): One-sentence description
```

And **every documentation URL serves clean markdown when you append `.md`**:

```
GET https://www.algolia.com/doc/guides/managing-results/relevance-overview.md
→ 200 text/markdown; charset=utf-8
```

This is the canonical "give me the whole page as text" path. Combined flow when the goal is content (not just search ranking):

1. Cache `llms.txt` (refresh ≥ daily; it's stable).
2. Local string-match the query against `[Title]` and the description after `:` on each line. Tokenize on whitespace + dashes, case-insensitive.
3. For each match, `GET <url>.md` and return body. Trim the leading `> ## Documentation Index` blockquote that every page ships with (4 lines).

This path is preferred when the agent needs the *whole page* content, when DocSearch's ~30k section-level granularity is too noisy, or when you want a fully self-contained, offline-cacheable index.

### 3. Browser fallback

If both API paths fail (network policy block, an outage on `*.algolia.net`, or a regression in `llms.txt`), drive the on-site search UI:

1. `browse open https://www.algolia.com/doc/` — no stealth, no proxy needed (Cloudflare-fronted but bot-friendly for unauthenticated GETs).
2. Click `button: Open search` (the `Ctrl+K` shortcut bar in the header).
3. Type the query into the floating modal — the search input is `input#docsearch-input` once the modal is mounted. While unfocused/closed, it lives at `position: absolute; left: -9999px` — wait for the modal `dialog` to render before targeting.
4. Snapshot after `wait timeout 1500` — DocSearch debounces ~300 ms and hits the same `*.algolia.net` endpoint the API path uses.
5. Result rows have shape `link → {hierarchy.lvl0 > lvl1 > lvl2} … snippet`. Each row's `href` is the canonical URL with anchor.

The browser path is strictly slower (page load + bundle hydrate + debounce ≈ 3–6 s vs. ~100 ms for the API path) and produces the same data — only fall back if the host networking layer is blocking the Algolia API host directly.

## Site-Specific Gotchas

- **The DocSearch credentials above (`H467ZOT0O1` / `8cd74d06fd7f9f83e33838376e92ddb3`) are search-only public keys.** They cannot index, delete, list keys, or read non-search data. They are baked into the docs JS bundle (visible in any browser's Network tab) and are stable across visits. Treat them as a public surface, not a leaked secret. If they ever rotate, recover by opening `https://www.algolia.com/doc/` in a browser and capturing the `x-algolia-application-id` / `x-algolia-api-key` query params on any `*-dsn.algolia.net/1/indexes/*/queries` request — that's all DocSearch v4 does on first keystroke.
- **Two indexes serve different shapes.** `Algolia Mintlify Docs` (the default on-site index) is section-granular: 30k+ records, one per `<h2>`/`<h3>` anchor, with `hierarchy.lvl0..lvl6`, `content` snippets, and a `weight.pageRank` for ranking. `algolia-docs-markdown` is page-granular: 1,842 records, one per doc page, with a much larger `text` body containing the full markdown. Use the first for "search and link", the second for "search and embed full content".
- **Index name has a space — URL-encode it.** `Algolia Mintlify Docs` must become `Algolia%20Mintlify%20Docs` in the path. `+` does not work in the path segment.
- **Typo tolerance is on by default**, so a "no such word" query will still return one or two low-`matchLevel` hits. To detect genuine no-result queries, check `nbHits === 0`, OR check that the top hit's `_highlightResult.*.matchLevel === "full"` before treating it as a match.
- **`hierarchy.lvl0..lvl6` strings sometimes start with a U+200B (zero-width space).** That `​` character in `"​See also"` is real — strip leading `​` if you're string-matching against hierarchy values.
- **`content` can be `null` on `type: "lvl0".."lvl6"` hits** — those records are pure section-heading matches and carry the breadcrumb only. Use `url` / `hierarchy` and skip snippet rendering. Only `type: "content"` records guarantee a non-null `content` string.
- **The on-site search box modal hides its `<input>` off-canvas (`left: -9999px`) until the user clicks "Open search".** Direct typing into the input while the modal is closed silently no-ops — the on-screen Ctrl+K shortcut bar is a `<button>`, not an `<input>`. If you're driving the browser path, click the button first, then target `input#docsearch-input` from the freshly mounted dialog.
- **`https://algolia.com/llms.txt` (bare) 301-redirects to `https://www.algolia.com/doc/llms.txt`.** Either works after following redirects, but the canonical site-wide overview is at the bare path and the *doc-index* is at `www.algolia.com/doc/llms.txt`. The blockquote on every doc page links the bare path; if your fetcher doesn't auto-redirect, hit `www.algolia.com/doc/llms.txt` directly (~295 KB, 200 OK, `Content-Type: text/plain`).
- **The bare `https://www.algolia.com/doc/llms.txt` exceeds 1 MB only when proxied through `browse cloud fetch --proxies` (which caps at 1 MB).** Direct fetch is well under the cap (295 KB). If you proxy and get 502 "response body exceeded the maximum allowed size of 1 MB," repeat without `--proxies` — the docs site doesn't anti-bot unauthenticated GETs.
- **Every `.md` doc page leads with a 4-line blockquote** announcing `## Documentation Index` and pointing at `llms.txt`. Strip the first blockquote block before rendering content to a user.
- **Docs are hosted on Mintlify CDN** (`mintcdn.com`). The site front-door is `algolia.com` (Cloudflare → Vercel), but doc assets and the search bundle are Mintlify-hosted. Practical implication: if `algolia.com` itself is having a Cloudflare incident, the DocSearch API path (`*.algolia.net`) is still up — they're on completely separate infrastructure.
- **There is an "Ask AI" sidepanel** (the `⌘I` shortcut in the header) that runs a separate LLM-driven Q&A over the same indexes. It is **not** the same as the search box and produces synthesized answers, not links. If the user's intent is "find me the page about X," use the API path. If the user's intent is "answer this question using the docs," that's a different skill and should be modeled as such.
- **Pagination — DocSearch caps `hitsPerPage` at ~1000 per request**, with classic offset pagination via `page=N` (zero-indexed). For the typical use case (top 10–20 results) one request is enough; the index is small enough that even an enumeration over `*` for a topic-keyword query rarely exceeds 200 hits.
- **No rate-limit observed during 1 iteration of testing** at light load (a handful of sequential queries). Algolia's general guidance for search-only keys is "keep client-side QPS reasonable" — the on-site search box throttles to one query per keystroke debounce (~300 ms), so a per-skill QPS ≤ 5 is well within tolerance.

## Expected Output

Two natural output shapes, depending on whether the caller wants ranked search hits or full page content.

### Shape A — ranked search results (DocSearch path, recommended default)

```json
{
  "query": "faceted search",
  "index": "Algolia Mintlify Docs",
  "nb_hits": 87,
  "page": 0,
  "nb_pages": 18,
  "hits": [
    {
      "title": "Auto-selected facets — See also",
      "breadcrumb": "Guides > Solutions > Ecommerce > Auto-selected facets > See also",
      "url": "https://www.algolia.com/doc/guides/solutions/ecommerce/filtering-and-navigation/tutorials/auto-selected-facets#see-also",
      "page_url": "https://www.algolia.com/doc/guides/solutions/ecommerce/filtering-and-navigation/tutorials/auto-selected-facets",
      "anchor": "see-also",
      "type": "content",
      "snippet": "Filter suggestions … A great faceted search experience (blog)",
      "matched_words": ["faceted", "search"],
      "page_rank": 100
    },
    {
      "title": "Customize existing widgets — Display facets with no matches",
      "breadcrumb": "Guides > Building Search Ui > Widgets > Customize existing widgets > Display facets with no matches",
      "url": "https://www.algolia.com/doc/guides/building-search-ui/widgets/customize-an-existing-widget/react#display-facets-with-no-matches",
      "page_url": "https://www.algolia.com/doc/guides/building-search-ui/widgets/customize-an-existing-widget/react",
      "anchor": "display-facets-with-no-matches",
      "type": "content",
      "snippet": "… Facet hits from a faceted search won't work because Algolia only returns matching facets …",
      "matched_words": ["faceted", "search"],
      "page_rank": 90
    }
  ]
}
```

Zero-result shape:

```json
{ "query": "...", "index": "Algolia Mintlify Docs", "nb_hits": 0, "hits": [] }
```

### Shape B — full page markdown (llms.txt + `.md` path)

```json
{
  "query": "relevance overview",
  "matches": [
    {
      "title": "Relevance overview",
      "url": "https://www.algolia.com/doc/guides/managing-results/relevance-overview",
      "md_url": "https://www.algolia.com/doc/guides/managing-results/relevance-overview.md",
      "description": "Learn how to achieve strong relevance and improve it.",
      "content_md": "# Relevance overview\n\n> Learn how to achieve strong relevance and improve it.\n\n...",
      "content_chars": 6042
    }
  ],
  "source": "llms.txt"
}
```
