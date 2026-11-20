---
name: crawlproof-com-aeo-report-m4mma3
title: Crawlproof.com AEO Ranking Report
description: >-
  Fetch an AEO (Answer Engine Optimization) ranking / AI-visibility report for a
  user-supplied website from crawlproof.com. As of 2026-05-19 the target domain
  is a parked Railway deployment returning 404 on all paths, so the skill
  currently emits a service_unavailable result and surfaces aeoproof.com as the
  closest live alternative.
website: crawlproof.com
category: seo-aeo
tags:
  - aeo
  - geo
  - ai-visibility
  - seo
  - parked-domain
  - candidate
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Until crawlproof.com ships a live application there is no API or URL-param
      shortcut to discover. Browser-driving is the only plausible path once the
      site is provisioned; today the browser flow short-circuits at the
      Railway-edge 404 fallback.
verified: true
proxies: true
---
# Crawlproof.com AEO Ranking Report

## Purpose

Given a target website (the user's site), return its AEO (Answer Engine Optimization) ranking / visibility report from `crawlproof.com`. Read-only — should never trigger a paid upgrade or subscription click. Output is the numeric AEO score plus the per-engine breakdown (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews, etc.) that the service emits.

**Important — current state of the target domain (verified 2026-05-19):** `crawlproof.com` is **not currently serving any application**. The apex domain, `www.crawlproof.com`, `/robots.txt`, and `/sitemap.xml` all return a Railway-edge "404 Not Found — The train has not arrived at the station" fallback page with `X-Railway-Fallback: true` and the Railway logo. Common subdomains (`app`, `blog`, `docs`, `dashboard`, `api`) do not resolve at all. The domain appears to be provisioned in Railway but no service is deployed to it. There is therefore no AEO ranking endpoint, UI, or API to drive on this site today. This skill is published as a **candidate** so future agents do not waste turns re-discovering the same parked-domain wall, and so it can be promoted to launched the moment crawlproof.com actually ships a product.

**Assumption made during this generation run:** The prompt "Give me my AEO ranking for this web site" was interpreted as "produce an AEO/AI-visibility score for the user-supplied URL using crawlproof.com's checker." The user's own target URL was not supplied in the prompt and the skill therefore treats the target URL as a runtime parameter (`target_url`), not a fixed value.

## When to Use

- A user asks "what's my AEO score" / "AI visibility ranking" / "GEO score" and explicitly names crawlproof.com as the source.
- A pipeline needs to fetch an AEO report card from crawlproof.com on a schedule (weekly visibility tracking).
- Any flow that needs a third-party AEO grade without booking, paying, or saving the result to crawlproof.com's account database.

Do **not** use this skill if the user is happy with any AEO checker — `aeoproof.com` is currently the closest live alternative (see Site-Specific Gotchas) and ships a working free checker today.

## Workflow

### 0. Pre-flight — verify the target domain is actually serving an application

Before any other step, confirm crawlproof.com is up. As of 2026-05-19 it is not:

```bash
browse cloud fetch https://crawlproof.com/ --allow-insecure-ssl --allow-redirects
# If you see:
#   "statusCode": 404
#   X-Railway-Fallback: true
#   title>404 Not Found</title> ... "The train has not arrived at the station"
# then the domain is still parked. STOP and emit:
#   { "success": false, "reason": "service_unavailable",
#     "detail": "crawlproof.com is currently a parked Railway domain returning 404",
#     "verified_at": "<ISO-8601 timestamp>" }
# Do NOT proceed to step 1.
```

Only continue to step 1 once the fetch returns 200 with a non-Railway-fallback HTML body (look for the absence of the `X-Railway-Fallback: true` response header).

### 1. Open the checker page (browser session, when site goes live)

This is the **expected** flow once crawlproof.com ships. Endpoints and selectors are placeholders — re-verify against the live site on first successful run and update this SKILL.md.

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open "https://crawlproof.com/" --remote --session "$sid"
browse wait load --remote
browse snapshot --remote
```

### 2. Submit the user's URL

Locate the URL input field (typical AEO-checker UX: a single big input on the landing page with a "Check" / "Analyze" CTA). Fill it with the target URL the user supplied, then click the analyze button. Wait for the score to render (these tools commonly run 10–60s of background LLM queries before showing the report).

```bash
browse fill "@<input-ref>" "https://example.com" --remote
browse click "@<analyze-button-ref>" --remote
browse wait timeout 60000 --remote     # AEO checks are slow — give it a full minute
browse snapshot --remote
```

### 3. Extract the report

Read the rendered page. Expected fields based on the AEO-checker product category (verified pattern on `aeoproof.com` 2026-05-19, structure should be similar on crawlproof.com once live):

- **Overall score** — single integer 0–100 or letter grade A-F.
- **Per-engine breakdown** — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews, Bing Copilot. Each with its own sub-score.
- **Citations count** — how many times the target appears as a citation across sampled prompts.
- **Sample prompts** — the queries the tool ran against the engines.
- **Recommendations** — text blob of fix-it suggestions.

```bash
# Grab the rendered text — fall back to body markdown if structured-data extraction fails
browse get markdown body --remote > /tmp/aeo-report.md
```

### 4. Release session

```bash
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

### Browser fallback (and current default while the site is parked)

Until crawlproof.com is provisioned, no browser flow is possible. The honest output is the `service_unavailable` shape in step 0. If the user asks for "an AEO ranking" without specifying source, the agent should surface this fact and offer to run the check against a live alternative (see gotchas) rather than fabricate a number.

## Site-Specific Gotchas

- **The domain is currently parked on Railway (verified 2026-05-19).** Apex, `www.`, `/robots.txt`, `/sitemap.xml`, all common subdomains return the Railway-edge 404 page with `X-Railway-Fallback: true`. There is no JS app, no API, no GraphQL endpoint, no public catalog. The Wayback Machine CDX API (`web.archive.org/cdx/search/cdx?url=crawlproof.com`) returned 503 during this run, so historical content could not be confirmed either — treat the domain as never-having-shipped until first observed 200 from a non-Railway origin.
- **Do not confuse with `aeoproof.com`** — a real, live AEO/GEO checker product at the time of writing (2026-05-19), with a free "AI Search Visibility Checker" at `https://aeoproof.com/tools/ai-search-visibility-checker`. If the user's intent is "I want any AEO score for my site", `aeoproof.com` is the closest live alternative; do **not** silently re-target to it without explicit user confirmation, but do mention it in the response when crawlproof.com is down. Also distinct from `aeoradar.io`, `crawlbase.com`, `crawlhunt.com`, `crawlforge.dev`, `crawlnow.com`, `crawlapi.dev`, and the unrelated "crawlproof" lead-products historical reference in the Internet Archive.
- **Railway-fallback signature** — the parked-domain 404 includes a very specific HTML: SVG Railway logo, `<h1>Not Found</h1>`, the phrase "The train has not arrived at the station", and a `Request ID` block. If you ever see that signature on a *path you expect to be real*, the site is down and not just the route is missing — Railway returns the same body for every path on an unprovisioned domain.
- **`/robots.txt` and `/sitemap.xml` give the same 404 HTML, not text/plain.** Don't try to parse them — they are part of the fallback, not real files.
- **Do not bother with `--proxies` to "bypass" the 404.** Verified: the 404 is origin-side from Railway's edge for an unprovisioned domain. Switching IPs, adding a User-Agent, or stealth-mode session does not change the response. This is not anti-bot — it is genuinely no-service.
- **`browse cloud fetch https://crawlproof.com --proxies`** (without `--allow-insecure-ssl`) returns `502 TLS certificate verification failed` because Railway's edge sometimes presents a cert tied to the underlying generated `*.up.railway.app` host rather than the custom domain. Use `--allow-insecure-ssl --allow-redirects` to get past it. This is a useful tell — a real live service would have a valid cert chain.
- **No site-specific anti-bot tooling observed**, because there is no application to defend. Do not infer that the eventual live site will be bare; AEO-checker products typically gate behind reCAPTCHA / Turnstile to prevent abuse of their LLM budget.
- **Read-only contract** — AEO checker products almost always have a "save report" or "upgrade for full results" CTA. Never click these. If the report is truncated behind a paywall, capture what is visible and emit `partial: true` in the output rather than logging in or paying.

## Expected Output

Three distinct outcome shapes — the skill must branch on which one is observed:

```json
// 1. Service unavailable (current state as of 2026-05-19) — the ONLY observable shape today
{
  "success": false,
  "reason": "service_unavailable",
  "detail": "crawlproof.com returns Railway-edge 404 fallback on all observed paths; domain not yet provisioned with a live application",
  "evidence": {
    "url": "https://crawlproof.com/",
    "status": 404,
    "railway_fallback_header": true,
    "body_signature": "The train has not arrived at the station"
  },
  "verified_at": "2026-05-19T23:45:00Z",
  "suggested_alternative": "https://aeoproof.com/tools/ai-search-visibility-checker"
}

// 2. Successful AEO report (expected shape once the site is live — fields to be re-verified)
{
  "success": true,
  "target_url": "https://example.com",
  "overall_score": 72,
  "scale": "0-100",
  "per_engine": {
    "chatgpt": 80,
    "claude": 75,
    "perplexity": 65,
    "gemini": 70,
    "google_ai_overviews": 60,
    "bing_copilot": 82
  },
  "citations_observed": 14,
  "prompts_sampled": [
    "best running shoes 2026",
    "..."
  ],
  "recommendations": [
    "Add FAQ schema to product pages",
    "..."
  ],
  "report_url": "https://crawlproof.com/report/<id>",
  "checked_at": "2026-MM-DDTHH:MM:SSZ"
}

// 3. URL submitted but check failed (rate limit, invalid URL, robots-block on target)
{
  "success": false,
  "reason": "check_failed",
  "detail": "<human-readable error pulled from crawlproof.com's error UI>",
  "target_url": "https://example.com",
  "checked_at": "2026-MM-DDTHH:MM:SSZ"
}
```
