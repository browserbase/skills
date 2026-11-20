---
name: booksearanchescape-escapia-com-find-sea-ranch-house-sffj18
title: Sea Ranch Escape — Find a House
description: >-
  Find Sea Ranch vacation-rental homes on booksearanchescape.escapia.com by date
  range, party size, bedrooms, and pet allowance. Returns availability
  (day-by-day JSON), rate quotes, amenities, and detail-page links. Read-only —
  never books.
website: booksearanchescape.escapia.com
category: vacation-rentals
tags:
  - vacation-rentals
  - lodging
  - sea-ranch
  - escapia
  - read-only
  - url-param
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: url-param
alternative_methods: []
verified: true
proxies: true
---
# Find a House on Sea Ranch Escape

## Purpose

Given user constraints — date range, party size, bedroom count, pet allowance, ocean-view preference, etc. — return one or more Sea Ranch vacation-rental homes from the Sea Ranch Escape catalog (`booksearanchescape.escapia.com`, an Escapia-powered booking portal) with availability, pricing, amenities, and a deep-link to the unit detail page. Read-only — never click "Book Now" or submit the booking form.

## When to Use

- "Find a 3-bedroom house in Sea Ranch for Thanksgiving week 2026, dog-friendly."
- "What's available at The Sea Ranch from July 4–7 for 4 adults?"
- "Cheapest oceanfront 2BR cottage on Sea Ranch under $400/night this fall."
- "List every Sea Ranch Escape property — I'll filter myself."
- A trip-planning agent comparing vacation rentals across coastal Sonoma/Mendocino.

Booking flows (taking payment, holding a slot) are a separate skill — this one stops at the rate-quote / detail page.

## Workflow

The Sea Ranch Escape portal exposes four undocumented but stable URL-parameter endpoints. **Do not drive the booking form** — the form posts to `DesktopDefault.aspx` with ASP.NET `__VIEWSTATE` (rotates per session, painful to script). Every piece of data the form exposes is reachable via these direct GET endpoints instead.

### 1. Enumerate the full catalog (≈30 units across 4 pages)

```
GET https://booksearanchescape.escapia.com/DesktopDefault.aspx?PageID=11977&page_num={1..4}
```

(Equivalent pretty-URL alias for page 1: `/site/PropertyList/11977/default.aspx`.)

Each response embeds a `<ul id="propertyList">` block with one `<li>` per unit. Parse each `<li>` for:

| Field | XPath / regex anchor |
|---|---|
| `pid` | `href="/Unit/Details/(\d+)"` |
| `name` | `<h3><a href="/Unit/Details/{pid}">{name}</a></h3>` |
| `price_summary` | `<span class="rate">…{value}…</span>` (free-text — "Starts @ 3 Nights $2075/ Weekly $3903") |
| `bedrooms` | `<dt>Bedrooms:</dt><dd>{n}</dd>` |
| `bathrooms` | `<dt>Bathrooms:</dt><dd>{n}</dd>` |
| `sleeps` | `<dt>Sleeps:</dt><dd>{n}</dd>` |
| `pets` | `<dt>Pets:</dt><dd>{None\|Dogs\|...}</dd>` |
| `guest_rating` | `Guest Rating: (\d+)` in the trailing `<p>` |
| `image_url` | `<img class="pic" src="//pictures.escapia.com/SEARES/{pid}/{hash}.jpg">` |
| `description` | Trailing `<p>` after stripping the rating image |

Loop `page_num` from 1 to 4 (the pager UI also reports `<TotalPagesLabel>4</TotalPagesLabel>` — read it instead of hardcoding if you want to be safe).

### 2. Check per-unit availability (JSON, day-by-day)

```
GET https://booksearanchescape.escapia.com/Unit/Availability/{pid}?startDate=MM/DD/YYYY&endDate=MM/DD/YYYY
```

Returns `application/json` — an array of one entry per calendar day from `startDate` (inclusive) to `endDate` (inclusive). Entry shape:

```json
{"S": "A", "M": 3}
```

| `S` | Meaning |
|---|---|
| `"A"` | Available |
| `"U"` | Unavailable |
| `"I"` | Check-in only (this day can be an arrival but not a mid-stay night) |
| `"O"` | Check-out only (this day can be a departure but not a mid-stay night) |

