---
name: trykopi-ai-audit-shopify-store-prj4km
title: Audit a Shopify Store on Kopi AI
description: >-
  Submit a Shopify store URL to Kopi AI's free analyzer and return the overall
  0–100 score, letter grade (A–F), tone (Professional or Savage), and canonical
  analysis URL. Detailed per-category critique and prioritized recommendations
  are auth-gated and not extractable anonymously.
website: trykopi.ai
category: ecommerce-tools
tags:
  - shopify
  - audit
  - seo
  - conversion
  - ux
  - kopi-ai
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public submission/results API documented. The analyzer page POSTs to
      internal Next.js Server Action endpoints with anti-CSRF tokens — not
      reusable from outside the page context. Browser submission is the only
      supported path.
verified: true
proxies: true
---
# Audit a Shopify Store on Kopi AI

## Purpose

Submit a Shopify store URL to Kopi AI's free "Shopify Analyzer" and return the resulting overall grade and numeric score (0–100) for that store, along with the canonical analysis URL, the chosen tone (Professional vs Savage), and the screenshot Kopi captured of the storefront. **Read-only**: nothing is purchased, posted, or modified on the analyzed store; Kopi simply scrapes it.

⚠️ **Hard auth wall on the detailed report.** The full graded critique (per-category scores for SEO / speed / UX / Clarity & UX / Trust Signals / Content Quality, prioritized recommendations, and Savage-mode roast text) is **gated behind a Kopi account** — magic-link email or Google OAuth. An anonymous agent can drive the submission, observe the overall numeric score (it leaks via the page `<title>`) and letter grade (it leaks via the "Recent Shopify Store Analyses" card on `/shopify-analyzer`), and capture the storefront screenshot URL, **but cannot extract the per-category breakdown or the recommendations list without credentials.** Treat the per-category critique as out-of-reach for autonomous runs and surface that limitation to the caller.

## When to Use

- Quick overall-grade lookup for a Shopify store the caller is curious about ("how would Kopi grade allbirds.com?").
- Comparing several stores by letter grade / 0–100 score in bulk.
- Capturing the Kopi-rendered storefront screenshot for a deck or report.
- **Not** suitable when the caller actually needs the per-category breakdown, written critique, or prioritized recommendations — those require a logged-in Kopi account this skill does not have.

## Workflow

The Kopi analyzer is a Next.js page at `https://www.trykopi.ai/shopify-analyzer`. There is **no documented public API** for submitting analyses or fetching results; submission is a `fetch` from the React app on click of "Analyze My Store". Drive it through the browser.

1. **Open the analyzer** at `https://www.trykopi.ai/shopify-analyzer`. The site is on Vercel/Next.js with no Akamai, Cloudflare, or captcha gate — a vanilla Browserbase session works (residential proxy not required, `--verified` not required). Bare `https://trykopi.ai` 308-redirects to `https://www.trykopi.ai/`, so prefer the `www` host directly to save one hop.

