---
name: carnival-com-au-find-deals-1mt2hu
title: Carnival Australia Cruise Deals
description: >-
  Extract Carnival Cruise Line Australia's current promotional cruise deals
  (offer name, from-price in AUD, perks, book-by date, and rate code) from the
  cruise-deals page, with an optional drill-down to the concrete sailings each
  deal applies to. Read-only.
website: carnival.com.au
category: travel
tags:
  - travel
  - cruise
  - deals
  - carnival
  - read-only
  - australia
source: 'browserbase: agent-runtime 2026-05-30'
updated: '2026-05-30'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No usable public API. The /cruise-deals-2025 and /cruise-search Next.js
      payloads (__NEXT_DATA__ pageProps.data) are CryptoJS-AES encrypted
      ('Salted__'), and /cruisesearch/api/targetedOffers/get requires a VIFP
      PastGuestNumber (returns 400 without one). Render the page and read the
      DOM instead.
verified: false
proxies: false
---
# Find Carnival Cruise Line Australia Deals

## Purpose

Return the list of promotional cruise deals currently advertised on Carnival Cruise Line Australia's deals page (`carnival.com.au/cruise-deals`). Each deal is a marketing **bundle** (a named offer with a rate code, an "average from" per-person AUD price, a set of perks, and a book-by date), not an individual sailing. The skill optionally drills into any deal to surface the concrete sailings (ship, itinerary, nights, sail date, per-person price) that the deal applies to, via the `cruise-search` page. Read-only — it never books, holds, or proceeds to checkout.

## When to Use

- "What cruise deals is Carnival Australia running right now?"
- Monitoring promotional offers (reduced deposits, onboard credit, room upgrades) and their book-by deadlines.
- As a first step before a price-comparison flow: get the deal's rate code, then drill into `cruise-search` for actual sailing prices.
- Any flow that needs the current named offers + "from" prices without committing to a booking.

## Workflow

The deals page is a client-rendered Next.js app. Its server payload (`pageProps.data` inside `__NEXT_DATA__`) is **CryptoJS-AES encrypted** (`U2FsdGVkX1...` = `"Salted__"`), and the `/cruise-search` results page encrypts its payload the same way — so there is **no clean JSON/API path**. The recommended method is to render the page in a browser and read the deal cards from the DOM. A bare Browserbase session (no proxies, no stealth) is sufficient — see Gotchas.

1. **Open the deals page** (a plain session is fine):
   ```bash
   sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   browse open "https://www.carnival.com.au/cruise-deals" --remote --session "$sid"
   ```
   `carnival.com.au/cruise-deals` 301-redirects to `carnival.com.au/cruise-deals-2025?&dest=tp,nz,o,u,x`. Don't fight the redirect — follow it.

2. **Wait for the React deal cards to render** (~3–5s after load fires):
   ```bash
   browse wait load --remote --session "$sid"
   browse wait timeout 5000 --remote --session "$sid"
   ```

3. **Read the cards** with `browse get text body` (and `browse snapshot` for refs / anchor hrefs). The page header reads "N Deals" (currently `4 Deals`, excluding the locked VIFP member tile). For each deal card extract:
   - **title** — e.g. "Fun-believable Deals", "Escape With Carnival", "Choice Plus", "Fun Select".
   - **price_from_aud** — the "Average price `$NNN`* pp" figure (per person, twin-share, AUD; the `*` denotes "starting price, taxes & fees included").
   - **perks** — the bulleted benefits (reduced/half-price deposits, onboard spending money, category upgrades, refundable deposits).
   - **book_by / sailing window** — the "Available on … through {month year} — Book by {date}" line (not present on every card).
   - **rate_code** & **shop_url** — from the card's "SHOP NOW" anchor href (see step 5). The rate code also appears in the `icid`.

4. **Handle the VIFP member tile.** One tile is a locked "Log in to unlock member-only deals" card (VIFP Club loyalty). It shows no price unless logged in. Emit it with `member_only: true` and a null price rather than dropping it.

5. **(Optional) Drill into concrete sailings.** Each deal's "SHOP NOW" button links to `cruise-search` with the deal's rate code, e.g.:
   ```
   https://www.carnival.com.au/cruise-search?cruisedeals=funbelievabledeals&rateCodes=k3p&dest=U,X,NZ,O,TP&sort=fromprice&showBest=true&pagenumber=1&pagesize=8
   ```
   Open it, `browse wait timeout 7000`, and read the results. The page shows a "SALES RATE APPLIED" badge, an "N Cruise Results" count (72 at capture time), and individual sailing cards: itinerary title (e.g. "2-Day Getaway from Melbourne, Australia"), ship (e.g. "Carnival Adventure"), and an "average per person" AUD price. **Do NOT click a sailing's book/select control** — stop at the results list.

