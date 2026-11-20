---
name: m-uber-com-find-fare-estimate-eyeaqq
title: Uber Fare Estimate Between Two Places
description: >-
  Drive m.uber.com to enter a pickup and dropoff and return the route's
  available Uber ride products (UberX, Comfort, UberXL, Black, etc.) with
  capacity and descriptions. Read-only. Dollar fares are gated behind an Uber
  login; anonymous sessions get ride types but no prices.
website: m.uber.com
category: transportation
tags:
  - transportation
  - rideshare
  - uber
  - fare-estimate
  - read-only
  - cloudflare
  - login-wall
source: 'browserbase: agent-runtime 2026-09-08'
updated: '2026-09-08'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      The m.uber.com location-autocomplete + product-selection flow is the only
      surface that enumerates ride options for a route. No login-free API or URL
      returns fares; the public www.uber.com/global/en/price-estimate/ estimator
      just redirects into the same m.uber.com login wall.
verified: true
proxies: true
---
# Uber Fare Estimate Between Two Places

## Purpose

Given a pickup place and a dropoff place, drive `m.uber.com` to produce a route-scoped list of available Uber ride products (UberX, Comfort, UberXL, Black, etc.) with each product's passenger capacity and one-line description. **Read-only — never requests a ride.** Important honesty caveat: the actual dollar **fare amounts are gated behind an Uber login.** An anonymous/bot session can reach the ride-selection screen and enumerate every available ride type for the route, but the per-product price is never rendered to logged-out users — a "Log in to see ride options" dialog blocks it. Use this skill to answer "which Uber products serve this route" reliably; to also return dollar fares you must supply an authenticated Uber session (see Gotchas).

## When to Use

- "What Uber options are available from A to B?" — returns the full product catalog for the route.
- A trip-planning agent that needs the set of ride tiers (and their capacities) between two addresses.
- As the first half of a fare lookup: run this to reach the product-selection screen, then hand off to an authenticated session to read prices.
- Do **not** use this expecting anonymous dollar fares — Uber does not expose them to logged-out users (confirmed below).

## Workflow

Recommended method is **browser** — there is no login-free API or URL that returns Uber fares. The whole flow is a location autocomplete → route → product-selection navigation on `m.uber.com`.

1. **Create a stealth session.** `m.uber.com` sits behind Cloudflare + Cloudflare WAF. Create the Browserbase session with `--verified --proxies`; a bare session risks a 403/challenge.
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```
2. **Open the site.** `browse open "https://m.uber.com/" --remote` — it 301-redirects to `https://m.uber.com/go/home`, which renders a "Get a ride" form with Pickup/Dropoff comboboxes and a Search button.
3. **Dismiss the cookie dialog.** A third-party-cookie consent dialog appears; click its **"Got it"** button.
4. **Enter pickup.** Click the **"Pickup location"** combobox (accessible name: "Search for a location"), then `browse fill <ref> "<pickup place>"`. Wait ~2s. A listbox of ~7 suggestions appears ("N options available"). Click the option that best matches the intended place (prefer a named POI/business match over the raw-address or "Set location on map" rows). Selecting encodes the pickup as a JSON blob into the URL: `/go/drop?pickup={addressLine1,addressLine2,id,latitude,longitude,provider,...}`.
5. **Enter dropoff.** The dropoff combobox is now focused. Click it, `fill` the dropoff place, wait ~2s, click the best suggestion. The URL now carries both `pickup=` and `drop[0]=` JSON params.
6. **Search.** Click the **"Search"** button → navigates to `/go/product-selection?...&vehicle=8`.
7. **Read the product list.** `browse snapshot` — the ride products render as a listbox of options. Each option's accessible name is `"<Product> Person <capacity> <description>"` (e.g. `UberX Person 4 Affordable rides all to yourself`). Extract product name, capacity, and description for every option.
8. **Handle the price gate.** A dialog titled **"Log in to see ride options"** overlays the list ("Please take a moment to quickly log in or sign up so we can show you your ride options" + a "Continue" button that routes to auth). This is expected for anonymous sessions. Emit the ride-type list with `price: null` and `prices_available_anonymously: false`. **Do not click "Continue"** unless you are intentionally driving an authenticated flow (out of scope / read-only).
9. **Release the session.** `browse cloud sessions update "$sid" --status REQUEST_RELEASE`.

### Getting actual dollar fares (authenticated, optional)

Prices are only rendered after login. To capture them you must run steps 2–7 inside a session that is already authenticated with Uber credentials (cookie/session injection), then re-read the product listbox — each option then carries a `$` fare next to the product name. Supplying credentials is out of scope for this read-only skill and requires a logged-in Uber account.

## Site-Specific Gotchas

