---
name: mcp-data-gouv-fr-query-extract-structure-datasets-2xs1uy
title: 'data.gouv.fr MCP — Query, Extract & Structure Datasets'
description: >-
  Drive the data.gouv.fr MCP server (mcp.data.gouv.fr/mcp, server v1.27.1, MCP
  protocol 2025-06-18, Streamable HTTP + SSE) to search datasets, organizations,
  and third-party APIs, then normalize each hit into a clean reusable JSON
  record (title, description, organization, license, frequency, spatial,
  temporal, resources, file_urls, api_endpoints, quality_signals, …) by
  enriching with the data.gouv.fr REST API at /api/1/datasets/{id}/.
website: mcp.data.gouv.fr
category: open-data
tags:
  - mcp
  - data-gouv-fr
  - open-data
  - france
  - datasets
  - api
  - scraping
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: hybrid
alternative_methods: []
verified: true
proxies: true
---
# data.gouv.fr MCP — Query, Extract & Structure Datasets

## Purpose

Drive the official **data.gouv.fr MCP server** at `https://mcp.data.gouv.fr/mcp` to discover, inspect, and extract every dataset, resource, file, and third-party API published on the French national open-data portal — then normalize the results into a clean, reproducible JSON/CSV record per dataset. The skill is read-only (all 10 server-side tools declare `readOnlyHint: true`) and is designed to be embedded as one stage of a larger scraping/automation pipeline driven by Hermes, OpenClaw, Cursor, Claude Code, or any other MCP-aware agent.

The skill targets **maximum extraction**: when an MCP tool returns a truncated or human-readable summary, fall through to the underlying REST API at `https://www.data.gouv.fr/api/1/` for the full raw record. The output schema below is the single normalized shape the pipeline emits, regardless of which surface answered.

## When to Use

- Building a corpus of French public datasets matching one or more keyword queries.
- Periodic refresh of a dataset catalogue snapshot (price tracker, regulatory monitor, etc.).
- Discovering and calling third-party APIs (`dataservices`) registered on the portal.
- Any agent flow where you want LLM-friendly tool descriptions ("`search_datasets`", "`list_dataset_resources`") instead of hand-rolling REST calls and risking schema drift.
- When a downstream task needs the *full* `description`, `quality` block, `spatial`, `temporal_coverage`, or `metrics` — the MCP text responses truncate these; the REST fallback restores them.

## Workflow

The optimal path is **hybrid**: lead with the MCP server for discovery (`search_datasets`, `list_dataset_resources`, `query_resource_data`) because its tool descriptions and JSON-RPC envelope are ideal for agent control loops, then enrich each hit with one call to the underlying `https://www.data.gouv.fr/api/1/datasets/{id}/` REST endpoint to recover fields the MCP text response truncates (full `description`, `spatial.zones`, `temporal_coverage`, `quality`, `metrics`, raw `resources[]`). Both surfaces are public, authentication-free, and CORS-permissive when called from the MCP origin; neither requires a residential proxy.

### 1. Setup — transport and protocol

The server speaks **MCP Streamable HTTP** (specification `2025-06-18`) over a single POST endpoint. It is **stateless** (no `mcp-session-id` is returned on `initialize`) and emits responses as `text/event-stream` Server-Sent Events with a single `event: message` frame per call.

Mandatory request headers on every call:

```
POST https://mcp.data.gouv.fr/mcp
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Protocol-Version: 2025-06-18
```

Missing `text/event-stream` in `Accept` produces a `406 Not Acceptable` with body `{"error":{"code":-32600,"message":"Not Acceptable: Client must accept text/event-stream"}}`. This is the first gotcha clients hit; see Site-Specific Gotchas.

Three options for connecting, in order of preference:

| Method | When to use |
|---|---|
| **Native MCP client** (`@modelcontextprotocol/sdk`, `mcp` Python package, Hermes, OpenClaw, Cursor, Claude Code config) | Production. Handles SSE framing, retries, and tool schema validation. |
| **Raw `fetch` / `httpx`** with the headers above | Quick pipeline scripts, CI smoke tests, no SDK available. |
| `curl` from a shell | Manual debugging only. |

#### 1a. Native MCP — Claude Code / Cursor / Hermes / OpenClaw config

Add the server to the host's MCP config (paths vary by client):

```json
{
  "mcpServers": {
    "data-gouv-fr": {
      "type": "http",
      "url": "https://mcp.data.gouv.fr/mcp"
    }
  }
}
```

