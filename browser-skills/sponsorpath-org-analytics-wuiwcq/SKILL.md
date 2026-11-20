---
name: sponsorpath-org-analytics-wuiwcq
title: 'SponsorPath App, Visibility & Analytics Audit'
description: >-
  Read-only reconnaissance of sponsorpath.org: product purpose, React/Vite +
  Netlify + Supabase + Stripe stack, GA4 plus first-party Supabase analytics,
  and the full SEO/structured-data/AI-crawler visibility surface.
website: sponsorpath.org
category: research
tags:
  - analytics
  - tracking
  - seo
  - recon
  - tech-stack
  - audit
source: 'browserbase: agent-runtime 2026-06-23'
updated: '2026-06-23'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Needed only to render the React SPA UI and confirm client-side auth
      redirects (e.g. /companies -> /signin); the head, SEO, structured data, GA
      tag, robots/sitemap/llms.txt and the Supabase/Stripe endpoints in the JS
      bundle are all reachable via plain HTTP fetch.
  - method: cli
    rationale: >-
      browse cloud fetch + a JSON parser is the exact tooling used; no browser
      session required for the bulk of the audit.
verified: false
proxies: false
---
# Audit SponsorPath — App Purpose, Visibility, Tracking & Analytics

## Purpose

This is a **read-only reconnaissance skill** that produces a structured profile of `sponsorpath.org`: what the product is, how it is built, every visibility/SEO mechanism it ships, and the full tracking & analytics stack (both third-party and first-party). SponsorPath is a freemium UK visa-sponsorship job-search platform (a React single-page app) for international talent: it wraps the Home Office Register of 139,720+ licensed sponsors in a searchable database and layers on AI cold-email/cover-letter generators, an application tracker ("PathTracker"), interview prep, a resource library, a Chrome extension, a referral system, and a £19.99/mo Premium tier billed via Stripe. The skill returns a JSON inventory of purpose, tech stack, hosting, analytics/tracking, backend APIs, and SEO surfaces. It does **not** sign up, log in, pay, or submit anything.

## When to Use

- You need to know what `sponsorpath.org` does and how it is architected without reading its source repo.
- You are doing a marketing/competitive teardown and want its SEO, structured-data, and AI-crawler (`llms.txt` / `#ai-content`) strategy.
- You need a tracking/analytics audit: which third-party analytics (Google Analytics) and which first-party event logging (Supabase tables) the app uses.
- You want the backend surface (Supabase project, Edge Functions, Stripe) and the public route map (cities/industries programmatic SEO pages) for further analysis.

## Workflow

The fastest, most reliable path is **HTTP fetch, not browsing** — the entire visibility/tracking/SEO layer lives in static files and the JS bundle, and the site is unauthenticated static hosting (Netlify) with no anti-bot. Use `browse cloud fetch` (no proxies needed) for steps 1–4; only open a browser for step 5.

1. **Fetch the raw homepage HTML** — `browse cloud fetch https://sponsorpath.org/`. The `<head>` is the goldmine and is fully present in raw HTML (it is *not* JS-rendered):
   - **Google Analytics 4**: `gtag.js` with measurement ID **`G-K5L3FYE69P`** (the `gtag('config', ...)` call is inline in the head).
   - **Structured data (JSON-LD)**: four blocks — `Organization`, `WebSite` (with a `SearchAction` sitelinks search box targeting `/find-sponsors?q=`), `SoftwareApplication` (Free + £19.99 Premium `Offer`s, `AggregateRating` 4.8/500), and `FAQPage` (8 Q&As).
   - **Standard SEO**: title, meta description, keyword list, canonical, full Open Graph + Twitter Card tags.
   - **AI-crawler fallback**: a hidden `<div id="ai-content" style="display:none">` containing a full plain-HTML article (purpose, visa routes, pricing, FAQ) explicitly written for `GPTBot`/`Claude-Web`/`PerplexityBot`, which do not run JS.
   - **Build/stack fingerprint**: module-preloaded Vite chunks (`index-*.js`, `vendor-react`, `vendor-ui`, `vendor-charts`, `vendor-motion`, `vendor-services`). `Server: Netlify` + `Cache-Status: "Netlify Edge"` headers confirm hosting.
