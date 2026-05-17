---
name: browser-trace
description: Capture a full DevTools-protocol trace of any browser automation — CDP firehose, screenshots, and DOM dumps — then bisect the stream into per-page searchable buckets. Use when the user wants to debug a failed run, audit network/console/DOM activity, attach a trace to an in-progress session, or feed structured per-page summaries back into an agent loop so its next iteration learns from the last one.
compatibility: "Requires Node 18+, the browse CLI (`npm install -g browse`) with `browse cdp`, and optionally `jq` for ad-hoc querying of the bisected JSONL files. For remote Browserbase sessions, also requires `BROWSERBASE_API_KEY`. The skill scripts themselves use only the Node standard library — no `npm install` step."
license: MIT
allowed-tools: Bash, Read, Grep
---

# Browser Trace

Attach a **second, read-only CDP client** to a browser session that is already being driven by your main automation. The trace records the full DevTools firehose to NDJSON, polls for screenshots and DOM dumps in parallel, and slices everything into a directory tree that bash tools can search.

This skill does **not** drive pages — it only listens. Pair it with the `browser` skill, `browse`, Stagehand, Playwright, or anything else that speaks CDP.

## When to use

- The user wants to debug a browser-automation run (failing form, missing element, hung navigation, JS exception).
- The user has a running automation and wants to attach a trace mid-flight without restarting it.
- The user wants to split a CDP firehose into network / console / DOM / page buckets.
- The user wants screenshots + DOM snapshots over time, joined to CDP events by timestamp.

If the user just wants to **drive** the browser, use the `browser` skill instead.

## Setup check

```bash
node --version                                  # require Node 18+
which browse || npm install -g browse
which jq     || true                                # optional — used only for ad-hoc querying
```

Verify `browse cdp` exists:

```bash
browse --help | grep -q "^\s*cdp " || echo "browse cdp not available — update browse"
```

## How it works

Every Chrome DevTools target accepts **multiple concurrent CDP clients**. Your main automation is one client; this skill adds a second one that only enables observation domains (Network, Console, Runtime, Log, Page) and never sends action commands.

The tracer has three pieces:

1. **Firehose**: `browse cdp <target>` streams every CDP event as one JSON object per line to `cdp/raw.ndjson`.
2. **Sampler**: a polling loop calls `browse screenshot --cdp <target> --path <file>` and `browse get html body --cdp <target>` on an interval (default 2s). The helper passes `--cdp` when it samples so it can attach to the traced target from its own process; once a browse daemon session is attached to a CDP target, follow-up commands in that session do not need to repeat `--cdp`.
3. **Bisector**: after the run, `bisect-cdp.mjs` walks `raw.ndjson` once, slices it into per-bucket JSONL files keyed by CDP method, and additionally bisects per page using top-level `Page.frameNavigated` events as boundaries.

## Quickstart

### Local Chrome

```bash
# 1. Launch Chrome with a debugger port (any user-data-dir keeps it isolated).
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-o11y \
  about:blank &

# 2. Start the tracer.
node scripts/start-capture.mjs 9222 my-run

# 3. Run your main automation against port 9222.
browse open https://example.com --cdp 9222
# ...whatever the run does...

# 4. Stop and bisect.
node scripts/stop-capture.mjs my-run
node scripts/bisect-cdp.mjs my-run
```

### Browserbase remote

Two helpers wrap the platform-side bookkeeping: `bb-capture.mjs` creates or attaches to a session and starts the tracer; `bb-finalize.mjs` pulls platform artifacts (final session metadata, server logs, downloads) into the run dir at the end.

> Browserbase ends a session as soon as its last CDP client disconnects. **Create with `--keep-alive`, then attach automation to the session's `connectUrl` before or together with the tracer.** `bb-capture.mjs --new` handles the keep-alive session and tracer setup; your automation still needs to attach.

```bash
export BROWSERBASE_API_KEY=...

# 1. Create a keep-alive session AND start the tracer in one step.
#    Prints the session id, connectUrl prefix, and a live debugger URL you
#    can open in a browser to watch the run interactively.
node scripts/bb-capture.mjs --new my-run

# 2. Drive automation. bb-capture stamped the session id into the manifest.
SID=$(jq -r .browserbase.session_id .o11y/my-run/manifest.json)
CONNECT_URL="$(browse cloud sessions get "$SID" | jq -r .connectUrl)"
BROWSE_NAME=my-run-browser
browse open https://example.com --cdp "$CONNECT_URL" --session "$BROWSE_NAME"
browse open https://news.ycombinator.com --session "$BROWSE_NAME"

# 3. Stop the tracer, bisect, then pull platform artifacts and release.
node scripts/stop-capture.mjs my-run
node scripts/bisect-cdp.mjs my-run
node scripts/bb-finalize.mjs my-run --release
```

Attaching to a session that's *already running* (e.g. one your production worker created) — `bb-capture.mjs` accepts a session id instead of `--new`:

```bash
# Pick a running session (filter client-side; browse cloud sessions list has no --status flag)
browse cloud sessions list | jq -r '.[] | select(.status == "RUNNING") | .id'

node scripts/bb-capture.mjs <session-id> mid-flight-debug
# ...tracer runs alongside the existing automation client; no disruption...
node scripts/stop-capture.mjs mid-flight-debug
node scripts/bisect-cdp.mjs mid-flight-debug
node scripts/bb-finalize.mjs mid-flight-debug   # without --release: leave the session running
```

#### What you get from the Browserbase platform

`bb-capture.mjs` adds a `browserbase` block to `manifest.json` (session id, project, region, started_at, expires_at, debugger URL). `bb-finalize.mjs` writes:

- `<run>/browserbase/session.json` — final `browse cloud sessions get` snapshot (proxyBytes, status, ended_at, viewport, …)
- `<run>/browserbase/logs.json` — `browse cloud sessions logs` output. **Often empty.** The CDP firehose in `cdp/raw.ndjson` is the source of truth; this is a side channel.
- `<run>/browserbase/downloads.zip` — files the session downloaded, if any (the script discards the empty 22-byte zip you get when there are none)

Session replay artifact fetching is **deprecated** and isn't fetched. Use the screenshots + DOM dumps in `screenshots/` and `dom/` for visual ground truth.

The live `debugger_url` in the manifest opens an interactive Chrome DevTools view served by Browserbase — handy for *watching* a long-running automation while the tracer captures the firehose to disk.

## Filesystem layout

```
.o11y/<run-id>/
  manifest.json                 run metadata: target, domains, started_at, stopped_at
  index.jsonl                   one line per sample: {ts, screenshot, dom, url}
  cdp/
    raw.ndjson                  full CDP firehose (one JSON object per line)
    summary.json                {sessionId, duration, totalEvents, pages[]} — see shape below
    network/{requests,responses,finished,failed,websocket}.jsonl   session-wide buckets (always written)
    console/{logs,exceptions}.jsonl
    runtime/all.jsonl
    log/entries.jsonl
    page/{navigations,lifecycle,frames,dialogs,all}.jsonl
    dom/all.jsonl                                                  (only if O11Y_DOMAINS includes DOM)
    target/{attached,detached}.jsonl
    pages/                      per-page slices, indexed by top-level frameNavigated boundaries
      000/                      first concrete page
        url.txt                 the URL for this page
        summary.json            this page's domains/network/timing block (same shape as a pages[] entry)
        raw.jsonl               firehose scoped to this page
        network/, console/, page/, runtime/, log/, target/, dom/    same buckets, only non-empty files
  screenshots/<iso-ts>.png      one PNG per sample interval
  dom/<iso-ts>.html             one HTML dump per sample interval
  browserbase/                  added by bb-finalize.mjs (Browserbase runs only)
    session.json                final `browse cloud sessions get` snapshot (proxyBytes, status, ended_at, …)
    logs.json                   `browse cloud sessions logs` output (often [])
    downloads.zip               `browse cloud sessions downloads get` output (only if the session downloaded files)
```

When a run was started via `bb-capture.mjs`, `manifest.json` also carries a top-level `browserbase` block: `session_id`, `project_id`, `region`, `started_at`, `expires_at`, `keep_alive`, `debugger_url`.

### Summary shape

`cdp/summary.json` is the entry point for any analysis: it has session-level totals and a `pages[]` array indexed by top-level `Page.frameNavigated`. Per-page entries are emitted in navigation order (page 0 = first concrete URL).

```json
{
  "sessionId": "45f28023-…",
  "duration": { "startMs": 1777312533000, "endMs": 1777312609000, "totalMs": 76000 },
  "totalEvents": 420,
  "pages": [
    {
      "pageId": 0,
      "url": "https://example.com/",
      "startMs": 1777312533000, "endMs": 1777312538886, "durationMs": 5886,
      "eventCount": 60,
      "domains": {
        "Network": { "count": 18, "errors": 1 },
        "Console": { "count": 2 },
        "Page":    { "count": 24 },
        "Runtime": { "count": 13 }
      },
      "network": { "requests": 4, "failed": 1, "byType": { "Document": 2, "Script": 1, "Other": 1 } }
    }
  ]
}
```

`startMs` / `endMs` / `durationMs` are wall-clock ms, derived from `manifest.started_at` plus the offset of each event's CDP monotonic timestamp. `domains[*]` only includes `errors`/`warnings` keys when non-zero.

### Drilling in with `query.mjs`

For interactive exploration, use `scripts/query.mjs <run-id> <command>` instead of remembering paths:

```bash
node scripts/query.mjs my-run list                    # one-line table of pages
node scripts/query.mjs my-run page 1                  # full summary for page 1
node scripts/query.mjs my-run page 1 network/failed   # cat failed.jsonl for page 1
node scripts/query.mjs my-run errors                  # all errors across pages, attributed by pid
node scripts/query.mjs my-run errors 2                # errors from page 2 only
node scripts/query.mjs my-run hosts                   # top hosts by request count
node scripts/query.mjs my-run host api.example.com    # all requests/responses for a host
node scripts/query.mjs my-run summary                 # full summary.json
```

Behind the scenes it just reads `cdp/summary.json` and the `cdp/pages/<pid>/` tree — feel free to bypass it with raw `jq`/`rg` once you know the shape.

## Top traversal recipes

```bash
# All failed network requests (use jq -c to keep it line-delimited)
jq -c '.params' .o11y/<run>/cdp/network/failed.jsonl

# Find requests to a specific host
jq -c 'select(.params.request.url | test("api\\.example\\.com"))' \
  .o11y/<run>/cdp/network/requests.jsonl

# 4xx/5xx responses
jq -c 'select(.params.response.status >= 400)
       | {status: .params.response.status, url: .params.response.url}' \
  .o11y/<run>/cdp/network/responses.jsonl

# Console errors only
jq -c 'select(.params.type == "error")' .o11y/<run>/cdp/console/logs.jsonl

# Sequence of URLs visited
jq -r '.params.frame.url' .o11y/<run>/cdp/page/navigations.jsonl

# Find the screenshot taken closest to a timestamp (e.g., when an exception fired)
ls .o11y/<run>/screenshots/ | sort | awk -v t=20260427T1714123NZ '
  $0 >= t { print; exit }'
```

See **REFERENCE.md** for the full jq recipe library and a method-by-method bisect map. See **EXAMPLES.md** for end-to-end debug scenarios.

## Best practices

1. **Use `bb-capture.mjs` on Browserbase**: it enforces `--keep-alive`, fetches the connectUrl, captures the debugger URL, and stamps the manifest. Doing it manually invites mistakes.
2. **Don't `--release` a session you don't own**: `bb-finalize.mjs --release` is for sessions *you* created with `--new`. When attaching to a production session via `bb-capture.mjs <session-id>`, run `bb-finalize.mjs` without `--release` so the original automation keeps running.
3. **Order matters for remote**: on Browserbase, attach the main automation client before (or together with) the tracer, and create the session with `--keep-alive`. Otherwise the session ends as soon as the tracer's WS closes.
4. **Don't poll faster than ~1s**: each sample runs browser CLI read commands and screenshots Chrome. 2s is a good default.
5. **Pick domains deliberately**: defaults (`Network Console Runtime Log Page`) cover most debugging. Add `DOM` for DOM-tree mutations (very noisy) via `O11Y_DOMAINS="$O11Y_DOMAINS DOM"`.
6. **Reuse one Browserbase session for the automation client on remote** by attaching to that session's `connectUrl` with `browse open ... --cdp "$CONNECT_URL" --session <name>`. The `--session` flag names the local browse daemon; it is not a Browserbase session attach flag.
7. **Always run `stop-capture.mjs`**, even after a crash, so background processes don't linger and the manifest gets `stopped_at`.
8. **Bisect once per run**: `bisect-cdp.mjs` is idempotent — it overwrites the per-bucket files from `raw.ndjson` each time.

## Troubleshooting

- **`browse cdp exited immediately`**: usually means the target is unreachable (wrong port) or the Browserbase session has already ended. For remote, verify with `browse cloud sessions get <id>` — if `status` is `COMPLETED`, recreate with `--keep-alive` and attach automation first.
- **Empty `raw.ndjson` even though processes are running**: confirm a CDP client is actually driving the page. The tracer only emits events that the browser generates, so an idle browser produces ~5 lines of attach/discover messages and nothing else.
- **Screenshots all look identical**: check `index.jsonl` — if `url` doesn't change, the page hasn't navigated yet. The polling loop runs independently of the main automation's pace.
- **Browserbase session ends mid-run**: it likely hit `--timeout`. Recreate with a higher timeout (`BB_SESSION_TIMEOUT=1800 node scripts/bb-capture.mjs --new ...`) or remove the timeout flag.
- **`bb-capture.mjs <id>` says "not RUNNING"**: the session you tried to attach to ended. List candidates with `browse cloud sessions list | jq '.[] | select(.status == "RUNNING")'` and try again.
- **`browserbase/logs.json` is empty `[]`**: expected — `browse cloud sessions logs` is sparse in practice. The CDP firehose in `cdp/raw.ndjson` is the source of truth.
- **Where's the session recording (rrweb)?**: session replay artifact fetching is deprecated; this skill doesn't fetch it. Use the screenshot stream in `screenshots/` and DOM dumps in `dom/`.

For full reference, see [REFERENCE.md](REFERENCE.md).
For example debug runs, see [EXAMPLES.md](EXAMPLES.md).
