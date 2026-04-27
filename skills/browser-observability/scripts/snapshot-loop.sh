#!/usr/bin/env bash
# Periodically capture screenshot + DOM HTML + URL via one-shot CDP connections.
# Invoked by start-capture.sh; not meant to be called directly.

set -uo pipefail

TARGET="${1:?target required}"
RUN_DIR="${2:?run dir required}"
INTERVAL="${3:-2}"

INDEX="$RUN_DIR/index.jsonl"
trap 'exit 0' SIGTERM SIGINT

while true; do
  TS=$(date -u +%Y%m%dT%H%M%S%3NZ 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)
  PNG="$RUN_DIR/screenshots/$TS.png"
  HTML="$RUN_DIR/dom/$TS.html"
  HTML_TMP="$HTML.partial"

  # Best-effort screenshot via one-shot CDP (--ws bypasses daemon).
  browse --ws "$TARGET" screenshot "$PNG" >/dev/null 2>&1 || true
  [[ -f "$PNG" && ! -s "$PNG" ]] && rm -f "$PNG"

  # Best-effort DOM dump — use a temp file so we never leave a 0-byte HTML.
  if browse --ws "$TARGET" get html body > "$HTML_TMP" 2>/dev/null && [[ -s "$HTML_TMP" ]]; then
    mv "$HTML_TMP" "$HTML"
  else
    rm -f "$HTML_TMP"
  fi

  # Best-effort URL — `browse --json get url` emits {"url":"..."}. Extract scalar via jq.
  URL=$(browse --ws "$TARGET" --json get url 2>/dev/null \
        | jq -r '.url // ""' 2>/dev/null || echo "")

  PNG_REL=""
  HTML_REL=""
  [[ -s "$PNG" ]]  && PNG_REL="screenshots/$TS.png"
  [[ -s "$HTML" ]] && HTML_REL="dom/$TS.html"

  # Build the index line via jq so embedded quotes/newlines stay safe.
  jq -cn --arg ts "$TS" --arg s "$PNG_REL" --arg d "$HTML_REL" --arg u "$URL" \
    '{ts:$ts, screenshot:$s, dom:$d, url:$u}' >> "$INDEX"

  sleep "$INTERVAL"
done
