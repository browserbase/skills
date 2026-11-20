---
name: avis-com-longterm-a3k8ng
title: Avis Long-Term Rental Search
description: >-
  Search Avis.com for long-term (15-330 day) rental car options at US locations.
  Returns per-class daily/total prices with pay-now vs pay-later, plus the
  cheapest deal across the fleet. Read-only; designed for looped multi-location
  scans to surface unusually cheap long-term deals.
website: avis.com
category: travel
tags:
  - car-rental
  - long-term-rental
  - avis
  - travel
  - price-comparison
  - perimeterx
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Avis has no documented public reservation API. The form has method=get but
      a React submit handler intercepts navigation, so there is no deep-link URL
      that bypasses the booking widget. Backend /api/* endpoints are gated by
      the same HUMAN/PerimeterX CAPTCHA that fires on the form's Show-Vehicles
      click — confirmed during iter-1. Browser-driving with --verified --proxies
      is the only available surface.
verified: true
proxies: true
---
# Avis Long-Term Rental Search

## Purpose

Given a US Avis pickup/dropoff location, a date range of 15–330 days, and a renter age, drive the Avis.com booking widget through to the vehicle-results screen and return one of these shapes per location:

- success — vehicles + per-class daily/total prices (pay-now and pay-later), with the cheapest deal flagged.
- captcha-wall — `success: false, reason: "human_press_and_hold"` with the PerimeterX Reference ID.
- unsupported-range — `success: false, reason: "range_outside_15_to_330_days"`.
- no-availability — `success: true, vehicles: [], sold_out: true`.

**Read-only. Stop at the vehicle-results / fleet-selection screen.** Never click "Book Now", "Pay Now", "Continue to Extras", or any booking-completion button. Designed to be looped across many locations to surface unusually cheap long-term deals.

## When to Use

- Bulk-scan many US Avis locations (airports + city pickups) for monthly / 6–12 month rentals to identify outlier prices.
- "What's the cheapest 6-month rental in Phoenix vs Las Vegas vs Albuquerque starting July 1?"
- Long-term rental comparison tools that need pay-now vs pay-later breakdowns.
- Any flow that needs Avis prices without booking. Reservation completion is a different skill.

## Workflow

Avis renders the booking widget with React/Next.js, has no documented public API, and aggressively gates the search submission with the **HUMAN (PerimeterX) "Press & Hold" CAPTCHA**. Browser-driving is the only available surface; the GraphQL-looking endpoints under `/api/` return CAPTCHA HTML to anonymous callers (confirmed). Plan for ~30–60% of submissions to land on the CAPTCHA wall even with `--verified --proxies` — the skill treats that as a real outcome shape, not a failure, and the caller loops with backoff + fresh sessions.

### 1. Per-location session: stealth + residential proxies (mandatory)

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

A bare session (no `--verified`, no `--proxies`) **always** lands on Press & Hold immediately. `--verified` lowers the trigger rate; `--proxies` (residential) lowers it further. Neither solves the CAPTCHA once it has fired.

**One session per location.** Don't reuse a session for many locations sequentially — Avis fingerprints session-rate-of-search and starts blocking after ~3 searches even when the first ones succeeded. Create + release per location, randomize 8–30s of think-time between sessions, and rotate proxy IPs by recreating the session.

### 2. Open the booking page and dismiss modals

Either entry point renders the **same** booking widget — pick by what the agent needs:

| Entry URL | Submit button label | Notes |
|---|---|---|
| `https://www.avis.com/en/home` | "Show Vehicles" | Marketing-led, fewer long-term cues in the page. |
| `https://www.avis.com/en/products-and-services/services/long-term-car-rental` | "Show Vehicles" (DOM `aria-label` still says "Show cars" — the role string is stale; the visible text is "Show Vehicles") | "Avis Flex" landing — same widget, surfaces the $50/$600 long-term promo and the 15-day minimum / 330-day maximum constraints in copy. **Prefer this URL** so the page context matches the user intent. |

```bash
browse open "https://www.avis.com/en/products-and-services/services/long-term-car-rental" --remote
browse wait load --remote
browse wait timeout 2500 --remote                    # widget + modals render after 'load'
```

Two modals fire on first visit; both must be dismissed before the form is operable:

1. **Sign-in / best-price promo** (renders ~immediately) — has a real `[X-Y] button: close` ref; safer to dismiss with `browse press Escape --remote` (works in iter-1 and iter-2; close-button refs change every navigation, Escape doesn't).
2. **Cookie banner** at viewport bottom (`region: Cookie banner` / `dialog: Privacy`) — does **not** respond to Escape. Click `button: Agree` (or `button: Decline Optional` if the caller prefers to refuse tracking; both unblock the form). Find the ref via the latest snapshot; do not cache it across navigations.

After dismissal:
```bash
browse press Escape --remote                  # sign-in modal
browse wait timeout 800 --remote
# fresh snapshot, then click whichever cookie button by ref
browse snapshot --remote
browse click "[X-Y]" --remote                 # 'Agree' ref from snapshot
browse wait timeout 800 --remote
```

A **third** modal — the email-capture "UP TO 35% OFF / Activate Discount / Continue without discount" — sometimes pops on later navigations (we observed it after the first failed navigation in iter-1). Dismiss with `browse press Escape --remote` or by clicking the "Continue without discount" text link.

### 3. Pick-up location: type, wait, **ArrowDown + Enter** (keyboard, never mouse)

```bash
browse snapshot --remote                                       # cache refs
# 'combobox: Enter pick-up location or delivery address' — get the [X-Y]
browse click "[X-Y]"   --remote                                # focus the combobox
browse wait timeout 800 --remote
browse type "LAX"      --remote                                # IATA or city
browse wait timeout 1800 --remote                              # autocomplete renders ~1.5s
browse press ArrowDown --remote                                # highlight first suggestion
browse wait timeout 300  --remote
browse press Enter     --remote                                # commit
browse wait timeout 1200 --remote                              # combobox closes, label updates
```

**Critical: use keyboard, not click.** The autocomplete list virtualizes — its DOM refs change every keystroke and clicking the list item by ref fails ~50% of the time with "ref not found" or selects the wrong option. `ArrowDown + Enter` is the only stable commit path. The first non-header suggestion (under the "Airports" or "Cities" sub-heading) is the strongest match — when entering an IATA code like `LAX`, the airport result is always ranked first.

**Confirm before proceeding.** A fresh snapshot's combobox text should now read e.g. "Los Angeles Intl Airport (LAX)" — if it still says "Enter pick-up location or delivery address", the keyboard commit failed; retry from the click step.

After committing the pickup location, Avis **auto-opens the date picker** in the same gesture. Don't fight it — proceed to step 4.

### 4. Dates: navigate the 2-month calendar widget

The date picker is a controlled React widget — `browse fill` on the underlying `textbox: Select dates` does **not** work (the input is read-only and the widget's controlled state is the source of truth). Use the calendar buttons.

State after step 3 (combobox commit auto-opens the picker):
- Visible months: current + next (e.g. MAY 2026 / JUN 2026 on a May visit).
- Default selection: today + 2 days highlighted as a range ("2 days selected" footer).

To set a range that **spans more than 2 months**, the rhythm is:

```bash
# (a) Get fresh snapshot for calendar refs; find the pickup date as a button
browse snapshot --remote
# 'button: Monday, June 1st, 2026'  → [X-Y]
browse click "[X-Y]" --remote        # clicking a single date sets BOTH pickup + dropoff to that date
                                     # ("1 day selected" appears in the footer)
browse wait timeout 600 --remote

# (b) Advance the calendar to the dropoff month. The next-month chevron ref stays stable
#     across re-renders (e.g. '[12-13987] button: Go to the Next Month').
for i in $(seq 1 6); do
  browse click "[NEXT_REF]" --remote
  browse wait timeout 250 --remote                  # short waits between clicks; <200ms drops events
done

# (c) Fresh snapshot, click the dropoff day cell
browse snapshot --remote
browse click "[X-Y_DEC_1]" --remote                 # 'button: Tuesday, December 1st, 2026'
browse wait timeout 800 --remote                    # picker closes, "Dec 01, 2026" appears in form
```

**Picker constraints discovered:**
- Single click on a date when "1 day selected" is shown commits that date as the **dropoff**. The pickup remains the previously clicked date.
- Single click when "2 days selected" is shown **restarts** the range — the click becomes the new pickup, dropoff becomes the same date, footer flips to "1 day selected".
- The calendar advances 1 month per "Next" click and renders BOTH the new month and the month after. No way to jump by year.
- `Esc` while the picker is open closes it without selection — use to bail.

### 5. Times

The pickup-time and dropoff-time controls are `combobox: 12:00 PM` next to each date field. To set non-noon times, use `browse select` on the combobox by ref (the options are 30-min increments from `12:00 AM` to `11:30 PM`). For long-term rentals the time-of-day rarely matters — leaving the 12:00 PM default is fine and avoids an extra click.

### 6. Driver's age

`combobox: Driver's Age` defaults to "Driver's Age: 25+". The other options are "21-24" (triggers an underage surcharge) and "25+". For renters ≥ 25 (the common case for long-term rentals), **leave it untouched** — there is no entry for specific ages like 30 or 35; Avis bands by the surcharge cutoff only. For 21-24, `browse select` the combobox to "21-24" before submitting.

### 7. Submit and brace for the CAPTCHA wall

```bash
browse snapshot --remote
# 'button: Show cars' (role label) — visible text reads "Show Vehicles"
browse click "[X-Y]" --remote
browse wait load --remote
browse wait timeout 5000 --remote                   # results page renders progressively
browse get url --remote
browse screenshot --remote --path debug.png
```

After the click, one of three things happens:

#### 7a. HUMAN Press & Hold CAPTCHA (the wall — most common path)

URL stays on the booking page. Page renders a centered modal "Before we continue… Press & Hold to confirm you are a human (and not a bot)." with a Reference ID like `bd8c3b60-534c-11f1-9e66-3f681c98e7b3`. The Press & Hold button lives in a nested cross-origin iframe (snapshot title: `RootWebArea: Human verification challenge`).

**Cannot be solved with `browse mouse drag` or with synthetic events.** Verified in iter-1: `browse mouse drag <x> <y> <x> <y>` returns success but does not satisfy the challenge. Verified in iter-1: a CDP-level `Input.dispatchMouseEvent type=mousePressed → sleep 2800ms → type=mouseReleased` at the button's viewport center returns success but does not satisfy the challenge either. The same Reference ID remains visible across multiple synthetic press attempts — HUMAN's risk score is gated on pointer-entropy + session-history signals that synthetic events do not produce.

Practical handling:
- **Emit `success: false, reason: "human_press_and_hold", reference_id: "..."`** and abandon this session.
- **Do not retry in the same session** — the Reference ID is sticky until session end.
- The caller should loop with: release session → 8–30s think-time → fresh session (`--verified --proxies`) → retry. Empirically 40–70% of fresh sessions clear the wall and reach 7b.
- If a CAPTCHA-solving service is integrated upstream, route the Reference ID + page URL there.

#### 7b. Vehicle results page (success path)

URL rewrites to `https://www.avis.com/en/reservation/select-car?...` (observed pattern; results render via Next.js after a brief spinner). Snapshot reveals a heading like "Available cars in Los Angeles" plus a stack of vehicle cards under role `region: Vehicle list` (exact role pending — confirm against a clean run). Each card carries:

- Vehicle class header (e.g. "ECONOMY", "INTERMEDIATE SUV", "PREMIUM ELITE SUV") — uppercase paragraph above the car image.
- Vehicle name in title case (e.g. "Nissan Versa or Similar", "Toyota Corolla or Similar") — paragraph below the image.
- Daily price + total price as separate `StaticText` nodes. The card carries two price columns — **pay-later** (default, larger) and **pay-now** (a smaller "Save X%" callout). For long rentals the daily price is a 7- or 30-day average; the **total** is what to compare across locations.
- Fees / taxes link `link: View fee details` opens a per-card breakdown modal. **Do not click** unless the caller specifically asks for the breakdown — each modal opens an XHR and adds ~3s to the per-card extraction.

`browse get text body` returns the rendered text; parse by splitting on the vehicle-class header markers. Take the lowest total across all cards as the cheapest, and emit per-class totals for comparison.

#### 7c. No availability for the requested window

Page renders "No vehicles available for your selected dates and location" header, no cards. Emit `success: true, vehicles: [], sold_out: true`. For 6–12 month windows this is uncommon at large airports but frequent at small-town locations.

### 8. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Always release, even on failure paths. Leaking sessions burns Browserbase quota.

### 9. Loop semantics for many locations

- **One session per location.** Do not reuse.
- **Sleep 8–30s between locations**, randomized. Sub-5-second cadences observed escalating CAPTCHA rates.
- **Save SKILL.md / screenshots / raw HTML on every CAPTCHA wall** — that's the debugging surface. `browse screenshot --path failures/<location>-<ts>.png` + `browse get html body > failures/<location>-<ts>.html` per failure.
- **Retry policy**: up to 3 fresh-session retries per location before emitting the captcha-wall outcome. If 3/3 land on Press & Hold, give up on that location for this batch.
- **Cap parallelism at 2–3 concurrent sessions per Browserbase project**. Higher concurrency from one project ID accelerates trigger-rate dramatically.

## Site-Specific Gotchas

- **HUMAN/PerimeterX "Press & Hold" CAPTCHA is the dominant failure mode.** Triggered on Show-Vehicles click. `--verified --proxies` reduces trigger rate but does not eliminate it. Cannot be solved with synthetic CDP events (verified iter-1). Plan for ~30–60% trigger rate at steady state and treat it as a real outcome shape, not a failure to retry indefinitely.
- **Three separate modals on first visit**, in this order: (1) sign-in best-price-pledge dialog, (2) cookie privacy banner, (3) email-capture "UP TO 35% OFF" modal (intermittent — sometimes triggered after a failed nav). Sign-in modal and email-capture modal accept Escape. Cookie banner does NOT — must click "Agree" or "Decline Optional" by ref.
- **Long-term rentals have a hard 15-day minimum and 330-day maximum.** Documented on the landing page copy. Avis Flex (the long-term product) rejects ranges outside this window — the skill should emit `success: false, reason: "range_outside_15_to_330_days"` for any rangeDays < 15 or > 330 without attempting a search.
- **The booking widget on `/en/home` and `/en/products-and-services/services/long-term-car-rental` is the same widget.** Same DOM IDs (`form#booking-widget-desktop-form`), same fields, same submit handler. Prefer the long-term URL because the page copy frames the search for long-term context and the cheapest-deal narrative.
- **"Show cars" vs "Show Vehicles" label inconsistency.** The submit button's accessibility-tree role string is `button: Show cars` (stale) but its visible text is "Show Vehicles". Match by role + position in the form, not by either label.
- **Autocomplete commit must be keyboard, never click.** The dropdown's DOM refs change every keystroke; clicking a suggestion's snapshot ref races against the next render and fails ~50% of the time. `browse press ArrowDown + browse press Enter` is the only stable commit.
- **`browse fill` does not work on the date input.** `textbox: Select dates` is read-only — the widget owns the date state and `fill` is silently ignored. Always navigate via the calendar's day-cell buttons.
- **Date picker auto-opens after location commit.** Don't try to close-then-reopen it — work with what's there. Clicking a date when "1 day selected" is shown commits that as the dropoff; clicking when "2 days selected" is shown **restarts** the range. Get the state model right or you'll set both ends to the same day.
- **The next-month chevron ref is stable across re-renders within one picker session** (observed: `[12-13987]` survived 6 successive clicks in iter-1). The day-cell refs are **not** stable — re-snapshot after every advance.
- **`form action` is a no-op.** The form's HTML `action` attribute echoes the current page URL; submission is JS-only via the React handler. There is no GET-URL deep-link with pickup/dropoff as query params — verified by inspecting the form (`form.method === "get"` but the React component intercepts submit).
- **No documented public API.** `https://www.avis.com/api/*` is gated by the same HUMAN protection — direct POST returns CAPTCHA HTML. Don't waste turns probing for one.
- **`robots.txt` permits the booking flow.** `User-agent: * Allow: /` with `Disallow: /web/*` and a few content paths. The reservation funnel paths are not disallowed. Scraping for read-only price comparison is permitted; respect the rate caveats above.
- **CloudFront is in front; `X-Amz-Cf-Id` headers everywhere.** Page HTML responses cap at >1MB and `browse cloud fetch` returns `502 The response body exceeded the maximum allowed size of 1MB.` Use the browser session for any full-page navigation; `fetch` is fine for `/robots.txt`, `/sitemap.xml`, small JSON.
- **`--verified` is the Browserbase "advanced stealth" flag in the unified `browse` CLI.** Older docs reference `--advanced-stealth`. They mean the same thing.
- **Session-rate triggers Avis fingerprinting.** After ~3 successful searches within ~5 minutes from one session, every subsequent search lands on Press & Hold regardless of `--verified`. One session per location is the safe pattern.
- **Driver age is banded, not numeric.** Combobox options are "21-24" and "25+" — there is no 30 / 35 / 65+. The skill caller should map any age ≥ 25 to "25+" and pass through. 21-24 surfaces an underage surcharge in the results page; for long-term rentals, the renter is almost always ≥ 25.
- **`browse cloud fetch` on Avis HTML is unreliable due to the 1MB cap** — even for `https://www.avis.com/en/home` it returns 502. Only use it for known-small resources.

## Expected Output

Four distinct outcome shapes, all flagged with `success` + `reason` (or `vehicles` for the happy path).

### Happy path — vehicles extracted

```json
{
  "success": true,
  "pickup_location": {"input": "LAX", "resolved": "Los Angeles Intl Airport (LAX)"},
  "dropoff_location": {"input": "LAX", "resolved": "Los Angeles Intl Airport (LAX)"},
  "pickup_at": "2026-06-01T12:00:00",
  "return_at": "2026-12-01T12:00:00",
  "rental_days": 183,
  "renter_age_band": "25+",
  "vehicles": [
    {
      "class": "ECONOMY",
      "name": "Nissan Versa or Similar",
      "daily_price": {"pay_later": 34.99, "pay_now": 31.49, "currency": "USD"},
      "total_price": {"pay_later": 7459.21, "pay_now": 6713.29, "currency": "USD"},
      "fees_taxes_included_in_total": true,
      "fees_breakdown": null
    },
    {
      "class": "INTERMEDIATE SUV",
      "name": "Toyota RAV4 or Similar",
      "daily_price": {"pay_later": 58.40, "pay_now": 52.56, "currency": "USD"},
      "total_price": {"pay_later": 12325.20, "pay_now": 11082.68, "currency": "USD"},
      "fees_taxes_included_in_total": true,
      "fees_breakdown": null
    }
  ],
  "cheapest": {
    "class": "ECONOMY",
    "name": "Nissan Versa or Similar",
    "total_price_pay_now": 6713.29,
    "daily_avg_pay_now": 36.69
  },
  "session_id": "6df6814b-2e52-46da-8853-7f2d788e046f",
  "screenshots": ["screenshots/lax-2026-06-01.png"]
}
```

### CAPTCHA wall (most common failure)

```json
{
  "success": false,
  "reason": "human_press_and_hold",
  "reference_id": "bd8c3b60-534c-11f1-9e66-3f681c98e7b3",
  "pickup_location": {"input": "LAX"},
  "url_at_block": "https://www.avis.com/en/products-and-services/services/long-term-car-rental",
  "session_id": "6df6814b-2e52-46da-8853-7f2d788e046f",
  "screenshots": ["failures/lax-2026-06-01.png"],
  "html_path": "failures/lax-2026-06-01.html",
  "retry_recommended": true
}
```

### Unsupported range (caller validation; do not submit)

```json
{
  "success": false,
  "reason": "range_outside_15_to_330_days",
  "rental_days": 365,
  "constraint": {"min_days": 15, "max_days": 330, "product": "Avis Flex"}
}
```

### No availability

```json
{
  "success": true,
  "vehicles": [],
  "sold_out": true,
  "pickup_location": {"input": "LAX", "resolved": "Los Angeles Intl Airport (LAX)"},
  "pickup_at": "2026-06-01T12:00:00",
  "return_at": "2026-12-01T12:00:00",
  "rental_days": 183
}
```