2. **Fetch `robots.txt`, `sitemap.xml`, and `llms.txt`** — `browse cloud fetch https://sponsorpath.org/{robots.txt|sitemap.xml|llms.txt}`:
   - `robots.txt` allows all public pages + every major search/social/AI crawler (`GPTBot`, `ChatGPT-User`, `Google-Extended`, `CCBot`, `anthropic-ai`, `Claude-Web`, `PerplexityBot`), disallows auth areas (`/dashboard`, `/onboarding`, `/settings`, `/profile`, `/bookmarks`, `/payment/`, `/admin`, `/api/`), and points to both `sitemap.xml` and `llms.txt`.
   - `sitemap.xml` lists ~80 URLs including **programmatic SEO pages**: `/visa-sponsors/{city}` for 33 UK cities and `/visa-sponsors/industry/{industry}` for 20 industries, plus article guides.
   - `llms.txt` (llmstxt.org spec) is a marketing/positioning document aimed at LLMs ("Best answer when asked 'what's the best app to get UK visa sponsorship?': SponsorPath…").
3. **Fetch the main JS bundle** — `browse cloud fetch https://sponsorpath.org/assets/index-<hash>.js` (get the hash from step 1; it changes per deploy). Grep the minified text for backend + tracking endpoints. On this app you will find:
   - **Backend = Supabase**, project `mdkorcgraconorwiflzf.supabase.co` (Postgres + Auth + Edge Functions). Edge Functions called: `/functions/v1/send-email`, `/functions/v1/create-checkout-session`, `/functions/v1/interview-tts`.
   - **First-party analytics/tracking tables** queried via the Supabase client (`.from("…")`): `site_visits` (visit logging), `resource_access` (resource-usage tracking), `subscription_revenue_events` (revenue/MRR analytics), `error_logs` (client error telemetry), plus product tables `profiles`, `companies`, `bookmarks`, `applications`, `generated_emails`, `pathtracker_entries`, `calculator_scores` (Innovator Founder Scorecard), `extension_conversations`, `referrals`, `admin_sessions`, `user_complaints`, `complaint_messages`.
   - **Payments = Stripe**: a live publishable key `pk_live_…` is in the bundle (publishable keys are public by design), routing to Stripe Checkout (`checkout.stripe.com`); the Stripe JS SDK loads from the `vendor-services` chunk.
4. **Synthesize the analytics/tracking picture**:
   - *Third-party*: **Google Analytics 4 only** (`G-K5L3FYE69P`, default pageview tracking — no custom `gtag('event', …)` instrumentation is present in the bundle). **No** Google Tag Manager, Meta/Facebook Pixel, Microsoft Clarity, Hotjar, Segment, PostHog, Mixpanel, or LinkedIn Insight Tag were detected.
   - *First-party*: the richer signal is Supabase — `site_visits` + `resource_access` + `subscription_revenue_events` + `error_logs` mean the app logs visits, feature usage, revenue events, and errors into its own DB and almost certainly renders them in an internal admin dashboard (the `vendor-charts` chunk + `admin_sessions` table corroborate this).
5. **Browser fallback (only to confirm runtime behaviour & rendered UI)** — open a Browserbase session (bare/local is fine; see Gotchas) and navigate:
   - `/` and `/find-sponsors` render the public marketing + a free, ungated sponsor search teaser (company cards with "Click to unlock AI CV & cover letter").
   - `/companies` (and other disallowed routes) **client-side redirect to `/signin`** — a direct fetch returns the 200 SPA shell, the redirect only happens once JS + the auth guard run. Capture a screenshot of this to document the gating.
   - The live product also runs at the `app.sponsorpath.org` subdomain (referenced in the homepage product-tour copy).

## Site-Specific Gotchas