`M` is the **minimum stay in nights** for a booking that starts on (or includes) that day. Common values seen: `3`, `5`, `7`, `255` (encoded "not bookable / no minimum applies because day is `U`").

**Availability rule for a candidate trip with `arrive` → `depart`:**

1. Day `arrive` must have `S ∈ {"A", "I"}`.
2. Every day in `(arrive, depart)` (exclusive on both ends) must have `S == "A"`.
3. Day `depart - 1` (the last night) — covered by rule 2. Day `depart` itself is the checkout day and need not be `A`.
4. `(depart - arrive)` in nights ≥ `M[arrive]`.

If any rule fails, the unit is not bookable for that range.

### 3. Get the full rate quote (HTML)

```
GET https://booksearanchescape.escapia.com/Booking/RateDetails/{pid}?arrive=MM/DD/YYYY&depart=MM/DD/YYYY&adults=N&children=N
```

- HTTP `200` + HTML: parse `<dd class="total-price">$X,XXX.XX</dd>` for the total. The full breakdown (base rent, fees, taxes, promo savings) lives in a `<dl>` immediately above it; the booking summary (check-in, check-out, nights, adults, children, pets) is in the same `<dl>`.
- HTTP `302` → `Location: /Error/UnitUnavailable`: dates are **not** bookable for this unit (despite what the calendar might suggest — Escapia rolls min-stay, blackout, and inventory rules into this single check). Treat this as the canonical "unavailable" signal; it is more authoritative than the `/Unit/Availability/...` JSON alone.

For a robust availability check, hit `/Unit/Availability/...` first to fail-fast on calendar conflicts, then call `/Booking/RateDetails/...` to confirm bookability and read the total price.

### 4. Get rich unit metadata (HTML)

```
GET https://booksearanchescape.escapia.com/Unit/Details/{pid}
```

Stable extractable regions:

- `<title>The Sea Ranch, CA United States - {name} | Sea Ranch Escape</title>`
- `<p id="longDescription">…</p>` — full marketing description (much richer than the catalog `<li>` blurb).
- `<table id="unitAmenities">` — twelve `td.amenity-grouping` / `td` pairs covering **Property Type, Unit Code, Beds, Bathrooms, Rooms, Pets, Living, Kitchen, Entertainment, Outdoor, Geographic, Convenience, Children**.
- Photo carousel: `<img>` tags under `<ul id="thumbnailCarousel1">` with `pictures.escapia.com/SEARES/{pid}/*.jpg`.
- Average ratings: regex `Manager Rating[^(]*\(Based on (\d+) reviews\)` and `Rental Rating[^(]*\(Based on (\d+) reviews\)`.

### 5. Issue the requests via Browserbase Fetch

Every endpoint above is plain HTTP with no JavaScript dependency. The site sits behind AWS ALB + ASP.NET, not Akamai/Cloudflare/PerimeterX — a bare `browse cloud fetch` with `--proxies` is sufficient. No CAPTCHA, no rate-limit observed across ~25 requests in iteration. Stealth + verified-session flags are not required for these endpoints.

```bash
browse cloud fetch \
  "https://booksearanchescape.escapia.com/DesktopDefault.aspx?PageID=11977&page_num=1" \
  --proxies
```

### Browser fallback

If for some reason the URL endpoints regress (Escapia retires the `/Unit/Availability` JSON route, etc.), drive the form interactively:

1. `browse open https://booksearanchescape.escapia.com/ --remote`
2. `browse fill #ctl03_ctl06_ctl02_arrive "07/04/2026"` and same for `_depart`.
3. Set `#ctl03_ctl06_ctl02_adults` and `#ctl03_ctl06_ctl02_children` via `browse fill`.
4. `browse click #ctl03_ctl06_ctl02_submit` — triggers an `__doPostBack` to `DesktopDefault.aspx`.
5. Parse the resulting SearchResults page (same `<ul id="propertyList">` schema as catalog).
6. **Note:** Even the form-submit path does **not** filter results to *actually available* units — Escapia's SearchResults module shows all matching catalog units; the only authoritative availability gate is `/Booking/RateDetails/{pid}` returning `200` vs `302`.

