---
name: nav-com-get-smb-funding-2s1rpm
title: Nav Small-Business Funding Marketplace
description: >-
  Enumerate the small-business funding options on Nav's public marketplace —
  business loans, business credit cards, and trade-credit vendors — returning
  each offer's lender, dollar range, cost/APR, repayment, and funding speed.
  Read-only.
website: nav.com
category: smb-finance
tags:
  - smb-finance
  - loans
  - credit-cards
  - marketplace
  - read-only
  - remix
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Nav serves the marketplace as SSR HTML at
      https://www.nav.com/marketplace/{slug}/ — a single GET returns the page
      chrome plus the first 6 offer cards. No auth, no anti-bot, no proxy
      required. This is the cheapest path for a shortlist.
  - method: browser
    rationale: >-
      Required only when (a) you need offers 7..N — the 'Show more' button is
      client-side React with no URL or fetch path, or (b) you want to apply UI
      filters (Financing Type, Annual Revenue, etc.) which are pure React state
      and ignored on the URL.
  - method: api
    rationale: >-
      Nav exposes no public REST or GraphQL endpoint for the marketplace. Tested
      ?_data=routes/... (Remix loader pattern) and various ?filter=, ?type=,
      ?financingType= params — all return the full unfiltered HTML page. The
      HTML response is the only API; offers 7..N are reachable only by clicking
      Show more or by decoding the React Router stream payload embedded in the
      response (custom decoder required).
verified: false
proxies: false
---
# Nav Small-Business Funding Marketplace

## Purpose

Enumerate the small-business funding options listed on Nav's public marketplace — business loans, business credit cards, and trade credit (net-30+ vendor accounts) — and return each offer's terms (lender, funding amount, cost/APR/factor rate, repayment, funding speed, pros/cons). Read-only; never clicks "Apply now". Returns offers visible to anyone in the world (no auth, no anti-bot). For Nav's *personalized* MatchFactor ranking, an account is required (see Gotcha below); this skill covers the public/anonymous view only.

## When to Use

- "What small-business loans, credit cards, or net-30 vendor accounts are listed on Nav today?"
- A finance agent assembling a comparison shortlist before a user signs up for a marketplace account.
- Daily/weekly cron to detect when a new partner is added to Nav's portfolio (offers list is small and stable enough to diff).
- Anywhere you want the raw partner list — name, lender, dollar ranges, APR/factor rate, funding speed — without scraping each lender's own site.

## Workflow

Nav's `/marketplace/{slug}/` pages are server-rendered Remix routes. The **Browserbase Fetch API** (or any plain `GET`) returns the full HTML including the React Router stream payload, and the first 6 offer cards are fully visible in the rendered DOM. No auth, no anti-bot, no proxy required. Browser driving is **only** needed if you want offers 7–N (the "Show more" button is client-side JS) or to apply UI filters (filters are React state, ignored on the URL). For the typical "give me a shortlist" use case, the fetch path returns enough.

### 1. Pick the marketplace category

| slug | What it lists | Count (2026-05-18) |
|---|---|---|
| `business-loans` | Term loans, lines of credit, SBA, MCA, equipment financing, cash advances | 23 offers |
| `business-credit-cards` | Purchase cards, rewards/cash-back, charge cards, fuel cards | 20 offers |
| `trade-credit` | Net-30+ vendor accounts (also reports to business credit bureaus) | 29 vendors |

URL template: `https://www.nav.com/marketplace/{slug}/`

### 2. Fetch the page

```bash
# Browserbase Fetch API — single 200 OK, ~500 KB HTML body
browse cloud fetch "https://www.nav.com/marketplace/business-loans/" --output bl.json
```

A plain `curl` works equally well; nothing about this surface requires Browserbase. The response is `text/html; charset=utf-8`, `Cache-Control: private`, served via Varnish.

### 3. Parse the rendered offer cards (top 6)

Each `Apply now` button anchors one offer card. Split the HTML on `Apply now` markers and read each chunk up to the matching `Show details`. Within a chunk the structure is consistent:

```
{Offer Name} by {Lender}
{free-text description, optional}
Pros
{pro bullet 1}
{pro bullet 2}
…
Cons
{con bullet 1}
…
Funding Amount     {range}
Cost               {APR or factor rate or fee}
Repayment Terms    {schedule}
Funding Speed      {turnaround}
```

Reference Python parser (stable across the three marketplace slugs):

```python
import json, re
html = open("bl.html").read()
# Collapse tags to pipe-delimited tokens
t = re.sub(r"<[^>]+>", "|", html)
t = re.sub(r"\|+", "|", t)
t = re.sub(r"\s+", " ", t)
chunks = t.split("|Apply now|")[1:]  # 0th chunk is the page chrome

offers = []
for ch in chunks:
    end = ch.find("Show details")
    parts = [p.strip() for p in ch[:end].split("|") if p.strip()]
    if not parts: continue
    head = parts[0]                                         # "Short-Term Loan by Credibly"
    m = re.match(r"^(.*?)\s+by\s+(.+)$", head)
    name, lender = (m.group(1), m.group(2)) if m else (head, None)
    def field(label):
        try: return parts[parts.index(label)+1]
        except ValueError: return None
    pros, cons = [], []
    if "Pros" in parts and "Cons" in parts:
        pi, ci = parts.index("Pros"), parts.index("Cons")
        fi = parts.index("Funding Amount") if "Funding Amount" in parts else len(parts)
        pros, cons = parts[pi+1:ci], parts[ci+1:fi]
    offers.append({
        "name": name, "lender": lender,
        "funding_amount": field("Funding Amount"),
        "cost": field("Cost"),
        "repayment_terms": field("Repayment Terms"),
        "funding_speed": field("Funding Speed"),
        "pros": pros, "cons": cons,
    })
```

Read the total count from `Showing 1 - <!-- -->6<!-- --> of <!-- -->23` (regex: `r"Showing\s+1\s*-\s*<!--\s*-->\s*(\d+)\s*<!--\s*-->\s*of\s*<!--\s*-->\s*(\d+)"`). The literal HTML comments in the count badge are React-hydration markers — don't strip them before matching, or write the regex against the rendered text (`Showing 1 - 6 of 23`) after stripping tags.

### 4. (Optional) Extract all N offers from the stream payload — without a browser

The rendered DOM only shows the first 6 cards, but **all N offers' data is in the initial HTML response**, embedded in an inline `<script>` that calls `window.__reactRouterContext.streamController.enqueue("…")`. The encoded chunk is ~150 KB and uses a deduplicated positional-reference format (keys like `{"_1":2,"_3":-5}` where `_N` is a slot id and the integer is a pointer to another slot's value). Decoding it fully requires a custom resolver, but the offer titles (`{Name} by {Lender}`) are stored as plain JSON strings and are easy to regex out:

```python
import re
m = re.search(r'__reactRouterContext\.streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)', html)
decoded = m.group(1).encode().decode("unicode_escape")
titles = sorted(set(re.findall(
    r'"([A-Z][^"\n]{8,80}\bby\s+[A-Z][A-Za-z &\.-]{2,30})"', decoded)))
# titles: all 21 unique loan-offer titles; the 23 total includes 2 brand variants
```

Recovering the full per-offer fields (Cost, Speed, Pros, Cons) from the stream requires walking the dedup table — feasible but several hundred lines. **In practice**: emit the top-6 from the DOM, and if the user explicitly asks for the full list, fall back to the browser path (Step 5).

### 5. Browser fallback — for offers 7+, filters, or "Apply now" follow-through

Open the page in a Browserbase session, click `button: Show more` until the rendered count matches `total_results`, then re-run the Step 3 parser against the post-hydration HTML. Filters (Financing Type, Annual Revenue, Time in Business, Credit Range, Personal Guarantee, etc.) are pure client-side React state — click the relevant checkboxes in the sidebar, then re-extract. No URL or fetch path mirrors them.

