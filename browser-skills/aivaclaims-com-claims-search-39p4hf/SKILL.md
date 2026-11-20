---
name: aivaclaims-com-claims-search-39p4hf
title: AIVA Claims Knowledge Base Search
description: >-
  Search AIVA Claims Assistant's public 22-entry FAQ knowledge base for
  VA-disability-claim service info (eligibility, pricing, process, AI-model
  vendor, accreditation). Returns matching Q&A pairs by category. Read-only; no
  sign-in.
website: aivaclaims.com
category: veterans-services
tags:
  - veterans
  - va-claims
  - faq-search
  - knowledge-base
  - disability
  - aiva
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No public REST/JSON API for FAQ content. The only `/api/*` route
      discovered (POST /api/benefits/search, the Benefits Finder backend) is
      auth-walled and returns 401 'Unauthorized: No token provided' to anonymous
      requests. Do not attempt — confirmed blocked.
  - method: url-param
    rationale: >-
      No deep-link query parameter on /faq pre-filters or scrolls to a Q&A.
      Navigation is entirely client-side React state.
  - method: hybrid
    rationale: >-
      The optimal browser flow is itself a hybrid: drive a session, wait for
      React to mount, then extract the FAQPage JSON-LD blob in one eval rather
      than driving the on-page searchbox. Listed as 'browser' since a real
      session is required to render the JSON-LD, but the actual extraction is
      structured-data parsing, not DOM walking.
verified: true
proxies: true
---
# AIVA Claims Knowledge Base Search

## Purpose

Search the public AIVA Claims Assistant knowledge base for information about U.S. VA disability claim preparation, the AIVA service process, pricing, eligibility, and operational details. Returns matching question/answer pairs from a curated 22-entry FAQ knowledge base organized into four categories: *Getting Started*, *Claims Process*, *Pricing & Payment*, *Technical Support*. **Read-only, no sign-in required, no claim is filed.**

This skill does **not** cover personalized federal/state/local benefit eligibility lookups — that surface exists (`/benefits-finder`) but its backend (`POST /api/benefits/search`) requires a Clerk session and returns `401 Unauthorized: No token provided` to anonymous clients. Don't waste cycles on it. See gotchas.

## When to Use

- A veteran or caregiver asks "what does AIVA do?", "how much does it cost?", "is AIVA a law firm?", "what about appeals?" — any general-policy / how-the-service-works question.
- The user wants pre-purchase due-diligence facts: pricing model, payment timing, security practices, AI-model vendor, accreditation status.
- The user wants quick procedural pointers ("how do I get my VA medical records?", "what is an Intent to File?") and is willing to be routed to AIVA's plain-English summaries rather than VA.gov primary sources.
- The user is comparison-shopping between AIVA, VSOs, and law firms and wants AIVA's stated positioning on backpay percentages and flat fees.

**Do NOT use this skill for:**
- Personalized benefit eligibility lookup by ZIP + disability rating — requires a Clerk-authenticated session this skill does not provide.
- Authoritative VA regulation / rate-table data — those live at `va.gov`. AIVA's FAQ summarizes; it is not the source of truth.
- Anything that involves uploading medical records, generating draft documents, signing forms, or submitting claims — all gated behind sign-in at `clerk.aivaclaims.com` and out of scope.

## Workflow

The FAQ knowledge base is delivered as a React SPA — a raw HTTP fetch of `/faq` returns only the SSR shell with two unrelated JSON-LD blocks (`Organization`, `WebApplication`) and **no FAQ content**. The full Q&A catalog is injected into the DOM after React mounts as a `<script type="application/ld+json">` block of `@type: FAQPage`. So a browser session is required, but once it is running you have two equivalent paths — the **JSON-LD extract** is strictly faster and more reliable than driving the searchbox.

1. **Open the FAQ page in a browser session** (Cloudflare-fronted but bare-friendly for read-only — stealth/proxies are optional, not required).
   ```bash
   sid=$(browse cloud sessions create --keep-alive | jq -r .id)
   export BROWSE_SESSION="$sid"
   browse open "https://aivaclaims.com/faq" --remote
   ```

