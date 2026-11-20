---
name: beno-com-size-filter-wo29k8
title: Beno Yacht Size Filter (Min & Max Length)
description: >-
  Filter Beno's Dubai yacht-rental listing by yacht size (minimum and maximum
  length in feet) using the dual-handle Size range slider, and read back the
  yachts within that range with their length, guest capacity and hourly price.
  Read-only.
website: beno.com
category: marketplace
tags:
  - yacht-rental
  - luxury
  - filter
  - dubai
  - size
  - read-only
source: 'browserbase: agent-runtime 2026-06-09'
updated: '2026-06-09'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      The listing's private endpoint apps-api.beno.com/v3/deals/products/yacht
      accepts a sizes[]=<min>,<max> param, but it is CloudFront/WAF-protected:
      direct fetch returns 403 Forbidden and page-context fetch fails with CORS.
      Confirmed not usable as a raw-API fast-path.
  - method: browser
    rationale: >-
      The /yachts?sizes=<min>,<max> deep-link pre-activates the filter but
      frequently hangs on 'Loading...' on a cold page load; reliable only after
      warming the listing, so the modal-apply flow is preferred.
verified: true
proxies: true
---
# Beno Yacht Size Filter (Min & Max Length)

## Purpose

Filter Beno's Dubai/UAE yacht-rental listing by **yacht size** — a minimum and maximum length in **feet** — and read back the yachts that fall inside that range. Beno is a luxury rental marketplace (yachts, cars, helicopters, etc.); "size" on the yacht listing means hull length in feet, exposed as a dual-handle range slider (default 20–200 ft). This skill is **read-only**: it sets the filter and extracts the resulting yacht cards (name, length, guest capacity, hourly price). It never books.

## When to Use

- "Show me yachts between 60 and 120 feet on Beno."
- A shopping agent narrowing yacht options to a size band before comparing prices.
- Any flow that needs the set of Beno yachts whose length is within a `[min, max]` foot range, with their guest capacity and hourly rate.
- NOT for cars/helicopters/buggies — those listings have their own filters; "size" as length-in-feet is a yacht concept.

## Workflow

The recommended method is the **browser UI**, driving the filter modal on `https://www.beno.com/yachts`. The listing is a JavaScript (Angular) SPA whose data comes from a private API (`apps-api.beno.com/v3/deals/products/yacht`), but that endpoint is CloudFront/WAF-protected and returns `403 Forbidden` to direct and page-context fetches — it is **not** a usable fast-path (see Gotchas). The clean URL `?/yachts?sizes=<min>,<max>` *is* a real deep-link, but it is unreliable on a cold page load (cards frequently stick on "Loading…"), so prefer applying the filter through the modal on an already-loaded listing.

1. **Open the listing page (warm it up first).**
   ```bash
   browse open "https://www.beno.com/yachts" --remote --session "$sid"
   browse wait load --remote --session "$sid"
   browse wait timeout 5000 --remote --session "$sid"
   ```
   Use `/yachts` — **not** `/yachts/yachts`, which returns a 500 error page. Wait until the `Loading…` placeholders are replaced by real cards (each card reads "`<n> Guests · <n> Cabins · <n> Length · <rating>`"). This takes ~5–8 s.

2. **Open the Filter modal.** Snapshot, find the button labelled `icon Filters` (it gains a count badge, e.g. `icon Filters 1`, once a filter is active) and click it.
   ```bash
   browse snapshot --remote --session "$sid"   # locate "button: icon Filters"
   browse click "@<ref>" --remote --session "$sid"
   browse wait timeout 2000 --remote --session "$sid"
   ```
   The modal contains, top-to-bottom: **Sort By**, **Harbors**, **Brands**, and **Size**, with **Reset** / **Apply** at the bottom.

3. **Set the Size min and max via JavaScript (most reliable).** The Size control is two native `<input type="range">` elements (`min=20`, `max=200`, `step=1`): the **first** input is the MIN handle, the **second** is the MAX handle. Setting them with the native value setter + `input`/`change` events updates the Angular model and the "Min. N Feet / Max. N Feet" labels:
   ```bash
   browse eval "(() => {
     const s=[...document.querySelectorAll('input[type=range]')];
     const setN=(el,v)=>{const p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
       p.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true}));
       el.dispatchEvent(new Event('change',{bubbles:true}));};
     setN(s[0], 60);   // MIN feet
     setN(s[1], 120);  // MAX feet
     return JSON.stringify(s.map(x=>x.value));
   })()" --remote --session "$sid"
   ```
   Do **not** waste turns trying to scroll the modal's accessibility tree to drag the handles — the modal a11y snapshot is large and partly truncated, and dragging is imprecise. The JS setter is deterministic. (Focusing a handle and pressing Arrow keys also works but costs one keypress per foot.)

4. **Apply.** Find and click the `button: Apply`.
   ```bash
   browse snapshot --remote --session "$sid"   # locate "button: Apply"
   browse click "@<ref>" --remote --session "$sid"
   browse wait timeout 4000 --remote --session "$sid"
   ```
   On success the URL becomes `https://www.beno.com/yachts?sizes=60,120` and the Filters button shows a `1` badge.

