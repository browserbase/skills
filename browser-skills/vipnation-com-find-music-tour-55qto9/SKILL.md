---
name: vipnation-com-find-music-tour-55qto9
title: VIP Nation List Tours
description: >-
  List currently-promoted artist tours on vipnation.com — tour title, slug,
  canonical URL, and (when reachable) full stop list with date, venue, city, and
  ticket-package availability. Read-only; never follows purchase CTAs.
website: vipnation.com
category: ticketing
tags:
  - ticketing
  - concerts
  - tours
  - live-nation
  - vip-packages
  - spa
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      The full tour catalog is in one JSON state blob (CloudFront-cached, or
      live at /api/v1/rest-content/index). One HTTP request, no auth, no
      anti-bot — but the response is multi-MB and is blocked by 1MB-capped fetch
      APIs (e.g. Browserbase Fetch). Use this when your harness has no
      response-size cap.
  - method: api
    rationale: >-
      For just enumerating tour slugs (not full metadata), the sitemap at
      vipnation.7.prod.bubbleup.com/api/v1/sitemap/vipnation.com/sitemap.xml is
      ~700KB and contains 1,457 /tour/{slug} URLs in one request. No size cap
      problem. Use as a Path-A fallback when only slug-level data is needed.
  - method: browser
    rationale: >-
      Drive the Angular SPA directly on /tours. Bare session — no stealth, no
      residential proxy needed (plain CloudFront/S3, no anti-bot). 3–8s render
      wall while window.GLOBAL_STATE_PROMISE resolves. Use this when the
      state-blob API is blocked by a fetch size cap and you need full per-stop
      metadata.
verified: false
proxies: false
---
# VIP Nation List Tours

## Purpose

Return the list of artist tours currently promoted on `vipnation.com/tours` — for each tour, the artist/title, slug, canonical landing-page URL, and (when reachable) the tour's stop list with date + venue + city + ticket-package availability. Read-only: never click "Buy" / "Get Tickets" / waiver / sign-up CTAs.

## When to Use

- Cataloging which artists currently sell VIP packages through Live Nation's VIP Nation property.
- Daily / weekly monitoring for newly added tours or new stops on an existing tour.
- Resolving "where can I get a VIP package for {artist}" — the catalog is keyed on artist+tour slugs.
- Bulk extraction across all 50+ currently-active tours; the site is a single SPA fed from one CMS state blob, so any per-tour browser path is paying a flat startup cost for the whole render.

## Workflow

**Architecture (verified by inspecting the bootstrap HTML).** `vipnation.com` is an Angular SPA built on the BubbleUp CMS platform (a Live Nation Entertainment ticketing-content product, same shell as `vipliveevents.com`, `concertfix.com`, and several Live Nation-owned artist sites). Every URL — `/`, `/tours`, `/tour/{slug}` — returns the same ~2.5KB SPA shell with an `<app-root>` placeholder. The shell's inline `<script>` synchronously fetches the entire site content as a single JSON state blob, then the Angular router renders the requested route from that blob client-side. There is **no SSR and no per-route HTML** — `curl https://www.vipnation.com/tour/grey-day-tour-2026` and `curl https://www.vipnation.com/tours` are byte-identical except for the OneTrust script tag.

This gives three operational paths, in order of preference:

### Path A (recommended): single JSON state-blob fetch

The entire tour catalog (every tour, every stop, every ticket package, with pricing where published) is in one JSON file. This is the same blob the SPA itself reads. **Fast lane: one HTTP request, no JS execution, no anti-bot, no auth.**

1. **Resolve the current state-blob URL via the pointer file.** The pointer is a tiny text file (~130 bytes) on CloudFront that contains a base64-encoded URL of the latest JSON revision:

   ```
   GET https://dn9vpp1cp40r1.cloudfront.net/vipnation/2/api-cache/gzip/p_vipnation2.txt?cacheBust=<random>
   ```

   The body is base64. Decode it and you get the absolute URL of the current state JSON, of the form:

   ```
   https://dn9vpp1cp40r1.cloudfront.net/vipnation/2/api-cache/gzip/revision-<NNNN>_<random>.json
   ```

   The `?cacheBust=<random>` query param is **mandatory** — the SPA appends `Math.random()` here because both CloudFront and the upstream are aggressively cached. Without it, you risk an hour-stale pointer.

