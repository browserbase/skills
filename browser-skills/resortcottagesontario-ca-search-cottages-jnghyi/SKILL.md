---
name: resortcottagesontario-ca-search-cottages-jnghyi
title: Resort Cottages Ontario — Search Cottages
description: >-
  Search resortcottagesontario.ca for resort-cottage rentals: returns Mildred's
  Lakefront Resort Cottage (the site's single Kawarthas / Rice Lake / Bellmere
  Winds property) with date-specific availability via the on-site MotoPress
  booking form for 2027+ dates, or a Great Blue Cottage Rentals deeplink for
  2026 dates. Read-only — never clicks Confirm Reservation.
website: resortcottagesontario.ca
category: lodging
tags:
  - lodging
  - cottage-rental
  - ontario
  - kawarthas
  - motopress
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      /llms.txt is a 2.3 KB plain-text dump that covers all static cottage
      metadata (name, address, bedrooms, sleeps, base rate, amenities, contact,
      brand disambiguation) in one cheap GET — use this exclusively when the
      caller only needs property info, not a date-specific verdict.
  - method: browser
    rationale: >-
      The MPHB form on /book/ is the only public surface for date-specific
      availability for 2027+ dates; WP REST endpoints under /wp-json/mphb/v1/*
      are admin-locked (401) and the public admin-ajax.php nonce only survives
      inside a warm browser session.
  - method: url-param
    rationale: >-
      For 2026 dates, construct a pre-filled greatbluecottagerentals.com
      deeplink (resort_id=102, grade=PNTDR075, post_id=15393 are stable
      Mildred's identifiers on GBCR); the actual availability lookup happens on
      that separate domain and belongs to a sibling skill.
  - method: api
    rationale: >-
      Confirmed not available — /wp-json/mphb/v1/accommodation_types and
      /wp-json/mphb/v1/bookings/availability both return
      {"code":"mphb_rest_cannot_view","data":{"status":401}} unauthenticated.
      Don't waste iterations probing these.
verified: false
proxies: false
---
# Resort Cottages Ontario — Search Cottages

## Purpose

Return resort-cottage rental information from `resortcottagesontario.ca` for a given date range. Today the domain advertises a single property — **Mildred's Lakefront Resort Cottage** at Bellmere Winds Golf Resort on Rice Lake in the Kawarthas, Ontario — so "search" reduces to "return the cottage's static metadata plus an availability verdict for the requested dates." The skill is written so it generalises if more listings are added later. **Read-only — never click `Confirm Reservation` and never submit `mphb_is_direct_booking=1`.**

## When to Use

- A traveller asks "are there any resort cottages available in Ontario the weekend of <date>?" and you need to verify Mildred's specifically.
- An agent needs static cottage metadata (sleeps, bedrooms, amenities, address, base rate) without paying for a full browser session.
- A planning agent comparing waterfront rentals near Toronto in the Kawarthas / Rice Lake area.
- A brand-disambiguation step — confirm the user means *Resort Cottages Ontario* (this site, plural) and not *resortcottages.ca* (a separate real-estate business).

## Workflow

Hybrid path: an authoritative LLM-friendly text dump (`/llms.txt`) covers all static metadata in one cheap fetch, and the on-site MotoPress Hotel Booking (MPHB) form on `/book/` is the only public way to check date-specific availability. The internal WordPress REST endpoints at `/wp-json/mphb/v1/*` are admin-locked (`{"code":"mphb_rest_cannot_view", "data":{"status":401}}` for `accommodation_types`, `bookings/availability`, etc.), and the public AJAX endpoint at `/wp-admin/admin-ajax.php` requires a per-page-load nonce — so there is no usable cookieless API for availability. Use the steps below in order; skip step 3 entirely if the caller only needs static metadata.

1. **Static property metadata — single GET, no JS, no session.** Fetch `https://resortcottagesontario.ca/llms.txt` (≈2.3 KB plain text). Parse the markdown-style sections to extract: property name, address, bedrooms / sleeps / sqft, base nightly rate, resort amenities, check-in / check-out times, phone, email, brand-disambiguation notes, and the canonical URLs for About / FAQ / Book pages. **Always treat the `llms.txt` base rate as the lower bound — it can lag the actual rate on `/book/`** (see Gotchas).

2. **Decide which booking era applies.** The site splits the calendar between two backends, gated by year:
   - **2026 (current season):** "Mildred's 2026 availability is managed through Great Blue Cottage Rentals (GBCR). Direct online booking coming in 2027." For 2026 dates, hand off to GBCR — see step 3a.
   - **2027 and later:** Direct on-site booking via the MPHB plugin form. Use step 3b.
   - The form on `/book/` is labelled "Check Mildred's Lakefront Resort Cottage 2027 Availability" and its hidden attribute `data-first_available_check_in_date="2026-10-12"` is the earliest selectable check-in (the tail of 2026 has spilled into the MPHB form because the property opened the calendar early — confirmed by typing `15/10/2026` into the check-in field: it accepts).

3a. **2026 dates — GBCR deeplink path (browser optional).** On the `/book/` page the "Check 2026 Availability →" anchor (text on the page; href is the one shown below) is a fully-formed deeplink to the GBCR property summary page. The reference href as of 2026-05-19 is:
   ```
   https://greatbluecottagerentals.com/summary/?setselection=1
     &search_region=The+Kawarthas
     &search_resort=BELLMERE
     &resort_id=102
     &post_id=15393
     &grade=PNTDR075
     &search_check_date_in=Aug+12%2C+2026   ← change to target check-in (format: "MMM+D%2C+YYYY")
     &no_of_nights=5                          ← change to nights between dates
     &guests=1&search_no_of_adults=1&search_no_of_children=0&search_no_of_pets=0
     &price=1850.00                           ← sample only; GBCR recalculates on landing
     &unit_pet_friendly=on&unit_sunroom=on&unit_waterfront=on&unit_near_pool=on&unit_near_beach=on
   ```
   The `resort_id=102`, `grade=PNTDR075`, and `post_id=15393` IDs are the **stable identifiers for Mildred's on the GBCR backend** — do not change them. The skill stops here for 2026 queries: emit the constructed URL and tell the caller that **the actual availability/pricing lookup happens on greatbluecottagerentals.com, which is a separate domain and out of scope for this skill** (a sibling skill `greatbluecottagerentals.com/<task>` should drive that side).

3b. **2027+ dates — MPHB form on `/book/` (browser required).** Open a bare Browserbase session (`browse cloud sessions create --keep-alive` — no `--verified`, no `--proxies`; site has no anti-bot beyond Cloudflare bot-management headers). Navigate to `https://resortcottagesontario.ca/book/`, then:
   1. `browse snapshot` and locate `textbox: Check-in Date *` and `textbox: Check-out Date *`.
   2. `browse click <check-in-ref>`; **`browse type "DD/MM/YYYY"`** (note: site is configured `dateFormat: "dd/mm/yyyy"`, not US `mm/dd`); `browse press Escape` to dismiss the kbwood datepicker.
   3. Same for check-out.
   4. `browse click <Check Availability button-ref>` (label text: `CHECK AVAILABILITY`). The form refreshes in place — no page navigation.
   5. `browse wait timeout 2000`, then `browse snapshot` and read the new status paragraph. Three branches (verified 2026-05-19):
      - **Available**: `"Mildred's Lakefront 3 Bedroom Resort Cottage is available for selected dates."` followed by a `button: Confirm Reservation`. **STOP — do not click Confirm Reservation.**
      - **Unavailable / dates not bookable**: `"Nothing found. Please try again with different search parameters."` (verified by submitting `06/10/2027 → 08/10/2027`, dates not surfaced as `link:` cells in the datepicker).
      - **Invalid dates** (e.g. check-out ≤ check-in, or below min-stay): inline error per `MPHB.translations` — `"Check-in date is not valid."`, `"Check-out date is not valid."`, `"Less than min days stay"`, `"More than max days stay"`, `"Later than max date for current check-in date"`. Capture verbatim.
   6. **The form does NOT print a date-specific subtotal**, only the property-card price (`Prices start at: $375 per night (+taxes and fees)`). Nightly subtotal must be computed client-side as `nights * 375` or left null and flagged `pricing_source: "property_card_starting_rate"`.
   7. Release: `browse cloud sessions update <sid> --status REQUEST_RELEASE`.

4. **Compose the response** matching the Expected Output schema. Include the GBCR handoff URL when the query year is 2026, the MPHB on-site verdict when the year is 2027+, and the union of metadata from `/llms.txt` + the `/book/` property card.

## Site-Specific Gotchas

- **Single-property site.** Despite the plural brand "Resort Cottages Ontario", as of 2026-05-19 the domain markets exactly one property (Mildred's Lakefront Resort Cottage). Future iterations may add more — re-verify by counting `article.mphb-room-type` cards on `/book/`.
- **Two booking backends, gated by year.** 2026 dates → GBCR (external, `greatbluecottagerentals.com`); 2027+ → MPHB on-site form. The earliest MPHB check-in is `data-first_available_check_in_date="2026-10-12"` — late-2026 dates after the GBCR season-close also work on the MPHB form. Always check the year first and route appropriately.
- **Date format is `dd/mm/yyyy`, not US `mm/dd/yyyy`.** Set per `MPHB._data.settings.dateFormat: "dd/mm/yyyy"` (the `<abbr title="Formatted as dd/mm/yyyy">*</abbr>` next to each label is the on-page hint). Internal transfer format is `yyyy-mm-dd` (`dateTransferFormat`), used in the hidden `mphb_check_in_date` / `mphb_check_out_date` inputs.
- **kbwood datepicker only shows `link:` cells for check-in–eligible days.** Days rendered as plain `cell:` (no nested `link:` ref) are blocked by booking rules (already booked, not a valid check-in day, below min-stay, etc.). You can still *type* any date into the textbox — but if the date is rule-blocked, the form returns "Nothing found" after submission. To pre-validate, count linked cells in the rendered calendar before typing.
- **Form refreshes in place — same URL, no navigation event.** `browse get url` will still return `/book/` after clicking `CHECK AVAILABILITY`. Branch on the snapshot's status paragraph, not on URL changes. The non-deterministic ref IDs (e.g. `[1-575]`, `[1-578]` after submission) mean you must re-snapshot, not cache.
- **`/llms.txt` price is stale.** The text says `"Starting from CAD $254/night"` but the rendered `/book/` property card shows `"$375 per night (+taxes and fees)"` as of 2026-05-19. Always prefer the on-page card price over `/llms.txt`; treat `llms.txt` rate as a lower-bound historical hint only.
- **WP REST is admin-only.** `https://resortcottagesontario.ca/wp-json/mphb/v1/accommodation_types` and `…/bookings/availability` both return `{"code":"mphb_rest_cannot_view","data":{"status":401}}` for unauthenticated callers. Don't waste time probing — the only public surface is the browser form. (The `/wp-json/mphb/v1` index itself *is* readable and lists routes, but every collection requires `view`/`edit` scope.)
- **`admin-ajax.php` actions need a per-page nonce.** `MPHB._data.nonces.mphb_get_room_type_availability_data` is regenerated per page render and won't survive a cookieless POST from outside a warm session. If you do want to skip the form click, you can scrape the nonce from the rendered HTML and POST `action=mphb_get_room_type_availability_data&nonce=<x>&room_type_id=195` with the page's cookie jar — but the form-click path is simpler and equally cheap.
- **Confirm Reservation is the booking trigger.** Clicking the `Confirm Reservation` button initiates a real booking flow (form action: `https://resortcottagesontario.ca/booking-confirmation/`, hidden `mphb_is_direct_booking=1`). The skill must stop one click earlier.
- **GBCR sample URL contains a sample `price=1850.00` and `search_check_date_in=Aug+12%2C+2026`.** Those are placeholder values from the static href on `/book/`; GBCR recalculates price server-side on landing. Override `search_check_date_in` and `no_of_nights` with the caller's values; you can leave `price` alone or drop it.
- **Brand disambiguation.** Per `/llms.txt`: *"Resort Cottages Ontario" (plural) is the brand/domain name; "resort cottage ontario" (singular) is the search category this property belongs to. This property is not affiliated with resortcottages.ca (a separate real-estate business).* If a query is ambiguous, prefer this site only when the user clearly wants a *rental* (not real-estate listings).
- **No anti-bot beyond Cloudflare bot-management cookies.** Bare Browserbase session works first try; `--verified` and `--proxies` are unnecessary and add cost. The site sets `__cf_bm` and `_cfuvid` cookies but does not challenge automated clients on `/book/`.
- **Timezone is America/Toronto (EDT/EST).** All "today" comparisons in the form (`MPHB._data.today`) use server-local time, not UTC. A 2026-05-19 09:00Z run still saw `"today": "2026-05-18"` because Toronto was still the 18th.
- **Form id `booking-form-195` and `mphb_room_type_id=195` are stable per-property IDs.** Don't reuse them across other MPHB installs; they are local WordPress post IDs.

## Expected Output

The skill emits one of three branches depending on the requested date range. JSON shapes (verified 2026-05-19):

```json
// Branch A — 2027+ dates, MPHB on-site form returned an availability verdict
{
  "success": true,
  "site": "resortcottagesontario.ca",
  "query": { "check_in": "2027-10-15", "check_out": "2027-10-18", "nights": 3, "guests": 2 },
  "listings": [
    {
      "name": "Mildred's Lakefront Resort Cottage",
      "resort": "Bellmere Winds Golf Resort",
      "region": "Kawarthas",
      "lake": "Rice Lake",
      "address": "1235 Villiers Line - Site 75, The Point Drive, Keene, ON K0L 2G0",
      "bedrooms": 3,
      "sleeps": 6,
      "size_sqft": 600,
      "view": "Waterfront",
      "amenities": ["air-conditioning", "free wi-fi", "pet-friendly", "Smart TV"],
      "category": "resort cottage",
      "starting_nightly_rate_cad": 375,
      "currency": "CAD",
      "pricing_source": "property_card_starting_rate",
      "subtotal_cad_estimate": 1125,
      "first_available_check_in_date": "2026-10-12",
      "availability": {
        "status": "available",
        "message": "Mildred's Lakefront 3 Bedroom Resort Cottage is available for selected dates.",
        "next_step": "Confirm Reservation (NOT clicked by this read-only skill)"
      },
      "booking_url": "https://resortcottagesontario.ca/book/",
      "phone": "+1 (647) 287-9978",
      "email": "mildredslakefront@resortcottagesontario.ca"
    }
  ]
}

// Branch B — 2027+ dates, but dates blocked by booking rules
{
  "success": true,
  "site": "resortcottagesontario.ca",
  "query": { "check_in": "2027-10-06", "check_out": "2027-10-08", "nights": 2, "guests": 2 },
  "listings": [
    {
      "name": "Mildred's Lakefront Resort Cottage",
      "availability": {
        "status": "unavailable",
        "message": "Nothing found. Please try again with different search parameters.",
        "reason_hint": "Dates fall outside check-in eligibility or below min-stay; non-linked datepicker cells indicate blocked days."
      },
      "booking_url": "https://resortcottagesontario.ca/book/"
    }
  ]
}

// Branch C — 2026 dates, on-site form does not apply; hand off to GBCR
{
  "success": true,
  "site": "resortcottagesontario.ca",
  "query": { "check_in": "2026-08-12", "check_out": "2026-08-17", "nights": 5, "guests": 2 },
  "listings": [
    {
      "name": "Mildred's Lakefront Resort Cottage",
      "resort": "Bellmere Winds Golf Resort",
      "starting_nightly_rate_cad": 375,
      "currency": "CAD",
      "availability": {
        "status": "delegated",
        "delegate_backend": "greatbluecottagerentals.com",
        "delegate_url": "https://greatbluecottagerentals.com/summary/?setselection=1&search_region=The+Kawarthas&search_resort=BELLMERE&resort_id=102&post_id=15393&grade=PNTDR075&search_check_date_in=Aug+12%2C+2026&no_of_nights=5&guests=2&search_no_of_adults=2&search_no_of_children=0&search_no_of_pets=0&unit_pet_friendly=on&unit_sunroom=on&unit_waterfront=on&unit_near_pool=on&unit_near_beach=on",
        "message": "Mildred's 2026 availability is managed through Great Blue Cottage Rentals (GBCR). Use the delegate_url to complete the date-specific lookup on greatbluecottagerentals.com — that domain is a separate skill scope."
      },
      "booking_url": "https://resortcottagesontario.ca/book/"
    }
  ]
}

// Branch D — failure (network, page changed, etc.)
{
  "success": false,
  "error_reasoning": "Verbatim message or short description of what blocked the skill.",
  "site": "resortcottagesontario.ca"
}
```
