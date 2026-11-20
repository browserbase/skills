---
name: bayclubs-com-bay-clubs-info-4zbre5
title: Bay Club Location Info Scraper
description: >-
  Aggregate per-location gym data from bayclubs.com — name, full address, phone,
  email, weekly operating hours, and the club-specific amenity list — across all
  33 Bay Club locations for a wellness/health platform.
website: bayclubs.com
category: fitness
tags:
  - fitness
  - gym
  - amenities
  - hours
  - locations
  - directory
source: 'browserbase: agent-runtime 2026-06-09'
updated: '2026-06-09'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      A headless browser (e.g. Browserbase default remote session) renders the
      identical static content and was cross-validated to extract the same 21
      amenities + hours + address as the HTTP parse. Use only if a
      residential-proxy HTTP fetch is unavailable — it costs ~100x more per page
      for no extra data, since nothing is JS-gated.
verified: false
proxies: true
---
# Bay Club Location Info Scraper

## Purpose

Aggregate structured, per-location gym information from `bayclubs.com` for a wellness/health platform: club name, full street address (city, state, ZIP), phone, email, weekly operating hours (Sun–Sat, including "closed" days), and the **club-specific** amenity list. Bay Club is a ~33-location chain of athletic/fitness/golf clubs across California, Washington, and Oregon. The site is a statically-rendered Webflow site — all of this data is present in the initial HTML, so a residential-proxy HTTP fetch + parse is the fast, cheap, reliable path. Read-only; never submits the "Visit a club" lead form.

## When to Use

- Building or refreshing a directory of Bay Club locations with addresses, hours, and offered amenities.
- Comparing amenities across locations (e.g. "which clubs have a pool / spa / pickleball?").
- Periodic re-sync of hours and contact info into an aggregator.
- Any flow that would otherwise scrape Bay Club club pages — the HTML is static, so skip a full browser unless your HTTP path is blocked.

## Workflow

The recommended method is **HTTP fetch through a residential proxy + HTML parse** — no JavaScript execution is required. Every field lives in the server-rendered HTML. A bare (non-proxy) request intermittently gets a Cloudflare "Just a moment" interstitial (HTTP 200 but challenge body, no real content), so route the fetch through a residential proxy (`browse cloud fetch <url> --proxies`).

### 1. Enumerate all locations

Fetch the locations index and harvest every club URL:

```
GET https://bayclubs.com/locations        (via residential proxy)
```

Extract club detail links with the regex `href="(/clubs/[^"]+)"` and de-dupe. This yields **33** locations (the authoritative list — it is a superset of `/sitemap.xml`, which omits `pro-club-seattle` and `griffinclub`). `/sitemap.xml` is an alternative enumeration source but trust `/locations`.

### 2. Fetch each club page

```
GET https://bayclubs.com/clubs/{slug}      (via residential proxy)
```

### 3. Parse the "HOURS & LOCATION INFO" block

Locate the literal heading text `HOURS & LOCATION INFO`. Immediately after it:

- **Weekly hours** — seven lines `Sun:`, `Mon:`, … `Sat:`. Each value is either `H:MM am - H:MM pm` or the literal `closed`. **The colon may be followed OR preceded by whitespace** — match `Day\s*:\s*(closed|\d{1,2}:\d{2}\s*[ap]m\s*-\s*\d{1,2}:\d{2}\s*[ap]m)` (e.g. Griffin Club renders `Sun : 6:00 am - 9:00 pm`). Note invisible zero-width / `‍` joiner characters separate the lines — strip them.
- **Address** — the block between the `Sat:` hours value and the literal `Phone:`, in the form `{Club Name} {street} {City}, {ST} {ZIP}`. The club name prefix duplicates the page `<title>`; strip it to get the clean street+city line. **There is no comma between street and city**, so don't try to split them — keep the line whole and parse `state`/`zip` from the `, {ST} {ZIP}` tail.
- **Phone** — `Phone:\s*([0-9().\- ]{7,20})`.
- **Email** — `Email:\s*([\w.%+\-]+@[\w.\-]+\.\w{2,})`.

### 4. Parse the "CLUB AMENITIES" grid (club-specific)

The amenity list that is *specific to that club* is a Webflow CMS collection. Each card is an anchor:

```html
<a class="clubamenities_linkblock ..." data-category="Fitness Centers" href="/amenities/fitness-center">…</a>
```

Collect the `data-category` attribute (the display name) and the `href` (`/amenities/{slug}`) from every `clubamenities_linkblock` anchor. De-dupe by name. Amenity counts vary by club (observed 4–29), confirming these are club-specific.

**Do NOT** derive amenities from `/amenity/{slug}` (singular) hrefs on the page — those are an identical global footer/nav block present on *every* club page (always the same ~25 links) and are NOT the club's actual offering. The club-specific signal is the `clubamenities_linkblock` / `data-category` cards, whose target hrefs use the **plural** `/amenities/{slug}`.

### 5. Emit one record per club

See **Expected Output**. Cross-validated: parsing 33 club pages yielded fully structured records for 31; see Gotchas for the 2 exceptions.

### Browser fallback

If the proxied HTTP path is unavailable, a headless browser produces the identical data (cross-validated to the exact same 21 amenities + hours + address for `sanfrancisco`):

1. `browse open https://bayclubs.com/clubs/{slug} --remote` (a default Browserbase remote session passed Cloudflare without `--proxies` in testing; add `--proxies` if challenged).
2. Dismiss the Usercentrics cookie banner (click the `OK` button) if it overlays content.
3. `browse snapshot` — the page exposes a full accessibility tree (~458 refs). Read the `HOURS & LOCATION INFO` text and the `CLUB AMENITIES` grid labels (ALL-CAPS in the snapshot; title-case them when emitting).

