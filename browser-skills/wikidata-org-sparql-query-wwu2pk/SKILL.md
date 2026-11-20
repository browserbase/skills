---
name: wikidata-org-sparql-query-wwu2pk
title: Wikidata SPARQL Query
description: >-
  Execute SPARQL against Wikidata's public Query Service and return structured
  JSON. Accepts raw SPARQL, a Wikidata entity QID (with optional property-PID
  filter), or a natural-language relational question that the agent translates
  into SPARQL. Honors output format (JSON/XML/CSV/TSV), label language, LIMIT,
  and the 60s endpoint timeout. Read-only — mutation queries rejected
  client-side.
website: wikidata.org
category: knowledge-graph
tags:
  - wikidata
  - sparql
  - knowledge-graph
  - rdf
  - entity-lookup
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      The public SPARQL endpoint at query.wikidata.org/sparql is
      unauthenticated, CORS-enabled, and not anti-bot protected. For QID-only
      entity lookups, the Special:EntityData/{QID}.json endpoint is
      purpose-built and returns a structured per-language envelope ~1.5x smaller
      than SPARQL DESCRIBE.
  - method: browser
    rationale: >-
      The WDQS web UI (query.wikidata.org) reads SPARQL from the URL fragment
      and renders results in a downloadable table. Worth ~50x the cost of direct
      HTTP; reserve for the contingency where direct HTTP egress to
      query.wikidata.org is blocked at the network layer.
verified: false
proxies: false
---
# Wikidata SPARQL Query

## Purpose

Execute SPARQL against Wikidata's public Query Service at `https://query.wikidata.org/sparql` and return the result set as structured JSON. Accepts three input shapes — raw SPARQL string, Wikidata entity QID (with optional property-PID filter), or a natural-language relational question that the caller translates to SPARQL using Wikidata's standard vocabulary (`wd:`, `wdt:`, `p:`, `ps:`, `pq:`, `rdfs:label`, `SERVICE wikibase:label`). Honors output format (JSON / XML / CSV / TSV), label-language code(s), `LIMIT`, and the endpoint's 60-second hard timeout. Read-only — mutation queries are rejected client-side before they leave.

## When to Use

- A caller has a SPARQL query string and wants it executed with the result rows decoded into a flat `{ var: value }` shape per row (entity URIs resolved to `{ qid, label, description, url }`).
- A caller wants the full structured profile of a Wikidata entity by QID — labels, descriptions, aliases, claims, sitelinks — without writing SPARQL.
- A caller wants to answer a relational question over Wikidata's graph ("US presidents born in Virginia", "films directed by Kubrick released before 1980") and the agent constructs the SPARQL.
- Any pipeline that currently scrapes `wikidata.org/wiki/Q...` pages — the SPARQL endpoint and `Special:EntityData` JSON endpoint are both faster, structured, and have no anti-bot.

## Workflow

The optimal path is direct HTTP. The endpoint is public, unauthenticated, CORS-enabled, and not anti-bot protected. There is **no benefit to scripted browsing of the WDQS web UI** — every shape of the SPARQL contract is reachable from `curl`. Honesty bar: no proxies, no stealth session, no `--verified` flag needed. The browser fallback below exists only for the contingency where direct HTTP egress to `query.wikidata.org` is blocked at the network layer.

Pick the path that matches your input shape:

### Path A — Raw SPARQL query  (recommended)

1. **Validate the query is read-only.** Reject any query whose tokenized first non-comment, non-`PREFIX`, non-`BASE` keyword is one of `INSERT`, `DELETE`, `LOAD`, `CLEAR`, `CREATE`, `DROP`, `COPY`, `MOVE`, `ADD`, `WITH`. The endpoint server-side rejects these anyway with HTTP 400 `MalformedQueryException` — failing client-side is cheaper and produces a cleaner error to the caller.