For clients that only support stdio transport, wrap it in `mcp-remote`:

```json
{
  "mcpServers": {
    "data-gouv-fr": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.data.gouv.fr/mcp"]
    }
  }
}
```

After registering, the host process exposes the 10 tools below as native function-calls — no further setup required.

#### 1b. Python (SDK)

```python
# pip install "mcp[cli]"
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def connect():
    async with streamablehttp_client("https://mcp.data.gouv.fr/mcp") as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            tools = await session.list_tools()
            return tools
```

#### 1c. Raw `fetch` (Node, browser, Deno)

```js
const ENDPOINT = "https://mcp.data.gouv.fr/mcp";
const H = {
  "Accept": "application/json, text/event-stream",
  "Content-Type": "application/json",
  "MCP-Protocol-Version": "2025-06-18",
};

// Parse the single SSE frame the server returns per call
async function rpc(method, params = undefined, id = Date.now()) {
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
  const r = await fetch(ENDPOINT, { method: "POST", headers: H, body });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const raw = await r.text();
  // Server emits exactly one "data: { ... }\n\n" SSE frame per JSON-RPC response
  const m = raw.match(/^data:\s*(\{[\s\S]*\})\s*$/m);
  if (!m) throw new Error("malformed SSE frame: " + raw.slice(0, 200));
  const env = JSON.parse(m[1]);
  if (env.error) throw new Error(`MCP ${env.error.code}: ${env.error.message}`);
  return env.result;
}

// Required handshake (initialize + notifications/initialized).
// Server is stateless — no mcp-session-id is issued — but the notification is still part of spec.
await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "my-pipeline", version: "1.0.0" },
});
await fetch(ENDPOINT, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
```

### 2. MCP discovery — list every available tool

Always run `tools/list` once at session start. The catalog is small (10 entries) but reading it programmatically lets the pipeline detect upstream additions without re-deploying:

```js
const { tools } = await rpc("tools/list");
// tools.length === 10 as of 2026-05-22
```

The complete tool catalogue served by `data.gouv.fr MCP server` version `1.27.1`:

| # | Tool name | Required args | Optional args | Returns |
|---|---|---|---|---|
| 1 | `search_datasets` | `query` | `page=1`, `page_size=20` | Numbered text list of dataset titles + IDs + tags + URL |
| 2 | `search_organizations` | — | `query=""`, `page`, `page_size`, `sort`, `badge`, `name`, `business_number_id` | Numbered text list of publishing organizations |
| 3 | `search_dataservices` | `query` | `page`, `page_size` | Numbered text list of third-party API entries |
| 4 | `get_dataservice_info` | `dataservice_id` | — | Text record: title, base_api_url, machine_documentation_url, license, dates |
| 5 | `get_dataservice_openapi_spec` | `dataservice_id` | — | Summarized list of endpoints and parameters from the published OpenAPI/Swagger spec |
| 6 | `get_dataset_info` | `dataset_id` | — | Text record: title, slug, **truncated** description, organization, tags, resource count, dates, license, frequency |
| 7 | `list_dataset_resources` | `dataset_id` | — | Per-resource: id, format, type, URL |
| 8 | `get_resource_info` | `resource_id` | — | Per-resource: id, format, type, URL, description, parent dataset_id + name, Tabular API availability flag |
| 9 | `query_resource_data` | `resource_id` | `page=1`, `page_size=20`, `filter_column`, `filter_value`, `filter_operator=exact`, `sort_column`, `sort_direction=asc` | Rows from CSV/XLSX via the Tabular API |
| 10 | `get_metrics` | — (one of `dataset_id` or `resource_id` required) | `limit=12` | Monthly visit/download counts. Production-only — returns empty on the demo instance. |

`resources/list` and `prompts/list` both return empty arrays — the server exposes its surface exclusively through tools. Do not waste turns probing them after a one-shot confirmation.

All ten tools declare:

```json
{ "readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": true }
```

`openWorldHint: true` means the result set is non-enumerable from the agent's side — always paginate to completion or stop when `Found N` ≤ pages × page_size.

### 3. Search datasets by keyword

```js
const res = await rpc("tools/call", {
  name: "search_datasets",
  arguments: { query: "transport ferroviaire", page: 1, page_size: 20 },
});
const text = res.content[0].text;           // plain text, line-oriented
const total = +(text.match(/Found (\d+) dataset/) || [])[1] || 0;
```

