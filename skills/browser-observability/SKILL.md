---
name: browser-observability
description: Capture full DevTools-protocol observability data alongside any browser automation, then bisect the firehose into searchable buckets. Use when the user wants to debug a browser run, audit network/console/DOM activity, attach observability to an in-progress session, or build a structured artifact tree (CDP events, screenshots, DOM dumps) that bash tools can search.
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli@alpha` or 0.5.1+ once released — `browse cdp` is alpha-tagged) and `jq`. For remote Browserbase sessions, also requires the `bb` CLI (`npm install -g @browserbasehq/cli`) and `BROWSERBASE_API_KEY`."
license: MIT
allowed-tools: Bash, Read, Grep
---

# Browser Observability

Attach a **second CDP client** to a browser session that is already being driven by your main automation. The observer records the full DevTools firehose to NDJSON, polls for screenshots and DOM dumps in parallel, and slices everything into a directory tree that bash tools can search.

This skill does **not** drive pages — it only listens. Pair it with the `browser` skill, `bb`, Stagehand, Playwright, or anything else that speaks CDP.

## When to use

- The user wants to debug a browser-automation run (failing form, missing element, hung navigation, JS exception).
- The user has a running automation and wants to attach observability mid-flight without restarting it.
- The user wants to split a CDP firehose into network / console / DOM / page buckets.
- The user wants screenshots + DOM snapshots over time, joined to CDP events by timestamp.

If the user just wants to **drive** the browser, use the `browser` skill instead.

## Setup check

```bash
which browse || npm install -g @browserbasehq/browse-cli@alpha
which jq || brew install jq           # macOS; on Linux: apt/yum/dnf install jq
which bb || npm install -g @browserbasehq/cli   # only needed for Browserbase remote
```

Verify `browse cdp` exists (it ships in 0.5.0-alpha-a4ca430+):

```bash
browse --help | grep -q "^\s*cdp " || echo "browse cdp not in this version — install @alpha"
```

## How it works

Every Chrome DevTools target accepts **multiple concurrent CDP clients**. Your main automation is one client; this skill adds a second one that only enables observation domains (Network, Console, Runtime, Log, Page) and never sends action commands.

The observer has three pieces:

1. **Firehose**: `browse cdp <target>` streams every CDP event as one JSON object per line to `cdp/raw.ndjson`.
2. **Sampler**: a polling loop calls `browse --ws <target> screenshot` and `browse --ws <target> get html body` on an interval (default 2s). `--ws` is one-shot and bypasses the daemon, so it doesn't fight the main automation.
3. **Bisector**: after the run, `jq` slices `raw.ndjson` into per-bucket JSONL files keyed by CDP method.

## Quickstart

### Local Chrome

```bash
# 1. Launch Chrome with a debugger port (any user-data-dir keeps it isolated).
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-o11y \
  about:blank &

# 2. Start the observer.
bash scripts/start-capture.sh 9222 my-run

# 3. Run your main automation against port 9222.
browse env local 9222
browse open https://example.com
# ...whatever the run does...

# 4. Stop and bisect.
bash scripts/stop-capture.sh my-run
bash scripts/bisect-cdp.sh my-run
```

### Browserbase remote

Two helpers wrap the platform-side bookkeeping: `bb-capture.sh` creates or attaches to a session and starts the observer; `bb-finalize.sh` pulls platform artifacts (final session metadata, server logs, downloads) into the run dir at the end.

> Browserbase ends a session as soon as its last CDP client disconnects. **Always create with `--keep-alive` and attach an automation client before (or together with) the observer.** `bb-capture.sh --new` does this for you.

```bash
export BROWSERBASE_API_KEY=...

# 1. Create a keep-alive session AND start the observer in one step.
#    Prints the session id, connectUrl prefix, and a live debugger URL you
#    can open in a browser to watch the run interactively.
bash scripts/bb-capture.sh --new my-run

# 2. Drive automation. bb-capture stamped the session id into the manifest.
SID=$(jq -r .browserbase.session_id .o11y/my-run/manifest.json)
browse --connect "$SID" open https://example.com
browse --connect "$SID" open https://news.ycombinator.com

# 3. Stop the observer, bisect, then pull platform artifacts and release.
bash scripts/stop-capture.sh my-run
bash scripts/bisect-cdp.sh my-run
bash scripts/bb-finalize.sh my-run --release
```

Attaching to a session that's *already running* (e.g. one your production worker created) — `bb-capture.sh` accepts a session id instead of `--new`:

```bash
# Pick a running session (filter client-side; bb sessions list has no --status flag)
bb sessions list | jq -r '.[] | select(.status == "RUNNING") | .id'

