#!/usr/bin/env bash
# Start an observability capture against a CDP target.
#
# Usage:
#   start-capture.sh <port|ws-url> [run-id] [interval-seconds]
#
# Environment:
#   O11Y_ROOT     Base directory for runs (default: .o11y)
#   O11Y_DOMAINS  Space-separated CDP domains (default: "Network Console Runtime Log Page")
#
# Outputs a key=value block on stdout describing the run; PIDs are also stored
# inside the run dir so stop-capture.sh can find them without arguments.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: start-capture.sh <port|ws-url> [run-id] [interval-seconds]" >&2
  exit 2
fi

TARGET="$1"
RUN_ID="${2:-$(date -u +%Y%m%dT%H%M%SZ)}"
INTERVAL="${3:-2}"
ROOT="${O11Y_ROOT:-.o11y}"
DOMAINS="${O11Y_DOMAINS:-Network Console Runtime Log Page}"

RUN_DIR="$ROOT/$RUN_ID"
mkdir -p "$RUN_DIR/cdp" "$RUN_DIR/screenshots" "$RUN_DIR/dom"

# Build --domain flags for `browse cdp`
domain_args=()
for d in $DOMAINS; do
  domain_args+=(--domain "$d")
done

# Manifest
cat > "$RUN_DIR/manifest.json" <<EOF
{
  "run_id": "$RUN_ID",
  "target": "$TARGET",
  "domains": "$DOMAINS",
  "interval_seconds": $INTERVAL,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Stream CDP firehose to NDJSON in the background.
# `browse cdp` writes one JSON object per line to stdout.
nohup browse cdp "$TARGET" "${domain_args[@]}" \
  > "$RUN_DIR/cdp/raw.ndjson" \
  2> "$RUN_DIR/cdp/stderr.log" &
CDP_PID=$!
echo "$CDP_PID" > "$RUN_DIR/.cdp.pid"

# Periodic screenshot + DOM dump loop in the background.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
nohup bash "$SCRIPT_DIR/snapshot-loop.sh" "$TARGET" "$RUN_DIR" "$INTERVAL" \
  > "$RUN_DIR/snapshot-loop.log" 2>&1 &
LOOP_PID=$!
echo "$LOOP_PID" > "$RUN_DIR/.loop.pid"

# Give the CDP process a moment to fail loudly on bad targets so the user sees
# an error instead of a silent capture that produces zero events.
sleep 1
if ! kill -0 "$CDP_PID" 2>/dev/null; then
  echo "browse cdp exited immediately — check $RUN_DIR/cdp/stderr.log" >&2
  cat "$RUN_DIR/cdp/stderr.log" >&2 || true
  kill "$LOOP_PID" 2>/dev/null || true
  exit 1
fi

cat <<EOF
run_id=$RUN_ID
run_dir=$RUN_DIR
target=$TARGET
cdp_pid=$CDP_PID
loop_pid=$LOOP_PID
EOF