The text body for `search_datasets` follows this exact shape (one block per hit, separated by blank lines):

```
Found 302 dataset(s) for query: 'transport ferroviaire'
Page 1 of results:

1. <title>
   ID: <24-hex mongo objectid>
   Organization: <name>
   Tags: <comma-separated tag slugs>
   Resources: <integer>
   URL: https://www.data.gouv.fr/datasets/<slug>

2. <title>
   ...
```

A regex-based parser (below) extracts the structured tuple `(rank, title, id, organization, tags[], resource_count, url)` per hit. The `id` is the MongoDB ObjectID used by every other tool — store it.

**Zero-result shape** — when nothing matches, body is exactly `No datasets found for query: '<q>'` and `total = 0`. This is **not** an error: `isError === false`, `error === undefined`. Detect by string match (see Site-Specific Gotchas: "Errors are returned as content, not errors").

### 4. Extract full metadata per dataset (the hybrid step)

For each `id` from step 3, call `get_dataset_info` first (one round-trip via MCP), then enrich from the REST API to recover fields the MCP text response truncates with `...`:

```js
// 4a. MCP — fast, agent-friendly, but description truncated at ~500 chars
const info = await rpc("tools/call", {
  name: "get_dataset_info",
  arguments: { dataset_id: id },
});

// 4b. REST — full raw record. CORS-permissive, no auth, gzip-encoded.
const raw = await fetch(`https://www.data.gouv.fr/api/1/datasets/${id}/`).then(r => r.json());
```

The REST response carries every field the normalized output schema requires. Field mapping (REST → output):

| Output field | Source path |
|---|---|
| `title` | `raw.title` |
| `description` | `raw.description` (full, untruncated; markdown) |
| `url` | `raw.page` |
| `organization` | `raw.organization.name` (+ `acronym`, `slug`, `id`, `badges[].kind`) |
| `producer` | `raw.organization.name` (data.gouv.fr conflates publisher = producer; surface `harvest.source_id` separately if non-null) |
| `tags` | `raw.tags[]` |
| `categories` | derive from `raw.tags[]` + `raw.harvest.source_id` (no first-class field) |
| `license` | `raw.license` (e.g. `fr-lo`, `lov2`, `odc-by`) |
| `created_at` | `raw.created_at` (ISO 8601) |
| `updated_at` | `raw.last_update` (preferred) or `raw.last_modified` |
| `frequency` | `raw.frequency` (e.g. `annual`, `monthly`, `daily`, `continuous`, `unknown`) |
| `geographic_scope` | `{ granularity: raw.spatial.granularity, zones: raw.spatial.zones, geom: raw.spatial.geom }` |
| `temporal_coverage` | `raw.temporal_coverage` — `{start, end}` ISO dates, or `null` |
| `resources` | `raw.resources[]` (id, title, description, format, filesize, mime, url, latest, created_at, last_modified, schema) |
| `file_urls` | `raw.resources[].url` |
| `api_endpoints` | `raw.resources[].latest` (data.gouv.fr permanent redirect URL) + any `format ∈ {api, wms, wfs}` resource's `url` |
| `formats` | `[...new Set(raw.resources.map(r => r.format))]` |
| `metadata` | `{ extras: raw.extras, harvest: raw.harvest, internal: raw.internal, slug: raw.slug, uri: raw.uri }` |
| `related_datasets` | optional — call `https://www.data.gouv.fr/api/1/datasets/?organization=<org_id>&page_size=5` and exclude the current id |
| `quality_signals` | `raw.quality` — `{ score, all_resources_available, has_open_format, license, spatial, temporal_coverage, update_frequency, update_fulfilled_in_time, dataset_description_quality, has_resources, resources_documentation }` plus `raw.metrics` (`views`, `resources_downloads`, `reuses`, `followers`) |
| `extraction_date` | client-side `new Date().toISOString()` |
| `raw_source_url` | `raw.uri` (canonical REST API URI for the record) |

If the REST call fails (5xx, network), fall back to the MCP `get_dataset_info` text and parse what's available with the regex extractors in Best Practices. Always record `extraction_partial: true` in `metadata` so downstream consumers can re-run later.

### 5. List resources / files / URLs / API endpoints per dataset

Two interchangeable paths — pick based on whether you've already paid for the REST fetch in step 4:

```js
// Path A: dedicated MCP tool. Use when iterating many datasets without full enrichment.
const r = await rpc("tools/call", {
  name: "list_dataset_resources",
  arguments: { dataset_id: id },
});

// Path B: re-use the REST raw record from step 4b — already populated.
const resources = raw.resources;
```

Per resource, the structured tuple is:

```
{
  id:           "<uuid v4>",                               // resources have UUIDs, datasets have ObjectIDs — never confuse the two
  title:        "<string>",
  description:  "<markdown>",
  format:       "csv|xlsx|json|geojson|shp|pdf|api|wms|...",  // free-form lowercased
  filesize:     <bytes>|null,
  mime:         "<mime>"|null,
  url:          "https://...",                             // direct file URL on the publisher's CDN
  latest:       "https://www.data.gouv.fr/api/1/datasets/r/<resource_id>",  // permanent redirect — prefer for citation
  created_at:   "<ISO>",
  last_modified:"<ISO>",
  schema:       { name, url, version }|null,               // populated only for resources tagged with a schema.data.gouv.fr definition
  type:         "main|documentation|api|update|code|other",
  extras:       { ... }                                    // includes "analysis:*" and "check:*" health-check fields
}
```

**API-endpoint discovery** is split between (a) resources of `type: "api"` inside this dataset and (b) the separate `dataservices` catalogue. To collect both, run `search_dataservices` with the same query in parallel and join on `dataservice.datasets[]`.

### 6. Query tabular data inside a CSV/XLSX resource

Use `query_resource_data` *only* when `get_resource_info` reports the Tabular API is available (`format ∈ {csv, xlsx}` and the file passed health checks). For other formats (JSON, JSONL, GeoJSON, Shapefile, PDF, …), fetch `resources[].url` directly.

```js
const page = await rpc("tools/call", {
  name: "query_resource_data",
  arguments: {
    resource_id: "<uuid>",
    page: 1,
    page_size: 50,
    filter_column: "annee",
    filter_value: "2024",
    filter_operator: "exact",         // exact | contains | less | greater | strictly_less | strictly_greater
    sort_column: "valeur",
    sort_direction: "desc",
  },
});
```

If `get_resource_info` returns `⚠️ Not available via Tabular API`, the resource is either non-tabular, hosted off-platform (`filetype: "remote"`), or has not been profiled yet — skip `query_resource_data` and fetch `url` directly.

### 7. Pagination, retries, errors

- **Pagination on search tools.** Cursor through pages by re-calling with `page = page + 1` until either `Found N` < `page * page_size` or the body is the empty-result sentinel. The server has no `next_cursor` field; you must compute `total_pages = Math.ceil(N / page_size)` from the first response.
- **Pagination on the REST API.** `https://www.data.gouv.fr/api/1/datasets/?page=1&page_size=50&q=<query>` returns `{ data: [...], next_page, previous_page, total }` — prefer this for bulk crawl because `data[]` already contains the structured JSON (no text parsing).
- **Rate limiting.** No formal limit is published but the upstream `nginx` returns `429 Too Many Requests` above ~10 req/s sustained from one IP. Cap pipeline concurrency at **5 parallel** MCP calls and **5 parallel** REST calls, and add jitter (200–800 ms) between bursts.
- **Retries.** Idempotent (every tool is `idempotentHint: true`). Retry on:
  - HTTP `429`, `502`, `503`, `504` — exponential backoff, base 1 s, factor 2, max 5 attempts.
  - Network errors / TLS errors — same.
  - `406 Not Acceptable` — **never retry**; this is a header bug in your client. Fix `Accept`.
  - `-32600` JSON-RPC error — **never retry**; malformed request envelope.
- **Error detection inside tool results.** Critical: when an upstream record is missing, the MCP server returns `isError: false` with `content[0].text` starting with `Error:` (e.g. `Error: Dataset with ID 'bogus-xxx' not found.`). Code must check the text body for this prefix; checking only `isError` produces silent failures. See Site-Specific Gotchas.

### 8. Normalize into clean JSON / CSV

Emit one record per dataset matching the schema in Expected Output. For CSV export, flatten arrays with `;` separators and nested objects with `.` keys — these are the only fields-of-interest mappings; everything else lives under `metadata` as a stringified JSON blob:

```
title, description, url, organization, organization_id, producer, tags, categories,
license, created_at, updated_at, frequency, geographic_granularity, geographic_zones,
temporal_start, temporal_end, resource_count, formats, file_urls, api_endpoints,
quality_score, views, downloads, reuses, extraction_date, raw_source_url, metadata_json
```

When in doubt, **emit JSON** — every downstream consumer that needs CSV can flatten from JSON, but the reverse round-trip loses structure.

### 9. Pipeline pattern (Hermes / OpenClaw / cron job)

```text
queries[]  ──►  search_datasets(q, page=1..N)  ──►  ids[]
ids[]      ──►  (parallel, max-5)
                  ├─ get_dataset_info(id)           [MCP]
                  ├─ GET /api/1/datasets/{id}/      [REST]
                  └─ list_dataset_resources(id)    [MCP]   (optional — REST already has it)
                ──►  merge & normalize  ──►  emit record
                ──►  upsert into store keyed by raw.id
```

Run nightly. Diff `raw.last_modified` against the previous run's value to detect changes; re-emit only when it advances. Persist `extraction_date` per record so downstream jobs can ignore stale rows.

### Hermes / OpenClaw / Cursor prompt examples

These prompts assume the MCP server is already registered (see step 1a). Paste verbatim:

**Prompt 1 — single-keyword harvest:**
> Use the `data-gouv-fr` MCP server. Call `search_datasets` with `query="qualité de l'air"` and paginate to completion (page_size=50). For each result, call `get_dataset_info`, then fetch `https://www.data.gouv.fr/api/1/datasets/{id}/` for the full record. Normalize each dataset into the schema with fields title, description, url, organization, tags, license, created_at, updated_at, frequency, geographic_scope, temporal_coverage, resources, file_urls, formats, quality_signals, extraction_date, raw_source_url. Emit one JSON object per line to stdout. Skip records where `get_dataset_info` returns "Error:".

**Prompt 2 — third-party API discovery:**
> Using `data-gouv-fr`, call `search_dataservices` with `query="adresse"`. For each dataservice, call `get_dataservice_info` then `get_dataservice_openapi_spec`. Return a table of (title, base_api_url, machine_documentation_url, license, endpoint_count, endpoints[]).

**Prompt 3 — single-dataset deep extract:**
> Using `data-gouv-fr`, fetch full metadata for dataset id `5afd4b6bc751df5b49337448`. Combine `get_dataset_info` + `list_dataset_resources` + REST `/api/1/datasets/{id}/`. For each resource, if `get_resource_info` reports Tabular API available, preview the first 20 rows via `query_resource_data`. Return the normalized record.

**Prompt 4 — incremental refresh:**
> Re-run yesterday's harvest. For each dataset id in `cache.json`, call `get_dataset_info` and compare the `Last updated` line to the cached value. Only re-extract (full REST + resources) when it has advanced. Output: `{updated_ids: [...], unchanged_ids: [...], extraction_date: <iso>}`.

## Site-Specific Gotchas

