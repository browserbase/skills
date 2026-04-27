#!/usr/bin/env bash
# After stop-capture.sh, pull final Browserbase-side artifacts (session metadata,
# any downloads) into the run dir. Logs are best-effort — they're often sparse.
#
# Usage:
#   bb-finalize.sh <run-id> [--release]
#
#   --release   send `bb sessions update --status REQUEST_RELEASE` after finalizing
#               (use when you created the session with --keep-alive and want to end it)

set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: bb-finalize.sh <run-id> [--release]" >&2
  exit 2
fi

: "${BROWSERBASE_API_KEY:?BROWSERBASE_API_KEY must be set}"

RUN_ID="$1"
RELEASE="${2:-}"
ROOT="${O11Y_ROOT:-.o11y}"
RUN_DIR="$ROOT/$RUN_ID"

[[ -f "$RUN_DIR/manifest.json" ]] || { echo "manifest not found at $RUN_DIR" >&2; exit 1; }

SESSION_ID=$(jq -r '.browserbase.session_id // empty' "$RUN_DIR/manifest.json")
if [[ -z "$SESSION_ID" ]]; then
  echo "manifest has no .browserbase.session_id — was this run captured via bb-capture.sh?" >&2
  exit 1
fi

mkdir -p "$RUN_DIR/browserbase"

# Final session metadata — proxyBytes, status, ended-at all settle here.
bb sessions get "$SESSION_ID" > "$RUN_DIR/browserbase/session.json" 2>/dev/null \
  && echo "wrote session.json" \
  || echo "warn: bb sessions get failed" >&2

# Server-side logs. Often empty — the firehose in cdp/raw.ndjson is the source of truth.
bb sessions logs "$SESSION_ID" > "$RUN_DIR/browserbase/logs.json" 2>/dev/null \
  && echo "wrote logs.json ($(jq 'length' "$RUN_DIR/browserbase/logs.json" 2>/dev/null || echo '?') entries)" \
  || rm -f "$RUN_DIR/browserbase/logs.json"

# Downloads. An empty session yields a 22-byte EOCD-only zip; any real content
# is always larger.
if bb sessions downloads get "$SESSION_ID" \
     --output "$RUN_DIR/browserbase/downloads.zip" >/dev/null 2>&1; then
  SIZE=$(stat -f%z "$RUN_DIR/browserbase/downloads.zip" 2>/dev/null \
         || stat -c%s "$RUN_DIR/browserbase/downloads.zip" 2>/dev/null \
         || echo 0)
  if [[ "$SIZE" -le 22 ]]; then
    rm -f "$RUN_DIR/browserbase/downloads.zip"
    echo "no downloads"
  else
    echo "wrote downloads.zip ($SIZE bytes)"
  fi
else
  rm -f "$RUN_DIR/browserbase/downloads.zip"
fi

if [[ "$RELEASE" == "--release" ]]; then
  bb sessions update "$SESSION_ID" --status REQUEST_RELEASE >/dev/null 2>&1 \
    && echo "released session $SESSION_ID"
  # Re-snapshot session.json so it reflects the final COMPLETED state with
  # settled proxyBytes and endedAt instead of the pre-release values.
  bb sessions get "$SESSION_ID" > "$RUN_DIR/browserbase/session.json" 2>/dev/null \
    && echo "refreshed session.json (post-release)"
fi

echo "finalized: $RUN_DIR/browserbase/"
ls "$RUN_DIR/browserbase/" 2>/dev/null
