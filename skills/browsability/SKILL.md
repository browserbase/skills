---
name: browsability
description: "Score how usable a website is BY AN AI BROWSER AGENT — its Browsability Index. Measures how little infrastructure assistance an agent needs to operate the site (Access Resistance), whether the agent can perceive and drive the live DOM (Drivability — does each control survive the accessibility-tree prune, are there iframe/shadow-DOM/deep-DOM traps), and how many more steps the agent needs than a human (Agent tax). Grounded in what the open-source Stagehand framework treats as hard. Use when the user asks how browsable / agent-friendly / agent-ready a website or a specific web flow (signup, checkout, search) is for a BROWSER agent, to compare sites on browser-agent usability, or to produce a browsability report card with concrete fixes. Triggers: 'how browsable is <site>', 'is this site agent-friendly for a browser agent', 'grade this checkout/signup flow for agents', 'browser-agent friendliness', 'DOM friction', 'browsability of <url>'. NOT for SEO/AEO or content discoverability (a different layer), and NOT for docs/SDK onboarding DX (use the agent-experience skill for that)."
license: MIT
metadata:
  author: browserbase
  version: "0.1.0"
allowed-tools: Bash Read Write Edit Glob Grep Agent
compatibility: "Requires `bun` and the browse CLI (`npm install -g @browserbasehq/browse-cli`). Remote mode needs BROWSERBASE_API_KEY. The full agent-ladder pass additionally needs a model-driven reference agent (use the `browser` skill as the driver)."
---

# Browsability — how usable is a site for a browser agent?

Score how well an AI **browser** agent can *operate* a website. The opinion: *browsability is how
little help an agent needs to succeed, and how much harder the site is for an agent than for a human.*
This is the operability layer — not discoverability, so ignore `llms.txt`, sitemaps, SEO/AEO.

**Before scoring, read `references/rubric.md`** — the full code-grounded rubric (axes, signals, the
assistance ladder, the agent-vs-human delta, and remediation knowledge). The summary below is only the
operating procedure.

## The score (0–100)

| Axis | Pts | Source |
|---|---|---|
| **A · Access Resistance** | 30 | lowest assistance rung that completes the task (agent ladder) |
| **B1 · Reachability** | 25 | % of controls that survive the accessibility-tree prune (deterministic probe) |
| **B3 · Structural traps** | 15 | cross-origin iframes, shadow DOM, DOM depth/size (deterministic probe) |
| **C · Agent tax** | 20 | agent steps OVER the human baseline (the delta — not absolute click count) |
| **D · Recoverability** | 10 | self-heal / site errors / blocking overlays / step ceiling (agent run) |

Score only counts for tasks a verifier confirms actually completed. **Agent-native affordance** (an
API / deep-link / structured action path) is a *ceiling badge*, not a scored component — flag it, do
not add it to the number; this rubric measures operability of the UI.

## Workflow

### Step 1 — Drivability probe (always; deterministic, no model)

Run the probe on the target URL (a page, or the entry point of a flow):

```bash
cd skills/browsability
bun scripts/friction.ts <url> --out browsability-out
```

This loads the page through the browse CLI and reports **B1 reachability** + **B3 structural traps**
straight from the live DOM (40 of 100 points). It needs no model and finishes in seconds. Use remote
mode (`browse env remote`, needs `BROWSERBASE_API_KEY`) for bot-protected sites; local is fine
otherwise. This alone is a useful friction profile and is the right answer for a quick assessment.

### Step 2 — Agent ladder + tasks (for the full score)

Derive a small set of **canonical tasks** for the site (informational / navigational / transactional —
e.g. "find the price of the paid plan", "create an account", "submit the contact form"). For each
task, run a reference browser agent across the **Access Resistance ladder** and record results:

- **rung 0** vanilla headless — captcha-solving **off** (`solveCaptchas:false`), no proxy, no fingerprint
- **rung 1** default assist — captcha-solving on
- **rung 2** proxy + realistic fingerprint
- **rung 3** advanced stealth + persisted context
- **rung 4** maximum assistance

Stop climbing once a task succeeds; the lowest passing rung is its Access Resistance. Drive the agent
with the `browser` skill (the browse CLI) or Stagehand, and judge each run's `success` with a verifier
— do not trust the agent's self-report. Capture **real step counts** and a **`humanBaselineSteps`**
estimate per task so Agent tax is computed as the delta. Record into `tasks.json`:

```json
{ "url": "https://example.com",
  "tasks": [
    { "name": "Create an account", "type": "transactional", "humanBaselineSteps": 4,
      "runs": [ {"rung":0,"success":false,"steps":10,"model":"<model>","note":"signup CTA unlabeled"},
                {"rung":2,"success":true,"steps":7,"model":"<model>","note":""} ] } ] }
```

If no model-driven agent is available, act as the reference agent using the `browser` skill: execute
each task's browse steps, count the steps, and write the runs into `tasks.json` honestly (mark
single-model). This produces a real, if single-model, result.

### Step 3 — Composite score + report

```bash
bun scripts/score.ts --friction browsability-out/friction.json --tasks tasks.json --out browsability-out
```

Writes `browsability-out/browsability.json` with the 0–100 score, grade, and per-axis breakdown. When
`tasks.json` is absent it reports a **Drivability-only** score (B1 + B3, 40 max) and marks A/C/D
pending — still honest, just partial.

### Step 4 — Report to the user

Present a **profile, not just a number**: the grade, the per-axis breakdown, the lowest passing rung,
and — most usefully — a **ranked remediation list** drawn from the rubric's remediation table (e.g.
"signup CTA has no accessible name → add `aria-label`; estimated lift +X"). Cite the concrete signal
each finding came from.

## Notes & gotchas

- `solveCaptchas` defaults to **on** in Browserbase — an honest rung-0 must explicitly disable it, or rungs 0 and 1 collapse and captcha-walled sites get over-credited.
- The deterministic probe approximates "closed shadow DOM" via custom-element count with zero open shadow hosts; treat it as a hint and confirm during the agent run.
- Keep the human baseline honest — Agent tax is the *delta*, so a genuinely long workflow (10 steps for humans too) must not be penalized as un-browsable.
- The scripts call `browse stop` on exit; if a daemon hangs, `pkill -f "browse.*daemon"`.
