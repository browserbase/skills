---
name: yelp-com-find-menu-jhjk4o
title: Yelp Menu from Photo
description: >-
  Retrieve a restaurant's menu on Yelp by reading its uploaded menu photos:
  clear the DataDome anti-bot wall, enumerate menu-category photos, open the
  full-resolution images from Yelp's CDN, and transcribe sections, items,
  descriptions, and prices via vision. Read-only.
website: yelp.com
category: restaurants
tags:
  - restaurants
  - menu
  - ocr
  - photos
  - datadome
  - read-only
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      A verified Browserbase session with --solve-captchas is mandatory to clear
      Yelp's DataDome 'slide right' challenge and load the biz_photos Menu grid
      (the only place menu-photo IDs are listed). Once IDs are known, the
      full-res /bphoto/<id>/o.jpg images are fetchable directly from
      s3-media*.fl.yelpcdn.com with no anti-bot (HTTP 200), so the
      image-retrieval + OCR step is a plain fetch + vision — hence hybrid rather
      than pure browser.
  - method: fetch
    rationale: >-
      Browserbase Fetch API on yelp.com biz / biz_photos pages returns the
      DataDome captcha interstitial (geo.captcha-delivery.com) on the datacenter
      IP, so fetch CANNOT enumerate menu photos. Fetch only works for the CDN
      image bytes once IDs are known.
verified: true
proxies: false
---
# Yelp Menu from Photo

## Purpose