This costs ~100× the HTTP path per page for zero extra data — use only as a fallback.

## Site-Specific Gotchas

- **Residential proxy for HTTP.** A bare HTTP GET returns `200` but sometimes serves a Cloudflare "Just a moment" / challenge body (no real content). `browse cloud fetch --proxies` was reliable across all 33 pages. (Pre-run probe flagged `cloudflare` + `recaptcha`; reCAPTCHA was never actually triggered on read-only GETs.)
- **Two PRO Club locations live off-domain.** `https://bayclubs.com/clubs/pro-club-seattle` and `/clubs/proclub-bellevue` return **HTTP 301** redirecting to `https://www.proclub.com/club/...`. They have no usable data on bayclubs.com — either follow the redirect and parse proclub.com separately, or flag them `success:false, reason:"offsite_redirect"`. All other 31 clubs render fully on bayclubs.com.
- **Hours colon spacing is inconsistent.** Most clubs render `Sun:` but at least one (Griffin Club) renders `Sun :` (space before colon). Use a whitespace-tolerant regex or you'll silently drop all 7 days for that club.
- **Zero-width joiner noise.** The hours lines are separated by `‍`/zero-width characters; normalize whitespace (`\s+ → " "`) before regex-matching or day boundaries get fuzzy.
- **ZIP ≠ first 5-digit number.** Several addresses begin with a 5-digit street number (e.g. Fremont `46650 Landing Parkway`, Portland `18120 SW…`). Parse ZIP from the `, {ST} {ZIP}` tail, not the first `\d{5}` in the block, or you'll capture the street number.
- **One club spells out the state.** `crowcanyon` renders `Danville, California` (full state name, no ZIP in the tail) instead of `, CA 94526`, so the 2-letter `state`/`zip` extraction returns null there. `address_raw` is still captured intact — fall back to it. All other CA/WA/OR clubs use the 2-letter form.
- **Amenities: plural vs singular path is the whole ballgame.** Club-specific amenities = `clubamenities_linkblock` cards → `data-category` name + `/amenities/{slug}` (plural) href. The `/amenity/{slug}` (singular) and `/new-amenities/{slug}` links are global nav/footer and are identical on every page — using them gives every club the same bogus 25-item list.
- **No JSON-LD / structured-data block.** The pages carry no `application/ld+json`. `/page-json` and `/faq-json` are *not* JSON endpoints — they're ordinary Webflow HTML pages titled "page-json"/"faq-json". Don't waste time trying to hit them as APIs.
- **Hosting fingerprint.** Webflow behind Cloudflare (`X-Wf-Region`, `Surrogate-Key: pageId:…`, `cdn.prod.website-files.com`). Content is fully pre-rendered; there is no client-side data API to discover.
- **Read-only.** Each club page embeds a "Visit a club" lead-capture form (First/Last name, email, phone, club picker). Never fill or submit it.
- **Embedded Google Map may error.** The map iframe sometimes shows "Oops! Something went wrong" — irrelevant to data extraction; the textual address is the source of truth.

## Expected Output

One record per club. Recommended top-level shape is `{ "source": "...", "count": N, "clubs": [ ... ] }`.

```json
{
  "source": "https://bayclubs.com/locations",
  "count": 33,
  "clubs": [
    {
      "success": true,
      "slug": "sanfrancisco",
      "name": "Bay Club San Francisco",
      "url": "https://bayclubs.com/clubs/sanfrancisco",
      "address": "150 Greenwich Street San Francisco, CA 94111",
      "address_raw": "Bay Club San Francisco 150 Greenwich Street San Francisco, CA 94111",
      "state": "CA",
      "zip": "94111",
      "phone": "(415) 433-2200",
      "email": "info.bcsf@bayclubs.com",
      "hours": {
        "Sun": "7:00 am - 7:00 pm",
        "Mon": "5:00 am - 10:00 pm",
        "Tue": "5:00 am - 10:00 pm",
        "Wed": "5:00 am - 10:00 pm",
        "Thu": "5:00 am - 10:00 pm",
        "Fri": "5:00 am - 9:00 pm",
        "Sat": "7:00 am - 7:00 pm"
      },
      "amenities": [
        { "name": "After School Programs", "url": "https://bayclubs.com/amenities/after-school-programs" },
        { "name": "Fitness Centers", "url": "https://bayclubs.com/amenities/fitness-center" },
        { "name": "Pilates", "url": "https://bayclubs.com/amenities/pilates" }
      ],
      "amenities_count": 21,
      "error_reasoning": null
    }
  ]
}
```

Edge-case record shapes:

```json
// Golf-only club with a "closed" day (StoneTree)
{ "success": true, "slug": "stonetree", "name": "StoneTree Golf Club",
  "hours": { "Mon": "closed", "Tue": "7:00 am - 5:00 pm", "...": "..." },
  "amenities_count": 9, "error_reasoning": null }

// Off-domain PRO Club location (301 -> proclub.com)
{ "success": false, "slug": "pro-club-seattle",
  "reason": "offsite_redirect",
  "redirect_to": "https://www.proclub.com/club/locations/seattle",
  "error_reasoning": "Club detail is hosted on proclub.com, not bayclubs.com" }

// State spelled out, ZIP not in 2-letter tail (crowcanyon) — address_raw still valid
{ "success": true, "slug": "crowcanyon", "name": "Bay Club Crow Canyon Country Club",
  "address": "711 Silver Lake Drive Danville, California",
  "state": null, "zip": null,
  "address_raw": "Bay Club Crow Canyon Country Club 711 Silver Lake Drive Danville, California",
  "amenities_count": 11, "error_reasoning": null }
```
