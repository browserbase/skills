# Adding Response Body Capture to `browser-trace` — Lift Estimate

> Grounded in the real source as of `browserbase/skills@main`. I read `SKILL.md`,
> `REFERENCE.md`, `lib.mjs`, `start-capture.mjs`, `snapshot-loop.mjs`, `bisect-cdp.mjs`,
> `bb-capture.mjs`, `bb-finalize.mjs`, `stop-capture.mjs`.

---

## 1. Why this is harder than it looks

`browser-trace` today does the simplest possible thing: it shells out to `browse cdp <target> --domain Network --domain Console ...`, which emits one CDP event per line to stdout, and that stream is captured verbatim into `cdp/raw.ndjson`. **No CDP commands are issued back into the session.** The capture is fully one-way and stateless.

Response bodies break that model. Bodies aren't pushed by CDP — they have to be **pulled** with a `Network.getResponseBody` request, keyed by `requestId`, **before the renderer evicts the resource**. Eviction is non-deterministic but typically happens within seconds of the response completing on a busy page. That means body capture has to be:

- **Live** — runs concurrently with the trace, can't be done from `raw.ndjson` after the fact.
- **Bidirectional** — issues CDP commands, not just reads events.
- **Fast** — the gap between `Network.loadingFinished` and the `getResponseBody` call must be small.
- **Selective** — fetching every body would 10–100x the disk footprint and add real load on the renderer.

This is a meaningful expansion of the skill's current architecture, not a tweak.

---

## 2. The lift, by component

### 2.1 New companion script — `scripts/body-capture.mjs` — **NEW, ~200 lines**

The `browse cdp` subprocess can't be modified (it's an external binary), so body capture has to be a **second CDP client** running in parallel, attached to the same target. Same model as `snapshot-loop.mjs`, but instead of polling screenshots it subscribes to `Network.responseReceived` + `Network.loadingFinished` and issues `Network.getResponseBody` for matching requests.

Responsibilities:

- Open its own WebSocket to the CDP target (or use `browse --ws <target> ...` if it supports request/response, which from the snapshot loop it does for one-shot commands — body capture is a long-lived subscription, so likely a raw `ws://` client).
- Maintain an in-memory map of `requestId → { url, method, contentType, status, type }` keyed off `Network.requestWillBeSent` + `Network.responseReceived`.
- On `Network.loadingFinished`: if the request matches the filter (default: `fetch`/`xhr` resourceType, JSON or form content-type, size cap), call `Network.getResponseBody` and write the result to `<run>/cdp/network/bodies/<requestId>.json`.
- Track failures (eviction races, out-of-process iframes that can't be addressed, sizes over the cap) in a sidecar `bodies/_skipped.jsonl`.
- SIGTERM-clean shutdown so `stop-capture.mjs` doesn't have to know about it specifically (it would just need to also kill `.bodies.pid`).

**Risk:** `Network.getResponseBody` requires a session-attached target. For OOPIFs (cross-origin iframes), you have to use `Target.attachToTarget` first and route the command on the resulting session. Non-trivial. Realistic v1 punts on iframes and just records the skip reason.

**Dependencies:** zero — Node stdlib has `ws` via `undici` /`WebSocket` (Node 22+) or you bundle a tiny WS client. The skill is currently zero-dep, so this constraint matters.

### 2.2 `start-capture.mjs` — **MODIFIED, ~10 lines**

Add an optional third detached subprocess: if `O11Y_BODIES=1` (or a `--bodies` flag), spawn `body-capture.mjs` the same way `snapshot-loop.mjs` is spawned, write `.bodies.pid`. Default off so existing users see no change.

### 2.3 `stop-capture.mjs` — **MODIFIED, ~3 lines**

Already loops over `['.cdp.pid', '.loop.pid']`. Add `'.bodies.pid'` to the list. Trivial.

### 2.4 `bisect-cdp.mjs` — **MODIFIED, ~15 lines**

Currently the only "network" buckets are CDP **events** (`requestWillBeSent`, `responseReceived`, `loadingFinished`, `loadingFailed`, `webSocket`). Bodies are content, not events, so they don't fit the existing `BUCKETS` predicate model.

Two sensible places to expose them:

1. **As-is on disk** — `cdp/network/bodies/<requestId>.json` already exists from body-capture; bisect doesn't have to do anything. Per-page slicing (`cdp/pages/<pid>/network/bodies/`) is the only real work: walk `network/responses.jsonl` for each page, find the matching body files, hard-link or copy them into the per-page dir. ~10 lines.
2. **Index** — emit `cdp/network/bodies-index.jsonl` mapping `{requestId, url, method, status, contentType, sizeBytes, bodyPath}` so query/grep tools don't have to walk the dir. ~5 lines.

### 2.5 `lib.mjs` — **MODIFIED, ~5 lines**

Add a helper `readBody(runDir, requestId) → { contentType, body, base64? }`. Useful for the new skill's `infer.mjs` and for `query.mjs`.

### 2.6 `query.mjs` — **MODIFIED, ~20 lines**

Add a `bodies` subcommand: list captured bodies, filter by URL/status/content-type, dump a body to stdout. Optional but cheap.

### 2.7 `bb-capture.mjs` / `bb-finalize.mjs` — **NO CHANGES**

They delegate to `start-capture.mjs` / `stop-capture.mjs`. Inherits body capture for free.

### 2.8 `SKILL.md` / `REFERENCE.md` — **MODIFIED, ~50 lines**

Document:
- The new flag/env var.
- New on-disk layout (`cdp/network/bodies/`, `bodies-index.jsonl`).
- Caveats: eviction races, OOPIF gaps, size cap, default-off.
- Filter knobs (`O11Y_BODY_TYPES`, `O11Y_BODY_MAX_KB`, `O11Y_BODY_INCLUDE_PATTERN`).
- Privacy implication: bodies can contain user data. Off by default for a reason.

---

## 3. Total lift

| Component | Type | Lines | Risk |
|---|---|---|---|
| `scripts/body-capture.mjs` | new | ~200 | **medium** — WS client, eviction races, OOPIF |
| `scripts/start-capture.mjs` | modify | ~10 | low |
| `scripts/stop-capture.mjs` | modify | ~3 | low |
| `scripts/bisect-cdp.mjs` | modify | ~15 | low |
| `scripts/lib.mjs` | modify | ~5 | low |
| `scripts/query.mjs` | modify | ~20 | low |
| `SKILL.md` + `REFERENCE.md` | modify | ~50 | low |
| **Total** | | **~300 LOC** | |

**Calendar estimate for one engineer who knows CDP:** ~2–3 days.
- Day 1: WS client + filter + happy-path body capture against Chromium local.
- Day 2: OOPIF target attachment, size cap, skip-tracking, integration with `start`/`stop`.
- Day 3: bisect integration, query subcommand, docs, end-to-end test against a Browserbase remote session.

**Calendar estimate without prior CDP fluency:** ~1 week. The eviction race and OOPIF target plumbing are the parts that bite.

---

## 4. Risks worth calling out in the PR

1. **Privacy.** Bodies can contain bearer tokens, PII, partial PII even when redacted at the header layer. Default-off + an opt-in flag is non-negotiable. The redaction story has to live in the consuming skill (e.g. `discover-api-spec`), not in the capture layer — capture should write what it sees.
2. **Performance.** `Network.getResponseBody` blocks on the renderer. For a page making 200 XHR requests, naive capture serializes every one of them. Mitigations: hard cap on concurrent in-flight `getResponseBody` calls (e.g. 8), aggressive content-type filter, default size cap (256 KB).
3. **Disk.** A 10-minute Browserbase session with body capture on can easily produce 100–500 MB of bodies. The skill should default to JSON-only + 256 KB cap and let users opt into more.
4. **Eviction races.** Some bodies will fail with `-32000 No data found for resource`. This is normal. `bodies/_skipped.jsonl` should record them so consumers know coverage isn't 100%.
5. **WebSocket frame data.** `Network.webSocketFrameSent` / `Received` already include the payload inline — no `getResponseBody` needed. v1 should explicitly punt on WebSocket bodies (already in the events bucket) to scope down.

---

## 5. Recommendation

Building this **into** `browser-trace` is the right call **if** the maintainers are willing to add a (default-off) feature with privacy and disk caveats. Putting it in a sibling skill is also viable but less clean — every consumer skill (api-spec, security audits, etc.) would have to reinvent the WS plumbing.

The cleanest framing: **bodies are part of the trace, off by default, on with a flag.** Same shape as how Chrome DevTools handles "Preserve log" / "Disable cache" — capture options, not a separate tool.