2. **Select tone**. Two pill buttons under the heading: `PROFESSIONAL` (default, "Receive constructive, formal advice 💼") and `SAVAGE` ("Get brutally honest feedback 🔥"). Click whichever the caller requested. The toggle has no immediate visual besides the helper-text swap and a button-highlight change — but it *is* the variable the backend reads, so always click before submitting (don't assume the default).

3. **Fill the URL textbox** (placeholder: `Enter your Shopify store URL (e.g., https://shop.app)`) with the target store URL. Accepts full origins (`https://allbirds.com`), `*.myshopify.com` subdomains, and apex domains with or without scheme.

   **Shortcut for famous stores**: the "Analyze A Titan" row of logo buttons (Belkin, Aesop, Allbirds, Gymshark, Skims, Bombas, Brooklinen, Away) one-clicks the URL in for you — skip step 3 and click the logo button directly, then jump to step 4.

4. **Click `ANALYZE MY STORE`**. The page transitions to an "Analyzing Your Page…" interstitial showing the target URL, a logo from `img.logo.dev`, a rotating progress message ("Scanning for common Shopify sins...", "Evaluating the 'Add to Cart' urgency..."), and a `Sign in to view results when analysis is ready` button. Analysis typically completes in **45–75 seconds**.

5. **Wait for redirect.** When the analysis finishes, the URL changes to `https://www.trykopi.ai/shopify-analyzer/{shortId}` where `{shortId}` is an 8-character alphanumeric (e.g. `Eff3gVLa`). Poll `browse get url` every 5s until the path changes from `/shopify-analyzer` (with no trailing segment) to `/shopify-analyzer/{id}`.

6. **Extract the overall score** from two anonymous-accessible sources:

   **(a) Page `<title>` tag** on the destination URL. After fetch, the title contains `Score: {N}/5` — **the `/5` is a templating bug**; the actual denominator is 100 (the recent-analyses card confirms `91/100` for the same record whose title reads `Score: 91/5`). Parse with `/Score:\s*(\d+)\/\d+/` and treat the captured integer as a 0–100 score.

   **(b) "Recent Shopify Store Analyses" card** at `https://www.trykopi.ai/shopify-analyzer`. The just-analyzed store appears as the first card with both the letter grade (`A`–`F`) and the `N/100` numeric score. Look up your store by matching the storefront URL string against the card's subtitle, or simpler: take the most recent card whose timestamp reads `Xm ago` / `Xs ago` (typically `1m ago` or `2m ago` immediately post-submit).

7. **(Auth-gated, not supported in this skill)** Visit `https://www.trykopi.ai/shopify-analyzer/{shortId}` to see the per-category critique. Without a logged-in session this page renders only the heading `Login Required` + the captured storefront screenshot + a `SIGN IN TO VIEW RESULTS` button. The login modal offers magic-link email and Google OAuth; both require external credentials this agent does not possess. Report the score from step 6 and surface `detailed_report_available: false` to the caller.

## Site-Specific Gotchas

- **Detailed report is auth-walled. No workaround discovered.** The HTML at `/shopify-analyzer/{shortId}` for an unauthenticated visitor contains zero report content — no `__NEXT_DATA__` block, no Server-Component-streamed payload with the critique text. Only the storefront screenshot URL, the page title's numeric score, and the login-wall chrome are present. Confirmed by fetching the page raw (no JS execution) and grepping for `recommendation`/`grade`/`critique` content — all matches are footer/UI strings, not data. **Do not waste turns hunting for a hidden JSON path; the report payload genuinely is not served to anonymous clients.**

- **Title bug**: every analysis page renders its title as `Score: {N}/5 | Kopi AI` regardless of the actual denominator. The denominator is **always 100** — the recent-analyses card shows `91/100` for the same record whose title says `Score: 91/5`. Don't be confused, don't try to compute `score * 20`, just treat the title number as 0–100 directly.

- **Score is non-deterministic per submission.** Re-submitting the same URL produces a different score each run — e.g. `allbirds.com` came back as `91/100 (A)` on this submission and `89/100 (B)` on a prior submission 5 hours earlier. The model re-evaluates fresh content each time. Single-submission scores carry ±5–10 point variance; if precise scoring matters, average several runs.

- **Sign-in methods both require external credentials**. The login modal offers (1) "Send sign-in link" (magic link to an email inbox the agent doesn't own) and (2) "Sign In with Google" (OAuth flow requiring a Google account + 2FA passthrough). Neither is solvable headlessly in a one-shot agent run. If the caller genuinely needs the per-category critique, the skill must be re-run by a human with their own Kopi credentials, or the caller must use Kopi's logged-in product.

- **Tone toggle defaults to Professional**. The Professional/Savage state survives page reloads via cookie/localStorage but resets between fresh sessions. Always click the desired toggle explicitly before submitting; do not assume the previous run's choice carries over.

- **The "Analyze A Titan" shortcut buttons** (Belkin / Aesop / Allbirds / Gymshark / Skims / Bombas / Brooklinen / Away) pre-fill the URL textbox AND auto-submit in some builds. If you're using this shortcut, do not also click `ANALYZE MY STORE` — that can fire a second submission and create a duplicate record.

- **`/shopify-analyzer/{shortId}` shortIds are 8-char nanoid-style.** Hall of Fame entries (curated, older) use a slug-prefixed pattern like `/shopify-analyzer/allbirds-wIxyxc7d`; freshly-submitted entries use a bare `/shopify-analyzer/Eff3gVLa` pattern. Both resolve to the same template.

- **`/roasts`** is the public directory of the 400+ historical analyses; it shows letter grade + numeric score + timestamp per card but every detail-page link still hits the login wall. It's useful for browsing historical results by score (sort options: `Recent` / `Best Stores` / `Worst Stores`) but not for extracting the critique text of any specific store.

- **No anti-bot.** No captcha, no Cloudflare, no Akamai, no rate-limit observed in this run. Bare Chromium without `--verified --proxies` is sufficient; using them does not change behavior.

## Expected Output

Anonymous submission returns the overall numeric score + letter grade + canonical URL. The detailed-report fields are always `null` / `unavailable` without auth.

```json
{
  "store_url": "https://allbirds.com",
  "tone": "professional",
  "submitted_at": "2026-05-19T22:59:00Z",
  "completed_at": "2026-05-19T23:00:12Z",
  "analysis_url": "https://www.trykopi.ai/shopify-analyzer/Eff3gVLa",
  "short_id": "Eff3gVLa",
  "overall_score": 91,
  "overall_grade": "A",
  "storefront_screenshot_url": "https://file.rendit.io/n/9e92f805c33a.png",
  "detailed_report_available": false,
  "detailed_report_reason": "login_required",
  "per_category_scores": null,
  "prioritized_recommendations": null,
  "savage_text": null
}
```

`overall_grade` letter-band mapping observed empirically from the public directory (`/roasts`): `A` ≥ 90, `B` 80–89, `C` 70–79, `D` 60–69, `F` < 60. `tone` is `"professional"` or `"savage"`.

Failure / edge shapes:

```json
{
  "store_url": "https://not-a-real-shop.example",
  "tone": "professional",
  "status": "analysis_timeout",
  "message": "Analyzer did not redirect to /shopify-analyzer/{id} within 120s; Kopi may have rejected the URL as non-Shopify or the backend is overloaded."
}
```

```json
{
  "store_url": "https://allbirds.com",
  "tone": "savage",
  "status": "submitted_but_report_locked",
  "analysis_url": "https://www.trykopi.ai/shopify-analyzer/Eff3gVLa",
  "overall_score": 91,
  "overall_grade": "A",
  "detailed_report_available": false,
  "detailed_report_reason": "login_required",
  "next_step_hint": "Detailed per-category critique and Savage-mode roast text are gated behind a Kopi account (magic-link email or Google OAuth). Re-run with credentials or use Kopi's logged-in product to see the full report."
}
```
