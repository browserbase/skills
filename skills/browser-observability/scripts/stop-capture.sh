#!/usr/bin/env bash
# Stop an in-progress capture and stamp the manifest with stopped_at.
#
# Usage:
#   stop-capture.sh <run-id>

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: stop-capture.sh <run-id>" >&2
  exit 2
fi

RUN_ID="$1"
ROOT="${O11Y_ROOT:-.o11y}"
RUN_DIR="$ROOT/$RUN_ID"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "run dir not found: $RUN_DIR" >&2
  exit 1
fi

for pidfile in "$RUN_DIR/.cdp.pid" "$RUN_DIR/.loop.pid"; do
  [[ -f "$pidfile" ]] || continue
  PID=$(cat "$pidfile" 2>/dev/null || echo "")
  [[ -n "$PID" ]] || { rm -f "$pidfile"; continue; }

  kill "$PID" 2>/dev/null || true
  for _ in 1 2 3; do
    sleep 1
    kill -0 "$PID" 2>/dev/null || break
  done
  kill -9 "$PID" 2>/dev/null || true
  rm -f "$pidfile"
done

if command -v jq >/dev/null 2>&1 && [[ -f "$RUN_DIR/manifest.json" ]]; then
  TMP=$(mktemp)
  jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.stopped_at = $ts' \
    "$RUN_DIR/manifest.json" > "$TMP" && mv "$TMP" "$RUN_DIR/manifest.json"
fi

# Sweep half-written DOM dumps if the loop got SIGTERM'd mid-write.
find "$RUN_DIR/dom" -name '*.partial' -delete 2>/dev/null || true

echo "stopped: $RUN_DIR"