```bash
SID=$(browse cloud sessions create --keep-alive --proxies | jq -r .id)
browse open "https://www.nav.com/marketplace/business-loans/" --remote -s "$SID"
browse wait load --remote -s "$SID"
# Click "Show more" until 'Showing 1 - N of N results' rendered count == total
browse click 'button[data-testid="show-more-button"]' --remote -s "$SID"
# Repeat ~3x for business-loans (each click reveals 6 more)
browse get markdown body --remote -s "$SID"
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

`--proxies` is not required for the read path, but adding it costs nothing and gives parity with the personalized flow in case Nav later turns on geo-fencing.

### 6. (Out of scope) Personalized MatchFactor

The "See my options" CTA on every marketplace page (and the `Sign up` header link) routes to `https://app.nav.com/registration/`. That form requires email + password + business name + EIN/SSN, after which Nav's MatchFactor service ranks the same partner pool against the supplied business profile (revenue band, time in business, credit range). **This is out of scope for this read-only skill** — credentials would be needed and Nav would consume an application slot. If you need ranked matches, sign up manually and use a separate authenticated skill.

## Site-Specific Gotchas

- **No anti-bot whatsoever**: `Cache-Control: private` + `Vary: Accept-Encoding` + Varnish + Strict-Transport-Security. `robots.txt` explicitly `Allow: /` except `/a/affiliates/` and `/partner`. Fetch API works first try with no proxy, no stealth.
- **Only 6 cards in the rendered DOM, 23 in the payload**: SSR renders the first 6 of N offers visibly; the remaining (N−6) are present in the `__reactRouterContext` stream payload but not yet hydrated into DOM nodes. Use the stream extractor in Step 4 for inventory questions; use the browser fallback for full offer detail.
- **URL filter params are ignored**: `?financingType=SBA`, `?filter=…`, `?type=…`, `?page=2` — all tested, all return the unfiltered 23. Filters are client-side React state only.
- **`?_data=routes/...` (Remix loader) is not exposed**: tested `?_data=routes/marketplace`, `?_data=routes%2Fmarketplace.business-loans` — both return the full HTML page, not loader JSON. Nav appears to be on Remix v2 / React Router Data Router but with the loader-as-data response disabled. **Don't waste time looking for a `_data` JSON endpoint** — it doesn't exist on this surface.
- **No public REST or GraphQL endpoint**: no `/api/*` paths, no `graphql` references, no `_next/data/` (Nav is Remix, not Next.js). The HTML response is the API.
- **"Showing 1 - 6 of 23" has literal HTML comments inside it**: the badge renders as `Showing 1 - <!-- -->6<!-- --> of <!-- -->23` in the raw HTML (React hydration markers). Match against the rendered text after stripping tags, or include `<!--\s*-->` in the regex.
- **`Funding Amount`/`Cost`/`Repayment Terms`/`Funding Speed` is the canonical field set** for business loans. Business credit cards use a different set: `Intro APR`, `Purchase APR`, `Annual Fee`, `Welcome Offer`. Trade credit uses: `credit limit`, `fees`, `minimum order`, `Net-30/60/etc.`. Per-category parsers needed.
- **Personal Guarantee filter is always checked-off by default** — Nav lists offers that *require* a personal guarantee alongside those that don't; this is one of the more useful filters when an LLC wants to limit personal liability exposure. The text "Personal Guarantee" appears in both the sidebar and the offer card descriptions.
- **MatchFactor is account-only**: `https://app.nav.com/registration/` is on a different subdomain (`app.` instead of `www.`), uses a separate Remix app, and gates everything personalized. The marketplace pages on `www.nav.com` are the only anonymous read surface.
- **All offers carry an `Apply now` CTA that opens a partner-redirect URL** (e.g. `https://www.nav.com/marketplace/business-loans/<offer-slug>/apply` → 302 to lender). **Do not click these**; they may consume a partner-application slot and Nav receives a referral fee on completion. Read-only enumeration stops at the offer card.
- **Advertiser disclosure is embedded**: every marketplace page includes Nav's disclosure that partners pay for placement and CTR. The order of offers is therefore commercial, not editorial — useful context if the agent is asked "which is best?".
- **`Cache-Control: private` + Varnish** means responses are not edge-cached for anonymous viewers; expect 100–400 ms response times depending on region. The `X-Cache` header reports `MISS, MISS` on cold reads and `HIT, MISS` (or vice versa) after warming.

