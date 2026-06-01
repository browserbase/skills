# What makes a site browsable for a browser agent

A checklist of what tends to help or hurt an AI **browser** agent trying to operate a website.
Grounded in what the open-source [Stagehand](https://github.com/browserbase/stagehand) framework
treats as hard, plus the public Browserbase session settings.

**Use this as a guide, not a rule book.** There is no scoring formula. Look at the site, try the
task, and decide what actually matters for *this* site — then report what helps and what hurts.

## The idea

**Browsability is how little help an agent needs to succeed, and how much harder the site is for an
agent than for a person.** Only the *agent-specific* friction counts: a long workflow that's long for
humans too isn't a browsability problem; a simple task made hard by unlabeled controls is. This is
*operability* (driving the UI), not *discoverability* (being found/cited — that's SEO/AEO, out of
scope).

When you see extra steps, ask: *would a human also need this step?* If yes, it's the workflow (don't
count it). If no — e.g. the agent had to click open a custom dropdown that a person reads at a glance
— that's the agent tax, and it hurts browsability.

---

## 1. Getting in — how much help did the agent need?

Re-frame "how protected is this site" as a ladder of assistance. The less help needed, the more
browsable. Browserbase exposes these public session settings; each one you have to switch on to make
the task work is a mark against the site:

- `solveCaptchas` — CAPTCHA challenges (**on by default**, so test with it off to see front-door hostility)
- `proxies` — IP blocks, rate limits, geo-gating
- `fingerprint` — headless-browser fingerprint detection
- `advancedStealth` — advanced anti-bot detection
- `context` (persist) — re-auth / re-consent walls

**Helps:** a plain vanilla headless session can load and act. **Hurts:** the task only works once you
add stealth, a proxy, or captcha-solving — and the more of those it needs, the worse.

**The remote-vs-local test (the strongest signal here).** Agents run on remote/cloud browsers, so
that's the environment that counts. If a task **works on a local/residential browser but is blocked
or errors on a remote one**, the site is gating cloud/automated browsers — that is a *major*
browsability failure, because a real agent simply cannot use it. Flag it loudly; do not excuse it as
"we just need a proxy." (Diagnostic tip: when a remote page comes back empty, check the final URL —
`chrome-error://…` or a title that's only the bare domain means the navigation was *blocked/failed*,
not that the page rendered empty. Confirm by loading the same URL locally.)

## 2. Seeing the controls — can the agent perceive what to click?

Browser agents work off an **accessibility tree**, and a control is only visible to the agent if it
has an accessible name, named children, or a real semantic role. An unlabeled `<div role="generic">`
button is dropped before the model ever sees it — effectively invisible.

- **Helps:** native `<button>`, `<a href>`, `<input>`, `<select>` with real text or labels; inputs tied to a `<label>`.
- **Hurts:** icon-only buttons with no `aria-label`; `<div onclick>` "buttons"; inputs with no label; controls hidden inside closed shadow DOM.

## 3. Structural traps

Hard walls that browser agents struggle with regardless of labeling:

- **Cross-origin iframes** — separately-managed frames that can drop out mid-action; fragile.
- **Shadow DOM** — closed roots are opaque to the agent.
- **Very deep DOM (hundreds of levels)** — forces slower, shallower page reads.
- **Very large DOM** — the accessibility snapshot can get truncated; elements past the cap vanish.
- **Never-settling pages** — constant streaming/polling means the page never looks "done loading," so the agent waits out a timeout on every step.
- **Virtualized / infinite lists** — no "scroll until found"; the agent has to scroll-and-look in a loop.

## 4. Extra steps the agent pays (but a human doesn't)

- **Custom dropdowns vs native `<select>`** — a native select is one action; a custom dropdown makes the agent click to open, re-read the page, then pick — two+ actions. Multiply across a form and it adds up.
- **Needless modals / multi-step wizards** that a human clicks through without thinking but the agent must navigate explicitly.
- Count only the steps *beyond* what a person would need.

## 5. When things break — can the agent recover?

- **Blocking overlays** — cookie/consent walls, login walls, paywalls that aren't dismissed automatically and sit on top of the flow.
- **Unstable DOM** — elements that move or re-render between looking and clicking, forcing the agent to re-find them (a sign of a hostile, racey page).
- **Slow / hanging navigation** — pages that exceed load timeouts.

---

## Turning findings into fixes

| Finding | Fix |
|---|---|
| Unlabeled / `<div>`-as-button controls | use semantic `<button>` / `<a>`, or add `aria-label` |
| Many custom dropdowns | use native `<select>` where possible |
| Cross-origin iframe in the flow | same-origin embed, or a direct route |
| Closed shadow DOM | open shadow roots, or expose semantic fallbacks |
| Deep / very large DOM | flatten nesting, paginate, reduce node count |
| Needs heavy stealth/proxy/captcha to work | reduce hostile bot-walls on agent-relevant flows |
| More steps than a human needs | collapse the funnel; remove needless modal steps |
| UI-only with no agent path | (ceiling) offer an API / deep-link for agents so they needn't drive the UI at all |