## Site-Specific Gotchas

- **GET-param search filters are cosmetic, not functional.** `/site/SearchResults/default.aspx?arrive=…&depart=…&adults=…&bedrooms=…&pets=…` pre-fills the form widgets but returns the same shuffled catalog page regardless of date/party/bedroom values. We verified: a search for `arrive=01/01/2020&depart=01/03/2020&adults=30` (impossible) still returned 10 listings; a search with `bedrooms=4` returned `[3, 1, 3, 2, 3, 3, 1, 4, 2, 2]` bedroom counts. **Never trust the SearchResults listing as "these units are available for your dates."** Use `/Unit/Availability/{pid}` per unit instead.
- **Catalog ordering is randomized per request.** Two back-to-back fetches of `/site/PropertyList/11977/default.aspx` (or `/DesktopDefault.aspx?PageID=11977&page_num=1`) return different 10-unit subsets — the SortingGuid cookie reshuffles per session. To enumerate the full catalog, walk all 4 `page_num` values; expect overlap. The published total is ~30+ properties but a single 4-page walk may surface ~20-25 unique pids due to shuffle collisions. If completeness matters, repeat the 4-page walk 2-3 times and union the pid sets.
- **`page_num` only works on `/DesktopDefault.aspx?PageID=11977`.** On the dated `/site/SearchResults/default.aspx` path, `?page_num=N` is silently ignored — the pager UI shows "Page 1 of 4" for every request because pagination state lives in `__VIEWSTATE` (POST-only). If you want paginated dated-search results from the browser-fallback path, you must POST with the rotating ViewState — not worth it; just paginate the catalog endpoint and filter availability per-unit.
- **`/Booking/RateDetails/{pid}` redirects on unavailability.** A `302` with `Location: http://booksearanchescape.escapia.com/Error/UnitUnavailable` is the canonical "no" signal. Do NOT follow the redirect (`--allow-redirects` off — Browserbase Fetch defaults to off, which is what you want). If your client follows the redirect blindly, you'll get the error page HTML and have to detect failure by string-match on "UnitUnavailable" — slower and noisier.
- **Date format is US `MM/DD/YYYY`.** ISO 8601 (`2026-12-24`) on the Availability or RateDetails endpoints returns 500 with `parameters dictionary contains a null entry for parameter 'startDate'`. The error page leaks the controller signature (`Escapia.Portal.Controllers.UnitController.Availability(Int32, DateTime, DateTime)`) — useful debug breadcrumb if the path ever changes.
- **`M: 255` in the Availability JSON is a sentinel, not a real min-stay.** It appears on every `U` (unavailable) day and on days that fall outside the bookable window. Treat any `M >= 90` as "ignore min-stay; use the `S` flag alone."
- **`Bedrooms: -` in the catalog `<li>` renders as `0` or an em-dash in metadata.** Some studio/loft units list a dash. Parse defensively: if the bedroom value is non-numeric, fall back to the detail page's `unitAmenities` table where "Property Type" usually includes the property classification ("Studio", "Loft", etc.).
- **All photo URLs are protocol-relative (`//pictures.escapia.com/...`).** Prefix with `https:` before storing or rendering.
- **The portal-alias subdomain matters.** `booksearanchescape.escapia.com` is the canonical host; the parent `www.searanchescape.com` is a separate marketing site that redirects/proxies into the same Escapia portal but with different markup. Always use the `*.escapia.com` host for the endpoints in this skill.
- **Read-only stop point.** The booking flow continues at `/Booking/RateDetails/{pid}` → `/Booking/Details` → `/Booking/Payment`. **Do not POST or click past RateDetails** — that creates a tentative reservation in the manager's system.

## Expected Output

The skill returns one of three shapes depending on input.

### Shape A — Listing query (no dates)

User asked "what houses does Sea Ranch Escape have?" — no date constraint, just discovery.

