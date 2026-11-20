---
name: platform-claude-com-write-prompt-guide-0j5xu3
title: Write a Prompt for Claude
description: >-
  A distilled, model-aware checklist for writing high-quality prompts for
  Claude's latest models, built from Anthropic's prompt-engineering overview and
  best-practices docs (LaTeX guidance excluded).
website: platform.claude.com
category: prompt-engineering
tags:
  - prompt-engineering
  - claude
  - llm
  - best-practices
  - agents
  - documentation
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      Canonical docs are served as clean Markdown by appending .md to the page
      URL (text/markdown, 200) — no browser, login, or scraping needed. This is
      how the guide is sourced and refreshed.
  - method: browser
    rationale: >-
      Rendering the docs pages in a browser works but is slower and unnecessary;
      the .md endpoint returns the same content as plain Markdown.
verified: false
proxies: true
---
# Write a Prompt for Claude

## Purpose

A self-contained, opinionated checklist for writing high-quality prompts for Claude's latest models (Opus 4.8 / 4.7 / 4.6, Sonnet 4.6, Haiku 4.5). It distills Anthropic's canonical prompt-engineering guidance — the [overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) and [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) pages — into a single reference you can pull in whenever you draft or refine a prompt. Read-only knowledge artifact: it tells *you* (or an agent acting on your behalf) how to construct a prompt; it does not call any API. The LaTeX/math-formatting guidance from the source is intentionally excluded.

## When to Use

- You're drafting a new system prompt or user prompt and want it right the first time.
- An existing prompt is underperforming and you need a structured way to diagnose and fix it.
- You're migrating prompts to a newer Claude model and behavior has shifted (verbosity, tool triggering, thinking, prefill).
- You're building an agentic harness (coding agent, research agent, long-horizon task runner) and need prompt patterns for autonomy, state tracking, and safety.
- You want to refresh this guide from source — the canonical pages are fetchable as clean Markdown (see Workflow step 0 and Gotchas).

## Workflow

**Optimal retrieval path (how this guide stays current).** The canonical docs serve clean Markdown at the same URL with a `.md` suffix — no browser, login, or scraping needed. `recommended_method: fetch`. To refresh:

```
GET https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview.md
GET https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices.md
```

Both return `text/markdown; 200`. Prefer this over rendering the HTML page. Everything below is the distilled product of those two pages.

### 0. Prerequisites — before you prompt-engineer

1. **Define success criteria** for your use case (what does a good output look like, measurably).
2. **Build a way to test** against those criteria (even a handful of eval cases).
3. **Have a first-draft prompt** to improve. (No draft? Use the prompt generator in the Claude Console.)
4. **Confirm prompting is the right lever.** Latency and cost are often better solved by model choice or the `effort` parameter than by prompt wording.

### 1. Core principles (apply to every prompt)

- **Be clear and direct.** Treat Claude as a brilliant new employee with zero context on your norms. State exactly what you want, including output format and constraints. If you want "above and beyond" effort, ask for it explicitly — don't rely on inference. **Golden rule:** show your prompt to a colleague with minimal context; if they'd be confused, so will Claude.
- **Use sequential steps** (numbered lists / bullets) when order or completeness matters.
- **Add context and motivation.** Explain *why* an instruction matters; Claude generalizes well from the reason. (E.g. "never use ellipses — this is read aloud by TTS, which can't pronounce them" beats a bare "NEVER use ellipses".)
- **Use examples (few-shot / multishot).** The most reliable way to steer format, tone, and structure. Make them **relevant** (mirror your real case), **diverse** (cover edge cases, vary enough to avoid unintended pattern-matching), and **structured** (wrap each in `<example>` tags, the set in `<examples>`). Aim for 3–5. You can ask Claude to critique or extend your example set.
- **Structure prompts with XML tags.** When a prompt mixes instructions, context, examples, and input, wrap each kind in its own descriptive tag (`<instructions>`, `<context>`, `<input>`). Use consistent tag names; nest when there's natural hierarchy.
- **Give Claude a role** via the system prompt. Even one sentence ("You are a helpful coding assistant specializing in Python.") focuses tone and behavior.