6. **Release the session:**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Notes on inputs / assumptions
- Prices render in AUD and are per-person twin-share "from" figures. Assumed the user wants the advertised deal bundles (the page's own "Deals"); concrete sailing prices are provided via the optional drill-down.
- `dest=U,X,NZ,O,TP` is the default destination filter the deals page applies (Australia / South Pacific / New Zealand / Asia / Transpacific). The deals themselves are not destination-specific bundles.

## Site-Specific Gotchas

- **No usable API — payloads are AES-encrypted.** Both `/cruise-deals-2025` and `/cruise-search` are Next.js SSR apps whose `__NEXT_DATA__ → props.pageProps.data` is a CryptoJS-AES "Salted__" blob, decrypted client-side by `main.min.js` with an embedded key. Don't waste time fetching `/cruise-deals-2025/_next/data/{buildId}/index.json` or trying to parse `pageProps.data` directly — confirmed encrypted across iterations. Read the rendered DOM instead.
- **`/cruisesearch/api/targetedOffers/get` is NOT the deals feed.** It is the personalized "Targeted Offers" (TGO) endpoint and **requires a `PastGuestNumber` (VIFP loyalty number)** — a bare GET returns HTTP 400 `{"errors":{"PastGuestNumber":["The PastGuestNumber field is required."]}}`. It powers the logged-in member tile, not the public deal cards.
- **Stealth/proxies are NOT required.** The site is fronted by Akamai (sets `ak_bmsc`, `akacd_*`, `AKA_A2` cookies), but a **bare** Browserbase session (no `--proxies`, no `--verified`) loaded and rendered the deals page cleanly. The pre-run probe agreed (`likelyNeedsVerified:false`, `likelyNeedsProxies:false`). `browse cloud fetch` also returns 200 on the homepage and deals page without proxies. Don't pay for stealth here unless behavior changes.
- **`/cruise-deals` redirects** → `/cruise-deals-2025?&dest=tp,nz,o,u,x` (301), and the assetPrefix/publicPath is `/cruise-deals-2025` (so static chunks live under that path). Navigate to `/cruise-deals` and follow it.
- **Deal cards render late.** A `browse snapshot` immediately after `wait load` can miss cards — always add `browse wait timeout 5000` (deals) / `7000` (cruise-search) before reading.
- **The "N Deals" count excludes the locked VIFP tile.** The header said "4 Deals" while 5 tiles were visible (the 5th being the member-only login tile). Count the public ones; flag the member tile separately.
- **Rate codes live in the SHOP NOW href and the `icid`.** Observed mapping at capture: Fun-believable Deals=`k3p`, Escape With Carnival=`keh`, Choice Plus=`qcp`, Fun Select=`KNS`. These rotate with promotions and book-by dates — re-read them each run, don't hardcode.
- **Prices and book-by dates are time-sensitive promotions.** The "$316/$320/$400/$520" figures and "Book by 30 May 2026 / 2 June 2026" deadlines were current at capture (2026-05-30) and will change. Treat every field as live data to re-extract, not a constant.
- **Read-only.** Never click a sailing's select/book control or a "SHOP NOW → checkout" flow. Stop at the deal cards (or the cruise-search results list on drill-down).

## Expected Output

```json
{
  "success": true,
  "source_url": "https://www.carnival.com.au/cruise-deals",
  "currency": "AUD",
  "deal_count": 4,
  "deals": [
    {
      "title": "Fun-believable Deals",
      "price_from_aud": 316,
      "member_only": false,
      "perks": ["Great rates - limited time only", "Reduced deposits $50 pp/twin"],
      "book_by": "30 May 2026",
      "sailing_window": "Select sailings through May 2027",
      "rate_code": "k3p",
      "shop_url": "https://www.carnival.com.au/cruise-search?cruisedeals=funbelievabledeals&rateCodes=k3p&dest=U,X,NZ,O,TP&sort=fromprice&showBest=true&pagenumber=1&pagesize=8"
    },
    {
      "title": "Escape With Carnival",
      "price_from_aud": 320,
      "member_only": false,
      "perks": ["2 Category room upgrades", "Reduced deposits from $50pp"],
      "book_by": "2 June 2026",
      "sailing_window": "Select Carnival Australia sailings through July 2028",
      "rate_code": "keh",
      "shop_url": "https://www.carnival.com.au/cruise-search?cruisedeals=escapewithcarnival&rateCodes=keh&dest=U,X,NZ,O,TP&sort=fromprice&showBest=true&pagenumber=1&pagesize=8"
    },
    {
      "title": "Choice Plus",
      "price_from_aud": 400,
      "member_only": false,
      "perks": ["Half Price Deposits", "Up to $400 Onboard Spending Money per room"],
      "book_by": null,
      "sailing_window": null,
      "rate_code": "qcp",
      "shop_url": "https://www.carnival.com.au/cruise-search?cruisedeals=choiceplus&rateCodes=qcp&dest=U,X,NZ,O,TP&sort=fromprice&showBest=true&pagenumber=1&pagesize=8"
    },
    {
      "title": "Fun Select",
      "price_from_aud": 520,
      "member_only": false,
      "perks": ["Refundable deposits", "2-Category Upgrade"],
      "book_by": null,
      "sailing_window": null,
      "rate_code": "KNS",
      "shop_url": "https://www.carnival.com.au/cruise-search?cruisedeals=funselect&rateCodes=KNS&dest=U,X,NZ,O,TP&sort=fromprice&showBest=true&pagenumber=1&pagesize=8"
    },
    {
      "title": "VIFP Club",
      "price_from_aud": null,
      "member_only": true,
      "perks": ["Member-only deals — log in to unlock"],
      "book_by": null,
      "sailing_window": null,
      "rate_code": null,
      "shop_url": null
    }
  ],
  "error_reasoning": null
}
```

Optional `cruise-search` drill-down shape (when step 5 is performed for a single deal):

```json
{
  "deal": "Fun-believable Deals",
  "rate_code": "k3p",
  "result_count": 72,
  "sailings": [
    {
      "title": "2-Day Getaway from Melbourne, Australia",
      "ship": "Carnival Adventure",
      "price_from_aud": 316,
      "sale_rate_applied": true
    }
  ]
}
```

Failure / blocked shape:

```json
{
  "success": false,
  "source_url": "https://www.carnival.com.au/cruise-deals",
  "deal_count": 0,
  "deals": [],
  "error_reasoning": "Deal cards did not render within timeout / page returned an anti-bot challenge."
}
```