2. **Fetch the state JSON.** GET the decoded URL. The response is **a single multi-megabyte JSON document** (gzip on the wire, despite the `.json` extension — observed ~1.3–1.5 MB gzipped, several MB uncompressed). **A `>1MB` response cap will block this fetch** (e.g. `browse cloud fetch` and Browserbase's `/v1/fetch` both 502 with "The response body exceeded the maximum allowed size of 1MB"). On any agent harness with such a cap, fall back to Path B or Path C.

3. **Extract tours.** Within the JSON state, the tour catalog lives under a `tours` or `pages.tours` array (key name varies — confirm by string-matching `"tour"` on the parsed top-level keys). Each tour entry has at minimum: `slug`, `name` / `title`, `artist`, `stops[]` (array of `{date, venueName, city, state, country, ticketUrl, packageNames}`), `imageUrl`, `description`. Some entries also carry `liveNationEventId` and a `bubbleupContentId`.

4. **Live equivalent (also size-blocked from constrained sandboxes).** The same blob is served fresh (no CloudFront cache) from the BubbleUp origin:

   ```
   GET https://vipnation.7.prod.bubbleup.com/api/v1/rest-content/index
   Header: SiteName: vipnation.com
   ```

   Use this when you suspect the CloudFront blob is stale (e.g., comparing tour counts to verify a recent publish). Same size as the CloudFront copy, so the same 1MB cap blocks it.

### Path B (fallback): sitemap-based tour-slug enumeration

When Path A is blocked by a response-size cap, the sitemap is your fastest source of truth for the **universe of tour slugs**:

```
GET https://vipnation.7.prod.bubbleup.com/api/v1/sitemap/vipnation.com/sitemap.xml
```

~700KB, no auth, no anti-bot, single response. Verified 2026-05-18: contains 4,293 `<url><loc>` entries, of which **1,457 are `/tour/{slug}` paths**. Filter and parse:

```bash
xmllint --xpath '//*[local-name()="loc"]/text()' sitemap.xml \
  | grep -oE 'https://vipnation\.com/tour/[^[:space:]]+'
```

**This is a superset of the live tour list — it includes historical tours (back to 2009) and unpublished drafts.** The sitemap does NOT distinguish active from concluded. Of the 1,457 tour slugs (last verified 2026-05-18):

- 55 contain "2026" in the slug (current year)
- 74 contain "2025"
- 510 contain a year `2010–2024` (historical / concluded)
- 818 have no year in the slug — could be either evergreen current tours OR pre-2010 historical tours.

Slug→title heuristics: replace `-` and `_` with spaces, title-case, strip trailing `-<digit>` disambiguators (`/tour/2026-3` is a placeholder slug, not a meaningful title — fall through to Path A or C for these). Slugs with a year suffix (`-2026`, `-tour-2026`) are reliable signals of currency.

If your task is just "give me a list of tour slugs and inferred titles," Path B alone is sufficient — one HTTP request, no rendering, no anti-bot. If the task requires dates / venues / ticket packages, you must combine Path B with Path A or Path C.

### Path C (browser fallback): drive the SPA

When you need full tour metadata AND your fetch has a size cap that blocks Path A AND you have browser-driving access:

1. **Session.** A bare Browserbase session is fine — no anti-bot stealth or residential proxy observed on `vipnation.com`. The CDN is plain CloudFront with no Akamai / DataDome / PerimeterX / hCaptcha:
   ```bash
   sid=$(browse cloud sessions create --keep-alive | jq -r .id)
   ```

2. **Navigate.** Open `https://www.vipnation.com/tours`. The SPA's `GLOBAL_STATE_PROMISE` (visible in the inline `<script>` in the page HTML) is **synchronous and blocking** — it runs as soon as the bootstrap script parses and stalls Angular's `app-root` render until the state JSON resolves. Expect **3–8 s wall-clock** between `wait load` and a renderable accessibility tree, dominated by the state blob's download.

   ```bash
   browse open "https://www.vipnation.com/tours" --remote --session "$sid"
   browse wait load --remote --session "$sid"
   browse wait timeout 4000 --remote --session "$sid"
   browse snapshot --remote --session "$sid"
   ```

3. **Extract from the snapshot.** Tour cards in the `/tours` route are anchor elements pointing to `/tour/{slug}` — these are the canonical entry points. Capture each card's anchor (`href`) plus its text label (the tour title). The card grid is virtualized with the `swiper` library, so initial snapshot may only contain the first N cards; scroll with `browse mouse scroll` and re-snapshot until card count stabilizes across two consecutive snapshots.

4. **Per-tour detail (if needed).** Open each `/tour/{slug}` URL in the same session. The detail page is a stop list — each stop is a row with date, venue, city, and one or more "VIP Package" CTAs that link to a Live Nation / Ticketmaster purchase URL. **Do NOT click the CTAs** — they open the purchase flow on `concerts.livenation.com` or `ticketmaster.com`, which is out-of-scope for a read-only listing task and triggers ticketing-side anti-bot (DataDome on Ticketmaster).

5. **Release.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

## Site-Specific Gotchas

- **The /tours route renders client-side from a single multi-MB JSON blob.** `curl https://www.vipnation.com/tours` returns an `<app-root>` shell with zero visible tour content. Anything before `GLOBAL_STATE_PROMISE` resolves is unrenderable; a `browse get markdown body` immediately after `wait load` will be empty.
- **The 1MB response cap on Browserbase Fetch (`browse cloud fetch`) hard-blocks the JSON state blob.** Verified 2026-05-18: requests to both `https://dn9vpp1cp40r1.cloudfront.net/vipnation/2/api-cache/gzip/revision-*.json` and `https://vipnation.7.prod.bubbleup.com/api/v1/rest-content/index` return `502 Bad Gateway: The response body exceeded the maximum allowed size of 1MB. Use a browser session to handle large responses.` Range headers (`Range: bytes=0-900000`) are silently dropped — the upstream is fetched in full before the cap is enforced. **Use a browser session, or a fetch path with no size cap.**
- **The CloudFront pointer file requires a `cacheBust` query param.** The SPA appends `?cacheBust=<Math.random()>` to `p_vipnation2.txt` because both CloudFront and the BubbleUp origin cache aggressively. Without it, you risk reading an hour-stale revision pointer. Always append a fresh random/UUID.
- **The pointer body is base64-encoded, not a plain URL.** Decode before fetching the second URL. Failing to decode produces a 403 from CloudFront because the encoded string isn't a valid path.
- **Tour slug = the only stable identifier.** BubbleUp's internal `contentId` is not exposed in URLs or sitemap; the slug is the canonical key. Two tours with identical titles are disambiguated with a trailing `-2026`, `-2`, `-13`, etc. Slugs like `/tour/2026-3` are placeholders for unfilled drafts — there is no meaningful title in the slug and the detail page may be empty.
- **Sitemap contains historical tours back to ~2009.** The `<lastmod>` is `2026-05-18` for every entry regardless of whether the tour was last published in 2010 — it's the sitemap-generation date, not the content-modification date. Don't use `<lastmod>` to filter active tours. Use slug-year heuristics, or cross-reference with Path A's state JSON (which only exposes currently-published tours).
- **No SSR, no JSON-LD, no Open Graph beyond a static site-level set.** Every URL returns the same `<title>VIP Nation</title>` and the same site-level OG image. Per-tour metadata exists only after JS runs.
- **No anti-bot, no auth, no rate-limit observed.** Plain CloudFront + S3 origin. A bare (non-stealth, non-proxied) Browserbase session navigates `vipnation.com` without challenges. The `recaptcha/api.js` script in the page HTML is loaded for the newsletter signup form, not for traffic gating. **Do not pay for `--verified --proxies` here** — it's wasted spend.
- **Ticket-purchase CTAs leave the property to Live Nation / Ticketmaster.** Every "Get Package" / "Buy VIP" button on a `/tour/{slug}` detail page is an outbound anchor to `concerts.livenation.com`, `ticketmaster.com`, or `livenation.com`. Those properties have aggressive anti-bot (DataDome on Ticketmaster, Akamai on Live Nation). For a read-only listing task, **do not follow these links** — capture the URL and stop.
- **OneTrust consent banner.** The page loads `cdn.cookielaw.org`'s OneTrust SDK. Tested 2026-05-18: the banner does NOT block scrolling or content extraction; ignore it. If a future change starts blocking interaction, dismiss via `button: Accept All Cookies` from the snapshot.
- **The SPA uses Live Nation's white-label font + styling** (`LiveNationSans-*.woff2`) — visual confirmation that this property is a Live Nation Entertainment vehicle, not an independent operator. Useful as a sanity check that you're on the right property; if those fonts aren't in the preload list, you've been redirected.
- **`window.GLOBAL_STATE_PROMISE` is the renderable-state signal.** If you're scripting the browser with `browse eval`, awaiting this promise is more reliable than polling for tour-card DOM elements:
  ```js
  await window.GLOBAL_STATE_PROMISE; // resolves to the raw state JSON string
  ```

## Expected Output

```json
{
  "source": "state-blob",
  "fetched_at": "2026-05-18T19:30:00Z",
  "revision": "6992_2z0F-y1SpL4Dzyyz",
  "tour_count": 55,
  "tours": [
    {
      "slug": "grey-day-tour-2026",
      "title": "Grey Day Tour 2026",
      "artist": "Suicideboys",
      "url": "https://www.vipnation.com/tour/grey-day-tour-2026",
      "image_url": "https://images.bubbleup.com/.../grey-day-2026.jpg",
      "description": "...",
      "stops": [
        {
          "date": "2026-06-12",
          "venue": "MidFlorida Credit Union Amphitheatre",
          "city": "Tampa",
          "state": "FL",
          "country": "US",
          "ticket_url": "https://concerts.livenation.com/event/...",
          "packages": ["VIP Soundcheck Experience", "Premium Lounge Package"]
        }
      ]
    }
  ]
}
```

Sitemap-only fallback output shape (Path B without Path A or C):

```json
{
  "source": "sitemap",
  "fetched_at": "2026-05-18T19:30:00Z",
  "tour_count": 1457,
  "tours": [
    {
      "slug": "grey-day-tour-2026",
      "title_inferred": "Grey Day Tour 2026",
      "url": "https://www.vipnation.com/tour/grey-day-tour-2026",
      "year_hint": 2026,
      "stops": null,
      "note": "Detail not loaded — fetch /tour/{slug} via browser to populate stops/packages."
    }
  ]
}
```

Empty/degenerate cases:

```json
// State blob successfully fetched but contains zero currently-published tours
{ "source": "state-blob", "tour_count": 0, "tours": [], "note": "No tours currently published." }

// All paths blocked (1MB cap on fetch AND no browser available)
{ "success": false, "reason": "all_paths_blocked", "detail": "State JSON exceeds harness fetch cap; no browser session available." }
```
