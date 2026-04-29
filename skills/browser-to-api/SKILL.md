---
name: browser-to-api
description: Turn a website's observable HTTP traffic into a best-effort OpenAPI 3.1 spec by analyzing a `browser-trace` capture. Use when the user wants to discover/extract API endpoints from a browser session, build an OpenAPI doc from network traffic, or document a third-party site's XHR/fetch surface for client integration.
compatibility: "Requires Node 18+ and a `browser-trace` run directory (`.o11y/<run>/`) produced by the sibling `browser-trace` skill. The scripts use only the Node standard library — no `npm install` step. `jq` is referenced in docs for ad-hoc querying but is not required by the scripts."
license: MIT
allowed-tools: Bash, Read, Grep
---

# Browser to API

Replay-driven API discovery. Consume a `browser-trace` capture, pair its CDP request / response events, templatize observed URLs, infer JSON schemas from samples, and emit an **OpenAPI 3.1** document plus a human-readable coverage report.

This skill **does not capture traffic**. It is purely offline post-processing on top of `browser-trace`'s `cdp/network/*.jsonl` buckets. The two skills compose:

```
browser-trace    →  .o11y/<run>/cdp/network/{requests,responses}.jsonl
browser-to-api   →  .o11y/<run>/api-spec/openapi.yaml + report.md
```

## When to use

- The user wants an OpenAPI document for a third-party or undocumented website API.
- The user has a `browser-trace` run and wants endpoints + schemas extracted from it.
- The user is building a client/SDK against a site that doesn't publish a spec.
- The user wants a coverage report showing which flows would broaden the spec.

If the user wants to **capture** traffic, send them to `browser-trace` first.

## Two-step workflow

### 1. Capture with `browser-trace` (and optionally bodies via `browse network on`)

```bash
# Local Chrome example (see browser-trace SKILL.md for Browserbase variant)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-spec about:blank &

node ../browser-trace/scripts/start-capture.mjs 9222 my-site
browse env local 9222
browse network on                                    # capture request/response bodies
browse open https://example.com
# ...drive whatever flows you want covered...

# Snapshot the bodies dir BEFORE turning capture off (the temp dir is shared
# per-session, so subsequent `browse network on` runs would mix your bodies
# with whatever a future capture writes if you skip this step).
cp -r "$(browse network path | jq -r .path)" .o11y/my-site/cdp/network/bodies/
browse network off

node ../browser-trace/scripts/stop-capture.mjs my-site
node ../browser-trace/scripts/bisect-cdp.mjs my-site
```

`browse network on` is **optional but strongly recommended** — without it, the spec has no response-body schemas (the CDP firehose used by `browse cdp` does not embed bodies). With it, both request bodies (already captured by CDP) *and* response bodies are joined into the trace by CDP `requestId`.

### 2. Generate the spec

```bash
node scripts/discover.mjs --run .o11y/my-site
# → .o11y/my-site/api-spec/openapi.yaml
#   .o11y/my-site/api-spec/openapi.json
#   .o11y/my-site/api-spec/report.md
#   .o11y/my-site/api-spec/confidence.json
#   .o11y/my-site/api-spec/samples/*.json
#   .o11y/my-site/api-spec/intermediate/*.jsonl
```

`discover.mjs` auto-detects `<run>/cdp/network/bodies/`. To use a body capture from elsewhere (e.g. didn't snapshot, want the live `browse network` dir), pass `--bodies <path>` explicitly.

The two primary deliverables are `openapi.yaml` (machine-readable spec) and `report.md` (human-readable coverage summary).

## CLI flags

| Flag | Required | Meaning |
|---|---|---|
| `--run <path>` | yes | Path to a `browser-trace` run directory |
| `--out <path>` | no | Output dir; default `<run>/api-spec/` |
| `--bodies <path>` | no | `browse network` capture dir to join into the trace (auto-detected from `<run>/cdp/network/bodies/` when present) |
| `--include <regex>` | no | Only include URLs matching regex (repeatable) |
| `--exclude <regex>` | no | Exclude URLs matching regex (repeatable; in addition to defaults) |
| `--origins <list>` | no | Comma-separated origin allow-list (e.g. `api.example.com,example.com`) |
| `--format <yaml\|json\|both>` | no | Output format. Default `both` |
| `--title <string>` | no | OpenAPI `info.title`. Default derived from primary origin |
| `--redact <list>` | no | Extra header names / JSON keys to redact (comma-separated) |
| `--min-samples <n>` | no | Minimum samples per endpoint to include. Default `1` |
| `--stage <name>` | no | Run only one stage: `load`, `filter`, `normalize`, `infer`, `emit` |

## Output layout

```
<run>/api-spec/
├── openapi.yaml              primary deliverable
├── openapi.json              mirror
├── report.md                 human-readable summary + coverage caveats
├── confidence.json           per-endpoint confidence + normalization flags
├── samples/                  redacted request/response examples
│   └── <method>__<path-hash>.json
└── intermediate/             pipeline byproducts (paired/filtered/endpoints jsonl)
```

## What you get from `browse cdp` and `browse network`

Two complementary capture sources:

| Source | Provides | Limitation |
|---|---|---|
| `browse cdp` (used by `browser-trace`) | request method/URL/headers/`postData`, response status/headers/mimeType, full event timing | **Does not embed response bodies.** Bodies must be pulled with `Network.getResponseBody`, which the firehose doesn't do. |
| `browse network on` (separate command) | request bodies AND response bodies on disk, keyed by CDP `requestId` | Capture dir is shared per `browse` session; snapshot before another `browse network on` overwrites it. |

`discover.mjs` will pull bodies from a `browse network` dir if you pass `--bodies <path>` (or stash them under `<run>/cdp/network/bodies/`, which is auto-detected). The matching is by `requestId` — `browse network` writes that into each `request.json` as `id`, and we join directly.

What changes when bodies are present:

- ✅ Path templating, query-param schemas, status codes, content-types — same either way.
- ✅ Request-body schemas — `postData` from CDP is enough; bodies dir is a nice-to-have for non-`postData` cases.
- ✅ **Response-body schemas** — fully inferred from real samples. Without bodies you get `{ description, content: <mimeType> }` skeletons.

The report flags every endpoint that has no response-body sample.

## Limitations

- **Coverage is bounded by the captured flow.** Endpoints not exercised in the trace will not appear. The skill cannot prove completeness.
- **Schemas are inductive, not contractual.** A field might be optional on the server even if every sample contained it.
- **Auth is observed, not specified.** The skill records auth-shaped headers in an `x-observed-auth` extension but won't claim a security scheme.
- **Path templating is heuristic.** Numeric / UUID / hex / slug patterns are detected per segment. Ambiguous URLs are flagged in `confidence.json`.
- **Redaction is best-effort.** Default redactions cover common credentials, but app-specific secrets may slip through; use `--redact` for known custom headers/keys.

## Best practices

1. **Drive the flows you want documented.** The richer the browser-trace, the richer the spec.
2. **Use `--origins` for noisy sites.** A marketing page hits dozens of analytics hosts; restrict to the API origin you care about.
3. **Inspect `report.md` first.** Low-sample endpoints, single-status endpoints, and missing request bodies are listed there with concrete suggestions.
4. **Bump `--min-samples` to 2+** when you want only confidently-shaped endpoints in the final doc — drop the long tail.
5. **Pair with `browse network on`** when response-body schemas matter. The CDP firehose alone has request bodies but not response bodies.

For pipeline internals and the file format reference, see [REFERENCE.md](REFERENCE.md).