### 2. Long-context prompts (20k+ tokens)

- **Put longform data at the top**, above your query, instructions, and examples. Queries placed at the *end* can improve response quality by up to ~30% on complex multi-document inputs.
- **Wrap each document** in `<document>` tags with `<document_content>` and `<source>` (plus other metadata) subtags; index multiple documents (`<document index="1">`).
- **Ground responses in quotes.** Ask Claude to first extract relevant quotes into `<quotes>` tags, then reason from them. Cuts through document noise.

### 3. Output and formatting control

- **Tell Claude what to do, not what not to do.** "Write in smoothly flowing prose paragraphs" beats "Do not use markdown."
- **Use XML format indicators.** "Write the prose sections in `<smoothly_flowing_prose_paragraphs>` tags."
- **Match your prompt's style to the desired output.** Removing markdown from your prompt tends to reduce markdown in the output.
- **Be explicit for strict formatting.** For heavy markdown control, give a detailed block (e.g. a `<avoid_excessive_markdown_and_bullet_points>` instruction). Prefer **positive examples** of the desired concision over lists of "don'ts."
- **Verbosity is calibrated, not fixed.** Latest models are more concise and may skip post-tool-call summaries. If you want visibility, ask: "After a task involving tool use, provide a quick summary of the work done."
- **Structured output:** prefer the Structured Outputs feature or tool/enum fields over older tricks; modern models match complex schemas reliably when told to.

### 4. Migrate away from prefilled responses

Prefilling the *last assistant turn* is **no longer supported** on Claude 4.6+ (returns HTTP 400). Replacements:

- **Force a format:** use Structured Outputs, tools with an enum field, or just ask for the schema.
- **Kill preambles:** instruct "Respond directly without preamble; don't start with 'Here is…', 'Based on…'." Or emit inside XML tags / strip in post.
- **Avoid bad refusals:** no longer needed — modern refusal behavior is good; clear user-message prompting suffices.
- **Continuations:** move the partial text into the *user* turn ("Your previous response was interrupted and ended with `…`. Continue from where you left off.").
- **Context hydration:** inject former prefilled reminders into the user turn, or hydrate via tools / during compaction.

### 5. Tool use

- **Be explicit when you want action.** "Can you suggest changes?" often yields only suggestions; "Change this function to improve performance" yields edits.
- **Steer the default posture** with a system-prompt block: `<default_to_action>` (implement rather than suggest, infer intent, use tools to discover missing details) or `<do_not_act_before_instructions>` (research/recommend, only act when explicitly told).
- **Dial back forceful language.** On 4.5/4.6+, prompts tuned to fix *under*-triggering now *over*-trigger. Replace "CRITICAL: You MUST use this tool when…" with plain "Use this tool when…".
- **Parallel tool calls:** latest models parallelize well natively; a `<use_parallel_tool_calls>` block pushes success toward ~100% (make all independent calls together; never parallelize dependent calls or guess missing params). To slow down, instruct sequential execution.

### 6. Thinking and reasoning