## Expected Output

One JSON envelope per requested category. Top-level fields are identical across categories; the `offers[]` shape varies by category.

### Business loans (also: any `business-loans`-style request)

```json
{
  "success": true,
  "category": "business-loans",
  "url": "https://www.nav.com/marketplace/business-loans/",
  "total_results": 23,
  "returned_results": 6,
  "fetched_at": "2026-05-18T22:22:40Z",
  "offers": [
    {
      "name": "Short-Term Loan",
      "lender": "Credibly",
      "funding_amount": "$5,000 - $600,000",
      "cost": "As low as a 1.11 FR",
      "repayment_terms": "Daily & Weekly automatic debits; 6 to 15 month repayment terms",
      "funding_speed": "As quickly as 4 hours",
      "pros": [
        "Set payments",
        "Pre-qualification, which means you can pre-qualify without hurting your credit",
        "With strong cashflow health, low personal credit scores still have great options here"
      ],
      "cons": [
        "Must have at least $15,000 a month in deposits",
        "Repayment terms maybe shorter for some users"
      ]
    }
  ],
  "full_inventory_titles": [
    "Business Cash Advance by Capitalized Business Funding",
    "Business Cash Advance by Credibly",
    "Business Cash Advance by Rapid Finance",
    "Equipment Leasing by American Capital Financial",
    "Intermediate-Term Loan by Kapitus",
    "Line of Credit by Fundbox",
    "Line of Credit by OnDeck",
    "Line of Credit by Plexe",
    "Line of Credit by Rapid Finance",
    "Line of Credit by SBG Funding",
    "Line of Credit by SmartBiz",
    "Line of Credit or Term Loan by Quantum LS",
    "Premier Loan by SBG Funding",
    "SBA Loan by SmartBiz",
    "Short-Term Loan by Credibly",
    "Short-Term Loan by Kapitus",
    "Short-Term Loan by National Funding",
    "Short-Term Loan by QuickBridge",
    "Short-Term Loan by Rapid Finance",
    "Term Loan by OnDeck",
    "Term Loan by SBG Funding"
  ]
}
```

### Business credit cards

```json
{
  "success": true,
  "category": "business-credit-cards",
  "url": "https://www.nav.com/marketplace/business-credit-cards/",
  "total_results": 20,
  "returned_results": 6,
  "offers": [
    {
      "name": "The American Express Blue Business Cash™ Card",
      "issuer": "American Express",
      "intro_apr": "0% on purchases for 12 months from date of account opening",
      "purchase_apr": "16.74% - 28.49% Variable",
      "annual_fee": "$0",
      "welcome_offer": "Earn a $250 statement credit after you make $3,000 in purchases on your Card in your first 3 months.",
      "pros": ["Attractive intro financing offer", "High rates of cash back for business spending", "No annual fee."],
      "cons": ["No rewards bonus for initial spending", "Foreign transaction fees."]
    }
  ]
}
```

### Trade credit (net-30+ vendors)

```json
{
  "success": true,
  "category": "trade-credit",
  "url": "https://www.nav.com/marketplace/trade-credit/",
  "total_results": 29,
  "returned_results": 6,
  "offers": [
    {
      "name": "FEDLIN Cybersecurity Services",
      "vendor": "FEDLIN",
      "category": "Business services",
      "credit_limit": "$5,000-$10,000",
      "fees": "No fees",
      "minimum_order": "Minimum of $150 per order",
      "terms": "Net-30",
      "bureau_reporting": ["Equifax"],
      "years_in_business": 4,
      "website": "fedlin.com"
    }
  ]
}
```

### Failure / blocked

```json
{
  "success": false,
  "category": "business-loans",
  "url": "https://www.nav.com/marketplace/business-loans/",
  "error_reasoning": "HTTP 5xx from Varnish / cache layer | unexpected DOM (Nav redesigned the marketplace) | bot block (not observed in 2026-05-18 testing)"
}
```