Given a restaurant on Yelp, return its menu transcribed from the **menu photos** that users and the business have uploaded — section headers, item names, descriptions, and prices. This is the photo-based menu (the "Menu" photo category on the business's photo page), not Yelp's separate structured `/menu/` page (which most restaurants don't have). The skill clears Yelp's DataDome anti-bot wall in a verified browser session, enumerates the menu-category photo IDs, pulls each full-resolution image directly from Yelp's CDN, and reads the image with vision. **Read-only** — it never writes reviews, uploads, or claims a business.

## When to Use

- "What's on the menu / what are the prices at {restaurant} on Yelp?" when the restaurant has no structured Yelp menu but diners have photographed the physical menu.
- Extracting dishes + prices from a steakhouse / cafe / bar whose menu only exists as photographed paper menus.
- Building a menu dataset from Yelp photo galleries.
- Any flow that needs menu content and is willing to OCR/vision-read photographed menus rather than a machine-readable feed.

## Workflow

The optimal method is **hybrid**. A verified browser session is mandatory to clear Yelp's DataDome challenge and load the photo grid (the only place the menu-photo IDs are listed). But the full-resolution images themselves live on `s3-media*.fl.yelpcdn.com`, which is **not** behind DataDome (HTTP 200 directly) — so once you have the photo IDs, retrieving and OCR'ing the images is a plain fetch + vision step. Lead with the browser to clear the wall and enumerate IDs; pull the pixels from the CDN.

1. **Create a verified session with captcha solving.**
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --solve-captchas \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```
   `--verified --solve-captchas` is what gets you past DataDome. (`--proxies` does nothing useful here unless your account actually has residential proxies provisioned — see Gotchas.)

2. **Open the business page and clear DataDome.**
   ```bash
   browse open "https://www.yelp.com/biz/<biz-slug>" --remote
   browse wait load --remote
   browse wait timeout 8000 --remote
   browse get title --remote
   ```
   - If the title is `yelp.com` (and the page shows "We want to make sure you are not a robot / Slide right to secure your access"), you're on the DataDome interstitial. **Wait and re-open the same URL**: `browse wait timeout 8000 --remote` then `browse open "<same url>" --remote` again. `--solve-captchas` clears the challenge in the background. Clearance is confirmed when the URL gains a `?dd_referrer=` param and the title becomes the real business title (e.g. `HOUSE OF PRIME RIB - Updated ... Photos & ... Reviews ...`). Retry the wait+reopen up to ~3 times; it typically clears within 1–2 cycles.

3. **Open the Menu photo grid.**
   ```bash
   browse open "https://www.yelp.com/biz_photos/<biz-slug>?tab=menu" --remote
   browse wait load --remote
   browse wait timeout 3000 --remote
   ```
   Title becomes `Photos and videos for <Restaurant> — Yelp`; the "Menu" tab is selected and shows the menu-photo count. DataDome stays cleared for the rest of the session.

4. **Enumerate menu-photo IDs.** Use `browse get html body --remote` (or `get text body`) — **not** `browse snapshot` (see Gotchas). Extract photo IDs with the regex `yelpcdn\.com/bphoto/([A-Za-z0-9_-]+)/`. In the Menu tab these appear as thumbnails sized `258s.jpg` / `300s.jpg` / `348s.jpg`. Pick the most recent / highest-quality looking menu photos (captions like "Dinner menu", "Dinner accompaniments menu" help).

5. **Retrieve each full-res image from the CDN and transcribe.** Build the full-resolution URL by using the `o.jpg` size segment:
   ```
   https://s3-media0.fl.yelpcdn.com/bphoto/<PHOTO_ID>/o.jpg
   ```
   Then either:
   - **In-session (vision):** `browse open "<o.jpg url>" --remote`, `browse wait timeout 2000 --remote`, `browse screenshot --remote --path shot.png`, then read `shot.png` with vision and transcribe section headers, item names, descriptions, and prices; **or**
   - **Out-of-band (fetch):** the same `o.jpg` URL returns HTTP 200 with no anti-bot (`browse cloud fetch "<o.jpg url>"`), so you can pull the bytes directly and feed them to a vision model.

   Transcribe 2–4 menu photos to cover the whole menu (many restaurants split the menu across multiple photos), then merge them into one menu.

6. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

### Notes for picking a restaurant slug
The `<biz-slug>` is the path segment in `https://www.yelp.com/biz/<biz-slug>` (e.g. `house-of-prime-rib-san-francisco`). If you only have a name + city, you must first resolve the slug — but the Yelp search page is also DataDome-walled, so do it inside the cleared session (open `https://www.yelp.com/search?find_desc=<name>&find_loc=<city>` after clearance and read the first result's `/biz/` href).

## Site-Specific Gotchas

- **Yelp is fronted by DataDome, not PerimeterX.** The "Slide right to secure your access" page is served from `geo.captcha-delivery.com` / `ct.captcha-delivery.com`. It appears on essentially every yelp.com page (homepage included) when the request comes from a flagged IP.
- **`--verified --solve-captchas` is what clears it — and it needs a wait + re-navigation.** Browserbase's solver works on DataDome here, but not instantly: on first load you'll usually land on the captcha; wait ~8s and re-open the same URL. The tell-tale sign of success is a `?dd_referrer=` query param appended to the URL and the real page title appearing. A single `browse get title == "yelp.com"` means you're still walled.
- **Datacenter IPs alone get walled; residential proxies would avoid the captcha entirely — but `--proxies` only helps if your account has proxies provisioned.** On the account used to build this skill, `--proxies` was a no-op: `proxyBytes` stayed `0` and the egress IP remained an AWS address (and DataDome still triggered). Don't assume `--proxies` gives you a residential IP — verify with an IP-echo (`https://api.ipify.org?format=json`) and check `proxyBytes` on the session. Because of this, the working configuration here is `verified: true, proxies: false`.
- **The Fetch API cannot enumerate menu photos.** `browse cloud fetch` on `yelp.com/biz` or `/biz_photos` (with or without `--proxies`) returns the DataDome JS-challenge HTML (`dd={...captcha-delivery.com...}`), not the real page. Don't waste time trying to scrape the photo list via fetch — you need the cleared browser session for that. Fetch **does** work for the CDN images (`s3-media*.fl.yelpcdn.com/.../o.jpg` → 200).
- **Image size segments:** `/<id>/o.jpg` = original/full-res (use this — legible for OCR), `/<id>/258s.jpg`, `/300s.jpg`, `/348s.jpg`, `/l.jpg`, `/348x348.jpg` = thumbnails/crops (too small/cropped to read reliably). Always swap to `o.jpg`.
- **`browse snapshot` is unreliable in this environment.** It frequently returns only the npm `Update available: 0.7.x -> 0.8.x` banner instead of the accessibility tree, which breaks ref-based clicking. Prefer `browse get html body` / `get text body` for extraction and `browse screenshot` + vision for reading photos.
- **Menu photos are user-uploaded and inconsistent.** Some are crisp scans of a printed menu; others are dim, angled, glare-y, or partial. Photo captions ("Dinner menu", "Drink menu") help you pick the readable ones. Expect to read several photos and merge; a single photo rarely contains the whole menu. Transcribe prices exactly as printed and don't invent items you can't read — mark unreadable regions rather than guessing.
- **Not every restaurant has menu photos.** If the Menu tab shows 0 photos, return `success: false, error_reasoning: "no menu photos available"`. Fall back to Yelp's structured `/menu/<biz-slug>` page only if it exists (most don't).
- **DataDome clearance is per-session.** Once `?dd_referrer=` appears, all subsequent yelp.com navigations in that same session stay cleared — no need to re-solve between the biz page, the photo grid, and search.

## Expected Output

```json
{
  "success": true,
  "restaurant": "House of Prime Rib",
  "biz_slug": "house-of-prime-rib-san-francisco",
  "source_photo_urls": [
    "https://s3-media0.fl.yelpcdn.com/bphoto/-6sjcxqCb1yD9UpHoRnKpw/o.jpg"
  ],
  "menu": [
    {
      "section": "Prime Rib Dinners",
      "note": "Served with salad, mashed potatoes or baked potato, Yorkshire pudding & creamed spinach.",
      "items": [
        { "name": "The City Cut", "description": "A smaller cut for those with a lighter appetite", "price": "$35.45" },
        { "name": "House of Prime Rib Cut", "description": "A hearty portion of juicy, tender beef", "price": "$37.85" },
        { "name": "The English Cut", "description": "Some feel that a thinner slice produces the better flavor", "price": "$37.85" },
        { "name": "King Henry VIII Cut", "description": "Extra-generous thick cut of prime rib, for king-size appetites", "price": "$39.85" },
        { "name": "Children's Prime Rib Dinner", "description": "Complete with milk and ice cream (for children 8 and under)", "price": "$11.45" }
      ]
    }
  ],
  "error_reasoning": null
}
```

Failure / edge shapes:

```json
// DataDome never cleared after retries
{ "success": false, "restaurant": "...", "menu": [], "error_reasoning": "DataDome captcha wall not cleared after 3 retries" }

// Restaurant exists but has no menu photos
{ "success": false, "restaurant": "...", "menu": [], "error_reasoning": "no menu photos available in the Menu tab" }

// Photos exist but are too low-quality / illegible to transcribe reliably
{ "success": true, "restaurant": "...", "source_photo_urls": ["..."], "menu": [{ "section": "Unlabeled", "items": [], "note": "menu photos present but too dim/angled to transcribe reliably" }], "error_reasoning": null }
```
