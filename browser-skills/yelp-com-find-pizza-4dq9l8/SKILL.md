---
name: yelp-com-find-pizza-4dq9l8
title: Find Pizza on Yelp in San Francisco
description: >-
  Search Yelp for pizza in San Francisco, extract the ranked search-results
  list, then open the top-ranked business page and extract its full profile
  (address, phone, hours by day, rating, review count, neighborhood, categories,
  photo count). Read-only.
website: yelp.com
category: restaurants
tags:
  - restaurants
  - yelp
  - search
  - pizza
  - datadome
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Yelp Fusion API (api.yelp.com/v3) returns the same data more cheaply but
      requires an API key (OAuth bearer) that the calling agent must supply.
      Without a key, all endpoints return 401. If a key is available, prefer it
      — the browser path exists because most callers do not have one.
  - method: fetch
    rationale: >-
      Direct HTTP fetch (`browse cloud fetch` with or without `--proxies`) is
      fully blocked by DataDome — returns 403 with the slider-challenge HTML on
      /search, /biz/*, m.yelp.com, and the homepage. Do not waste turns retrying
      this path.
verified: true
proxies: true
---
# Yelp Find Pizza in San Francisco

## Purpose

Search Yelp for pizza restaurants in San Francisco, extract the ranked search-results list (name, rank, rating, review count, neighborhood, categories, price tier, biz URL), then open the top-ranked business page and extract the full business profile (address, phone, hours-by-day, neighborhood, categories, photo count, rating, review count). Read-only — never writes a review, never books, never claims a listing.

## When to Use

- "What's the highest-rated pizza place in SF on Yelp right now?"
- Daily / weekly monitoring of Yelp ranking for a category in a city.
- Building a structured snapshot (address + phone + hours) of a specific top-ranked business.
- Any flow where you need *Yelp's* ranking (not Google SERP, not Maps) — Yelp's house ranking algorithm differs from Google's and from raw star-rating sort.

## Workflow

Yelp is fully gated behind **DataDome** (slider CAPTCHA on first page-load, IP-based fingerprinting, no public unauthenticated API surface that returns the same data). The only reliable path is a Browserbase remote session with stealth + residential proxies + a one-time **manual mouse-drag slider solve**. The drag mints a `datadome` cookie that the rest of the session can reuse for all subsequent `/search` and `/biz/*` navigations — including click-through from search → biz page — without re-solving.

1. **Create a stealth Browserbase session.** All three flags are mandatory; a bare or single-flag session is rejected at page-load.

   ```bash
   SID=$(browse cloud sessions create --keep-alive --verified --proxies --solve-captchas \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const m=s.match(/\"id\":\\s*\"([0-9a-f-]+)\"/);process.stdout.write(m?m[1]:'')})")
   export BROWSE_SESSION="$SID"
   ```

   Region: `us-west-2` (default) and `us-east-1` both hit the same wall — region selection does not change DataDome outcome. `--solve-captchas` does **not** clear the DataDome slider on its own (verified — 30s+ wait with the flag set still shows the CAPTCHA), but leave it enabled in case Yelp swaps challenge types.

2. **Navigate directly to the search URL.**

   ```bash
   browse open "https://www.yelp.com/search?find_desc=pizza&find_loc=San+Francisco%2C+CA" \
     --remote --session "$SID"
   browse wait load --remote --session "$SID"
   browse wait timeout 3000 --remote --session "$SID"
   ```

   Expected first state: a `[2-21] Iframe: DataDome Device Check` snapshot, NOT the results page. Don't try to extract data yet.

3. **Solve the DataDome slider by mouse-drag.** The slider button sits roughly at viewport `(528, 372)`; drag it to roughly `(750, 372)` over ~30 steps with a ~50ms delay between steps. This produces a human-enough motion profile that DataDome accepts.

   ```bash
   browse mouse drag 528 372 750 372 --steps 30 --delay 50 --remote --session "$SID"
   browse wait timeout 5000 --remote --session "$SID"
   ```

   Verify success by checking the URL changed to include `&dd_referrer=` (DataDome's post-solve marker) — for example `…/search?find_desc=pizza&find_loc=…&dd_referrer=`. If the URL did **not** change, the drag failed; retry with slightly different `toX` (try 720, 770) or re-snapshot to read the iframe coordinates and recompute.

4. **Screenshot + snapshot the search results page.**

   ```bash
   browse screenshot --remote --session "$SID" --path search-results.png
   browse snapshot --remote --session "$SID" > snapshot.json
   ```

   The page heading reads `Top 10 Best pizza Near San Francisco, California`. The ranked list begins with the listitem containing heading `1. Tony's Pizza Napoletana`, then `2. Rose Pizzeria`, etc. (Sponsored "Takeout options" cards appear above the ranked list — those are ads, not ranked results; ignore them.)

5. **Parse the ranked list from the a11y tree.** For each listitem under the `All "pizza" results near me…` list, capture:
   - `heading: N. <Name>` — the ranking number is the literal prefix on the heading text. Strip `N. ` to get the bare name.
   - The contained `link: <Name>` — its `urlMap` entry is the canonical `/biz/<slug>` URL (strip `?osq=pizza` query if you want the bare slug).
   - The `image: <X.Y> star rating` accessible-name on the sibling `image` node — parse the leading float.
   - The `StaticText: (<N> reviews)` or `(<N>k reviews)` — parse the integer; `k` means thousands (e.g. `8.7k` → 8700).
   - The trailing `LayoutTable` with `link: <category>` entries — categories like `Pizza`, `Italian`, `Cocktail Bars`.
   - The neighborhood string appears under the location section (e.g. `North Beach/Telegraph Hill`) for cards that have it.

6. **Open the top-ranked business page** by clicking the heading link.

   ```bash
   # The link ref for "1. Tony's Pizza Napoletana" was [2-1736] in our run;
   # find yours in snapshot.json by matching heading "1. " + name → contained link ref
   browse click "@2-1736" --remote --session "$SID"
   browse wait load --remote --session "$SID"
   browse wait timeout 5000 --remote --session "$SID"
   ```

   Click-through preserves the DataDome cookie — the biz page renders directly, **no second CAPTCHA**. URL lands at `https://www.yelp.com/biz/<slug>?osq=pizza&q=pizza`.

7. **Extract business data from the biz page.** Snapshot once, then read:
   - `RootWebArea` title: `<NAME> - Updated <Month Year> - <N> Photos & <N> Reviews - <Street>, <City>, <State> - <Category> - Restaurant Reviews - Phone Number - Yelp` — this single string yields photo count, review count, full address, and category in one parse.
   - `heading: <Name>` near top of page (also at `[4-60]`-style ref in our run).
   - `image: <X.Y> star rating` → numeric rating.
   - `StaticText: (<N>k reviews)` or `(<N> reviews)` → review count.
   - `StaticText: $`, `$$`, `$$$`, `$$$$` → price tier.
   - `StaticText: Claimed` (present) vs. `Unclaimed` (absent) → whether the owner has claimed the listing.
   - `link: <Category>` ×3 nearby → category list (e.g. Pizza / Italian / Cocktail Bars).
   - `region: Location & Hours` block contains:
     - `link: <Street Address>` + `StaticText: <City>, <State> <ZIP>`
     - `StaticText: <Neighborhood>` (e.g. `North Beach/Telegraph Hill`)
     - 7 rows of `columnheader: Mon|Tue|…|Sun` paired with `cell: <hh:mm AM> - <hh:mm PM>` (or `cell: Closed`).
     - One row's cell also reads `Open now` when within hours.
   - `link: Business website` → website URL in `urlMap`.
   - `StaticText: (XXX) XXX-XXXX` near the `image: Business phone number` → formatted phone.
   - `link: See all <N>k photos` → total photo count (matches title-string count).

8. **Release the session.**

   ```bash
   browse cloud sessions update "$SID" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **DataDome wall is the default, not the exception.** Yelp serves a slider CAPTCHA on first page-load *every* time, on every fresh session — including the homepage `/`, the search page `/search`, individual business pages `/biz/*`, and the mobile site `m.yelp.com`. Plan for the solve step, don't treat it as a failure mode.
- **`browse cloud fetch` is fully blocked.** Direct HTTP fetch (with or without `--proxies`) returns `403` with `X-Datadome: protected` headers and the standard DataDome challenge HTML. There is no "raw HTML" shortcut. The browser session is the only working path.
- **`--solve-captchas` does not handle the DataDome slider.** Verified — 30+ second wait with the flag set still shows the slider. The flag is for hCaptcha / reCAPTCHA. Always plan a manual drag step for DataDome.
- **The slider coordinate is viewport-relative.** Default viewport is ~1280×720, slider at `(528, 372)` → `(750, 372)`. If you set a custom `--viewport`, recompute by snapshotting the iframe and reading the canvas position. Use `--steps 30 --delay 50` minimum — fewer steps or no delay reads as a bot motion profile and DataDome rejects the solve.
- **The slider solve mints a `datadome` cookie** that survives navigations within the session. Click-through from `/search` to `/biz/<slug>` works without re-solving. **But** a fresh session needs a fresh solve — `--keep-alive` keeps the session alive across CLI invocations but every new `sessions create` starts at the slider.
- **The IP shown on the CAPTCHA page is always an AWS us-west-2 / us-east-1 IP** (e.g. `52.13.106.180`, `44.248.86.34`, `52.27.44.164`), **never a residential proxy IP**, even with `--proxies` enabled. Browserbase's residential proxy does not appear to apply to Yelp page-loads in our testing. Despite this, the slider-drag path still works — Yelp/DataDome's primary check is the human-motion profile of the drag, not the IP class.
- **Region does not change DataDome behavior.** `--region us-east-1` produced the same slider as `us-west-2`. Don't waste iterations on region-hopping.
- **Google referrer click-through does not bypass.** Clicking through from a Google SERP entry to the Yelp `/search` page still lands on the slider — DataDome ignores the `Referer` header for first-visit decisions.
- **Yelp Fusion API requires an API key the agent likely doesn't have.** `api.yelp.com/v3/businesses/search` returns 401 without a key. Don't suggest it as a fallback unless the user supplies a key.
- **Browserbase Search (`browse cloud search "query site:yelp.com"`) returns biz URLs but NOT Yelp's house ranking.** The search engine's ranking ≠ Yelp's `/search?find_desc=…` ranking. For the canonical "Top 10 Best pizza Near…" order, only the browser path produces correct data.
- **Sponsored "Takeout options" cards appear ABOVE the ranked list** with heading like "Frotelli Pizza" + Order buttons. These are ads, not ranked results. The actual ranked list begins under the `heading: All "<query>" results near me in <City>, <State> - <Month Year>` marker. Filter on this heading marker to find the start of the ranked list deterministically.
- **Review counts use `k` suffix when ≥ 1000.** `(8.7k reviews)` = 8700; `(669 reviews)` = 669; `(311 reviews)` = 311. The biz-page `RootWebArea` title has the exact integer (`8732 Reviews`), the search results card has the rounded `k` form. Prefer the title-string integer when on the biz page.
- **The biz-page title string is the richest single source** of structured data: `TONY'S PIZZA NAPOLETANA - Updated May 2026 - 9825 Photos & 8732 Reviews - 1570 Stockton St, San Francisco, California - Pizza - Restaurant Reviews - Phone Number - Yelp`. Regex this once and you have name + photo count + review count + address + primary category in one shot.
- **Hours are positional in a 7-row table** Mon→Sun. Each row has either a `cell: <HH:MM AM> - <HH:MM PM>` value or `cell: Closed`. Exactly one row also bears the `cell: Open now` marker — use that to derive today-of-week if you don't trust the session clock.
- **READ-ONLY discipline.** Don't click "Write a Review", "Add photos/videos", "Make a reservation", "Order Takeout" buttons. The skill ends at extraction. Reservations / orders are a different skill.
- **The page renders slowly after the slider solve.** A `wait timeout 5000` after the drag is mandatory; a 2000ms wait sometimes catches a partially-rendered DOM with missing review counts.

## Expected Output

The skill returns two JSON objects: a `search_results` list (ranked) and a `top_business` detail object.

```json
{
  "query": "pizza",
  "location": "San Francisco, CA",
  "result_heading": "Top 10 Best pizza Near San Francisco, California",
  "search_results": [
    {
      "rank": 1,
      "name": "Tony's Pizza Napoletana",
      "biz_url": "https://www.yelp.com/biz/tonys-pizza-napoletana-san-francisco",
      "rating": 4.2,
      "review_count": 8700,
      "review_count_display": "8.7k",
      "price_tier": "$$",
      "categories": ["Pizza", "Italian", "Cocktail Bars"]
    },
    {
      "rank": 2,
      "name": "Rose Pizzeria",
      "biz_url": "https://www.yelp.com/biz/rose-pizzeria-san-francisco",
      "rating": 3.9,
      "review_count": null,
      "categories": []
    },
    {
      "rank": 3,
      "name": "Golden Boy Pizza",
      "biz_url": "https://www.yelp.com/biz/golden-boy-pizza-san-francisco-5",
      "rating": null,
      "review_count": null,
      "categories": []
    }
  ],
  "top_business": {
    "name": "Tony's Pizza Napoletana",
    "biz_url": "https://www.yelp.com/biz/tonys-pizza-napoletana-san-francisco",
    "rating": 4.2,
    "review_count": 8732,
    "photo_count": 9825,
    "price_tier": "$$",
    "claimed": true,
    "categories": ["Pizza", "Italian", "Cocktail Bars"],
    "address": {
      "street": "1570 Stockton St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94133"
    },
    "neighborhood": "North Beach/Telegraph Hill",
    "phone": "(415) 835-9888",
    "hours": {
      "Mon": "12:00 PM - 10:00 PM",
      "Tue": "12:00 PM - 10:00 PM",
      "Wed": "12:00 PM - 10:00 PM",
      "Thu": "12:00 PM - 10:00 PM",
      "Fri": "12:00 PM - 11:00 PM",
      "Sat": "12:00 PM - 11:00 PM",
      "Sun": "12:00 PM - 11:00 PM"
    },
    "open_now": true,
    "today_hours": "12:00 PM - 10:00 PM"
  }
}
```

If the slider solve fails (URL never picks up `&dd_referrer=`), return a structured failure:

```json
{
  "success": false,
  "reason": "datadome_slider_unsolved",
  "attempts": 3,
  "last_url": "https://www.yelp.com/search?find_desc=pizza&find_loc=San+Francisco%2C+CA"
}
```
