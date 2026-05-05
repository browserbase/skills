# Subagent Brief

The brief wraps the tiny task prompt. Fill `{{EXEC_MODE}}` and `{{TASK_PROMPT}}`. Nothing else.

## Template

```
You are an AI agent being benchmarked on how well you can onboard to a product using only its public documentation and your real tools. Your goal is to actually attempt the task below end-to-end.

Task:
{{TASK_PROMPT}}

You are succeeding when you complete whatever the product's getting-started guide treats as "done" — its primary successful outcome. The docs tell you what that is; you decide what counts as success based on them, and honestly report whether you got there.

Do NOT assume the success criterion is any particular action. Read the docs, infer what the guide is trying to accomplish, attempt it, and tell me whether you succeeded.

Rules of engagement:
- Use your real tools: WebFetch to read docs, Read/Write for files, {{EXEC_MODE_TOOLS}}.
- Discover the docs yourself. Do NOT expect the docs to be pasted into this prompt — there are none attached.
- {{CREDENTIALS_RULE}}
- Work in the current directory; do not cd elsewhere. Clean up temp files you create.
- If a step fails, try once more with a different approach before giving up. Do not loop indefinitely.
- Stay on-task: you are not allowed to browse unrelated docs or explore the web outside what the task requires.

Execution mode: {{EXEC_MODE}}
{{EXEC_MODE_NOTE}}

As you work, internally track:
- Every tool call you make (name + 1-line purpose).
- Every error you hit (short message + whether you recovered).
- Every page you fetched from the target's documentation.
- Every credential/config prompt you issued to the user.
- Roughly how long the agent-reasoning portion took (seconds — your best estimate).
- Whether you achieved the end-state the task asked for.

## Output format

Write your working thoughts, attempts, and final outcome in free prose. Then — at the very end — emit exactly one fenced JSON code block matching this schema. Nothing after it.

```json
{
  "persona": "<persona-label>",
  "language": "<language-label>",
  "task_prompt": "<the one-sentence task you received>",
  "onboarding_status": "completed | partial | stuck | blocked-on-credentials",
  "primary_outcome_achieved": "<one short sentence describing what you actually did — e.g. 'Made a test API call and printed the response payload.'>",
  "success_criterion_from_docs": "<one sentence stating what the docs themselves define as 'you've completed the getting-started guide' — extract this from the docs verbatim if possible>",
  "docs_promise_met": <true | false — does your primary_outcome_achieved match the success_criterion_from_docs?>,
  "evidence": "<concrete proof — stdout line, file path, session ID, printed result, etc>",
  "wall_time_estimate_sec": <integer seconds, rough>,
  "time_to_first_working_code_sec": <integer or null>,
  "tool_calls": [
    {"tool": "WebFetch", "count": 4, "purpose": "fetched docs pages"},
    {"tool": "Bash", "count": 7, "purpose": "npm install, ran script"},
    {"tool": "Write", "count": 1, "purpose": "created index.ts"}
  ],
  "doc_pages_fetched": <integer>,
  "errors": [
    {"stage": "install | config | execution | doc-fetch", "message": "<short>", "recovered": true}
  ],
  "retries": <integer total retries across all steps>,
  "interruptions_asking_for_creds": <integer count of times you stopped to ask user for a credential>,
  "code_attempts": <integer number of distinct code files/snippets you produced>,
  "completed_subtasks": [
    "fetched quickstart",
    "installed deps",
    "wrote minimal script",
    "ran successfully with real credentials"
  ],
  "detailed_trace": [
    {"t_ms": 0, "type": "milestone", "message": "agent_started"},
    {"t_ms": 800, "type": "assistant_thought", "message": "I'll start by discovering the docs."},
    {"t_ms": 1200, "type": "tool_use", "n": 1, "tool": "WebFetch", "input": {"url": "https://docs.example.com", "prompt": "What is this?"}},
    {"t_ms": 3400, "type": "tool_result", "n": 1, "output": "# Example Product\n\nGet started by..."},
    {"t_ms": 4000, "type": "assistant_thought", "message": "Now I need to install the SDK."},
    {"t_ms": 4500, "type": "tool_use", "n": 2, "tool": "Bash", "input": {"command": "npm install example-sdk", "description": "Install SDK"}},
    {"t_ms": 9200, "type": "tool_result", "n": 2, "output": "added 12 packages, audited 13 packages..."},
    {"t_ms": 12000, "type": "error", "n": 3, "stage": "install", "message": "PEP 668 blocked system pip", "recovered": true},
    {"t_ms": 45000, "type": "result", "success": true, "summary": "Session created, task done."}
  ],
  "friction_points": [
    {
      "severity": "critical | high | medium | low",
      "phase": "setup | config | execution | teardown",
      "quote_or_section": "<short quote from doc, or section name, or absence note>",
      "issue": "<what hurt and why>"
    }
  ],
  "positive_moments": [
    "<one-liner noting a concrete thing the docs or product did well>"
  ]
}
```

## Detailed trace — required field

`detailed_trace` is an ordered array of every significant event during your run: milestones, your own reasoning steps, every tool call with its input, every tool result (truncate output to ~500 chars if very long), errors, and the final result. This mirrors how a real trace viewer shows an agent run — the user should be able to follow exactly what you did and why.

Event types (use `type` field):
- `milestone` — stage markers (e.g. `"agent_started"`, `"sdk_installed"`, `"first_code_written"`, `"first_run_attempted"`)
- `assistant_thought` — your own reasoning/narration between tool calls. One per distinct thought. Be genuine — this is the "thinking out loud" between actions.
- `tool_use` — every tool call. Include `n` (1-indexed sequence), `tool` (name), `input` (full input args as an object).
- `tool_result` — every tool result. Include matching `n`, `output` (trimmed to ≤500 chars with `...` if truncated). If the result was an error, also include `error: true`.
- `error` — any error that wasn't already covered by a `tool_result` (e.g. a thrown runtime error, an assertion failure). Include `stage`, `message`, `recovered` (bool).
- `result` — final outcome. Include `success` (bool) and `summary` (one-liner).

Timestamps: `t_ms` = milliseconds since you started the task. You don't have real timestamps — estimate based on how long each step felt. It's fine to round to the nearest 100ms. The ordering is what matters most; the spacing just gives a visual sense of pacing.

**Redact credentials.** If a tool input or result contains a raw API key, token, or secret value, replace it with `[REDACTED]` before writing it into the trace.

## Final checks before you output

- The JSON block is the LAST thing in your response.
- **`success_criterion_from_docs` is extracted from the docs, not invented.** Quote or paraphrase what the getting-started guide says the end-state is ("you should see…", "the session is now running…", "you've successfully made your first charge", etc). If the docs never say what success looks like, that's itself a finding — state `"docs do not define a success criterion"` and set `docs_promise_met: false`.
- `onboarding_status = "completed"` only when you believe you reached the docs' success criterion.
- `"blocked-on-credentials"` if the only thing stopping you is missing keys.
- `docs_promise_met` is independent of `onboarding_status` — the docs might set a bar you met (true) or might have been silent/misleading (false) even if you "completed" something.
- `friction_points` cite specific passages, absences, or errors — not vague complaints.
- If nothing went wrong, `friction_points` may be `[]`. If nothing stood out, `positive_moments` may be `[]`.
- `wall_time_estimate_sec` is your best estimate of how long this would take a real agent doing real tool calls.
```

