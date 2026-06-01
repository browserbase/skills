---
name: browsability
description: "Assess how usable a website is BY AN AI BROWSER AGENT — its browsability. Look at how little infrastructure help the agent needs to get in (stealth/proxy/captcha), whether it can perceive and drive the live DOM (are controls labeled and reachable, are there iframe/shadow-DOM/deep-DOM traps), and how many extra steps it takes versus a human. Report what helps and what hurts, with concrete fixes — no numeric score. Use when the user asks how browsable / agent-friendly / agent-ready a website or a specific web flow (signup, checkout, search) is for a BROWSER agent, to compare sites on browser-agent usability, or to get a browsability report with fixes. Triggers: 'how browsable is <site>', 'is this site agent-friendly for a browser agent', 'check this checkout/signup flow for agents', 'browser-agent friendliness', 'DOM friction', 'browsability of <url>'. NOT for SEO/AEO or content discoverability (a different layer), and NOT for docs/SDK onboarding DX (use the agent-experience skill for that)."
license: MIT
metadata:
  author: browserbase
  version: "0.2.0"
allowed-tools: Read Bash Glob Grep Agent
compatibility: "Uses the browse CLI (`npm install -g @browserbasehq/browse-cli`) via the `browser` skill to look at and drive the site. Remote mode needs BROWSERBASE_API_KEY."
---

# Browsability — how usable is a site for a browser agent?

Judge how well an AI **browser** agent can *operate* a website. The idea is simple:

> **Browsability is how little help an agent needs to succeed — and how much harder the site is for
> an agent than for a person.** A 10-click checkout that takes a human 10 clicks too is fine; a
> 3-click task that takes the agent 10 because the buttons are unlabeled is not — those extra clicks
> are the agent's problem, not the workflow's.

This is the *operability* layer — driving the live UI. It is **not** discoverability, so ignore
`llms.txt`, sitemaps, and SEO/AEO. It is also distinct from docs/SDK onboarding (that's the
`agent-experience` skill).

There is **no scoring formula here.** Look at the site with your own eyes (and the agent's), use the
checklist in `references/rubric.md` as a guide for what tends to matter, and decide what actually
matters for *this* site. Then report what helps and what hurts.

## How to assess

1. **Actually try to use the site** with the `browser` skill. Open it, take a `browse snapshot`
   (the accessibility tree — this is what an agent "sees"), and attempt a real task the site is for:
   find the pricing, create an account, add to cart, submit the contact form. Notice where it's easy
   and where you get stuck.

2. **Notice how much help it took to get in.** If a vanilla session sails through, great — that's
   maximally browsable. If you needed stealth, a proxy, or captcha-solving just to load or act, that
   counts against the site. (`references/rubric.md` describes this assistance ladder.) Remember
   `solveCaptchas` is **on by default** — if you want to know whether a site is hostile at the front
   door, try it with captcha-solving off first.

3. **Watch for the things that trip up browser agents** as you go — read `references/rubric.md` for
   the full checklist, but in short: unlabeled / `<div>`-as-button controls, custom dropdowns,
   iframes (especially cross-origin), shadow DOM, very deep or huge DOMs, blocking cookie/consent
   walls, and flows that take the agent more steps than a person.

Use judgment over completeness — surface the few things that genuinely make or break this site for an
agent, not an exhaustive audit.

## How to report

A simple **Helps / Hurts** table. Each "Hurts" row names the concrete fix. Cite what you observed.

| ✅ Helps browsability | ⚠️ Hurts browsability |
|---|---|
| Native `<button>` / `<select>` with clear labels | Signup CTA is an unlabeled `<div>` → agent can't see it. *Fix: make it a `<button>` or add `aria-label`* |
| Loads & acts fine in a vanilla session | Needs proxy + captcha-solving just to load. *Fix: ease bot-walls on agent-relevant flows* |
| Main flow is same-origin | Checkout is a cross-origin iframe → fragile. *Fix: same-origin embed or a direct route* |

Optionally close with one plain-language line ("easy / moderate / hard for a browser agent, because…").
Do not invent a number. In Slack contexts use mrkdwn (`*bold*`, `•` bullets), not tables.
