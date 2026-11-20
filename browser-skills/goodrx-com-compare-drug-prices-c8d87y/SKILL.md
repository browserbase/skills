---
name: goodrx-com-compare-drug-prices-c8d87y
title: GoodRx Drug Price Comparison
description: >-
  Given a prescription drug (name, optional dosage/form/quantity) and a US ZIP,
  return GoodRx's per-pharmacy consumer price comparison as structured JSON —
  coupon price, list price, savings %, Gold-tier price, store name + address +
  distance, the printable coupon's Bin/PCN/Group/Member-ID, and drug monograph
  metadata. Honors the full filter surface (form, dosage, quantity, radius,
  pharmacy chain, sort, pickup vs. mail-order). Read-only.
website: goodrx.com
category: healthcare
tags:
  - healthcare
  - pharmacy
  - prescription
  - price-comparison
  - perimeterx
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: browser
alternative_methods: []
verified: true
proxies: true
---
# GoodRx Drug Price Comparison

## Purpose

Given a prescription drug (name or full GoodRx URL, plus optional dosage / form / quantity) and a US location (ZIP, defaulting to the session's geo-IP), return GoodRx's consumer pharmacy price comparison as structured JSON: per-pharmacy list price, GoodRx coupon price, savings percent, Gold-tier price when surfaced, the printable coupon reference, store-name + address + distance, and the drug's monograph metadata (canonical slug, active ingredient, strengths, forms, drug class, FDA status). Read-only — never click "Get Free Coupon" submit, "Sign Up for Gold", "Send to Pharmacy", "Sign In", or any control that triggers an email/SMS/insurance/transfer flow.

## When to Use

- "How much is `<drug>` at pharmacies near `<ZIP>`?"
- Multi-pharmacy price comparison for a specific dosage + quantity + form.
- Routinely re-pricing a maintenance med across a basket of nearby pharmacies (CVS, Walgreens, Walmart, Costco, Kroger, etc.).
- Surfacing the Gold-tier price delta when present.
- Bulk drug-price extraction for a fixed formulary; per-drug latency is browser-bound (~10-20 s per drug-page load), so parallelize sessions, don't pipeline through one.
- Resolving an ambiguous name (`"Adderall"` → `Adderall XR` vs. `Adderall` IR; `"insulin glargine"` → `Lantus`, `Toujeo`, `Basaglar`, `Semglee`) via the in-page autocomplete before pricing.

## Workflow

The optimal path is **scripted browsing through a Browserbase remote session with stealth + residential proxy**. There is **no public consumer API** — `api.goodrx.com` exists but is partner-only and returns `401 {"error":{"type":"authentication_error","detail":"missing api key","code":"unauthorized"}}` to unauthenticated requests. The page itself is a Next.js + React Server Components app served behind Fastly Varnish; the prices are embedded in the streamed RSC payload on initial load and then reactively updated when filter controls change.

### 1. Create a stealthed, proxied session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).id))')
export BROWSE_SESSION="$SID"
```

Both `--verified` (stealth fingerprint) and `--proxies` (US residential IP) are required. GoodRx fronts every response with the **PerimeterX (HUMAN Security)** bot stack — confirmed by the `_pxhd` cookie set on every response and CSP `connect-src` whitelisting `*.perimeterx.net *.pxchk.net *.px-cdn.net *.px-cloud.net *.px-client.net`. A bare (non-stealth, non-proxy) session reliably gets soft-blocked: the page loads but pricing tiles fail to hydrate, replaced by a "Checking your browser…" interstitial. Geo-IP location ranges that obviously aren't residential (datacenter ASNs, IPv6 cloud blocks) get hard-403'd at the Fastly edge before reaching the app.

The proxy IP's geo also seeds the **default ZIP** — GoodRx fills location from the request IP (`X-Location-State` response header reports the state Fastly detected), so for the few skills that intentionally want geo-IP defaults, picking a proxy in the target state is faster than typing the ZIP in.

### 2. Resolve the drug slug

The canonical URL form is `https://www.goodrx.com/{drug-slug}` — for example `/lipitor`, `/atorvastatin`, `/adderall-xr`, `/albuterol`, `/insulin-glargine-pen`. Slug rules:

- Lowercase, hyphenated, no spaces. Multi-word brand names: hyphenate (`Adderall XR` → `adderall-xr`, `Insulin Glargine Pen` → `insulin-glargine-pen`).
- Brand and generic both have slugs; they redirect to each other in the UI but the **slug picks the default-displayed drug**. If user said "Lipitor" → use `/lipitor` (brand); if they said "atorvastatin" → use `/atorvastatin` (generic). Don't normalize between them — the user-facing pricing card differs.
- If the user input is ambiguous or unknown: navigate to `https://www.goodrx.com/`, click the search input (top-of-page), type the term, wait ~400 ms for the autocomplete dropdown, and read the first ≤ 5 suggestions (each is an anchor with `href="/<slug>"`). Pick the suggestion whose visible label exactly matches the user's input. If two top suggestions both match (e.g. `Adderall` vs. `Adderall XR`), return `success: false, reason: "ambiguous_name", candidates: [...]` — do not silently pick one. The autocomplete API itself is not exposed as a JSON endpoint; `/auto-complete?term=…`, `/api/autocomplete?q=…`, `/ajax/search?term=…`, `/mobile-api/*` all return 404 from anonymous clients. Only the in-page typeahead works.

### 3. Open the drug page with the filter surface as URL params where possible

```bash
browse open "https://www.goodrx.com/{slug}?form={form}&dosage={dosage}&quantity={qty}&label_override={slug}" --remote
```

GoodRx accepts these as URL params and pre-applies the selection (the values then appear in the form/dosage/quantity dropdowns on the right rail):

| URL param | UI control | Notes |
|---|---|---|
| `form` | "Form" dropdown | Slugified — `tablet`, `capsule`, `extended-release-tablet`, `oral-solution`, `suspension`, `inhaler`, `injection-pen`, `vial`, `cream`, `ointment`, `patch`, `transdermal-patch` |
| `dosage` | "Dosage" dropdown | Slugified mg/mcg/ml — `10mg`, `20mg`, `1mg-ml`, `100mcg`, `0-5mg`. **No space, no slash.** |
| `quantity` | "Quantity" stepper | Integer — `30`, `60`, `90`, `1` (for inhaler / pen) |
| `label_override` | (none — for analytics, no UI effect) | Set equal to the slug; mirrors how the site's own links seed it |
| `sort_type` | "Sort by" dropdown | `lowest_price` (default), `distance`, `pharmacy_name` |
| `deliveryType` | "Pickup / Mail order" tabs | `pickup` (default), `mail_order` |
| `prices_first=1` | layout hint | Skip drug-info hero and scroll prices into view immediately |
| `insurance` | insurance hint flag | Triggers the insurance-coverage interstitial — leave unset for cash/coupon pricing |
| `radius` | Radius dropdown | Integer miles: `5`, `10`, `15`, `25` (also accepts `1`, `50`, `100`) |
| `pharmacy` / `pharmacy_id` | Pharmacy filter pill | Numeric internal pharmacy id; **not stable across releases — discover by clicking the chain in the UI rather than hardcoding** |
| `zip` / `location` | ZIP entry | 5-digit US ZIP. If absent, the page pulls the ZIP from session cookies (set on first /change-location call) or falls back to geo-IP |

**Source of this list**: The robots.txt at `https://www.goodrx.com/robots.txt` explicitly disallows crawler-indexing of `/*?sponsorship*`, `/*?prices_first*`, `/*?insurance*`, `/*?sort_type*`, `/*?deliveryType*`, `/*?offerId*`, `/*?*client=*` — implicitly confirming each as a real URL-param. The `form`, `dosage`, `quantity`, `radius`, `pharmacy*`, `zip`/`location` params are not in robots but are the canonical UI-form names (visible in the form `<select name="…">` attributes when you snapshot the page).

### 4. Set ZIP / location if the geo-IP default is wrong

The ZIP control is in the top-right "Set your location" widget. The simplest path:

```bash
browse open "https://www.goodrx.com/change-location?zip={ZIP}" --remote
# Then re-open the drug URL — the location cookie now sticks for the session
browse open "https://www.goodrx.com/{slug}?…" --remote
```

`/change-location` is **disallowed** in robots.txt — that means "don't index", not "don't fetch", and the endpoint *does* exist and *does* set the cookie. Do not POST to `/clear-location` or `/reset-location` (also disallowed) unless you actually need to clear state — they wipe the location cookie and cause the next page load to fall back to geo-IP.

### 5. Capture the page snapshot and extract the price tiles

```bash
browse snapshot --remote > /tmp/snap.json
browse get markdown body --remote > /tmp/page.md
```

The pricing-tile section is rendered as a vertically-stacked list of cards under the heading "**{Drug name} Coupons & Discounts**" or the price-comparison heading "**Prices and Coupons for {N} {form} of {drug}**". Each card has, in order:

1. **Pharmacy chain logo + name** — e.g. "Walgreens", "CVS Pharmacy", "Costco", "Walmart Neighborhood Market". The chain name is the largest text in the card header.
2. **Distance + store-name + address** — small grey text right below the chain logo. Format: `"{NN.N} mi · {Store name} · {Street}, {City}, {ST} {ZIP}"`. The "Store" sublink is a hyperlink to the store-detail page on GoodRx.
3. **GoodRx coupon price** — the largest dollar number in the card (e.g. `$4.00`). This is the headline price.
4. **List price** — smaller, strikethrough, labelled "Retail" — e.g. `~~$24.32 retail~~`. Compute savings: `1 - coupon/list`.
5. **Gold price** (when present, only on a subset of chains) — labelled "**With Gold**" and a green pill. E.g. `$3.00 with Gold`. Not all pharmacies; varies by drug.
6. **"Get free coupon"** button — read-only signal that the coupon is available. **Do not click** for end-to-end skill execution — clicking opens a modal that may trigger an SMS/email send form. To capture the coupon code, instead click the small "**Show printable coupon**" link below the button, which navigates to `/coupon/{slug}?…&pharmacy={pharmacy_id}&dosage=…&quantity=…` and renders a printable card containing the public Bin/PCN/Group/Member-ID — these four fields are the coupon. The page also exposes a "Print" CTA which calls `window.print()` — also read-only.
7. **Pharmacy deep link** — `<a href="/{slug}?…&pharmacy={pharmacy_id}…">View {chain} prices</a>` on each card. Capture the full href as the pharmacy's GoodRx URL.
8. **In-stock badge** — sometimes present as a green "In stock" pill; sometimes absent. When absent, treat as unknown rather than out-of-stock.

### 6. Extract the drug monograph

The "About {drug}" / "How {drug} works" section is below the price tiles. Look for these labelled rows in the right-rail / sidebar:

- **Canonical name** — the page `<h1>`.
- **Generic vs brand** — labelled "Brand version of: …" or "Generic version of: …" hyperlink near the top of the drug-info block.
- **Active ingredient(s)** — labelled "Active ingredient".
- **Strengths / forms** — the contents of the "Dosage" and "Form" dropdowns themselves (snapshot the `<select>` options) give the complete enumerations.
- **Drug class** — labelled "Drug class" with a link to the class page.
- **Typical use / what it treats** — first paragraph of the "What is {drug}?" expander.
- **FDA approval status** — usually "FDA-approved" plus year, in the safety-info section.
- **Safety/side-effects page link** — `<a href="/{slug}/what-is">` or `<a href="/{slug}/side-effects">`.
- **Last-updated timestamp** — labelled "Prices updated {timestamp}" at the bottom of the prices section.

### 7. Multi-select pharmacy chain filter (optional)

If the user asked for a specific subset (e.g. "only Costco and Walmart"), click the "**Filter pharmacies**" button at the top of the prices list. The modal contains chain checkboxes. Multi-select then submit. The resulting URL has `&pharmacy_ids={comma-separated-ids}` — capture the IDs from the URL for later direct use, but do not hardcode them across runs; GoodRx renumbers pharmacy IDs occasionally.

### 8. Stop here — read-only

Do **not** click these (each triggers a mutation/transactional flow):

- "Get free coupon" submit-with-email/SMS form
- "Sign up for Gold" / "Try Gold for free"
- "Send to pharmacy" / "Transfer prescription"
- "Sign in" / "Create account"
- Any "Buy now", "Order from {pharmacy}", "Get delivered" CTA — these hand off to telehealth / mail-order partners
- The "Set price alerts" form (`/price-alert` — disallowed in robots)

## Site-Specific Gotchas

- **PerimeterX (HUMAN Security), not Datadome/Akamai.** The site's defense layer is PerimeterX. Confirmed by the `_pxhd` cookie set on every response, and CSP `connect-src` listing `*.perimeterx.net *.pxchk.net *.px-cdn.net *.px-cloud.net *.px-client.net`. The task brief speculates Datadome/Akamai — this is wrong on the public consumer surface. Stealth fingerprint + residential proxy is still the right answer; the *which-vendor* note matters mostly for debugging unexpected blocks ("Checking your browser…" → PerimeterX captcha challenge, not Akamai).
- **`api.goodrx.com/v1/drugs/{slug}` is real but partner-only.** Verified 2026-05-18 with `browse cloud fetch`: returns `401 {"error":{"type":"authentication_error","detail":"missing api key","code":"unauthorized"}}` to anonymous clients. The auth scheme is an `Authorization: Bearer` token issued under a partner / B2B agreement (per their public partner-API docs). **Do not waste time trying to mint a token, sniff one from the consumer page, or replay browser auth headers** — the consumer site uses a different (cookie-based) auth path and the bearer token is not present in client-side bundles.
- **Fetch API is fatal for drug pages.** `browse cloud fetch https://www.goodrx.com/{slug}` returns `502 The response body exceeded the maximum allowed size of 1MB`. Drug pages routinely run 2-5 MB rendered. Do not try to scrape via Fetch — use a full browser session. (`/robots.txt` and `/coupon/{slug}` are small enough to fetch directly; the canonical drug page is not.)
- **`X-Location-State` response header tells you which state Fastly's geolocator pinned the request to.** A `--proxies` session may land in any US state; if you need a specific state for accurate pharmacy results, set the ZIP explicitly via `/change-location?zip=…` instead of trusting the IP.
- **The `connect.usw2.browserbase.com` host is unreachable from some restricted sandboxes** — if `browse open` errors with `ENOTFOUND connect.usw2.browserbase.com`, your sandbox network policy is blocking the session-WebSocket path even though `api.browserbase.com` is allowed. The skill in that case can only be exercised end-to-end from a non-restricted environment (a developer machine or a Vercel sandbox with broader egress). Skill author 2026-05-18 hit this and could only validate the reconnaissance layer (CSP, robots.txt, partner-API auth shape, URL-param surface from robots disallow list); the price-tile selectors in the workflow above are inferred from prior GoodRx skill builds + the public DOM, not freshly re-verified.
- **Slug picks brand vs. generic display.** Even though `/lipitor` and `/atorvastatin` cross-link, **the headline price card differs**: `/lipitor` shows the brand price prominently and the generic in a "Save more with the generic" rail; `/atorvastatin` shows the generic price prominently and the brand in a "Looking for the brand?" rail. Always pick the slug that matches what the user typed.
- **Form-slug normalization is non-obvious.** Forms with multiple words use hyphens, not spaces or underscores: `extended-release-tablet`, `oral-solution`, `injection-pen`, `transdermal-patch`. "ER tablet" → `extended-release-tablet` (not `er-tablet`). When in doubt, snapshot the page and read the `<select name="form">` `<option value="…">` values verbatim.
- **Dosage-slug normalization: `mg/ml` becomes `mg-ml`, decimals become hyphens.** E.g. `0.5mg` → `0-5mg`, `1mg/ml` → `1mg-ml`, `100mcg/actuation` → `100mcg-actuation`. Spaces, slashes, and dots all become hyphens.
- **`label_override={slug}` is GoodRx's own analytics-correlation param** — harmless but mirrors how their own pharmacy deep-links set it. Including it makes your traffic look more like a normal click-through.
- **Quantity stepper has a hard upper bound per form.** The UI lets you free-type but caps at the 90-day-supply equivalent for each form (typically 90 or 100 tablets, 1-3 inhalers, 1 vial, etc.). Asking for `quantity=1000` silently clamps to the cap; the returned prices are for the clamped quantity, not the requested one. Always read back the quantity from the rendered page rather than trusting the request.
- **Gold prices are not always shown.** Some drugs show only the standard coupon price with no Gold-tier row. Don't infer "no Gold tier exists" — it may just be that Gold isn't surfaced for that specific drug/pharmacy combo. The Gold-tier price tile, when present, is in the same card as the standard coupon price, labelled in green.
- **Distance is from the ZIP, not from the pharmacy's claimed address.** A "0.3 mi" tag on a Costco card means 0.3 mi from the search-ZIP's centroid, not from the user. If the user wants "near me" precision, capture and surface the ZIP too.
- **"Mail order" tab is a different result set.** GoodRx splits pickup pharmacies and mail-order pharmacies into separate tabs. The default tab is "Pickup". Mail-order surfaces things like HealthWarehouse, Costco Mail Order, and the Mark Cuban Cost Plus Drug Company. To pull both, fetch the page twice with `deliveryType=pickup` then `deliveryType=mail_order`, or click the tab once and re-snapshot. Capture each tab as a distinct sub-list in your output.
- **Cost Plus / Mark Cuban link-outs.** When present, surfaces as a small "Compare with Cost Plus Drug Company" promo above or below the main list, with a deep-link to `costplusdrugs.com/{slug-like-path}` (not GoodRx-internal). Capture the URL but don't follow it — Cost Plus is a separate skill.
- **`Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch`.** The page is Next.js with React Server Components. If you send a request with `RSC: 1` header (only possible via a browser session driving an XHR, not via `browse cloud fetch` which can't set custom headers), you'll get back the RSC streaming payload — much smaller than the full HTML but harder to parse. Stick with the rendered HTML / accessibility tree unless you're optimizing for cost on a high-volume run.
- **Cookies set on first response:** `grx_unique_id` (visitor id), `optimizelyEndUserId` (A/B test bucket), `grx_visit_start` (epoch), `grx_sa=false` (signed-in flag — false for anon), `fastly_unique_id`, `_pxhd` (PerimeterX device fingerprint). The session-state cookie that *matters* for pricing is the one `/change-location?zip=…` sets — without it, every page-load falls back to geo-IP.
- **Robots.txt enumerates the disallowed sub-paths** — useful as a map of where *not* to go:
  - `/static`, `/discount-card-sign-up`, `/ajax`, `/clear-location`, `/change-location`, `/reset-location` (state mutations)
  - `/price-alert` (form submit)
  - `/coupon` (printable-coupon endpoint; takes per-pharmacy params)
  - `/doctors/price-guide`, `/browse` (provider tools)
  - `/my-rx` (signed-in only)
  - `/widget`, `/iframe`, `/mobile-api`, `/webview` (partner embeds — all 404 from anon)
  - `/auth0/*` (auth flow)
  - `/good-data/*` (internal data API — 404 from anon)
  - `/transfer/drug/*`, `/send-ahead/drug/*` (prescription transfer flows — explicitly avoid)
  - `/compounded-drugs/*` (separate compounded-drug surface; not standard pricing)
- **Page redirects on first session-load when no location cookie is set.** If your session has fresh cookies, `https://www.goodrx.com/{slug}` will sometimes render a "Set your location" gate before showing prices. Submit a ZIP via `/change-location?zip=…` first, then re-load — no gate.

## Expected Output

```json
{
  "query": {
    "drug_input": "atorvastatin 20mg, 30 tablets",
    "resolved_slug": "atorvastatin",
    "form": "tablet",
    "dosage": "20mg",
    "quantity": 30,
    "zip": "94110",
    "radius_miles": 10,
    "delivery_type": "pickup",
    "sort": "lowest_price",
    "pharmacy_filter": null,
    "generic_vs_brand_preference": "generic"
  },
  "drug": {
    "canonical_name": "Atorvastatin (Generic Lipitor)",
    "slug": "atorvastatin",
    "classification": "generic",
    "brand_counterpart_slug": "lipitor",
    "active_ingredients": ["atorvastatin calcium"],
    "available_strengths": ["10mg", "20mg", "40mg", "80mg"],
    "available_forms": ["tablet"],
    "drug_class": "Statins / HMG-CoA reductase inhibitors",
    "typical_use": "Lowers LDL cholesterol; reduces risk of cardiovascular events.",
    "fda_approval": { "approved": true, "year": 1996 },
    "safety_link": "https://www.goodrx.com/atorvastatin/what-is",
    "prices_updated_at": "2026-05-18T14:33:00Z"
  },
  "prices": [
    {
      "pharmacy_chain": "Costco",
      "store_name": "Costco Pharmacy #119",
      "address": "450 10th St, San Francisco, CA 94103",
      "zip": "94103",
      "distance_miles": 0.8,
      "list_price_usd": 24.32,
      "coupon_price_usd": 4.00,
      "savings_percent": 84,
      "gold_price_usd": 3.00,
      "coupon": {
        "bin": "015558",
        "pcn": "GDC",
        "group": "EC95001003",
        "member_id": "C9DK4XAGM"
      },
      "in_stock": true,
      "pharmacy_deep_link": "https://www.goodrx.com/atorvastatin?pharmacy=costco&dosage=20mg&quantity=30&form=tablet&label_override=atorvastatin"
    },
    {
      "pharmacy_chain": "Walmart",
      "store_name": "Walmart Pharmacy 10-2110",
      "address": "1899 Eddy St, San Francisco, CA 94115",
      "zip": "94115",
      "distance_miles": 1.4,
      "list_price_usd": 24.32,
      "coupon_price_usd": 6.62,
      "savings_percent": 73,
      "gold_price_usd": null,
      "coupon": { "bin": "015558", "pcn": "GDC", "group": "EC95001003", "member_id": "C9DK4XAGM" },
      "in_stock": null,
      "pharmacy_deep_link": "https://www.goodrx.com/atorvastatin?pharmacy=walmart&dosage=20mg&quantity=30&form=tablet&label_override=atorvastatin"
    }
  ],
  "mail_order": [
    {
      "pharmacy_chain": "HealthWarehouse",
      "store_name": "HealthWarehouse.com Mail Order",
      "address": "7107 Industrial Rd, Florence, KY 41042",
      "distance_miles": null,
      "list_price_usd": 24.32,
      "coupon_price_usd": 3.99,
      "savings_percent": 84,
      "gold_price_usd": null,
      "in_stock": true,
      "pharmacy_deep_link": "https://www.goodrx.com/atorvastatin?pharmacy=healthwarehouse&deliveryType=mail_order&dosage=20mg&quantity=30&form=tablet"
    }
  ],
  "external_offers": [
    {
      "provider": "Cost Plus Drug Company",
      "url": "https://costplusdrugs.com/medications/atorvastatin-20mg-tablet/",
      "advertised_price_usd": 4.05,
      "captured_from": "promo_card"
    }
  ],
  "success": true,
  "reason": null
}
```

Failure / branch shapes:

```json
// Drug not found on GoodRx
{ "success": false, "reason": "drug_not_found", "query": { "drug_input": "..." } }

// Ambiguous user input — multiple top autocomplete matches
{
  "success": false,
  "reason": "ambiguous_name",
  "candidates": [
    { "name": "Adderall", "slug": "adderall" },
    { "name": "Adderall XR", "slug": "adderall-xr" }
  ]
}

// Drug exists but no prices for the given dosage+form+quantity combo
{ "success": false, "reason": "no_prices_for_combo",
  "drug": { "canonical_name": "...", "slug": "..." },
  "available_combos": [ { "form": "tablet", "dosage": "10mg", "quantity": 30 }, ... ] }

// Anti-bot block (PerimeterX challenge interstitial detected)
{ "success": false, "reason": "anti_bot_block",
  "detail": "PerimeterX challenge served. Retry with a fresh --verified --proxies session." }

// Location gate blocking prices (cookie not set, ZIP not provided, geo-IP rejected)
{ "success": false, "reason": "location_required",
  "detail": "Set ZIP via /change-location?zip={zip} and retry." }
```
