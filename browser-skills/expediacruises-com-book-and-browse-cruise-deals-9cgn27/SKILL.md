---
name: expediacruises-com-book-and-browse-cruise-deals-9cgn27
title: Expedia Cruises Deals & Cruise Search
description: >-
  Pull current Expedia Cruises 'Deals of the Week', search sailings by
  destination/line/ship, and open a cruise's pricing and booking flow (read-only
  — stops before payment).
website: expediacruises.com
category: travel
tags:
  - travel
  - cruises
  - deals
  - expedia
  - search
  - booking
source: 'browserbase: agent-runtime 2026-06-18'
updated: '2026-06-18'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      The /en-us/corporate/Deals page and all corporate marketing pages are
      fully server-rendered HTML — `browse cloud fetch --proxies` returns every
      deal card (itinerary, line/ship, dates, 'from' price, package link) with
      no JS or captcha. This is the fastest path for the deals half of the task.
  - method: browser
    rationale: >-
      The cruise search engine and package/booking pages
      (bookus.expediacruises.com/swift/*) are an Odysseus 'swift-v2-prod' SPA:
      JS-rendered and gated by reCaptcha/Cloudflare Turnstile + 429
      rate-limiting. A real (verified+proxies) browser renders results and
      per-cabin pricing reliably; the underlying AJAX API is not directly
      callable.
  - method: api
    rationale: >-
      Not viable — the swift search/booking data endpoints sit behind captcha
      and a per-site rate limiter (429). Confirmed dead end; do not attempt
      direct JSON calls.
verified: true
proxies: true
---
# Expedia Cruises Deals & Cruise Search

## Purpose

This skill operates on Expedia Cruises (expediacruises.com) to do three related, **read-only** things: (1) pull the current "Deals of the Week" offers, (2) search live cruise sailings by destination, cruise line, ship, dates, or duration, and (3) open a specific cruise's per-cabin pricing and the start of its booking flow. It returns structured data — deal cards, sailing-search result rows, and itinerary/pricing detail — and **stops before any payment or booking submission**. Expedia Cruises is a franchise travel-agency network, so the consumer-facing site is split between a server-rendered corporate marketing site (`www.expediacruises.com/en-us/corporate/...`) and a separate JS booking engine (`bookus.expediacruises.com/swift/...`); this skill uses the cheapest reliable method for each half.

## When to Use

- "What cruise deals does Expedia Cruises have this week?" — extract the Deals-of-the-Week cards (itinerary, line, ship, dates, starting price).
- "Find me cruises to the Caribbean / on Royal Caribbean / on a specific ship, cheapest first" — run the sailing search and read result rows with per-cabin prices.
- "How much is cruise X / what does the booking flow look like?" — open a package/itinerary page for per-person pricing (Inside/Outside/Balcony/Suite) and bonus offers.
- "Get me a quote for this cruise" — surface the Request-a-Quote link (routes to a human travel agent, no payment).
- NOT for: completing a purchase, entering guest/passenger details, or submitting payment. Stop at the pricing/availability screen.

## Workflow

There are two surfaces. **Deals and all corporate pages are server-rendered — fetch them. The cruise search + booking pages are a captcha-gated SPA — drive them in a real browser.** Use a `--verified --proxies` Browserbase session for the browser half (the corporate site is behind Akamai and the booking engine behind reCaptcha/Turnstile + a 429 rate limiter).

### A. Pull the deals (fetch — fastest, no JS, no captcha)

1. Fetch the deals page directly — do **not** start at the bare domain (it redirect-chains through three hostnames; see Gotchas):
   ```bash
   browse cloud fetch "https://www.expediacruises.com/en-us/corporate/Deals" --proxies
   ```
   Returns HTTP 200, ~520 KB of fully-rendered HTML.
2. Parse each "Deals of the Week" card. Per card you get: itinerary title (e.g. `5 Night Caribbean Western Cruise`), ports (Tampa → Costa Maya → Cozumel → Tampa), cruise line + ship, departure & return dates, the "from" price with `Taxes & fees included`, a promotion ID, and two links:
   - `Learn More` → `https://bookus.expediacruises.com/swift/cruise/package/{packageId}?siid=1095905&lang=1`
   - `Request a Quote` → `/en-us/corporate/RequestAQuote?cruise={packageId}&refPage=Deals`
3. Regional/category deal subpages exist and fetch the same way, e.g. `/en-us/corporate/Deals/Europe`, `/en-us/corporate/Deals/group-travel`, `/en-us/corporate/Deals/guided-tours`.

### B. Search live sailings (browser — the swift SPA)

1. Open the search engine with query params (it deep-links straight to a populated result set):
   ```bash
   browse open "https://bookus.expediacruises.com/swift/cruise?siid=1095905&lang=1&destinationType=All&sortColumn=price&sortOrder=asc" --remote
   browse wait timeout 8000 --remote   # SPA renders + populates result rows
   ```
2. Read the `N Sailings Found` count (e.g. "63,724 Sailings Found") and scroll to the result rows. Each sailing row shows a sail date, four per-cabin price columns (Inside / Outside / Balcony / Suite), `Includes taxes and fees`, and a BOOK button. Extract via `browse get markdown body` or `browse snapshot`.
3. Narrow with URL params instead of clicking the form when possible — they are the reliable fast path:
   - `&cruiseline={cruiselineId}` — filter to one line (e.g. `&cruiseline=982`)
   - `&ship={shipId}` — filter to one ship (e.g. `&ship=15127`)
   - `&destinationType=All` plus `&sortColumn=price&sortOrder=asc` — cheapest first
   - The on-page form also exposes Going to / Sailing Dates / Duration / Cruise Line / Ship / Departure Port and a left-rail filter panel (Cabin Type, Cruise Line, Price Per Person, ports).

### C. Open a cruise's pricing + booking flow (browser, READ-ONLY)

1. Open the package/itinerary page (the `packageId` comes from a deal card or a search result):
   ```bash
   browse open "https://bookus.expediacruises.com/swift/cruise/package/1484845?siid=1095905&lang=1" --remote
   browse wait timeout 8000 --remote
   ```
2. Read `Price Per Person From` for each cabin tier (Inside / Outside / Balcony / Suite), the per-person "from … /mo" financing line, itinerary (ports + day-by-day dates), and `Available Bonus Offers`. The page header is a four-step booking breadcrumb: **Guest Information → Category → Staterooms → Check out**.
3. **STOP HERE.** Do not click BOOK, advance the breadcrumb, enter guest/passenger details, or submit payment. To hand off to a human, return the Request-a-Quote URL from step A.2 instead.

## Site-Specific Gotchas

- **Never start at the bare domain.** `https://expediacruises.com/` → 301 → `https://www.expediacruise.com/en-US` (note: singular `expediacruise.com`) → 301 → `https://www.expediacruises.com/en-us/` → 302 → `/en-us/corporate`. Always request `https://www.expediacruises.com/en-us/corporate/...` paths directly to skip the chain. URL path casing matters in the redirects (`/en-US` vs `/en-us`).
- **Two completely different stacks.** Marketing/deals = `www.expediacruises.com/en-us/corporate/*`, server-rendered HTML behind **AkamaiGHost** (`X-Akamai-Reference-Id` header). Search/booking = `bookus.expediacruises.com/swift/*`, an **Odysseus "swift-v2-prod" SPA** served off `contents.odysol.com`. Don't expect deal data on bookus, or live availability on the corporate site.
- **The swift search API is captcha-gated — don't try to call it directly.** The SPA loads `recaptcha/api.js` and Cloudflare Turnstile (`challenges.cloudflare.com/turnstile`), and the page config carries explicit rate-limit error strings (`rateLimitExceededErrorMessage`, "Please wait a minute and try again (429)"). Direct AJAX/JSON requests are rate-limited and security-keyed. Use a real `--verified` browser; budget an 8s render wait and don't hammer reloads.
- **`siid=1095905` is the franchise site id** baked into every booking-engine link (`siteItemId` in the page config). Reuse the `siid` you find on the deals page rather than inventing one; a wrong/empty `siid` can break the search form's security key (error code `429-CSKInvalid`).
- **Prices lazy-load.** Deal-card "from" prices are in the server HTML, but inside the swift SPA the per-cabin price columns populate a beat after the result rows; wait for `$` amounts to appear before extracting, otherwise you'll capture night counts with empty prices.
- **`destinationType=All` returns the full inventory** (~63k sailings) — always pair it with a real filter (`cruiseline`, `ship`, dates, or destination) or at least `sortColumn=price&sortOrder=asc` so the first rows are meaningful.
- **Read-only boundary:** the package page's `BOOK` buttons and the `Guest Information → … → Check out` breadcrumb lead into a real reservation. Never proceed. The `RequestAQuote` link is the safe human-handoff.
- **Anti-bot reality vs. the pre-run probe.** The host probe reported "none detected / likelyNeedsVerified:false," but the corporate site is fronted by Akamai and the booking engine by reCaptcha+Turnstile. The successful run used `--verified --proxies`; keep stealth on. No block was hit during testing, but a bare session is not advised.
- **No autobrowse trace/strategy shipped with this skill:** the build sandbox lacked a real Anthropic credential (`ANTHROPIC_AUTH_TOKEN` was the literal string `placeholder`), so the inner self-improvement agent couldn't run. All findings here come from direct `browse` automation + `browse cloud fetch`, which authenticate via `BROWSERBASE_API_KEY` and worked normally.

## Expected Output

Three distinct outcome shapes depending on which sub-task ran.

### 1. Deals (from the corporate Deals page)

```json
{
  "success": true,
  "source": "https://www.expediacruises.com/en-us/corporate/Deals",
  "deals": [
    {
      "title": "5 Night Caribbean Western Cruise",
      "ports": ["Tampa, Florida", "Costa Maya, Mexico", "Cozumel, Mexico", "Tampa, Florida"],
      "cruise_line": "MSC Cruises",
      "ship": "MSC Seascape",
      "depart": "Jul 26, 2026",
      "return": "Aug 2, 2026",
      "price_from_usd": 528,
      "taxes_fees_included": true,
      "promotion_id": "2231584",
      "package_url": "https://bookus.expediacruises.com/swift/cruise/package/1484845?siid=1095905&lang=1",
      "quote_url": "https://www.expediacruises.com/en-us/corporate/RequestAQuote?cruise=1484845&refPage=Deals"
    }
  ]
}
```

### 2. Sailing search (from the swift search engine)

```json
{
  "success": true,
  "search_url": "https://bookus.expediacruises.com/swift/cruise?siid=1095905&lang=1&destinationType=All&sortColumn=price&sortOrder=asc",
  "sailings_found": 63724,
  "sort": "price-asc",
  "results": [
    {
      "sail_date": "Sep 14, 2026",
      "day_range": "Mon - Thu",
      "prices_per_person_usd": { "inside": 163, "outside": 229, "balcony": 299, "suite": 668 },
      "includes_taxes_fees": true
    }
  ]
}
```

### 3. Cruise / package detail (read-only booking entry)

```json
{
  "success": true,
  "package_url": "https://bookus.expediacruises.com/swift/cruise/package/1484845?siid=1095905&lang=1",
  "title": "7 Nights | Caribbean Western | MSC Cruises: MSC Seascape | Jul 26, 2026",
  "ship": "MSC Seascape",
  "cruise_line": "MSC Cruises",
  "route": "Galveston → Galveston",
  "price_per_person_from_usd": { "inside": 528, "outside": 612, "balcony": 724, "suite": 1865 },
  "bonus_offers": ["Up to $125 Onboard Credit", "FLASH Sale! Reduced Fares", "Save up to 30%", "One Key members earn 2% in OneKeyCash"],
  "booking_steps": ["Guest Information", "Category", "Staterooms", "Check out"],
  "note": "read-only — stopped before payment"
}
```

### Failure / blocked

```json
{
  "success": false,
  "error_reasoning": "swift search returned 429 rate-limit ('Please wait a minute and try again') — back off ~60s and retry with a verified session; do not call the AJAX endpoint directly."
}
```