```json
{
  "success": true,
  "query": {
    "type": "catalog"
  },
  "results": [
    {
      "pid": "38550",
      "name": "Masthead Dunes (TOT ID #2162)",
      "url": "https://booksearanchescape.escapia.com/Unit/Details/38550",
      "price_summary": "Starts @ 3 Nights $2075/ Weekly $3903",
      "bedrooms": 4,
      "bathrooms": 2.0,
      "sleeps": 8,
      "pets": "None",
      "guest_rating": 5,
      "image_url": "https://pictures.escapia.com/SEARES/38550/9883760465.jpg",
      "description": "Unit 28 Lot 96. Exquisite new home located within minutes to tide pools and Walk On Beach…"
    }
  ],
  "total_results": 24,
  "total_pages_walked": 4,
  "note": "Catalog ordering is randomized per request; repeat the page walk to union additional unit IDs."
}
```

### Shape B — Dated availability query

User asked "what's available July 4–7 2026 for 4 adults, dog-friendly?".

```json
{
  "success": true,
  "query": {
    "type": "availability",
    "arrive": "07/04/2026",
    "depart": "07/07/2026",
    "adults": 4,
    "children": 0,
    "pets_required": "Dogs"
  },
  "results": [
    {
      "pid": "116598",
      "name": "Alta Pacifica (TOT #2927N)",
      "url": "https://booksearanchescape.escapia.com/Unit/Details/116598",
      "bedrooms": 3,
      "bathrooms": 3.0,
      "sleeps": 6,
      "pets": "Dogs",
      "available": true,
      "min_stay_nights": 3,
      "total_price_usd": 1247.55,
      "nights": 3,
      "rate_details_url": "https://booksearanchescape.escapia.com/Booking/RateDetails/116598?arrive=07/04/2026&depart=07/07/2026&adults=4&children=0"
    }
  ],
  "candidates_screened": 24,
  "available_count": 1
}
```

### Shape C — No-match outcome

User asked for an impossible/unavailable combination.

```json
{
  "success": true,
  "query": {
    "type": "availability",
    "arrive": "12/24/2026",
    "depart": "12/28/2026",
    "adults": 2,
    "children": 0
  },
  "results": [],
  "candidates_screened": 24,
  "available_count": 0,
  "reason": "all_unavailable",
  "note": "Christmas week — every screened unit returned 302 → /Error/UnitUnavailable from RateDetails, or had U (Unavailable) days in the requested span."
}
```

### Shape D — Unit-detail enrichment (optional)

If the caller requests rich amenities for a returned `pid`, add this object alongside the listing entry:

```json
{
  "pid": "38550",
  "detail": {
    "long_description": "Unit 28 Lot 96 Ocean Front / HIGHLIGHTS: Hot tub with some views, internet access, gas fireplace, gas BBQ, easy walk to Walk On Beach, children welcome. FLOOR PLAN: Open kitchen, dining and living room…",
    "amenities": {
      "Property Type": "House, 1 story, Built in 2009",
      "Unit Code": "MAST",
      "Beds": "1 king bed, 2 queen beds, 2 twin beds",
      "Bathrooms": "2 bathrooms",
      "Rooms": "Sleeps 8",
      "Pets": "No pets allowed.",
      "Living": "Forced Air Heat, Gas Fireplace, Washer & Dryer, Wireless Internet",
      "Kitchen": "Coffee Maker, Cookware, Dishwasher, Full Kitchen, Gas Oven and Stovetop, Ice Maker, Microwave, Refrigerator, Toaster, Washer/Dryer, Coffee Grinder, Blender",
      "Entertainment": "CD Player, DVD Player, i Pod Dock, Satellite TV, Stereo System, Wireless Internet",
      "Outdoor": "Deck, Gas Grill, Hot Tub",
      "Geographic": "Close to Town, Near Beach",
      "Convenience": "Area FitnessCenter, Golf Course, Nearby Grocery, Nearby Medical Services",
      "Children": "Children allowed"
    },
    "reviews": {
      "manager_count": 6682,
      "unit_count": 100,
      "would_recommend_pct": 99
    },
    "photos": [
      "https://pictures.escapia.com/SEARES/38550/9883760465.jpg",
      "https://pictures.escapia.com/SEARES/38550/6379990312.jpg"
    ]
  }
}
```