- **`Accept` header must include `text/event-stream` or you get `406 Not Acceptable`.** Plain `application/json` is not enough — the server unconditionally returns SSE. The 406 error envelope (`code: -32600`) is what you see in a browser address bar; configure your client correctly and it disappears. This is the single most common first-call failure.
- **Responses come back as a single SSE frame, not a JSON body.** Every tool call returns exactly one `event: message\r\ndata: {…JSON-RPC envelope…}\r\n\r\n` frame, then the connection closes. Strip the SSE wrapper before `JSON.parse`. The Node SDK and Python `mcp` library handle this; raw `fetch`/`httpx` users must not.
- **Server is stateless — no `mcp-session-id` is issued.** Unlike some MCP servers, `data.gouv.fr` does not return a session header on `initialize` and does not require one on subsequent calls. Do not invent one. The `notifications/initialized` notification is still part of the spec and should be sent once per session for forward-compatibility, but the server tolerates its absence.
- **`isError` is always `false` even on lookup misses.** When a dataset/resource/organization is not found, the response is `{ result: { content: [{ type: "text", text: "Error: ... not found." }], isError: false } }`. The `Error:` prefix is the canonical signal. Other miss shapes: `No datasets found for query: '<q>'`, `No organizations found ...`. Treat any `content[0].text` starting with `Error:` or matching `/^No \w+ found/` as a non-fatal miss; do **not** treat the JSON-RPC call itself as failed.
- **The MCP text response for `get_dataset_info` truncates the description at ~500 chars with `...`.** For full-text indexing, citation, or LLM context, always fetch `https://www.data.gouv.fr/api/1/datasets/{id}/` and read `raw.description`. The MCP tool is for agent-loop control flow; the REST API is the source of truth for content.
- **Several fields the user asks for don't exist as first-class fields on data.gouv.fr.** `producer` is not separate from `organization` (the publishing organization is the producer); `categories` is not a first-class field (tags carry both topical and structural meaning; some publishers use `extras.harvest.source_label` as a category proxy). Document the conflation in the normalized record so consumers don't expect more granularity than the upstream provides.
- **Dataset IDs are MongoDB ObjectIDs (24 hex chars); resource IDs are UUIDv4.** Mixing them produces `Error: ... not found.` Use the prefix shape as a sanity check before passing IDs across tools.
- **`get_metrics` is production-only.** On the demo instance (any non-default deployment) it returns `null` or empty. Wrap it in a try/catch and don't block the pipeline on it.
- **`query_resource_data` only works for resources whose Tabular API health check passed.** `get_resource_info` exposes this with the line `Tabular API availability: ⚠️ Not available via Tabular API ...` — gate the call on it. Calling `query_resource_data` on an unprofiled or remote file produces a misleading "no rows" result instead of an error.
- **Resource URLs can point off-domain.** Many publishers (SNCF, INSEE, Météo-France) host the actual files on their own CDN; `resources[].filetype === "remote"` flags this. The MCP server does not proxy these; your pipeline must follow the redirect itself and budget for upstream availability separately.
- **No formal rate limit but `429`s appear above ~10 req/s.** Cap concurrency at 5 + jitter. Both surfaces (`mcp.data.gouv.fr` and `www.data.gouv.fr`) share the upstream API server.
- **`search_datasets` uses AND-logic with French stemming.** Generic words ("data", "fichier", "données") return zero results despite the catalogue having hundreds of thousands of records. Use 1–3 distinctive French terms (organization acronyms, ministry names, sector terms). Quoted phrases are not supported.
- **Resources `latest` field is the citation-stable URL.** `resources[].url` can change when the publisher uploads a new version; `resources[].latest = https://www.data.gouv.fr/api/1/datasets/r/<resource_id>` is a permanent redirect to whatever the current file is. Persist `latest` in citations and `url` for download.
- **`spatial.zones` uses ISO-3166 zone codes prefixed by granularity** — e.g. `country:fr`, `fr:departement:75`, `fr:commune:75056`. Don't assume free-form strings.
- **`temporal_coverage` may be null.** ~40% of datasets in the catalogue have not declared a temporal coverage; emit `null` in the normalized record rather than guessing from `last_modified`.

## Expected Output

One record per dataset, JSON shape:

```json
{
  "title": "Données du marché français du transport ferroviaire de voyageurs et de marchandises",
  "description": "Contenu du jeu de données : ce jeu inclut les principaux indicateurs ... (full text, markdown)",
  "url": "https://www.data.gouv.fr/datasets/donnees-du-marche-francais-du-transport-ferroviaire-de-voyageurs-et-de-marchandises",
  "organization": {
    "name": "Autorité de régulation des transports (anciennement Arafer)",
    "acronym": "Autorité de régulation des transports",
    "id": "5a65deb788ee38279c49d926",
    "slug": "autorite-de-regulation-des-transports-anciennement-arafer",
    "badges": ["certified", "public-service"],
    "page": "https://www.data.gouv.fr/organizations/autorite-de-regulation-des-transports-anciennement-arafer"
  },
  "producer": "Autorité de régulation des transports (anciennement Arafer)",
  "tags": ["ferroviaire","fret","rer","rfn","tagv","ter","transilien","transport-de-marchandises","transport-de-voyageurs"],
  "categories": [],
  "license": "fr-lo",
  "created_at": "2018-05-17T11:29:15.482000+00:00",
  "updated_at": "2024-12-19T13:45:52+00:00",
  "frequency": "annual",
  "geographic_scope": {
    "granularity": "country",
    "zones": ["country:fr"],
    "geom": null
  },
  "temporal_coverage": { "start": "2015-01-01", "end": "2022-12-31" },
  "resources": [
    {
      "id": "205bfae4-5c52-4f37-8f87-d1286f8bb798",
      "title": "Données du marché français du transport ferroviaire de voyageurs et de marchandises",
      "description": "La base de données inclut ...",
      "format": "xlsx",
      "type": "main",
      "filesize": 6770997,
      "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "url": "https://ftp.autorite-transports.fr/ART_donnees_transport_ferroviaire.xlsx",
      "latest": "https://www.data.gouv.fr/api/1/datasets/r/205bfae4-5c52-4f37-8f87-d1286f8bb798",
      "created_at": "2018-05-17T11:32:18.599000+00:00",
      "last_modified": "2024-12-19T13:45:52+00:00",
      "schema": null,
      "tabular_api_available": false
    }
  ],
  "file_urls": [
    "https://ftp.autorite-transports.fr/ART_donnees_transport_ferroviaire.xlsx"
  ],
  "api_endpoints": [
    "https://www.data.gouv.fr/api/1/datasets/r/205bfae4-5c52-4f37-8f87-d1286f8bb798"
  ],
  "formats": ["xlsx"],
  "metadata": {
    "id": "5afd4b6bc751df5b49337448",
    "slug": "donnees-du-marche-francais-du-transport-ferroviaire-de-voyageurs-et-de-marchandises",
    "uri": "https://www.data.gouv.fr/api/1/datasets/donnees-du-marche-francais-du-transport-ferroviaire-de-voyageurs-et-de-marchandises/",
    "extras": {},
    "harvest": null,
    "private": false,
    "archived": null
  },
  "related_datasets": [],
  "quality_signals": {
    "score": 0.7777777777777778,
    "all_resources_available": true,
    "has_open_format": false,
    "has_resources": true,
    "license": true,
    "spatial": true,
    "temporal_coverage": true,
    "update_frequency": true,
    "update_fulfilled_in_time": false,
    "dataset_description_quality": true,
    "resources_documentation": true,
    "views": 9341,
    "downloads": 2312,
    "reuses": 0,
    "followers": 0
  },
  "extraction_date": "2026-05-22T02:14:00.000Z",
  "raw_source_url": "https://www.data.gouv.fr/api/1/datasets/donnees-du-marche-francais-du-transport-ferroviaire-de-voyageurs-et-de-marchandises/"
}
```

Three additional outcome shapes the pipeline must handle:

```json
// No matches for a search query
{ "query": "zzzzzqyxxx_no_such", "total_results": 0, "results": [], "extraction_date": "2026-05-22T02:14:00.000Z" }

// Dataset lookup miss (bogus id, or upstream deleted)
{ "dataset_id": "bogus-id-xxxxxxxxxxxx", "error": "not_found", "extraction_date": "2026-05-22T02:14:00.000Z" }

// MCP succeeded but REST enrichment failed (5xx) — partial record, marked
{ "title": "...", "url": "...", "extraction_partial": true, "metadata": { "rest_error": "503", ... }, "extraction_date": "..." }
```

### Best practices to avoid incomplete or messy extraction

1. **Always run `tools/list` once per session** and cache the schema. Detects upstream tool additions/renames without code changes.
2. **Always fall through to `https://www.data.gouv.fr/api/1/datasets/{id}/`** for the canonical full record. The MCP text response is for control flow, not content.
3. **Detect `Error:` and `No <X> found` text prefixes** before treating a tool response as data. Never trust `isError` alone — see gotcha.
4. **Validate every ID before passing it between tools.** ObjectID (24 hex) for datasets and organizations; UUID v4 for resources and dataservices. Mismatch → guaranteed lookup miss.
5. **Persist `last_modified` between runs** and skip re-extraction when it hasn't advanced. Saves ~95% of pipeline cost on daily refreshes.
6. **Cap concurrency at 5** parallel MCP + 5 parallel REST calls. Add 200–800 ms jitter. Both surfaces share the upstream rate-limiter.
7. **Emit JSON, not CSV, as the primary output.** Use CSV only as a flattened export. Round-tripping CSV → JSON loses arrays, nested quality, and spatial.
8. **Stamp `extraction_date` and `raw_source_url` on every record.** Lets downstream consumers re-resolve and verify provenance.
9. **Do not write logic that depends on the MCP server's text wording.** The numbered-list format ("1. <title>\n   ID: ...\n") is stable today (server v1.27.1) but is not a contract. Use regex extractors defensively and fall back to the REST API on parse failure.
10. **Treat the demo and production deployments as different scopes.** `get_metrics` is empty on demo. Always verify which deployment the agent is targeting by reading the server-info from `initialize`.