5. **Extract the results.** Each yacht card exposes its length as "`<n> Length`" text. Pull names, lengths, guest counts and hourly prices and confirm every length is within `[min, max]`:
   ```bash
   browse eval "(() => {
     const t=document.body.innerText;
     const lengths=[...t.matchAll(/(\\d+)\\s*Length/g)].map(m=>+m[1]);
     return JSON.stringify({loading:/Loading/.test(t),
       count:(t.match(/Guests/g)||[]).length, lengths,
       allWithinRange: lengths.every(l=>l>=60 && l<=120)});
   })()" --remote --session "$sid"
   ```
   If `loading` is still `true` after the wait, the listing API failed for this session/IP — see the loading-hang gotcha. Re-apply, or restart with a fresh session (new proxy IP).

6. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Browser fallback / shortcut: the `?sizes=` deep-link

`https://www.beno.com/yachts?sizes=<min>,<max>` (comma-separated, no spaces) is the canonical URL the modal produces, and it does pre-activate the size filter (Filters badge shows `1`). It is handy for re-applying a known range *within an already-loaded SPA session*, but on a **cold** load it frequently hangs with the cards stuck on "Loading…". If you use it, always verify cards actually rendered (step 5) and fall back to the warm modal flow (steps 1–4) if they did not.

## Site-Specific Gotchas

- **Use `/yachts`, never `/yachts/yachts`.** The `/yachts/yachts` path (which appears in search-engine results) returns a "500 — Something's gone wrong" page. The working listing URL is `https://www.beno.com/yachts`.
- **"Size" = yacht length in feet.** Default slider range is **20–200 ft**, `step=1`. Two native `<input type="range">`: index `0` = MIN, index `1` = MAX. Display labels are "Min. N Feet" / "Max. N Feet".
- **URL param is `sizes=<min>,<max>`** (e.g. `?sizes=60,120`). The underlying API form is `sizes[]=<min>,<max>` (URL-encoded `sizes%5B%5D=60%2C120`).
- **Listing cards lazy-load — budget 5–8 s.** Before cards render, the grid shows ten "Loading…" placeholders. Snapshotting/extracting too early returns zero yachts. Wait for "Guests"/"Length" text to appear.
- **The cold `?sizes=` deep-link is unreliable.** Navigating fresh to `https://www.beno.com/yachts?sizes=…` (and even reloading it) frequently leaves the cards stuck on "Loading…" indefinitely. Reproduced both manually and by the autobrowse inner agent (it burned its whole turn budget on this). The warm-then-apply modal flow is the dependable path.
- **The private listing API is a confirmed dead end — don't bother.** The cards are populated from `GET https://apps-api.beno.com/v3/deals/products/yacht?…&sizes%5B%5D=<min>,<max>&…`. Direct `browse cloud fetch` returns `403 {"message":"Forbidden"}` (CloudFront `ForbiddenException`), and a page-context `fetch()` fails with "Failed to fetch" (CORS). It needs app-injected auth/headers and is WAF-locked — there is no usable raw-API fast-path. Use the browser UI.
- **Loading hang ↔ API 403 is likely proxy-IP dependent.** The same WAF that 403s the API also appears to gate the in-app listing fetch on some egress IPs, which is what produces the persistent "Loading…" state. If results never load, drop the session and create a fresh one (new IP) rather than waiting longer.
- **Set sliders with JS, not drag/scroll.** The filter modal's accessibility snapshot is large and the Size section is below the modal's internal scroll; agents that try to scroll-and-drag waste many turns. Setting the two range inputs via the native value setter + `input`/`change` events is one deterministic call.
- **No homepage anti-bot.** The pre-run probe and observation show no Akamai/captcha/login wall on `beno.com` itself; the only blocking is the WAF on the `apps-api` data endpoint. Despite that, the successful run used a `--verified --proxies` session (site is UAE-geo); a bare session was not validated.
- **Currency/region.** Prices are shown in AED per hour by default (top-right `EN/AED` toggle). Many yachts also carry a discount badge ("35% off") and a struck-through original price.
- **Other filters share the modal.** The same modal also offers Sort By (Hourly Price Low→High / High→Low, Beno Evaluation), Harbors (Dubai Harbor, Dubai Islands Marina, Dubai Marina, Marsa Al Arab Marina, Marasi Marina Business Bay), and Brands. Setting Size does not disturb them; "Reset" clears all filters.

## Expected Output

```json
{
  "success": true,
  "min_size_feet": 60,
  "max_size_feet": 120,
  "applied_url": "https://www.beno.com/yachts?sizes=60,120",
  "result_count": 10,
  "all_within_range": true,
  "currency": "AED",
  "yachts": [
    { "name": "Jude",      "length_feet": 74,  "guests": 27, "cabins": 3, "price_per_hour": 3250, "discount": "35% off" },
    { "name": "Santorini", "length_feet": 115, "guests": 80, "cabins": 5, "price_per_hour": 9750, "discount": "35% off" },
    { "name": "Sol",       "length_feet": 63,  "guests": 12, "cabins": 3, "price_per_hour": 2275, "discount": "35% off" }
  ],
  "error_reasoning": null
}
```

Other outcome shapes:

```json
// No yachts fall inside the requested range
{ "success": true, "min_size_feet": 150, "max_size_feet": 200,
  "applied_url": "https://www.beno.com/yachts?sizes=150,200",
  "result_count": 0, "all_within_range": true, "yachts": [], "error_reasoning": null }
```

```json
// Listing never finished loading (WAF/API 403 for this session/IP)
{ "success": false, "min_size_feet": 60, "max_size_feet": 120,
  "applied_url": "https://www.beno.com/yachts?sizes=60,120",
  "result_count": 0, "yachts": [],
  "error_reasoning": "Yacht cards stuck on 'Loading...' after Apply; listing data endpoint (apps-api.beno.com) likely 403'd for this egress IP. Retry with a fresh session." }
```