2. **Wait ~2-3 seconds for React to mount** and inject the `FAQPage` JSON-LD block. Confirm with a snapshot or by checking that `script[type="application/ld+json"]` count is 4 (Organization, WebApplication, BreadcrumbList, FAQPage).

3. **Optimal — extract the full knowledge base in one call via JSON-LD** and match locally against the user's query. This avoids any DOM-state mutation and gives you the complete catalog:
   ```bash
   browse eval "JSON.parse(Array.from(document.querySelectorAll('script[type=\"application/ld+json\"]')).find(s => s.textContent.includes('FAQPage')).textContent)" --remote
   ```
   The result is a `FAQPage` object with `mainEntity: [{ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }, ...]` — 22 entries. Note: **the JSON-LD does not contain category labels.** If you need the category for each entry (Getting Started / Claims Process / Pricing & Payment / Technical Support), read it from the DOM (each `<section>` element has the category as its `<h2>`), or use Workflow step 4b which shows category inline.

4. **Match the user's query against the 22 entries locally** (substring or fuzzy match against `name` + `acceptedAnswer.text`). Return up to N best matches with question, answer, and source URL `https://aivaclaims.com/faq`.

### Alternative — drive the on-page searchbox (no API call)

Useful when you want the site's own ranking signal or you want a screenshot of the filter UI for evidence. Note: the filter is **client-side only** — no network request is made. Output is just a re-rendered DOM subset.

```bash
# After step 1+2 above:
browse snapshot --remote                    # find the searchbox ref (look for "searchbox: Search frequently asked questions")
browse fill "@<ref>" "intent to file" --remote
sleep 1
# Re-snapshot — visible rows are now "{Question text} ({Category})" with the answer in an adjacent region.
```

The filter matches across both question and answer text, and the question label is augmented with the category in parentheses, e.g. `"How do I get started with AIVA? (Getting Started)"` — which is the easiest way to recover category data without re-walking sections.

## Site-Specific Gotchas

- **`/benefits-finder` API is auth-walled — confirmed blocked.** The form on `https://aivaclaims.com/benefits-finder` accepts `location` and `disabilityRating` inputs unauthenticated, fetches a CSRF token from `GET /api/csrf-token` (200 OK, even anonymously), then submits `POST /api/benefits/search` with body `{"location":"...","disabilityRating":N}` and `X-CSRF-Token` header. The response is **`401 {"error":"Unauthorized: No token provided"}`** because a Clerk session bearer is also required. The user sees a red "We couldn't complete your search / Unauthorized: No token provided" banner. **Do not attempt to bypass.** If a user asks for personalized benefits lookup, return a clear "requires sign-in at aivaclaims.com" message; don't pretend to deliver results.

- **Rate-limit on `/api/*`: `x-ratelimit-limit: 100`** per window (the reset header indicates ~60s rolling). Even failed 401 requests count against the budget. Don't loop on the benefits endpoint.

- **`FAQPage` JSON-LD is client-rendered, not in the SSR shell.** A `curl` / `browse cloud fetch` of `/faq` will return ~14.9 KB of HTML with only `Organization` and `WebApplication` JSON-LD — no Q&A. You **must** drive a real browser and wait for React to mount before extracting.

- **JSON-LD lacks category labels.** The `FAQPage.mainEntity[]` entries only carry `name` and `acceptedAnswer.text`. To attach a category (one of *Getting Started*, *Claims Process*, *Pricing & Payment*, *Technical Support*), either (a) read the rendered DOM where each `<section>` groups questions under an `<h2>`, or (b) use the on-page searchbox — its filtered output formats questions as `"<question> (<category>)"`.

- **Knowledge base is small and curated (22 entries) — not a full claim-condition catalog.** This skill cannot answer "is my hypertension service-connected?" or "what conditions are presumptive under PACT?" — those are VA regulatory questions that AIVA's marketing FAQ does not cover. Route those to VA.gov or to a VA-accredited representative.

