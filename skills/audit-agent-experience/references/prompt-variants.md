# Prompt Variants

The subagent gets **one or two sentences**. Do not paste docs. Do not list "rules". The realism of the audit depends on the prompt being as thin as a real developer's first thought.

## Template

```
{persona_prefix} {product}'s getting-started guide using {language}. You've completed it when you've done whatever the guide treats as its primary successful outcome.
```

No checklist. No prescriptive steps. The agent reads the docs and decides what "done" means. Only `{persona_prefix}` and `{language}` vary between agents.

## Persona prefixes

### Standard (default, no persona flavoring)
> Follow

No adjectives, no role-play, no behavioral hint. Just the task. Use this as the neutral baseline — removes the Hawthorne effect of telling the agent "you are X type of developer" and lets you measure the docs against an agent doing its natural thing.

### Pragmatic
> Skim and then follow

Behavioural hint: shortest path to working. Skips docs when possible. Flags friction bluntly.

### Thorough
> Read and then follow

Behavioural hint: reads end-to-end before coding. Surfaces ambiguity. Catches docs that don't survive a close read.

### Skeptical
> Follow — note anything in the docs that seems wrong or unclear as you go while following

Behavioural hint: verifies claims. Calls out marketing vs. code.

## Core task (single phrase — derived from the target)

Pick **one** core task for the whole audit. All subagents do the same task — only persona and language change.

Heuristics:

- **SDK / product with docs site** → "use it to do its primary function once". Examples of how to derive the core task (illustrative only — apply the same logic to whatever product the user named):
  - A payments API → "charge a test card"
  - An auth provider → "sign up a user"
  - A database/backend → "insert a row and read it back"
  - A browser-automation SDK → "run a session"
  - A search API → "make one query and parse the result"
- **SKILL.md** → "use this skill to do its advertised job"
- **API reference page** → "make one representative call and handle the response"
- **Tutorial / guide** → "follow the guide to completion"
- **README for library** → "install it and run the smallest meaningful example"

If the target is ambiguous, ask the user via AskUserQuestion before Step 4.

## Language tail

Append after the core task:

- Python → `using Python`
- TypeScript → `using TypeScript (Node.js)`
- Go → `using Go`
- Shell/Bash → `using bash/curl only`

## Final shape — examples

Substitute `{product}` with whatever the user named in Step 1. The shape is identical regardless of target.

Worked example with `{product} = Acme` (placeholder — not a default):

- **Standard × TypeScript** → *"Follow Acme's getting-started guide using TypeScript (Node.js). You've completed it when you've done whatever the guide treats as its primary successful outcome."*
- **Pragmatic × Python** → *"Skim and then follow Acme's getting-started guide using Python. You've completed it when you've done whatever the guide treats as its primary successful outcome."*
- **Thorough × Go** → *"Read and then follow Acme's getting-started guide using Go. You've completed it when you've done whatever the guide treats as its primary successful outcome."*
- **Skeptical × Shell** → *"Follow Acme's getting-started guide using bash/curl only — note anything in the docs that seems wrong or unclear as you go. You've completed it when you've done whatever the guide treats as its primary successful outcome."*

Each agent figures out on its own what the success outcome is from the docs.

## Cross-product rule

Generate cells = |personas| × |languages|. Truncate or repeat to hit N:

- If cells ≥ N → take the first N in row-major order (persona rotation, then language).
- If cells < N → reuse cells in the same order; distinguish reruns by appending a slight task variation to the tail, e.g. `"and print the full error if anything fails"` or `"and also capture a screenshot if possible"`.

## What NOT to do

- Do **not** paste doc content, URL content, or code examples into the prompt.
- Do **not** give a numbered list of rules ("1. Use only X. 2. Do Y...").
- Do **not** say "simulate a newbie" or use theatrical persona role-play — it just invites model performance-for-performance's-sake. The **prefix alone** shapes behaviour enough.
- Do **not** provide the answer in the prompt. If you find yourself writing "hint: use the Playwright quickstart at …", delete it.

## Seed URL placement

If the target's **name** alone might be ambiguous (e.g., "Clerk" could be many things), you may include the URL as the tail: `"…starting from https://clerk.com/docs"`. Prefer name-only when unambiguous.

## Final check

Before passing the prompt to the subagent:

- [ ] Under ~30 words?
- [ ] No checklist, no step-by-step, no doc content pasted in?
- [ ] The success criterion is left implicit ("whatever the guide treats as its primary successful outcome") — not dictated?
- [ ] Persona is expressed by the prefix, not by "you are simulating…"?