- **Adaptive thinking is preferred.** 4.6+ uses `thinking: {type: "adaptive"}`, where Claude decides when/how much to think based on the `effort` parameter and query complexity. It beat extended thinking in internal evals. Migrate off manual `budget_tokens` (deprecated) and control depth via `effort`.
- **Effort guide (Opus 4.8):** `xhigh` for coding/agentic; minimum `high` for intelligence-sensitive work; `medium` for cost-sensitive; `low` for short, scoped, latency-sensitive tasks; `max` for the hardest tasks (watch for overthinking/diminishing returns). If reasoning looks shallow, **raise effort** rather than prompting around it. Set a large `max_tokens` (start 64k) at high/xhigh so the model has room to think and act.
- **Don't over-prompt thoroughness.** "Default to using [tool]" / "if in doubt, use [tool]" cause overtriggering now. Use targeted "use [tool] when it would enhance understanding," and use lower `effort` as a fallback brake.
- **Prefer general thinking instructions over prescriptive step lists.** "Think thoroughly" often beats a hand-written plan. Use `<thinking>` tags inside few-shot examples to demonstrate a reasoning style. Ask Claude to **self-check** before finishing ("verify your answer against [criteria]").
- **Commit to an approach** when the model thrashes: "choose an approach and commit; avoid revisiting decisions unless new contradicting information appears."
- **Word sensitivity:** with thinking *disabled*, Claude Opus 4.5 is especially sensitive to the word "think" and variants — prefer "consider," "evaluate," "reason through."

### 7. Agentic systems

- **Long-horizon / multi-window:** lean on state tracking. Use a **different first-context-window prompt** to set up scaffolding (tests, setup scripts), then iterate on a todo list. Have the model write tests in a **structured format** (`tests.json`) and treat tests as sacrosanct ("It is unacceptable to remove or edit tests"). Create QoL scripts (`init.sh`). Prefer **starting fresh + filesystem discovery** over compaction; be prescriptive about startup ("call pwd," "review progress.txt, tests.json, git logs").
- **Context awareness / memory:** 4.5/4.6 track remaining token budget. If your harness compacts or persists to files, tell the model so it won't wrap up early; pair with the memory tool. Encourage full use of context ("don't stop early due to token budget; save state before refresh").
- **State management:** JSON for structured state, freeform text for progress notes, git for checkpoints; emphasize incremental progress.
- **Balance autonomy and safety:** ask for confirmation before hard-to-reverse / destructive / externally-visible actions (deletes, `git push --force`, posting, dropping tables); forbid destructive shortcuts and bypassing safety checks (`--no-verify`).
- **Research:** give clear success criteria, ask for cross-source verification; for complex tasks use a structured prompt (competing hypotheses, confidence tracking, self-critique, hypothesis-tree notes file).
- **Subagents:** modern models orchestrate natively — let them; watch for *overuse* (spawning subagents where a direct grep is faster). Add guidance on when subagents are/aren't warranted (parallel, isolated context, independent workstreams vs. simple/sequential/single-file work).
- **Prompt chaining** is still useful when you need to inspect intermediate output or enforce a pipeline. The common pattern is **self-correction:** draft → review against criteria → refine, each as a separate call.
- **Reduce file sprawl:** instruct cleanup of temporary iteration files at task end.
- **Avoid overengineering** (Opus 4.5/4.6 tend to overbuild): a minimization block — don't add unrequested features/abstractions/docs/defensive code; only validate at system boundaries.
- **Avoid teaching-to-the-test / hard-coding:** require a general-purpose solution for all valid inputs, not just test cases; no helper-script workarounds; surface infeasible tasks or wrong tests instead of hacking around them.
- **Minimize hallucinations** in coding: `<investigate_before_answering>` — never speculate about code you haven't opened; read referenced files before answering.

### 8. Model-specific tuning (Claude Opus 4.8 highlights)

- **More literal instruction following.** It won't silently generalize an instruction or infer unrequested work — **state scope explicitly** ("apply this to every section, not just the first").
- **Verbosity** is task-calibrated; if you need a fixed style/length, tune for it ("Provide concise, focused responses. Skip non-essential context, keep examples minimal.").
- **Thinking is off** unless you set `thinking: {type: "adaptive"}`; its triggering is steerable via prompt if it thinks too often.
- **Tool-use triggering** favors reasoning over tool calls; raise `effort` (high/xhigh) or instruct explicitly to increase tool usage.
- **Subagent spawning** is conservative by default; give explicit guidance when fan-out is desirable.
- **Frontend design** has a persistent "house style" (cream backgrounds, serif display, terracotta accent). Generic "don't use cream" just shifts to another fixed palette — instead **specify a concrete alternative** or have the model **propose 3–4 directions first**, then build the chosen one. Use a `<frontend_aesthetics>` block to avoid "AI slop."
- **Code review:** with strict "only high-severity / be conservative" instructions, 4.8 reports fewer findings (higher precision, lower recall). For coverage, instruct it to report everything (with confidence + severity) and filter downstream.