- **Cookie consent overlay** (`region: Privacy preferences` with "Accept optional / Reject optional / Customize") appears on first visit per session and overlays the form on `/benefits-finder`. On `/faq` it does **not** obstruct the searchbox, so for the recommended FAQ workflow it can be ignored. If you do need to dismiss it (e.g. for a clean screenshot), the "Reject optional" button is the privacy-respecting choice — chat widget still loads regardless.

- **Brevo live-chat iframe** loads unconditionally on every page (treated as strictly necessary). It appears as a green chat bubble in the bottom-right of screenshots and occupies its own iframe in the snapshot tree. It does not interfere with the FAQ extraction but will show in marketplace card images.

- **Site supports Spanish** via an English/Spanish toggle in the header (button `English Toggle language menu`). The `FAQPage` JSON-LD reflects whichever locale is active, so if you switch languages mid-session, your extracted Q&A text will swap. The default is English.

- **`/admin` and `/dashboard/sign*` are disallowed by `robots.txt`** and are the authenticated app surface. Stay out — they require Clerk session and represent a private-user-data boundary.

- **Cloudflare-fronted with no observed bot challenges for read-only navigation** during testing. Stealth (`--verified --proxies`) is overkill for this skill; a plain `browse cloud sessions create --keep-alive` is sufficient. Verified + proxies were tested and also work; choose based on cost/budget.

- **The site is a marketing-and-onboarding surface for a paid SaaS service**, not a government tool. AIVA is **not** affiliated with the U.S. Department of Veterans Affairs and **not** a VA-accredited claims agent or law firm (their own legal disclaimer states this prominently on `/services/disability-claims`). Any claim-result data returned from this skill should be framed as "AIVA's stated process / pricing," not as authoritative VA policy.

## Expected Output

A successful query returns an array of matched FAQ entries, plus a small envelope describing the query and source. The 22-entry catalog is the universe; results are a subset.

```json
{
  "query": "intent to file",
  "match_count": 2,
  "matches": [
    {
      "question": "How do I get started with AIVA?",
      "category": "Getting Started",
      "answer": "First, file your Intent to File on VA.gov to protect your effective date. Then, download your VA medical records from My HealtheVet and upload them to AIVA. AIVA's AI will analyze your records and generate draft claim documents within 24 hours for YOUR review, editing, and submission."
    },
    {
      "question": "What is an Intent to File and why do I need it?",
      "category": "Claims Process",
      "answer": "An Intent to File (VA Form 21-0966) protects your potential effective date for up to one year. This means if you file your intent today and submit your complete claim later, your benefits will be backdated to your intent filing date - potentially worth thousands of dollars in backpay."
    }
  ],
  "source_url": "https://aivaclaims.com/faq",
  "knowledge_base_size": 22,
  "categories": ["Getting Started", "Claims Process", "Pricing & Payment", "Technical Support"],
  "method": "json-ld-extract"
}
```

For a query that does not match any FAQ entry:

```json
{
  "query": "agent orange presumptive conditions",
  "match_count": 0,
  "matches": [],
  "source_url": "https://aivaclaims.com/faq",
  "knowledge_base_size": 22,
  "note": "No matches in AIVA's 22-entry FAQ. AIVA's knowledge base covers service-process and pricing topics, not VA regulatory content. Route this query to va.gov or a VA-accredited representative."
}
```

For a query that the user clearly meant as a **personalized eligibility lookup** (mentions a ZIP code, location, or rating percentage in a way that maps to the Benefits Finder surface), return the auth-wall outcome instead of attempting to drive `/benefits-finder`:

```json
{
  "query_type": "personalized_benefits_lookup",
  "status": "auth_required",
  "form_url": "https://aivaclaims.com/benefits-finder",
  "error": "The Benefits Finder backend (POST /api/benefits/search) requires a Clerk session token and returns 401 'Unauthorized: No token provided' to anonymous requests. Personalized federal/state/local benefit recommendations are gated behind sign-in.",
  "user_action_required": "Sign in at https://aivaclaims.com (Clerk auth) and submit the form interactively.",
  "fallback": "For general information about AIVA's claim-preparation service, this skill's FAQ search remains available."
}
```
