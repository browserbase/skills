#!/usr/bin/env bash
# Slice cdp/raw.ndjson into per-bucket and per-page JSONL files, then write a
# structured cdp/summary.json with a top-level overview and a pages[] array.
#
# Usage:
#   bisect-cdp.sh <run-id>
#
# Layout produced:
#   cdp/summary.json                  {sessionId, duration, totalEvents, pages[]}
#   cdp/<domain>/...                  session-wide buckets (legacy layout, always written)
#   cdp/pages/<pid>/                  per-page slices, only non-empty buckets written
#     url.txt
#     summary.json
#     raw.jsonl
#     network/{requests,responses,finished,failed,websocket}.jsonl
#     console/{logs,exceptions}.jsonl
#     page/{navigations,lifecycle,frames,dialogs,all}.jsonl
#     runtime/all.jsonl
#     log/entries.jsonl
#     target/{attached,detached}.jsonl
#     dom/all.jsonl

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: bisect-cdp.sh <run-id>" >&2
  exit 2
fi

RUN_ID="$1"
ROOT="${O11Y_ROOT:-.o11y}"
RUN_DIR="$ROOT/$RUN_ID"
CDP="$RUN_DIR/cdp"
RAW="$CDP/raw.ndjson"
MANIFEST="$RUN_DIR/manifest.json"

[[ -f "$RAW" ]] || { echo "raw.ndjson not found at $RAW" >&2; exit 1; }

# ---------- session-wide buckets (existing layout, always rewritten) ----------

mkdir -p "$CDP/network" "$CDP/console" "$CDP/page" "$CDP/log" \
         "$CDP/runtime" "$CDP/target" "$CDP/dom"

filter_session() {
  jq -c --arg p "$1" 'select(.method // "" | test($p))' "$RAW" > "$2"
}
filter_session '^Network\.requestWillBeSent$' "$CDP/network/requests.jsonl"
filter_session '^Network\.responseReceived$'  "$CDP/network/responses.jsonl"
filter_session '^Network\.loadingFinished$'   "$CDP/network/finished.jsonl"
filter_session '^Network\.loadingFailed$'     "$CDP/network/failed.jsonl"
filter_session '^Network\.webSocket'          "$CDP/network/websocket.jsonl"
filter_session '^Runtime\.consoleAPICalled$'  "$CDP/console/logs.jsonl"
filter_session '^Runtime\.exceptionThrown$'   "$CDP/console/exceptions.jsonl"
filter_session '^Runtime\.'                   "$CDP/runtime/all.jsonl"
filter_session '^Log\.entryAdded$'            "$CDP/log/entries.jsonl"
filter_session '^Page\.frameNavigated$'       "$CDP/page/navigations.jsonl"
filter_session '^Page\.lifecycleEvent$'       "$CDP/page/lifecycle.jsonl"
filter_session '^Page\.javascriptDialog'      "$CDP/page/dialogs.jsonl"
filter_session '^Page\.frame'                 "$CDP/page/frames.jsonl"
filter_session '^Page\.'                      "$CDP/page/all.jsonl"
filter_session '^DOM\.'                       "$CDP/dom/all.jsonl"
filter_session '^Target\.attachedToTarget$'   "$CDP/target/attached.jsonl"
filter_session '^Target\.detachedFromTarget$' "$CDP/target/detached.jsonl"

# ---------- tag every event with _pid (page id) ----------
#
# Walks events in order. Each top-level Page.frameNavigated bumps the page
# counter. Events emitted before the first navigation are clamped to pid 0
# so they fold into the first concrete page (their requests really are part
# of loading that first page).