## Site-Specific Gotchas

- **`.md` suffix = canonical Markdown.** Append `.md` to any `platform.claude.com/docs/...` page URL to get clean Markdown (`text/markdown; charset=UTF-8`, HTTP 200), served via an internal rewrite to `/docs/.generated-markdown/...`. This is the fetch shortcut — don't scrape the rendered HTML.
- **Fetch via residential proxy is reliable; no auth/anti-bot wall observed.** `browse cloud fetch <url>.md --proxies` returned 200 cleanly. The `browse` CLI prints an "Update available: x.y.z" banner to stdout *before* the JSON envelope — slice from the first `{` before `JSON.parse`, or you'll get a parse error. (`jq` is not installed in this sandbox.)
- **Guidance is model-version-specific and dated.** The best-practices page is explicitly written for Opus 4.8 / 4.7 / 4.6, Sonnet 4.6, Haiku 4.5 (page last-modified June 2026). Advice that fixes *under*-triggering on older models causes *over*-triggering on these — always re-validate against your target model, don't blindly carry old prompts forward.
- **Prefill on the last assistant turn is a hard 400** on 4.6+ (and Mythos Preview). Earlier models still support it; assistant messages *elsewhere* in the conversation are unaffected.
- **`budget_tokens` extended thinking is deprecated** (still functional on Opus/Sonnet 4.6). Migrate to adaptive thinking + `effort`; a ~16k budget is safe headroom only as a temporary bridge.
- **The word "think" is a trigger** for Opus 4.5 when thinking is disabled — swap for "consider/evaluate/reason through."
- **Don't over-prompt.** The single most common migration mistake: leaving "CRITICAL/MUST/if in doubt use X/default to X" language that now backfires. Default to plain phrasing and add force only if you measure undertriggering.
- **LaTeX guidance deliberately excluded** from this distillation per scope; if you need plain-text math output, see the source page's "LaTeX output" section.
- **Always measure.** Every prompt change should be validated against your evals/test cases — the source repeatedly stresses empirical testing over intuition (e.g. for recall/F1 on review harnesses, verbosity, thinking-trigger tuning).

## Expected Output

This skill produces *guidance*, not a data record. Two useful shapes:

**(a) A structured prompt assembled from the principles above:**

```text
System:
You are a <role>. <one-line behavioral framing>.

<instructions>
1. <clear, sequential step>
2. <step — state scope explicitly>
</instructions>

<context>
<why this matters / motivation>
</context>

<examples>
  <example>
    Input: <...>
    Output: <desired format/tone/structure>
  </example>
  <!-- 3–5 relevant, diverse, structured examples -->
</examples>

<formatting>
<positive description of desired output format>
</formatting>

User:
<longform documents at top, wrapped in <document> tags, if any>
<the query / task, placed AFTER the data>
```

**(b) A diagnostic when refining an existing prompt:**

```json
{
  "target_model": "claude-opus-4-8",
  "symptom": "model only suggests changes instead of making them",
  "diagnosis": "instruction phrased as a question; no action directive",
  "fix": "replace 'can you suggest...' with imperative 'Change X to...' and add a <default_to_action> block",
  "lever_used": "prompt",
  "alt_levers_considered": ["raise effort", "model choice"],
  "validate_against": "eval suite / test cases"
}
```

**Canonical sources (fetch as `.md`):**

```json
{
  "overview": "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview.md",
  "best_practices": "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices.md",
  "content_type": "text/markdown; charset=UTF-8",
  "status": 200,
  "excluded_sections": ["LaTeX output"]
}
```
