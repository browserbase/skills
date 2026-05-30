# The Browsability Rubric

A code-grounded, operational definition of how usable a website is **by an AI browser agent** —
and how to score it. Grounded in what the open-source [Stagehand](https://github.com/browserbase/stagehand)
browser-automation framework actually treats as hard, plus the public Browserbase session settings.

## The opinion, in one line

**Browsability is how little help an agent needs to succeed** — and, more precisely, **how much
harder the site is for an agent than for a motivated human.**

It is *not* discoverability. Forget `llms.txt`, sitemaps, token efficiency, and SEO/AEO — those
measure whether content can be *found and cited*. Browsability measures whether an agent can
*operate* the live site: perceive the controls, drive the DOM, and complete a real task.

It is measured **operationally** — by running real agent tasks and reading harness + session
telemetry (which controls survived the accessibility tree, how many steps a flow took, which errors
fired, how much stealth/proxy assistance was needed) — not by linting static HTML.

> **Scope note:** this rubric covers *UI operability* — driving a website in a browser. It is the
> sibling of, not a substitute for, auditing docs/SDK onboarding experience.

## The key reframe: score the agent-vs-human delta, not absolute effort

A 10-click checkout that also takes a human 10 clicks is *perfectly browsable* — that's just the
workflow. A 3-click task that takes the agent 10 because controls are unlabeled is *not browsable* —
those extra 7 clicks are the **agent tax**.

Scoring the **delta over the human baseline** mathematically subtracts out UX/design length (which
costs humans and agents equally) and isolates exactly the agent-specific penalty. This resolves the
"is click-count a UX problem or a browsability problem?" question: only the *excess* over the human
path counts.

Stagehand surfaces a piece of this directly — a native `<select>` is a **one-step** action; a custom
dropdown must be clicked open, re-snapshotted, then selected — a **two-step** action. That second
step *is* agent tax: incidental inflation, not essential workflow.

## The scored axes (+ one ceiling badge)

| Axis | What it measures | Weight | In score? |
|---|---|---|---|
| **A · Access Resistance** | How much infrastructure assistance the agent needs to operate at all (the ladder) | 30 | ✅ |
| **B1 · Reachability** | Can the agent perceive the controls (survive the accessibility-tree prune) | 25 | ✅ |
| **B3 · Structural traps** | iframes, shadow DOM, DOM depth/size | 15 | ✅ |
| **C · Agent tax** | Steps *above the human baseline* (incidental inflation only) | 20 | ✅ |
| **D · Recoverability** | What happens when something breaks (self-heal, site errors, blocking overlays, step ceiling) | 10 | ✅ |
| — Essential path length | Inherent workflow steps (humans pay too) | — | ❌ separate "Agent UX" lens |
| — Agent-native affordance | An API / deep-link / structured action path exists | — | ⭐ ceiling badge, not scored |

Agent-native affordance (offering a non-UI path so an agent need not drive the browser at all) is
noted as the *ceiling*, not a scored component — this rubric deliberately measures **operability of
the UI**, the realistic last mile for the large share of the web that is UI-only.

Gate everything on a **success verdict** per task (a verifier, not the agent's self-report): friction
and tax scores only count for tasks confirmed to have actually completed.

---

## Axis A — Access Resistance (the assistance ladder)

Browserbase exposes public session settings, each mitigating a specific site-side obstacle. Re-run
the *same task* climbing the ladder; the **lowest rung at which it succeeds** is the site's Access
Resistance. Lower = more browsable.

| Public setting | Mitigates |
|---|---|
| `solveCaptchas` | CAPTCHA challenges |
| `proxies` | IP blocks, rate limits, geo-gating (residential / geo-targeted) |
| `fingerprint` | headless-browser fingerprint detection |
| `advancedStealth` | advanced anti-bot detection |
| `context` (persist) | re-auth / re-consent walls; session continuity |

The ladder to re-run a task across:

- **L0 Vanilla headless** — captcha-solving **off**, no proxy, no fingerprint, fresh context. The agent looks like raw headless Chrome. *Passing here = maximally browsable.*
- **L1 Default assist** — captcha-solving on, still no proxy/fingerprint.
- **L2 Proxied + realistic fingerprint** — geo proxy + a realistic desktop fingerprint.
- **L3 Advanced stealth + persisted context** — advanced anti-bot mitigation on; cookies persisted.
- **L4 Maximum assistance** — top-tier anti-bot mitigation. *Needing this rung = barely browsable.*

> **Gotcha:** `solveCaptchas` defaults to **on** in Browserbase, so an honest rung-0 baseline must
> explicitly turn it off — otherwise L0 and L1 collapse and captcha-walled sites get over-credited.

**Score:** `A = 30 * (1 - minPassingRung / 4)`.

---

## Axis B — Drivability (per-step technical difficulty)

### B1 · Element reachability — can the agent even *see* the control?

Stagehand builds an accessibility tree and **prunes any node that lacks all three of**: an accessible
name, named children, or a non-structural role. An unlabeled `<div role="generic">` button is removed
*before the model ever sees it.* The survival rule, from the open-source accessibility snapshot:

```js
// keep a node iff:
const keep = !!(name && name.trim())        // it has an accessible name, OR
          || !!(childIds && childIds.length) // it has named children, OR
          || !isStructural(role);            // it has a real role (not generic/none/inlinetextbox)
```

- **Signal:** reachable-control ratio = interactive controls that survive the prune ÷ all interactive controls.
- **Penalize:** icon-only buttons with no `aria-label`; `<div onclick>` controls; inputs with no associated `<label>`; closed-shadow custom components.
- **Reward:** native semantic elements (`button`, `a[href]`, `input`, `select`) with text/labels — they always survive.

### B3 · Structural traps — the hard walls

| Trap | Why it hurts an agent |
|---|---|
| Closed shadow DOM | roots closed before instrumentation are effectively invisible |
| Cross-origin iframes | short-lived, separately-managed frames that can drop out mid-operation |
| Deep DOM (>256 levels) | serialization stack limits force shallower, slower retries |
| Never-settling network | streaming / sub-second polling never reaches "network idle" → timeout every step |
| Virtualized lists | no automatic "scroll until found"; an observe→scroll→observe loop is required |
| Very large DOM | the serialized tree is truncated; elements past the cap become invisible |

---

## Axis C — Agent tax (steps over the human baseline)

For each verifier-confirmed task: `agentTax = agentSteps - humanBaselineSteps`. Where a human baseline
is unavailable, approximate the incidental inflation from the **two-step ratio** (custom controls the
framework must expand-then-act on) plus needless modal steps. Only the *excess* counts; essential
workflow length is reported separately as "Agent UX," not scored as browsability.

---

## Axis D — Recoverability — what happens when something breaks

Stagehand's error taxonomy cleanly separates *site-caused* friction from agent-caused, and its
self-heal path is the tell: on a stale selector (the DOM mutated under the agent) it re-snapshots and
re-asks the model once. Frequent self-heal = an unstable, hostile DOM.

- **Site-caused errors (penalize):** element-not-visible, selector-resolution failures, element-not-found, captcha timeouts, navigation timeouts.
- **Blocking overlays (penalize):** cookie/consent walls, login walls, paywalls — not auto-dismissed; they eat steps or wall the flow entirely.
- **Max-steps blowout:** agent loops have a default step budget; tasks that exhaust it score as failures.
- **Signal:** self-heal count, site-caused-error count, overlay-encountered flag, whether the run hit the step ceiling.

---

## Remediation knowledge (turn findings into fixes)

| Finding | Fix |
|---|---|
| Low reachable-ratio | add `aria-label` to icon-only controls; use semantic `<button>` / `<a>` |
| Many custom dropdowns | use native `<select>` where possible |
| Cross-origin iframes in the flow | same-origin embed, or a direct route |
| Closed shadow DOM | open shadow roots, or expose semantic fallbacks |
| Deep / very large DOM | flatten nesting, paginate, reduce node count |
| High Access Resistance | reduce hostile bot-walls on agent-relevant flows |
| High agent tax | collapse the funnel; remove needless modal steps |
| (ceiling) UI-only | offer an API / deep-link / structured action path for agents |