bash scripts/bb-capture.sh <session-id> mid-flight-debug
# ...observer runs alongside the existing automation client; no disruption...
bash scripts/stop-capture.sh mid-flight-debug
bash scripts/bisect-cdp.sh mid-flight-debug
bash scripts/bb-finalize.sh mid-flight-debug   # without --release: leave the session running
```

#### What you get from the Browserbase platform

`bb-capture.sh` adds a `browserbase` block to `manifest.json` (session id, project, region, started_at, expires_at, debugger URL). `bb-finalize.sh` writes:

- `<run>/browserbase/session.json` — final `bb sessions get` snapshot (proxyBytes, status, ended_at, viewport, …)
- `<run>/browserbase/logs.json` — `bb sessions logs` output. **Often empty.** The CDP firehose in `cdp/raw.ndjson` is the source of truth; this is a side channel.
- `<run>/browserbase/downloads.zip` — files the session downloaded, if any (the script discards the empty 22-byte zip you get when there are none)

`bb sessions recording` (rrweb session replay) is **deprecated** and isn't fetched. Use the screenshots + DOM dumps in `screenshots/` and `dom/` for visual ground truth.

The live `debugger_url` in the manifest opens an interactive Chrome DevTools view served by Browserbase — handy for *watching* a long-running automation while the observer captures the firehose to disk.

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
  browserbase/                  added by bb-finalize.sh (Browserbase runs only)
    session.json                final `bb sessions get` snapshot (proxyBytes, status, ended_at, …)
    logs.json                   `bb sessions logs` output (often [])
    downloads.zip               `bb sessions downloads get` output (only if the session downloaded files)
```

When a run was started via `bb-capture.sh`, `manifest.json` also carries a top-level `browserbase` block: `session_id`, `project_id`, `region`, `started_at`, `expires_at`, `keep_alive`, `debugger_url`.

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

### Drilling in with `query.sh`

For interactive exploration, use `scripts/query.sh <run-id> <command>` instead of remembering paths:

```bash
bash scripts/query.sh my-run list                    # one-line table of pages
bash scripts/query.sh my-run page 1                  # full summary for page 1
bash scripts/query.sh my-run page 1 network/failed   # cat failed.jsonl for page 1
bash scripts/query.sh my-run errors                  # all errors across pages, attributed by pid
bash scripts/query.sh my-run errors 2                # errors from page 2 only
bash scripts/query.sh my-run hosts                   # top hosts by request count
bash scripts/query.sh my-run host api.example.com    # all requests/responses for a host
bash scripts/query.sh my-run summary                 # full summary.json
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

1. **Use `bb-capture.sh` on Browserbase**: it enforces `--keep-alive`, fetches the connectUrl, captures the debugger URL, and stamps the manifest. Doing it manually invites mistakes.
2. **Don't `--release` a session you don't own**: `bb-finalize.sh --release` is for sessions *you* created with `--new`. When attaching to a production session via `bb-capture.sh <session-id>`, run `bb-finalize.sh` without `--release` so the original automation keeps running.
3. **Order matters for remote**: on Browserbase, attach the main automation client before (or together with) the observer, and create the session with `--keep-alive`. Otherwise the session ends as soon as the observer's WS closes.
4. **Don't poll faster than ~1s**: each sample opens a one-shot CDP connection and screenshots Chrome. 2s is a good default.
5. **Pick domains deliberately**: defaults (`Network Console Runtime Log Page`) cover most debugging. Add `DOM` for DOM-tree mutations (very noisy) via `O11Y_DOMAINS="$O11Y_DOMAINS DOM"`.
6. **Use `--connect <session-id>` for the automation client on remote**, not a fresh `browse env remote` (which would create a new session each time).
7. **Always run `stop-capture.sh`**, even after a crash, so background processes don't linger and the manifest gets `stopped_at`.
8. **Bisect once per run**: `bisect-cdp.sh` is idempotent — it overwrites the per-bucket files from `raw.ndjson` each time.

## Troubleshooting

- **`browse cdp exited immediately`**: usually means the target is unreachable (wrong port) or the Browserbase session has already ended. For remote, verify with `bb sessions get <id>` — if `status` is `COMPLETED`, recreate with `--keep-alive` and attach automation first.
- **Empty `raw.ndjson` even though processes are running**: confirm a CDP client is actually driving the page. The observer only emits events that the browser generates, so an idle browser produces ~5 lines of attach/discover messages and nothing else.
- **Screenshots all look identical**: check `index.jsonl` — if `url` doesn't change, the page hasn't navigated yet. The polling loop runs independently of the main automation's pace.
- **Browserbase session ends mid-run**: it likely hit `--timeout`. Recreate with a higher timeout (`BB_SESSION_TIMEOUT=1800 bash scripts/bb-capture.sh --new ...`) or remove the timeout flag.
- **`bb-capture.sh <id>` says "not RUNNING"**: the session you tried to attach to ended. List candidates with `bb sessions list | jq '.[] | select(.status == "RUNNING")'` and try again.
- **`browserbase/logs.json` is empty `[]`**: expected — `bb sessions logs` is sparse in practice. The CDP firehose in `cdp/raw.ndjson` is the source of truth.
- **Where's the session recording (rrweb)?**: `bb sessions recording` is deprecated; this skill doesn't fetch it. Use the screenshot stream in `screenshots/` and DOM dumps in `dom/`.

For full reference, see [REFERENCE.md](REFERENCE.md).
For example debug runs, see [EXAMPLES.md](EXAMPLES.md).