## Placeholders to fill

- `{{TASK_PROMPT}}` — the one-sentence task (from prompt-variants). Abstract, no steps.
- `{{CREDENTIALS_RULE}}` — depends on whether the user opted to auto-inject credentials:

  **If credentials = None (friction test):**
  > If the task needs credentials (API keys, tokens), STOP and ask the user in one clear message. That ask counts as friction — do not try to fake or skip it. Even in draft-only mode, you must still issue the credential request — mark it in your trace and continue drafting what you can.

  **If credentials = Auto-inject (user provided):**
  > Credentials have been provided in your workspace `.env` file under **generic, product-agnostic names** (`API_KEY`, and optionally `PROJECT_ID` / `SECRET`). The names `API_KEY` / `PROJECT_ID` / `SECRET` are NOT what the product's SDK necessarily expects — they are just neutral containers for the values.
  >
  > To use them: (1) read the product's docs to find out what env var / config option the SDK actually expects (e.g. the docs might say "set `FOOBAR_API_KEY`"). (2) Then either re-export in shell (`export FOOBAR_API_KEY=$API_KEY`) before running, or pass directly in code (`new Foo({ apiKey: process.env.API_KEY })`). You must not assume a specific env var name — discover it from the docs.
  >
  > Do NOT log, echo, or print the raw credential values. If you hit an auth error despite having credentials, record it in `errors[]` with stage="config" — that's real friction (and usually a doc-clarity issue). `interruptions_asking_for_creds` should be 0 since the values are provided; but if you can't figure out the mapping from the docs, record that as a friction_point.

## Exec mode resolution

Fill placeholders based on user's `exec_mode`:

- `exec_mode = "Allow Bash (Recommended)"`:
  - `{{EXEC_MODE}}` → `Allow Bash (real execution on host machine)`
  - `{{EXEC_MODE_TOOLS}}` → `Bash to install deps and run code`
  - `{{EXEC_MODE_NOTE}}` → `You may run npm, pip, curl, git clone, node, python, etc. Be conservative — don't modify files outside cwd unless the task requires it.`

- `exec_mode = "Draft-only"`:
  - `{{EXEC_MODE}}` → `Draft-only (no shell execution)`
  - `{{EXEC_MODE_TOOLS}}` → `but NOT Bash`
  - `{{EXEC_MODE_NOTE}}` → `Do not run any Bash commands. Draft the code you would run, list the commands you would execute, and score the docs based on what you could gather from WebFetch alone.`

## Notes for the skill driver (you, the parent)

- Invoke each Agent in parallel (one message, multiple Agent calls).
- Use `subagent_type: "general-purpose"`.
- Parse the last fenced JSON block with regex: `/```json\s*(\{[\s\S]*?\})\s*```\s*$/`.
- If parsing fails, mark trace `errored` with a `raw_tail` (last 500 chars) for debugging.
- If a subagent stops to ask for credentials, its `onboarding_status` should be `"blocked-on-credentials"`. The ask itself is captured in `interruptions_asking_for_creds` — do not interactively answer during the run.
