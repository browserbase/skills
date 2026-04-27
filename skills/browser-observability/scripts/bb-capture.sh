#!/usr/bin/env bash
# Start an observability capture against a Browserbase session.
#
# Usage:
#   bb-capture.sh --new [run-id] [interval-sec]            # create a new keep-alive session, then capture
#   bb-capture.sh <session-id> [run-id] [interval-sec]     # attach to an existing RUNNING session
#
# Environment:
#   BROWSERBASE_API_KEY    required
#   BB_SESSION_TIMEOUT     timeout for `--new` sessions, in seconds (default 600)
#   O11Y_ROOT, O11Y_DOMAINS, O11Y_INTERVAL — same as start-capture.sh

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: bb-capture.sh --new|<session-id> [run-id] [interval-sec]" >&2
  exit 2
fi

: "${BROWSERBASE_API_KEY:?BROWSERBASE_API_KEY must be set}"

TARGET_ARG="$1"
RUN_ID="${2:-$(date -u +%Y%m%dT%H%M%SZ)}"
INTERVAL="${3:-2}"
ROOT="${O11Y_ROOT:-.o11y}"
RUN_DIR="$ROOT/$RUN_ID"

if [[ "$TARGET_ARG" == "--new" ]]; then
  SESSION_JSON=$(bb sessions create --keep-alive --timeout "${BB_SESSION_TIMEOUT:-600}")
  SESSION_ID=$(echo "$SESSION_JSON" | jq -r .id)
  echo "Created Browserbase session: $SESSION_ID"
else
  SESSION_ID="$TARGET_ARG"
  SESSION_JSON=$(bb sessions get "$SESSION_ID")
  STATUS=$(echo "$SESSION_JSON" | jq -r .status)
  if [[ "$STATUS" != "RUNNING" ]]; then
    echo "Session $SESSION_ID is not RUNNING (status=$STATUS). Recreate with --keep-alive." >&2
    exit 1
  fi
fi

CONNECT_URL=$(echo "$SESSION_JSON" | jq -r .connectUrl)
DEBUG_JSON=$(bb sessions debug "$SESSION_ID" 2>/dev/null || echo "null")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Filter the long signed connectUrl out of start-capture's status block —
# it's the same value as $CONNECT_URL, just noisy and credential-bearing.
bash "$SCRIPT_DIR/start-capture.sh" "$CONNECT_URL" "$RUN_ID" "$INTERVAL" \
  | grep -v '^target=' || true

# Stamp the manifest with Browserbase-side metadata so traversal queries can
# join CDP events back to platform info (region, debugger URL, project, etc.).
TMP=$(mktemp)
jq --argjson session "$SESSION_JSON" \
   --argjson debug "$DEBUG_JSON" \
   '. + {
      browserbase: {
        session_id:    $session.id,
        project_id:    $session.projectId,
        region:        $session.region,
        started_at:    $session.startedAt,
        expires_at:    $session.expiresAt,
        keep_alive:    $session.keepAlive,
        debugger_url:  ($debug | if . then (.debuggerFullscreenUrl // .debuggerUrl) else null end)
      }
    }' \
  "$RUN_DIR/manifest.json" > "$TMP" && mv "$TMP" "$RUN_DIR/manifest.json"

DEBUG_URL=$(echo "$DEBUG_JSON" | jq -r '.debuggerFullscreenUrl // .debuggerUrl // empty')
[[ -n "$DEBUG_URL" ]] && echo "Live debugger: $DEBUG_URL"

cat <<EOF
session_id=$SESSION_ID
connect_url=${CONNECT_URL:0:60}…
EOF
