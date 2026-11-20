---
name: wingfinder-com-find-best-flights-fngfjg
title: Find Your Best Strengths (Red Bull Wingfinder)
description: >-
  wingfinder.com is Red Bull's free personality/strengths assessment, not a
  flight search. This skill extracts the public catalog of the four success
  areas and 24 strengths read-only, and reports that personalized results are
  gated behind Auth0 sign-up plus a Cloudflare Turnstile CAPTCHA.
website: wingfinder.com
category: career-assessment
tags:
  - personality-test
  - strengths
  - red-bull
  - wingfinder
  - career
  - assessment
source: 'browserbase: agent-runtime 2026-06-13'
updated: '2026-06-13'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public/unauthenticated JSON API exposes the strengths catalog; content
      is server-rendered by a Next.js app behind Akamai. Browser read of the
      public pages is the only reliable path.
verified: true
proxies: true
---
# Find Your Best Strengths — Red Bull Wingfinder

## Purpose
This skill discovers and reports a user's "best" professional strengths via **Red Bull Wingfinder** (`wingfinder.com`). **Important assumption / disambiguation:** the skill slug is `find-best-flights`, but `wingfinder.com` is **not** a flight-search engine. The domain redirects (`wingfinder.com` → 301 → `www.wingfinder.com` → 302 → `redbull.com/int-en/wingfinder`) to Red Bull's free, science-based **personality / strengths assessment** ("Give wings to your career"). The "wings/flights" naming is a domain pun. We therefore interpret "find best flights" as the only sensible task this site supports: **find the strengths you are naturally best at.** This skill is **read-only for the public catalog** (the four success areas and 24 strengths, plus assessment metadata). The personalized result that names *your* top strengths requires completing a ~35-minute account-gated questionnaire, which is **not** read-only and is blocked by a login + CAPTCHA wall (see Gotchas). The skill returns the public strengths taxonomy and clearly reports the gate when asked for a personalized result.

## When to Use
- A user asks "what are my strengths / what am I best at" and points at Wingfinder / Red Bull Wingfinder.
- A user wants to understand what the Wingfinder personality test measures before signing up.
- A user wants the catalog of Wingfinder's four success areas and 24 strengths, with descriptions.
- A user mistakenly expects flight search at `wingfinder.com` — use this skill to correctly identify the site and explain there are no flights here.

## Workflow

**Recommended method: browser (read-only public pages).** No public/unauthenticated API or JSON endpoint exposes the strengths catalog — content is rendered by a Next.js app behind Akamai. The reliable path is to read the public marketing pages directly. A Browserbase session with stealth (`--verified --proxies`) loads everything cleanly; Akamai is present but did not block these public pages.

1. **Open the canonical landing page.** `browse open https://www.redbull.com/int-en/wingfinder --remote`. (Navigating `https://wingfinder.com/` works too — it redirects here.) Confirm title is `Give wings to your career!`. This confirms the site identity and the headline facts: assessment is **free**, takes **≈35 minutes**, globally recognised.
2. **Extract the four key success areas.** Read body text (`browse get markdown body`). The four areas, each with its one-line definition:
   - **Connections** — how you manage relationships and yourself.
   - **Creativity** — how you adapt, create alternatives, and seek out novel information/experiences.
   - **Drive** — your motivation, ambition, and self-discipline toward goals and setbacks.
   - **Thinking** — your ability to reason abstractly and solve complex problems.
3. **Get the full 24-strength catalog.** `browse open https://www.redbull.com/int-en/wingfinder/strengths --remote` then `browse get markdown body`. Each of the four areas lists its component strengths with a paragraph description (e.g. under **Connections**: Direct, Diplomatic, Autonomous, Supportive, Emotive, …). This page is the richest extractable content for "what strengths exist and what they mean."
4. **(Optional context)** `…/wingfinder/science`, `…/wingfinder/faq`, `…/wingfinder/mission` give methodology and FAQ text if the user wants the research basis (30 years of psychology research, UCL + Columbia professors).
5. **Report.** Return the strengths taxonomy (see Expected Output). If the user wants *their personal* top strengths, you cannot produce them read-only — report `personalized: false` with `gate: "login+captcha"` and explain the steps below would be required (and must not be auto-performed).