TAGGED="$CDP/.tagged.ndjson"
jq -s -c '
  . as $E
  | [foreach range(0; $E|length) as $i
       (-1;
        if $E[$i].method == "Page.frameNavigated"
           and (($E[$i].params.frame.parentId // null) == null)
        then . + 1
        else .
        end;
        $E[$i] + {_pid: (if . < 0 then 0 else . end)})
    ]
  | .[]
' "$RAW" > "$TAGGED"

# Build a sorted list of unique page ids ("0 1 2 3 4"). If raw has no events,
# default to "0" so we still produce an empty page summary.
PIDS=$(jq -r '._pid' "$TAGGED" 2>/dev/null | sort -un | tr '\n' ' ')
PIDS="${PIDS:-0 }"

# ---------- per-page slices ----------

PAGES_DIR="$CDP/pages"
rm -rf "$PAGES_DIR"
mkdir -p "$PAGES_DIR"

filter_page() {
  # filter_page <pid> <regex> <out>
  # Writes the file only if it would contain at least one line.
  local pid="$1" pattern="$2" out="$3"
  local result
  result=$(jq -c --argjson pid "$pid" --arg p "$pattern" \
    'select(._pid == $pid and (.method // "" | test($p))) | del(._pid)' \
    "$TAGGED")
  if [[ -n "$result" ]]; then
    mkdir -p "$(dirname "$out")"
    printf '%s\n' "$result" > "$out"
  fi
}

for pid in $PIDS; do
  PADDED=$(printf '%03d' "$pid")
  PDIR="$PAGES_DIR/$PADDED"
  mkdir -p "$PDIR"

  # raw.jsonl for this page (no _pid annotation in output).
  jq -c --argjson pid "$pid" 'select(._pid == $pid) | del(._pid)' "$TAGGED" \
    > "$PDIR/raw.jsonl"

  # url.txt — first top-level frameNavigated in this page, fallback "(initial)".
  URL=$(jq -r --argjson pid "$pid" '
    select(._pid == $pid
           and .method == "Page.frameNavigated"
           and (.params.frame.parentId // null) == null)
    | .params.frame.url' "$TAGGED" | head -1)
  echo "${URL:-(initial)}" > "$PDIR/url.txt"

  filter_page "$pid" '^Network\.requestWillBeSent$' "$PDIR/network/requests.jsonl"
  filter_page "$pid" '^Network\.responseReceived$'  "$PDIR/network/responses.jsonl"
  filter_page "$pid" '^Network\.loadingFinished$'   "$PDIR/network/finished.jsonl"
  filter_page "$pid" '^Network\.loadingFailed$'     "$PDIR/network/failed.jsonl"
  filter_page "$pid" '^Network\.webSocket'          "$PDIR/network/websocket.jsonl"
  filter_page "$pid" '^Runtime\.consoleAPICalled$'  "$PDIR/console/logs.jsonl"
  filter_page "$pid" '^Runtime\.exceptionThrown$'   "$PDIR/console/exceptions.jsonl"
  filter_page "$pid" '^Runtime\.'                   "$PDIR/runtime/all.jsonl"
  filter_page "$pid" '^Log\.entryAdded$'            "$PDIR/log/entries.jsonl"
  filter_page "$pid" '^Page\.frameNavigated$'       "$PDIR/page/navigations.jsonl"
  filter_page "$pid" '^Page\.lifecycleEvent$'       "$PDIR/page/lifecycle.jsonl"
  filter_page "$pid" '^Page\.javascriptDialog'      "$PDIR/page/dialogs.jsonl"
  filter_page "$pid" '^Page\.frame'                 "$PDIR/page/frames.jsonl"
  filter_page "$pid" '^Page\.'                      "$PDIR/page/all.jsonl"
  filter_page "$pid" '^DOM\.'                       "$PDIR/dom/all.jsonl"
  filter_page "$pid" '^Target\.attachedToTarget$'   "$PDIR/target/attached.jsonl"
  filter_page "$pid" '^Target\.detachedFromTarget$' "$PDIR/target/detached.jsonl"
done

# ---------- summary.json (top-level + per-page) ----------
#
# Anchors CDP monotonic timestamps to manifest.started_at so per-page durations
# come out in wall-clock ms. Events without a .params.timestamp inherit the
# nearest known one; if no timestamps appear at all, durations are null.

SESSION_ID=$(jq -r '.browserbase.session_id // .run_id // "unknown"' "$MANIFEST" 2>/dev/null)
STARTED_MS=$(jq -r '.started_at // empty | if . != "" then (fromdateiso8601 * 1000 | floor) else "null" end' "$MANIFEST" 2>/dev/null || echo null)
STOPPED_MS=$(jq -r '.stopped_at // empty | if . != "" then (fromdateiso8601 * 1000 | floor) else "null" end' "$MANIFEST" 2>/dev/null || echo null)
[[ -z "$STARTED_MS" ]] && STARTED_MS=null
[[ -z "$STOPPED_MS" ]] && STOPPED_MS=null

jq -s \
  --arg sessionId "$SESSION_ID" \
  --argjson startedMs "$STARTED_MS" \
  --argjson stoppedMs "$STOPPED_MS" '
  # CDP exposes two clocks under .params.timestamp depending on the domain:
  #   Network/Page              → MonotonicTime, seconds since browser start (small)
  #   Console.messageAdded etc. → TimeSinceEpoch in ms (large, > 1e9)
  # We only want MonotonicTime here so anchoring stays consistent.
  def is_monotonic: . != null and . < 1e9;

  # cdp seconds (monotonic) → wall-clock ms.
  def to_ms($ts; $anchor):
    if ($ts == null) or ($anchor == null) or ($startedMs == null) then null
    else ((($ts - $anchor) * 1000) + $startedMs) | floor
    end;

  # First/last monotonic .params.timestamp across an array of events.
  def page_window:
    [.[] | .params.timestamp? | select(is_monotonic)] as $ts
    | { start: ($ts | first), end: ($ts | last) };

  # Counts per CDP domain plus error/warning signals.
  def domain_stats:
    map(select(.method != null))
    | group_by(.method | split(".")[0])
    | map({
        key: (.[0].method | split(".")[0]),
        value: (
          { count: length }
          + ({
              errors:
                ([.[] | select(
                   .method == "Network.loadingFailed"
                   or .method == "Runtime.exceptionThrown"
                   or (.method == "Runtime.consoleAPICalled" and .params.type == "error")
                   or (.method == "Log.entryAdded" and .params.entry.level == "error")
                 )] | length),
              warnings:
                ([.[] | select(
                   (.method == "Runtime.consoleAPICalled"
                    and (.params.type == "warning" or .params.type == "warn"))
                   or (.method == "Log.entryAdded" and .params.entry.level == "warning")
                 )] | length)
            } | with_entries(select(.value > 0)))
        )
      })
    | from_entries;

  # Per-page network rollup: total requests, failed, byType breakdown.
  def network_stats:
    ([.[] | select(.method == "Network.requestWillBeSent")] | length) as $req
    | ([.[] | select(.method == "Network.loadingFailed")]   | length) as $fail
    | ([.[] | select(.method == "Network.requestWillBeSent")
            | .params.type // "Other"]
       | group_by(.) | map({key: .[0], value: length}) | from_entries) as $by
    | if ($req == 0 and $fail == 0) then null
      else { requests: $req, failed: $fail, byType: $by }
      end;

  # Find the wall-clock anchor (first event with a monotonic .params.timestamp).
  (first(.[] | .params.timestamp? | select(is_monotonic)) // null) as $anchor

  # Group events by page id, then build per-page summary blocks.
  | (group_by(._pid) | map(
      . as $evts
      | (.[0]._pid) as $pid
      | (page_window) as $w
      | (first(.[]
               | select(.method == "Page.frameNavigated"
                        and (.params.frame.parentId // null) == null)
               | .params.frame.url) // "(initial)") as $url
      | (to_ms($w.start; $anchor)) as $sm
      | (to_ms($w.end;   $anchor)) as $em
      | {
          pageId: $pid,
          url: $url,
          startMs: $sm,
          endMs: $em,
          durationMs: (if ($sm != null and $em != null) then ($em - $sm) else null end),
          eventCount: ($evts | length),
          domains: (domain_stats),
          network: (network_stats)
        }
      | with_entries(select(.value != null))
    )) as $pageSummaries

  | {
      sessionId: $sessionId,
      duration: {
        startMs: $startedMs,
        endMs: $stoppedMs,
        totalMs: (if ($startedMs != null and $stoppedMs != null)
                  then ($stoppedMs - $startedMs) else null end)
      },
      totalEvents: length,
      pages: $pageSummaries
    }
' "$TAGGED" > "$CDP/summary.json"

# Also drop a per-page summary.json into each pages/<pid>/ for ergonomic drill-in.
for pid in $PIDS; do
  PADDED=$(printf '%03d' "$pid")
  jq --argjson pid "$pid" '.pages[] | select(.pageId == $pid)' "$CDP/summary.json" \
    > "$PAGES_DIR/$PADDED/summary.json"
done

rm -f "$TAGGED"

# Compact one-liner summary for stdout (full file lives at cdp/summary.json).
jq '{
  sessionId,
  duration,
  totalEvents,
  pages: (.pages | map({pageId, url, durationMs, eventCount}))
}' "$CDP/summary.json"
