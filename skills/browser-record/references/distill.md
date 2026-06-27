# Distill: the teacher agent

The distiller is **an agent, not a script.** Reconstructing what a human *meant*
from what they *did* is a goal-level judgment — collapsing self-corrections,
dropping abandoned actions, parameterizing variables — and no deterministic rule
can do it. This is the same shape as the `autobrowse` teacher loop: there the
outer agent reads its own run's trace and improves a skill; here it reads a
*human's* trace and authors one.

## Inputs (capture wide, read selectively)

Give the agent everything the session produced, but let it **query** the trace
rather than dumping the firehose into context (that's what the bisected buckets
are for — progressive disclosure):

| source | what it carries | how to read it |
|--------|-----------------|----------------|
| `recording.json` | semantic spine: each click/type with the acted element's `name` + `role` + value | read in full (it's small) |
| `<recording>-shots/step-NN.png` | what the page looked like at each commit | read the ones you need to disambiguate intent |
| `browser-trace` buckets (`.o11y/<run>/cdp/by-bucket/`) | network, console, DOM dumps, exact event timing | `grep`/`jq`/`query.mjs` on demand — e.g. to confirm a click triggered a request, or that a value committed |

## The job

Produce the **smallest set of intents that explains the session**, then write a
parameterized task skill. Specifically:

1. **Recover intent, not mechanics.** A step's headline is the value the field
   *committed to* — read from the acted element's `name` (e.g. the autocomplete
   suggestion "New York"), not the keystrokes ("new yo") or the dynamic selector
   (`#c307`).
2. **Collapse self-corrections.** Typed "San Francisco", cleared it, typed "Los
   Angeles" → one intent: `origin = Los Angeles`. The intermediate states are noise.
3. **Drop abandoned actions.** Applied a "window seat" filter then removed it →
   net zero, omit it entirely. Same for opened-then-closed menus, mis-clicks.
4. **Parameterize.** The values the user supplied (cities, dates, search terms)
   become inputs with the recorded value as the example. Structural choices
   (which button submits) stay fixed.
5. **Attach a check per step.** The committed value *is* the assertion ("the field
   reads New York"); for steps with no readable value, point at the step screenshot.

## Output

Write `skills/<task-name>/`:
- `SKILL.md` — intent-level, parameterized, per-step verification. Each step names
  the **recorded target** (accessible name/role, plus selector if useful) as a
  *hint*, and explicitly grants the agent agency to use whatever live element
  achieves the intent — never bind it to a dynamic id.
- `screenshots/NN-<label>.png` — the committed-state shot for each intent step,
  curated from the recording and referenced per step. The visual oracle.
- `recording.json` — the raw mechanics, carried as a last-resort fallback.

## Teacher prompt (starting point)

> You are distilling a recorded browser session into a reusable task skill. You
> have `recording.json` (semantic click/type stream with element names), the
> per-step screenshots, and a queryable `browser-trace` (network/console/DOM).
> Figure out what the human was *trying to accomplish* — not the literal keystrokes.
> Collapse corrections, drop abandoned/undone actions, and identify which values
> were user inputs (parameterize them). Emit a parameterized SKILL.md whose steps
> are intents with a verification check each. When a step is ambiguous, look at its
> screenshot and query the trace before deciding. Prefer the fewest steps that
> reliably reproduce the goal.