### Personalized result (gated — do NOT auto-complete)
To get a user's *individual* top strengths, Wingfinder requires:
1. Clicking **Start Wingfinder** → redirect to `https://www.wingfinder.com/rb-register?lang=en-GB` → `auth.wingfinder.com` (Auth0).
2. **Sign up** (Email, Password, Repeat Password, First Name, Last Name) **or Log in** — the sign-up form embeds a **Cloudflare Turnstile** "Verify you are human" challenge.
3. Completing a ~35-minute psychometric questionnaire (personality + reasoning items).
4. Reading the generated personal feedback report + coaching plan.

Steps 2–4 create an account and submit personal data — **out of scope for a read-only agent.** Do not auto-register, solve the Turnstile, or submit the questionnaire. Stop at the gate and report it.

## Site-Specific Gotchas
- **Not a flight site.** `wingfinder.com` is Red Bull's personality/strengths assessment. Any agent expecting flights, fares, or airports is on the wrong site — say so explicitly rather than hunting for a search box.
- **Redirect chain.** `wingfinder.com` (301) → `www.wingfinder.com` (302) → `redbull.com/int-en/wingfinder`. Always land on the `redbull.com/int-en/wingfinder*` paths for content; the bare `wingfinder.com` host is only an auth/app shell.
- **Akamai in front (`Server: AkamaiGHost`).** Public marketing pages loaded fine with `--verified --proxies` and did not require solving anything. The pre-run probe reported "antibots: none detected" for the homepage, but stealth was kept ON and is recommended since Akamai is present.
- **The assessment is hard-walled.** `Start Wingfinder` → Auth0 (`auth.wingfinder.com`) login/sign-up. The **sign-up form contains a Cloudflare Turnstile** human-verification iframe. Confirmed: there is no read-only path to a personalized result. Don't waste time trying to script account creation or the questionnaire — it is both blocked (Turnstile) and against read-only rules.
- **No public catalog API.** The strengths data is rendered server-side by a Next.js app (`X-Powered-By: Next.js`, assets under `/wingfinder-static/`). There is no documented JSON endpoint returning the 24 strengths; extract from the rendered `/strengths` page markdown.
- **Locale matters.** Content is served per-locale (`int-en`, `de`, `it`, `ja`, `fr`, etc.). Use `int-en` for the canonical English catalog; other locales translate the same four areas / 24 strengths.
- **Fixed facts to assert confidently:** free of charge, ≈35 minutes, 4 areas (Connections, Creativity, Drive, Thinking), 24 total strengths, output is a feedback report + tailored coaching plan.

## Expected Output

Read-only catalog result (what this skill can produce unauthenticated):
```json
{
  "site": "redbull.com/int-en/wingfinder",
  "is_flight_search": false,
  "product": "Red Bull Wingfinder personality / strengths assessment",
  "cost": "free",
  "duration": "approximately 35 minutes",
  "areas": [
    { "name": "Connections", "definition": "How you manage relationships and how you manage yourself.",
      "example_strengths": ["Direct", "Diplomatic", "Autonomous", "Supportive", "Emotive"] },
    { "name": "Creativity", "definition": "How you adapt, create alternatives and seek out novel information or experiences.",
      "example_strengths": [] },
    { "name": "Drive", "definition": "Your motivation, ambition and self-discipline towards pursuing goals and handling setbacks.",
      "example_strengths": [] },
    { "name": "Thinking", "definition": "Your ability to reason abstractly and solve complex problems.",
      "example_strengths": [] }
  ],
  "total_strengths": 24,
  "personalized": false,
  "gate": "login+captcha",
  "notes": "Personal top-strengths report requires Auth0 sign-up (Cloudflare Turnstile) + a ~35 min questionnaire — not available read-only."
}
```

When the user explicitly wants their personal top strengths (gated outcome shape):
```json
{
  "site": "redbull.com/int-en/wingfinder",
  "personalized": false,
  "gate": "login+captcha",
  "blocked_at": "https://auth.wingfinder.com/login (Auth0 + Cloudflare Turnstile sign-up)",
  "required_but_out_of_scope": ["create account", "solve human-verification", "complete ~35 min questionnaire"],
  "public_catalog_available": true,
  "error_reasoning": "Personalized Wingfinder results are account-gated and behind a CAPTCHA; cannot be produced read-only."
}
```

Wrong-site clarification shape (user expected flights):
```json
{
  "site": "wingfinder.com",
  "is_flight_search": false,
  "actual_product": "Red Bull Wingfinder personality/strengths assessment",
  "message": "wingfinder.com is not a flight-search site; it redirects to Red Bull's free strengths assessment."
}
```
