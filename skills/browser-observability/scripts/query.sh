#!/usr/bin/env bash
# Drill-down helper for a captured run.
#
# Usage:
#   query.sh <run-id> list                          List pages with id, url, duration, events.
#   query.sh <run-id> summary                       Print cdp/summary.json (full).
#   query.sh <run-id> page <pid>                    Print this page's summary.json.
#   query.sh <run-id> page <pid> <bucket>           Cat a per-page bucket file.
#                                                   Examples: network/requests, network/failed,
#                                                             console/logs, page/lifecycle, raw
#   query.sh <run-id> errors [pid]                  All error rows (network failed, runtime
#                                                   exceptions, console errors, log errors).
#   query.sh <run-id> hosts [pid]                   Top hosts by request count.
#   query.sh <run-id> host <hostname> [pid]         Requests + responses for one hostname.
#   query.sh <run-id> timeline                      Compact navigation+lifecycle timeline.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  sed -n '3,18p' "$0" >&2
  exit 2
fi

RUN_ID="$1"; shift
CMD="$1";    shift
ROOT="${O11Y_ROOT:-.o11y}"
RUN_DIR="$ROOT/$RUN_ID"
CDP="$RUN_DIR/cdp"

[[ -d "$CDP" ]] || { echo "no run dir at $RUN_DIR" >&2; exit 1; }

page_dir() {
  local pid; pid=$(printf '%03d' "$1")
  echo "$CDP/pages/$pid"
}

pids_for_filter() {
  # Echo 0..N-1 if "all"/empty, or just the given pid.
  if [[ -z "${1:-}" || "${1:-}" == "all" ]]; then
    find "$CDP/pages" -mindepth 1 -maxdepth 1 -type d | sort | xargs -n1 basename | sed 's/^0*//' | sed 's/^$/0/'
  else
    echo "$1"
  fi
}

# Concatenate a per-page bucket file across one or more pages,
# prefixing each line with `[pid] ` so output stays attributable.
cat_bucket_across() {
  local bucket="$1"; shift
  for pid in "$@"; do
    local pdir; pdir=$(page_dir "$pid")
    local file="$pdir/$bucket.jsonl"
    [[ -f "$file" ]] || continue
    while IFS= read -r line; do
      printf '[%s] %s\n' "$pid" "$line"
    done < "$file"
  done
}

case "$CMD" in
  list)
    jq -r '
      .pages[]
      | "\(.pageId)\t\(.eventCount // 0)evt\t\((.durationMs // 0)/1000 | . * 100 | round / 100)s\t\(.url)"
    ' "$CDP/summary.json" | column -t -s $'\t'
    ;;

  summary)
    jq . "$CDP/summary.json"
    ;;

  page)
    PID="${1:?page id required}"; shift || true
    PDIR=$(page_dir "$PID")
    [[ -d "$PDIR" ]] || { echo "no such page: $PID" >&2; exit 1; }

    if [[ $# -eq 0 ]]; then
      jq . "$PDIR/summary.json"
    else
      BUCKET="$1"
      if [[ "$BUCKET" == "raw" ]]; then
        cat "$PDIR/raw.jsonl"
      else
        FILE="$PDIR/$BUCKET.jsonl"
        [[ -f "$FILE" ]] || { echo "(empty: $BUCKET for page $PID)" >&2; exit 0; }
        cat "$FILE"
      fi
    fi
    ;;

  errors)
    PIDS=($(pids_for_filter "${1:-all}"))
    for pid in "${PIDS[@]}"; do
      pdir=$(page_dir "$pid")
      [[ -d "$pdir" ]] || continue

      # Network.loadingFailed
      if [[ -f "$pdir/network/failed.jsonl" ]]; then
        jq -c --arg pid "$pid" '{pid: $pid, kind: "network.failed",
          rid: .params.requestId, errorText: .params.errorText, type: .params.type}' \
          "$pdir/network/failed.jsonl"
      fi
      # Runtime.exceptionThrown
      if [[ -f "$pdir/console/exceptions.jsonl" ]]; then
        jq -c --arg pid "$pid" '{pid: $pid, kind: "runtime.exception",
          text: .params.exceptionDetails.text,
          message: .params.exceptionDetails.exception.description}' \
          "$pdir/console/exceptions.jsonl"
      fi
      # Console.error
      if [[ -f "$pdir/console/logs.jsonl" ]]; then
        jq -c --arg pid "$pid" 'select(.params.type == "error")
          | {pid: $pid, kind: "console.error",
             msg: (.params.args[0].value // .params.args[0].description // "")}' \
          "$pdir/console/logs.jsonl"
      fi
      # Log entry errors
      if [[ -f "$pdir/log/entries.jsonl" ]]; then
        jq -c --arg pid "$pid" 'select(.params.entry.level == "error")
          | {pid: $pid, kind: "log.error",
             source: .params.entry.source, text: .params.entry.text}' \
          "$pdir/log/entries.jsonl"
      fi
    done
    ;;

  hosts)
    PIDS=($(pids_for_filter "${1:-all}"))
    for pid in "${PIDS[@]}"; do
      pdir=$(page_dir "$pid")
      [[ -f "$pdir/network/requests.jsonl" ]] || continue
      jq -r '.params.request.url' "$pdir/network/requests.jsonl"
    done | awk -F/ '{print $3}' | sort | uniq -c | sort -rn
    ;;

  host)
    HOST="${1:?hostname required}"; shift || true
    PIDS=($(pids_for_filter "${1:-all}"))
    for pid in "${PIDS[@]}"; do
      pdir=$(page_dir "$pid")
      if [[ -f "$pdir/network/requests.jsonl" ]]; then
        jq -c --arg pid "$pid" --arg host "$HOST" \
          'select(.params.request.url | test("^https?://" + $host))
           | {pid: $pid, kind: "request",
              method: .params.request.method,
              url: .params.request.url,
              type: .params.type}' \
          "$pdir/network/requests.jsonl"
      fi
      if [[ -f "$pdir/network/responses.jsonl" ]]; then
        jq -c --arg pid "$pid" --arg host "$HOST" \
          'select(.params.response.url | test("^https?://" + $host))
           | {pid: $pid, kind: "response",
              status: .params.response.status,
              url: .params.response.url}' \
          "$pdir/network/responses.jsonl"
      fi
    done
    ;;

  timeline)
    # Combine top-level navigations + lifecycle milestones, ordered by file order.
    jq -r '
      "[NAV " + (.params.frame.url // "?") + "]"
    ' "$CDP/page/navigations.jsonl" 2>/dev/null
    if [[ -f "$CDP/page/lifecycle.jsonl" ]]; then
      jq -r '"[" + .params.name + "]"' "$CDP/page/lifecycle.jsonl"
    fi
    ;;

  *)
    echo "unknown command: $CMD" >&2
    sed -n '3,18p' "$0" >&2
    exit 2
    ;;
esac