- **LOGIN WALL FOR PRICES — the central caveat.** On `/go/product-selection`, anonymous sessions see the full ride-type catalog but **zero dollar fares**; the "Log in to see ride options" dialog gates them. Verified twice (manual + autobrowse): `browse get text body` on this page contains no per-option fare. The only `$` values present (`$5`, `$240`, `$60`) are unrelated embedded config, **not** fares — do not scrape them as prices.
- **The public marketing estimator is a dead end for anonymous prices.** `https://www.uber.com/global/en/price-estimate/` has the same Pickup/Dropoff form plus a "See prices" link, but "See prices" just redirects into the **same** `m.uber.com/go/product-selection` login wall. There is no login-free price surface. Don't waste time on it expecting fares.
- **Cloudflare + Cloudflare WAF front the domain.** Pre-run probe flagged both. Use `--verified --proxies`. A stealth session loads the form cleanly; a bare session risks a challenge/403.
- **`browse fill` on the location combobox does NOT press Enter** (`pressedEnter: false`). This is good — the autocomplete listbox stays open. Always click a listbox option to commit the location; never rely on Enter submitting.
- **Autocomplete renders progressively.** Wait ~2s after `fill` before snapshotting; the listbox and its "N options available" status arrive a beat after keystrokes.
- **Location choice matters.** The first suggestion is often the raw typed address (a generic marker); prefer the named business/POI row (e.g. "Google LLC" over "1600 Amphitheatre Pkwy") for a cleaner, unambiguous route.
- **Pickup/dropoff are URL-encoded JSON, and the route is deep-linkable.** After both are selected, the full `/go/product-selection?pickup={...}&drop[0]={...}&vehicle=8` URL fully describes the trip (includes lat/long + place id). You can persist/replay it, but it still hits the same login wall for prices.
- **`vehicle=8`** is appended on Search — it's the default preselected product index, not a fare.
- **Read-only.** Stop at the product-selection screen. Never click "Continue" (auth) or any request/confirm-ride control.

## Expected Output

Anonymous run (the reliable outcome — ride catalog, no prices):

```json
{
  "success": true,
  "pickup": "Google LLC, 1600 Amphitheatre Pkwy, Mountain View, CA",
  "dropoff": "International Terminal (G gates), San Francisco International Airport (SFO), San Francisco, CA",
  "prices_available_anonymously": false,
  "ride_options": [
    { "product": "UberX",            "capacity": 4, "price": null, "description": "Affordable rides all to yourself" },
    { "product": "Comfort",          "capacity": 4, "price": null, "description": "Newer cars with extra legroom" },
    { "product": "Comfort Electric", "capacity": 4, "price": null, "description": "Newer electric vehicles with extra legroom" },
    { "product": "UberX Share",      "capacity": 1, "price": null, "description": "Save by sharing" },
    { "product": "Electric",         "capacity": 4, "price": null, "description": "Affordable rides in electric vehicles" },
    { "product": "UberXL",           "capacity": 6, "price": null, "description": "Affordable rides for groups up to 6" },
    { "product": "UberXXL",          "capacity": 6, "price": null, "description": "Rides for 6 with room for extra luggage" },
    { "product": "Uber Pet",         "capacity": 4, "price": null, "description": "For you and your pet" },
    { "product": "UberXL Priority",  "capacity": 6, "price": null, "description": "Shorter wait time for groups up to 6" },
    { "product": "Uber for teens",   "capacity": 4, "price": null, "description": "Highly rated drivers for teens" },
    { "product": "Black",            "capacity": 4, "price": null, "description": "Luxury rides with professional drivers" },
    { "product": "Black SUV",        "capacity": 6, "price": null, "description": "Luxury rides for 6 with professional drivers" },
    { "product": "Car Seat",         "capacity": 6, "price": null, "description": "For children 5 - 65 lbs" },
    { "product": "WAV",              "capacity": 4, "price": null, "description": "Wheelchair accessible vehicles" },
    { "product": "Assist",           "capacity": 4, "price": null, "description": "Special assistance from certified drivers" }
  ],
  "notes": "Reached /go/product-selection. 'Log in to see ride options' dialog gates all fares; anonymous session exposes ride types only.",
  "error_reasoning": null
}
```

Authenticated run (prices populated — requires a logged-in Uber session):

```json
{
  "success": true,
  "prices_available_anonymously": false,
  "ride_options": [
    { "product": "UberX",  "capacity": 4, "price": "$61.93", "description": "Affordable rides all to yourself" },
    { "product": "Black",  "capacity": 4, "price": "$142.47", "description": "Luxury rides with professional drivers" }
  ],
  "notes": "Fares captured from an authenticated Uber session.",
  "error_reasoning": null
}
```

Blocked run (Cloudflare challenge / could not reach product-selection):

```json
{
  "success": false,
  "prices_available_anonymously": false,
  "ride_options": [],
  "notes": "Blocked before product-selection.",
  "error_reasoning": "Cloudflare challenge on /go/home — recreate session with --verified --proxies."
}
```