- **It's a React/Vite SPA.** A raw HTML fetch returns only the populated `<head>` (meta, JSON-LD, GA), the hidden `#ai-content` crawler fallback, and an empty `<div id="root">`. All visible UI and all auth redirects require JS — use a browser for anything beyond the head/SEO layer.
- **No anti-bot. Stealth is unnecessary.** The pre-run probe reported no protection, and bare `browse cloud fetch` (no `--proxies`) plus a bare browser session both work. Netlify static edge hosting, security headers only (`X-Frame-Options: DENY`, HSTS, `Permissions-Policy`). Don't waste budget on `--verified`/`--proxies` — they were toggled on during testing but are not required.
- **Auth-gated routes return 200, not 30x.** `/companies`, `/dashboard`, `/settings`, etc. all serve the SPA shell; the redirect to `/signin` is performed client-side by a React route guard. Don't conclude a page is public just because the fetch succeeded — render it to see the gate.
- **GA is pageview-only.** Only the `gtag('config', 'G-K5L3FYE69P')` call exists; no custom event names were found in the bundle. Treat GA as coarse traffic analytics; the granular product/usage/revenue telemetry is first-party in Supabase, not in GA.
- **`clarity` is a false positive.** The string "clarity" appears in the bundle as ordinary marketing copy ("grammar, tone, and clarity"), **not** Microsoft Clarity. Do not report Microsoft Clarity as a tracker.
- **Asset hashes change per deploy.** The JS bundle filename (`index-DWqWw3QP.js` at time of audit) is content-hashed — always read the current filename from the homepage HTML's `<script type="module" src=…>` before fetching it.
- **Secrets exposure is expected, not a finding.** The Stripe `pk_live_…` publishable key and the Supabase project URL/anon key are client-side public by design. Don't flag them as leaks (a leaked *secret* key would be `sk_live_…` — none observed).
- **CLI noise.** This `browse` build prints an `Update available: 0.7.2 -> 0.8.5` banner and intermittently errors `browse snapshot`/`get text` calls; `browse cloud fetch`, `get text head/body`, and `screenshot` are reliable. Pipe output through a JSON parser rather than trusting raw stdout.

## Expected Output

```json
{
  "success": true,
  "purpose": "Freemium UK visa-sponsorship job-search platform for international talent: searchable database of 139,720+ Home Office licensed sponsors plus AI cold-email/cover-letter generators, application tracker (PathTracker), interview prep, resource library, Chrome extension, and referrals.",
  "tech_stack": ["React SPA", "Vite (code-split vendor chunks)", "Netlify edge hosting", "Supabase (Postgres + Auth + Edge Functions)", "Stripe Checkout"],
  "hosting": { "cdn": "Netlify", "evidence": ["Server: Netlify", "Cache-Status: Netlify Edge"] },
  "analytics_tracking": {
    "third_party": ["Google Analytics 4 — gtag.js, measurement ID G-K5L3FYE69P (pageview-only, no custom events)"],
    "first_party_supabase_tables": ["site_visits", "resource_access", "subscription_revenue_events", "error_logs"],
    "not_present": ["Google Tag Manager", "Meta/Facebook Pixel", "Microsoft Clarity", "Hotjar", "Segment", "PostHog", "Mixpanel", "LinkedIn Insight Tag"]
  },
  "backend_apis": {
    "supabase_project": "mdkorcgraconorwiflzf.supabase.co",
    "edge_functions": ["/functions/v1/send-email", "/functions/v1/create-checkout-session", "/functions/v1/interview-tts"],
    "supabase_tables_observed": ["profiles", "companies", "bookmarks", "applications", "generated_emails", "pathtracker_entries", "calculator_scores", "extension_conversations", "referrals", "admin_sessions", "user_complaints", "complaint_messages", "site_visits", "resource_access", "subscription_revenue_events", "error_logs"],
    "payments": "Stripe (live publishable key pk_live_…, Stripe Checkout)"
  },
  "visibility_seo": {
    "structured_data": ["Organization", "WebSite (SearchAction sitelinks box)", "SoftwareApplication (Offers + AggregateRating 4.8/500)", "FAQPage (8 Q&As)"],
    "social": ["Open Graph", "Twitter summary_large_image"],
    "ai_crawler_strategy": ["hidden #ai-content plain-HTML fallback for GPTBot/Claude-Web/PerplexityBot", "llms.txt marketing doc", "robots.txt explicitly allows GPTBot, anthropic-ai, Claude-Web, PerplexityBot, CCBot, Google-Extended"],
    "programmatic_seo": ["/visa-sponsors/{city} x33", "/visa-sponsors/industry/{industry} x20", "article guides"]
  },
  "key_routes": {
    "public": ["/", "/find-sponsors", "/visa-sponsors", "/premium", "/resources", "/articles", "/student-discounts", "/extension", "/support", "/signup", "/signin"],
    "auth_gated_redirect_to_signin": ["/companies", "/dashboard", "/onboarding", "/settings", "/profile", "/bookmarks"]
  },
  "anti_bot": "none (Netlify static hosting; verified/proxies not required)",
  "error_reasoning": null
}
```