2. **Inject `LIMIT` if the query is unbounded.** If the query is a `SELECT` or `CONSTRUCT` and contains no top-level `LIMIT` clause, append `LIMIT 100` (or the caller's requested cap). This is the only defense against the 60-second timeout for queries that would otherwise return millions of rows. `ASK` and `DESCRIBE` are exempt.

3. **GET the endpoint with `format=json`:**
   ```
   GET https://query.wikidata.org/sparql
       ?query=<urlencoded SPARQL>
       &format=json
   Accept: application/sparql-results+json
   User-Agent: <descriptive name>/<ver> (<homepage>; <contact email>)
   ```
   POST also works (form-urlencoded body with the same `query=` parameter, or `Content-Type: application/sparql-query` with the raw query as body). Use POST when the URL-encoded query exceeds ~8 KB (HTTP server URL-length limit).

4. **Decode the response.** Shape:
   ```json
   {
     "head":    { "vars": ["item", "itemLabel", ...] },
     "results": { "bindings": [
       { "item": { "type": "uri",     "value": "http://www.wikidata.org/entity/Q42" },
         "itemLabel": { "type": "literal", "xml:lang": "en", "value": "Douglas Adams" } },
       ...
     ] }
   }
   ```
   For each row, produce a flat object keyed by SPARQL variable name. Preserve `head.vars` order so callers can render a table without re-parsing.

5. **Resolve entity URIs.** When a binding's `type === "uri"` and `value` matches `^http://www\.wikidata\.org/entity/(Q\d+)$` (note `http://`, **not** `https://` — the canonical Wikidata RDF URI scheme is `http://`), extract the QID and emit `{ qid, label, description, url: "https://www.wikidata.org/entity/Qxxxx" }`. Re-fetch labels/descriptions in batch from `Special:EntityData` if the caller asks for them and they weren't projected by `SERVICE wikibase:label` in the query.

6. **Emit the executed query verbatim** alongside the result envelope so the caller can debug / re-run.

### Path B — Entity lookup by QID  (recommended for `Q\d+` input)

For a single entity-by-QID query, **prefer `Special:EntityData` over SPARQL `DESCRIBE`** — it's purpose-built, returns a structured per-language object instead of raw RDF triples, and is ~1.5× smaller for the same entity (316 KB vs 500 KB for `Q42`).

```
GET https://www.wikidata.org/wiki/Special:EntityData/<QID>.json
User-Agent: <descriptive name>/<ver> (<homepage>; <contact email>)
```

Response shape (per entity):
```json
{
  "entities": {
    "Q42": {
      "pageid": ..., "ns": 0, "title": "Q42", "lastrevid": ..., "modified": "...",
      "type": "item", "id": "Q42",
      "labels":        { "en": { "language": "en", "value": "Douglas Adams" }, "de": {...}, ... },
      "descriptions":  { "en": { "language": "en", "value": "British science fiction writer ..." }, ... },
      "aliases":       { "en": [ { "language": "en", "value": "Douglas Noël Adams" }, ... ], ... },
      "claims":        { "P31": [ { "mainsnak": {...}, "rank": "...", "qualifiers": {...}, "references": [...] }, ... ], ... },
      "sitelinks":     { "enwiki": { "site": "enwiki", "title": "Douglas Adams", "url": "..." }, ... }
    }
  }
}
```

If the caller passed a property-PID filter (`P31`, `P50`, …), project the `claims[<PID>]` array only and drop the rest. To keep responses small, the caller can also fetch only specific languages: `Special:EntityData/Q42.json` accepts no language filter directly, so do label/description trimming client-side after the fetch. (Alternative compact endpoint: `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q42&props=labels|descriptions|claims&languages=en&format=json` — supports `languages=` filtering and `props=` selection server-side.)

### Path C — Natural-language relational question

When the input is plain English, translate to SPARQL using the standard Wikidata vocabulary:

| Token | Meaning |
|---|---|
| `wd:Qxxx` | Entity QID |
| `wdt:Pxxx` | Truthy property — direct value (use this 90% of the time) |
| `p:Pxxx` | Statement node — use to access qualifiers / references |
| `ps:Pxxx` | Statement value (after `p:Pxxx`) |
| `pq:Pxxx` | Qualifier value on a statement |
| `rdfs:label` | Label triple (language-tagged literal) |
| `SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }` | Auto-bind `?fooLabel` for any `?foo` in the SELECT |
| `SERVICE wikibase:around { ... }` | Geo-radius search |
| `SERVICE wikibase:mwapi { ... }` | Full-text search via MediaWiki API |

Skeleton for relational questions:

```sparql
SELECT ?item ?itemLabel ?dob WHERE {
  ?item wdt:P31 wd:Q5 .                # instance of human
  ?item wdt:P39 wd:Q11696 .            # position held: US president
  ?item wdt:P19 ?placeOfBirth .        # place of birth
  ?placeOfBirth wdt:P131* wd:Q1370 .   # located in (transitively) Virginia
  ?item wdt:P569 ?dob .                # date of birth
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de,fr". }
}
LIMIT 100
```

Then execute via Path A. Always inject `LIMIT` per step 2.

### Output format negotiation

| Format | How to request | Verified |
|---|---|---|
| JSON  (default) | `format=json` query param **OR** `Accept: application/sparql-results+json` | ✅ 200 OK, well-formed |
| XML | `Accept: application/sparql-results+xml` | ✅ 200 OK |
| CSV | `Accept: text/csv` | ⚠ Header-only — `format=csv` query param is silently ignored (falls through to XML, see Gotchas) |
| TSV | `Accept: text/tab-separated-values` | ⚠ Header-only — `format=tsv` query param is silently ignored |

For any caller that needs CSV/TSV, the request **must** set the `Accept` header. The `format` query parameter only honors `json`; any other value (including `csv`, `tsv`, `xml`) silently returns XML.

### Timeout handling

The endpoint has a hard 60-second query timeout. When a query exceeds it, the server either:
- Returns HTTP 500 with a body containing `java.util.concurrent.TimeoutException` (most common), or
- Returns HTTP 200 with a truncated result set and `X-SPARQL-MaxAge` headers indicating partial cache.

Detect either case and surface as `{ status: "timeout", executedQuery: "...", durationMs: ..., hint: "Add a tighter LIMIT, use wdt:P31/wdt:P279* sparingly, or pre-narrow by another property." }` rather than failing silently or returning the truncated set as if it were complete.

### Browser fallback  (last resort)

If direct HTTP egress to `query.wikidata.org` is blocked at the network layer:

1. `browse cloud sessions create --keep-alive` (no `--proxies`, no `--verified` — WDQS is bare-friendly).
2. `browse open "https://query.wikidata.org/#<URL-encoded SPARQL>" --remote --session "$sid"` — the WDQS UI auto-loads queries from the URL fragment.
3. `browse click @<run-button-ref>` then wait for the results pane to render.
4. The result pane has a download menu — emit JSON / TSV / etc. via `browse click @<download-format-ref>` then capture the file from the session's `/downloads` endpoint via `browse cloud sessions downloads get <sid>`.

This path is ~50× slower than direct HTTP and only worth it as a last-mile fallback. Don't lead with it.

## Site-Specific Gotchas

- **Entity URIs use `http://`, not `https://`.** SPARQL results return entity URIs as `http://www.wikidata.org/entity/Q42`. This is the canonical RDF URI scheme and isn't a typo or a deprecation — Wikidata's RDF dump uses `http://` permanently. The human-readable web URL is `https://www.wikidata.org/wiki/Q42` or `https://www.wikidata.org/entity/Q42`. Convert the scheme when emitting `{ url }` to the caller; never compare entity URIs case-insensitively or scheme-insensitively against `https://`.
- **`format=csv` and `format=tsv` query params silently fall through to XML.** Only `format=json` is honored as a query parameter; all other values (and unrecognized values) return `application/sparql-results+xml`. For CSV / TSV output, the `Accept` header is mandatory. Verified live 2026-05-18: `?format=csv&...` and `?format=tsv&...` both returned identical 403-byte XML bodies.
- **Missing language labels fall back to the QID as a plain literal.** When a `?itemLabel` projection (via `SERVICE wikibase:label`) has no value in the requested language, the binding is emitted as `{ type: "literal", value: "Q378619" }` — note no `xml:lang` field and the value is literally the QID string. Detect with `if (binding.value === binding.qid)` and treat as "no label in this language" — not as a real label of "Q378619".
- **`SERVICE wikibase:label` only fires when the *Label-suffix variable* is in the `SELECT`.** Pattern: project `?item` and `?itemLabel` and let the service bind the latter — never write `?item rdfs:label ?label` manually unless you need a specific language with no fallback. The service supports a comma-separated language list (`"en,de,fr"`) and chains through fallbacks automatically; manual `rdfs:label` patterns don't.
- **Mutation queries are server-side rejected at the parser layer.** `INSERT`, `DELETE`, `LOAD`, `CLEAR`, etc. return HTTP 400 with a plain-text Blazegraph stack trace (the engine is `com.bigdata.rdf.sail.webapp.BigdataServlet`). Don't bother proxying the trace to the caller; reject client-side with a one-line "Wikidata SPARQL endpoint is read-only" error.
- **The endpoint is Blazegraph, not Apache Jena or Virtuoso.** Some SPARQL 1.1 features behave differently. Notably: `SERVICE` calls to external endpoints are restricted to a whitelist (only `wikibase:label`, `wikibase:around`, `wikibase:box`, `wikibase:mwapi`, and a small set of geo-coding services). Federation to arbitrary SPARQL endpoints is **disabled**. If a translated query has `SERVICE <http://...>` to anything outside that list, expect HTTP 500.
- **60-second hard timeout, no extension.** There is no way to ask for more. The remediation is always to narrow the query — add `LIMIT`, pre-filter by a more selective property, replace `wdt:P31/wdt:P279*` with a direct `wdt:P31 wd:Qxxx`. The WDQS team documents this at `https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual`.
- **User-Agent etiquette is enforced.** Per Wikimedia's UA policy, requests with generic `python-requests/X.Y.Z`, `curl/X`, or empty UAs may be 429'd or blocked. Set a descriptive UA like `your-product/1.0 (https://your-site; contact@your-site)`. We did not hit a UA block during evidence-gathering with `browse cloud fetch` (which sets its own descriptive UA), but a bare `curl` from a high-volume IP can be throttled.
- **DESCRIBE returns the entire RDF graph for an entity, including statement / reference / qualifier nodes.** For `wd:Q42` this is ~500 KB and ~4,000 quads — the variable bindings come out as `{ subject, predicate, object, context }`. Don't use `DESCRIBE` for entity-lookup; use `Special:EntityData/<QID>.json` (Path B). `DESCRIBE` is only the right tool when the caller is RDF-native and wants triples.
- **The `Special:EntityData` JSON endpoint does NOT filter by language server-side.** `Special:EntityData/Q42.json` always returns labels/descriptions in all available languages (~200+ for popular entities) and all 132 sitelinks. To get a single language, either trim client-side, or use the `wbgetentities` MediaWiki API (`/w/api.php?action=wbgetentities&ids=Q42&languages=en&props=labels|descriptions&format=json`) which supports `languages=` and `props=` filters.
- **Rate limits are concurrency-based, not request-rate-based.** WDQS allows ~5 concurrent queries per IP and ~30 query-minutes per minute of wallclock per IP. Bursting 100 cheap queries serially is fine; bursting 20 cheap queries in parallel will get some 429'd. Throttle parallel issue, not total volume.
- **The result-set caps at 1,048,576 rows (~1M) regardless of `LIMIT`.** Above that the server returns a truncation marker. For bulk extraction beyond 1M rows, paginate via `ORDER BY ?id OFFSET N LIMIT N` over a stable id or splice the query by a class / date range.
- **Comments must use `#`, not `//` or `/* */`.** Trailing `//` comments are valid SPARQL only if they're inside a literal; bare `//` outside a string makes the parser choke with `MalformedQueryException`.

## Expected Output

Successful execution returns one envelope:

```json
{
  "status": "ok",
  "endpoint": "https://query.wikidata.org/sparql",
  "executedQuery": "SELECT ?item ?itemLabel ?dob WHERE { ?item wdt:P31 wd:Q5 ; wdt:P39 wd:Q11696 ; wdt:P19 ?p . ?p wdt:P131* wd:Q1370 . ?item wdt:P569 ?dob . SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\" } } LIMIT 100",
  "format": "json",
  "language": "en",
  "vars": ["item", "itemLabel", "dob"],
  "durationMs": 482,
  "totalRows": 8,
  "rows": [
    {
      "item":      { "qid": "Q23",    "label": "George Washington", "description": "1st President of the United States",     "url": "https://www.wikidata.org/entity/Q23" },
      "itemLabel": "George Washington",
      "dob":       "1732-02-22T00:00:00Z"
    }
    /* ... */
  ]
}
```

Entity-lookup (Path B) returns an unwrapped structured-entity envelope:

```json
{
  "status": "ok",
  "endpoint": "https://www.wikidata.org/wiki/Special:EntityData/Q42.json",
  "qid": "Q42",
  "lastrevid": 2245983400,
  "modified": "2026-04-12T08:15:32Z",
  "labels":       { "en": "Douglas Adams", "de": "Douglas Adams", "fr": "Douglas Adams" },
  "descriptions": { "en": "British science fiction writer and humorist (1952–2001)" },
  "aliases":      { "en": ["Douglas Noël Adams", "Douglas N. Adams"] },
  "claims":       { "P31": [{ "value": { "qid": "Q5", "label": "human" }, "rank": "normal" }], "P21": [/* ... */] },
  "sitelinks":    { "enwiki": "https://en.wikipedia.org/wiki/Douglas_Adams", "dewiki": "...", "frwiki": "..." }
}
```

Read-only-violation envelope (client-side reject for mutation input):

```json
{
  "status": "rejected_read_only",
  "reason": "Wikidata's public SPARQL endpoint is read-only. INSERT / DELETE / LOAD / CLEAR / CREATE / DROP / COPY / MOVE / ADD / WITH are not permitted.",
  "executedQuery": null
}
```

Timeout envelope:

```json
{
  "status": "timeout",
  "endpoint": "https://query.wikidata.org/sparql",
  "executedQuery": "...",
  "durationMs": 60042,
  "hint": "Wikidata's SPARQL endpoint has a hard 60-second query timeout. Add a tighter LIMIT, replace transitive paths (wdt:P131*, wdt:P279*) with direct properties, or pre-narrow by a more selective WHERE clause."
}
```

Server-error envelope (HTTP 4xx/5xx other than timeout):

```json
{
  "status": "error",
  "httpStatus": 400,
  "endpoint": "https://query.wikidata.org/sparql",
  "executedQuery": "...",
  "message": "MalformedQueryException: Encountered \" \"insert\" \"INSERT \"\" at line 1, column 1.",
  "hint": "SPARQL parser rejected the query. Common causes: stray // comments, missing PREFIX declarations, mutation keywords (INSERT/DELETE), or unbalanced braces."
}
```
