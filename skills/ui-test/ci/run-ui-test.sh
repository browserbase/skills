#!/usr/bin/env bash
set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────────────────
PREVIEW_URL=""
MODE="light"
PR_NUMBER=""
REPO=""
LOCAL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)    PREVIEW_URL="$2"; shift 2 ;;
    --mode)   MODE="$2"; shift 2 ;;
    --pr)     PR_NUMBER="$2"; shift 2 ;;
    --repo)   REPO="$2"; shift 2 ;;
    --local)  LOCAL=true; shift ;;
    *)        echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$PREVIEW_URL" ]]; then
  echo "Error: --url is required"
  exit 1
fi

# ── Verify preview is reachable ──────────────────────────────────────────
echo "Checking preview URL: $PREVIEW_URL"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL" 2>/dev/null || echo "000")
if [[ "$HTTP_STATUS" == "000" ]]; then
  echo "Error: Preview URL is not reachable"
  exit 1
fi
echo "Preview is up (HTTP $HTTP_STATUS)"

# ── Build the prompt ─────────────────────────────────────────────────────
if [[ "$LOCAL" == true ]]; then
  # Local mode: skip diff gate, test the full app
  UI_FILES="(local mode — no diff filter, testing full app)"
  BROWSE_ENV="browse env local"
  DIFF_CONTEXT="No diff available (local mode). Explore the app and test what you find."
else
  DIFF_FILES=$(git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1)

  # Filter to UI-relevant files only
  UI_FILES=$(echo "$DIFF_FILES" | grep -E '\.(tsx|jsx|vue|svelte|css|scss)$' || true)

  if [[ -z "$UI_FILES" ]]; then
    echo "No UI files changed. Skipping tests."
    mkdir -p .context
    echo "No UI files changed in this PR." > .context/ui-test-summary.md
    echo "0" > .context/ui-test-exit-code
    exit 0
  fi
  BROWSE_ENV="browse env remote"
  DIFF_CONTEXT="Full diff of changed files (for context on what specifically changed):
$(git diff origin/main...HEAD -- $UI_FILES 2>/dev/null | head -500 || echo "Could not generate diff")"
fi

echo "UI files changed:"
echo "$UI_FILES"

# Build mode-specific instructions
if [[ "$MODE" == "light" ]]; then
  MODE_INSTRUCTIONS="Run in CI-light mode:
- Use at most 2 sub-agents
- Budget each sub-agent at 20 browse steps max
- Focus on: functional correctness of changed components, basic accessibility (axe-core), and console errors
- Skip: exploratory testing, visual/design consistency, UX heuristics
- Skip: HTML report generation (the summary is enough for CI)"
else
  MODE_INSTRUCTIONS="Run in full mode:
- Use up to 4 sub-agents
- Budget each sub-agent at 40 browse steps max
- Cover: functional, adversarial, accessibility, responsive, console health
- Generate the HTML report"
fi

PR_CONTEXT=""
if [[ -n "$PR_NUMBER" && -n "$REPO" ]]; then
  PR_CONTEXT="This is PR #${PR_NUMBER} on ${REPO}."
fi

PROMPT=$(cat <<PROMPT_EOF
You are running as a CI check. Test the UI at the target URL.

${PR_CONTEXT}

Target URL: ${PREVIEW_URL}

Changed UI files:
${UI_FILES}

${DIFF_CONTEXT}

## Instructions

1. Use \`${BROWSE_ENV}\` to set up the browser environment.
2. Analyze the context above to understand what to test.
3. Run the planning rounds (functional, adversarial, coverage gaps) then execute.
4. ${MODE_INSTRUCTIONS}
5. After all tests complete, write a markdown summary to .context/ui-test-summary.md with:
   - Total tests, passed, failed, skipped counts
   - A table of all test results (step-id, status, one-line evidence)
   - For failures: reproduction steps and suggested fix
6. Write the exit code to .context/ui-test-exit-code:
   - "0" if all tests passed
   - "1" if any test failed

Important CI constraints:
- Do NOT open any files in an editor or attempt interactive operations
- Do NOT ask for user input — make all decisions autonomously
- Keep total execution under 10 minutes
- Always run \`browse stop\` when done (and stop all named sessions)
PROMPT_EOF
)

# ── Setup ────────────────────────────────────────────────────────────────
mkdir -p .context/ui-test-screenshots

# ── Run Claude Code ──────────────────────────────────────────────────────
echo "Starting UI test run..."
echo "$PROMPT" | claude --print \
  --dangerously-skip-permissions \
  --allowed-tools "Bash(browse:*)" "Bash(BROWSE_SESSION=*)" "Bash(mkdir:*)" "Bash(curl:*)" "Bash(git:*)" "Read" "Glob" "Grep" "Agent" "Write" \
  2>&1 | tee .context/ui-test-output.log

# ── Post-run ─────────────────────────────────────────────────────────────
# Ensure browse sessions are cleaned up
browse stop 2>/dev/null || true
pkill -f "browse.*daemon" 2>/dev/null || true

# Default exit code if Claude didn't write one
if [[ ! -f .context/ui-test-exit-code ]]; then
  echo "1" > .context/ui-test-exit-code
  echo "Warning: Claude did not write an exit code. Defaulting to failure."
fi

# Default summary if Claude didn't write one
if [[ ! -f .context/ui-test-summary.md ]]; then
  cat > .context/ui-test-summary.md <<'EOF'
UI test run completed but did not produce a structured summary.

Check the full output log for details.
EOF
fi

echo ""
echo "======================================="
echo "UI Test Complete"
echo "======================================="
cat .context/ui-test-summary.md
echo ""
echo "Exit code: $(cat .context/ui-test-exit-code)"
