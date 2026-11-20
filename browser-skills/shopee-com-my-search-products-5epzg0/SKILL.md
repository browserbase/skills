---
name: shopee-com-my-search-products-5epzg0
title: Shopee Malaysia Product Search
description: >-
  Search Shopee Malaysia for products by keyword and return structured results —
  title, MYR price, sold count, rating, shop name, discount, canonical URL.
  Supports filters for price range, location (Peninsular/East Malaysia),
  shipping type, and sort by relevance/popularity/price. Read-only. Documents
  Shopee MY's hard anti-bot wall (Server Gateway error 90309999,
  /verify/traffic/error?type=4) confirmed across two iterations.
website: shopee.com.my
category: marketplace
tags:
  - marketplace
  - shopee
  - malaysia
  - e-commerce
  - antibot
  - read-only
  - myr
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Shopee's internal v4 JSON API (/api/v4/search/search_items,
      /api/v4/pdp/get_pc, /api/v4/search/search_filter_config) returns HTTP 403
      with error code 90309999 on every unauthenticated call. Verified with and
      without --proxies across us-east-1 and ap-southeast-1 — block is
      fingerprint-based, not IP-based. Only /api/v4/search/search_hint (keyword
      auto-complete) is accessible to guests, and it returns suggestions only,
      no product listings.
  - method: hybrid
    rationale: >-
      An authenticated browser workflow (Browserbase persistent context with
      seeded buyer-account cookies) is the only known path that bypasses the
      /verify/traffic/error?type=4 wall. Not configured in the default browse.sh
      sandbox — requires manual login bootstrap or a Shopee Open Platform /
      Affiliate partner credential.
verified: true
proxies: true
---
# Shopee Malaysia Product Search

## Purpose

Search Shopee Malaysia (`shopee.com.my`) for products matching a keyword and return a structured list of results — title, MYR price, sold count, rating, shop name, discount percent, and canonical product URL. Supports keyword + filters for price range, location (Peninsular Malaysia / East Malaysia / Sabah / Sarawak), shipping type, and sort (relevance / popularity / latest / sales / price-asc / price-desc). Read-only — never adds to cart, never logs in to a real buyer account, never places an order.

**Status (2026-05-20):** Shopee MY's anti-bot wall (Server Guard / "SGW") rejects every observed unauthenticated automation surface — both browser-rendered marketplace pages and the v4 JSON API. Use this skill as documentation of the wall; the only viable productionised path requires either (a) an authenticated buyer-account Browserbase context cookie-seeded by a human login, or (b) an official Shopee partner credential (Shopee Open Platform / Affiliate API), neither of which is configured in the default `browse.sh` sandbox.

## When to Use

- Daily / on-demand monitoring of Shopee MY listings for a target keyword + filter set.
- Price/availability comparison across Malaysian e-commerce marketplaces (Lazada MY, PG Mall, Mudah, Carousell MY).
- Any pipeline that would otherwise scrape Shopee MY HTML/SPA — read this skill first to understand the wall before burning time on residential proxies and stealth flags that don't work.

## Workflow

> **There is no working unauthenticated path on Shopee MY as of 2026-05-20.** The sections below document what was attempted, what the failure modes are, and the two known-viable productionised paths (both gated by credentials this skill does not have). If you have a buyer-account cookie context or a Shopee Open Platform key, jump to "Authenticated workflows" below. Otherwise, the only correct behaviour is to surface a structured `blocked` outcome — do **not** waste turns retrying the surfaces listed in "Confirmed-blocked" below.

### 0. Decide which path to take

| You have… | Use… |
|---|---|
| Buyer-account credentials + persistent Browserbase context | **Authenticated browser path** (§A below) |
| Shopee Open Platform partner key (shop-owner) | **Open Platform API** (§B below) |
| Nothing | Return `success: false, reason: "antibot_blocked"` — do not retry the unauthenticated surfaces |

### A. Authenticated browser path (untested in this skill build — documented for credential-holders)

1. **One-time setup**: create a Browserbase context, drive a human (or persisted cookie jar) through `https://shopee.com.my/buyer/login` to populate `SPC_F`, `SPC_R_T_ID`, `SPC_T_IV`, `SPC_T_ID`, `SPC_EC`, `SPC_U`, `csrftoken` cookies. Persist with `browse cloud contexts create --persist`.
2. **Per-search**: open a Browserbase session with `--context-id <ctx> --proxies --verified --region ap-southeast-1` and navigate to:
   ```
   https://shopee.com.my/search?keyword=<urlenc>
     &sortBy=<relevancy|sales|ctime|price_asc|price_desc>
     &order=<asc|desc>
     &locations=<Peninsular%20Malaysia|East%20Malaysia|Sabah|Sarawak>
     &minPrice=<num-MYR>
     &maxPrice=<num-MYR>
     &shipByDays=<n>
     &page=<0-indexed>
   ```
   These URL parameters are the same as the public site — the unauthenticated SPA does honour them on render (just behind the verify wall).
3. **Wait, then snapshot**: Shopee renders results progressively over 3–5s; `browse wait load && browse wait timeout 4000 && browse snapshot` is the minimum.
4. **Extract per tile** from the result grid. Each tile's anchor `href` matches `/{slug}-i.<shopid>.<itemid>` — that **is** the canonical product URL pattern; do not synthesise URLs any other way.
5. **Per-tile fields** (from rendered DOM via `browse get text` on the tile or `browse snapshot` refs):
   - Title — first text node in the tile, ≤140 chars.
   - Price — `RM <amount>` in the price cell. When two prices appear, the strike-through is `original_price_myr` and the bold is `price_myr`.
   - Discount — small red badge "−NN%" (only present on discounted items).
   - Sold count — text like "1.2k sold" or "10 sold" (sometimes localised to "Terjual" in Bahasa Malaysia).
   - Rating — star widget value as a decimal (e.g. `4.9`); some tiles have no rating yet — emit `null`.
   - Shop name — secondary text line below price; sometimes empty (Shopee Mall items show a "Mall" badge instead of a shop-name string).
6. **Pagination**: ?page=0..N. Shopee MY caps web search at ~60 tiles/page, ~50 pages.

### B. Shopee Open Platform API (requires partner credential — out of scope for guest agents)

Shopee's official partner API is documented at `https://open.shopee.com/`. The relevant endpoint is `/api/v2/product/search_item` under a shop-owner credential. This is **not** a public read API — it requires a signed partner request with `partner_id`, `partner_key`, `shop_id`, and `access_token`. Affiliate API access is a separate program (`https://affiliate.shopee.com.my/`). If you have those credentials wired into the agent environment, use them — the marketplace search APIs there are not behind the SGW wall.

### Browser fallback (does NOT work today — documented for completeness so the next agent doesn't re-attempt)

```bash
# This is what a guest browse attempt looks like. It deterministically lands on
# /verify/traffic/error?type=4 ("Looks like you're not logged in yet").
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
       --region ap-southeast-1 | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
browse open "https://shopee.com.my/search?keyword=iphone%2015" --remote --session "drv-$sid"
browse wait load --session "drv-$sid"
browse wait timeout 5000 --session "drv-$sid"
browse get url --session "drv-$sid"
# => https://shopee.com.my/verify/traffic/error?...&type=4
```

Confirmed across 2 iters × 2 regions × 4 URL types — see Site-Specific Gotchas.

## Site-Specific Gotchas

- **`/verify/traffic/error?type=4` is the universal anti-bot wall.** Every unauthenticated automated visit to `shopee.com.my/search`, `shopee.com.my/<slug>-cat.<catid>`, `shopee.com.my/<slug>-i.<shopid>.<itemid>`, and `shopee.com.my/` itself redirects to this page with `is_logged_in=false&type=4` and renders "Page Unavailable / Looks like you're not logged in yet." The redirect fires after the SPA boots — server returns 200 HTML on the original URL, but client-side React routing detects the guest fingerprint and pushes to the verify page. Verified 2026-05-20 with sessions in both `ap-southeast-1` (closer to MY users) and `us-east-1`, both with `--verified --proxies` (Browserbase residential), and `us-east-1` additionally with `--solve-captchas`. All four produced the identical redirect.
- **The v4 JSON API returns `error: 90309999` (HTTP 403) on every value-extraction endpoint.** Specifically blocked: `/api/v4/search/search_items`, `/api/v4/search/search_filter_config`, `/api/v4/pdp/get_pc`. Response body: `{"is_customized":false,"is_login":false,"action_type":2,"error":90309999,"tracking_id":"..."}`. The `90309999` code is Shopee Server Gateway's catch-all "rate-limit / bot-block" error. Result is identical with and without `browse cloud fetch --proxies` — the block is fingerprint-based, not IP-based. **Don't waste turns retrying these endpoints.**
- **`/api/v4/search/search_hint?keyword=<q>` returns 200.** The keyword auto-complete endpoint is **not** behind the SGW wall — useful as a sanity check that your network path to Shopee works, and for keyword-suggestion features, but it returns *suggestions only*, not product listings. Sample response: `{"bff_meta":null,"keywords":[{"keyword":"iphone 17 pro max",...}, ...]}`.
- **The login page is reachable.** `https://shopee.com.my/buyer/login` returns 200 and renders normally in an unauthenticated session. This is the entry point for any authenticated-context workflow — the wall only fires on marketplace browsing surfaces, not on identity surfaces.
- **`robots.txt` only whitelists Googlebot / Googlebot-Mobile / Bingbot.** Spoofing `User-Agent: Googlebot` does **not** bypass the wall — Shopee performs reverse-DNS verification on bot UAs and rejects non-Google IPs claiming to be Google. Don't try.
- **`/api/v4/general/*`, `/api/v4/category/*`, `/api/v2/category_v2/*` return `{"error":"error_not_found"}` (HTTP 404).** These paths existed historically but have been removed from the public surface as of the `sw-WEBFE-MKP-2026.05.20.v5-1-emergency` build. Don't try.
- **The SPA shell HTML embeds no initial state.** Unlike OpenTable (`window.__INITIAL_STATE__`) or Craigslist (server-rendered HTML), Shopee's HTML response (`Content-Length` ~142 KB) is a pure bootstrap — only `window.__APP_ID__`, `__LOCALE__`, `__ENV__`, `__META_APP_DETAILS__`, `__ASSETS__` are set. No `item_basic`, no `itemid` references, no JSON-LD `<script type="application/ld+json">` blocks. Parsing the HTML shell yields zero product data.
- **Canonical URL pattern**: `https://shopee.com.my/<url-slug>-i.<shopid>.<itemid>` (note the `-i.` literal separator before the dotted ID pair). When constructing URLs from extracted IDs, always include the dash before `i.`. The slug is cosmetic — `https://shopee.com.my/x-i.<shopid>.<itemid>` will redirect to the canonical slug.
- **Category URL pattern**: `https://shopee.com.my/<category-name>-cat.<catid>` (e.g., `Mobile-Gadgets-cat.11036280`). Also behind the verify wall for guests.
- **Sort parameters** (confirmed via URL inspection, untested under authenticated context): `sortBy=relevancy` (default), `sortBy=sales` (popularity), `sortBy=ctime` (latest), `sortBy=price&order=asc`, `sortBy=price&order=desc`.
- **Location filter values** are full strings, not codes: `locations=Peninsular%20Malaysia`, `locations=East%20Malaysia`, `locations=Sabah`, `locations=Sarawak`. Multiple comma-separated values are accepted in the URL.
- **Price filter is in whole MYR**, not cents: `minPrice=100&maxPrice=500` matches RM 100–500.
- **Browserbase `--region` did not change the outcome.** Tested `ap-southeast-1` (Singapore, closest to MY) and `us-east-1` (Virginia) — both blocked identically. Picking a Malaysia-proximal region does not improve guest-access success because the fingerprint signal (not the IP geography) is the deciding factor.
- **`--solve-captchas` is a no-op for this wall.** Shopee's `/verify/traffic/error?type=4` is a redirect-with-message, not a hCaptcha/reCaptcha challenge page. Captcha-solving has nothing to solve here.
- **Mobile site (`shopee.com.my/m/`) returns the same SPA shell as desktop** — there is no separate lightweight mobile surface to exploit.
- **`<a href*="/buyer/signup">` is the only outbound link from the verify wall.** The wall enforces a hard login requirement; there is no "continue as guest" affordance.

## Expected Output

Four distinct outcome shapes. The first (`success: true`) is what an authenticated workflow returns; the others are what every unauthenticated attempt resolves to today.

```json
// 1. Success — authenticated path returned a tile grid
{
  "success": true,
  "method_used": "browser-authenticated",
  "keyword": "iphone 15",
  "filters_applied": {
    "sort": "relevancy",
    "min_price_myr": null,
    "max_price_myr": null,
    "locations": [],
    "shipping_types": []
  },
  "total_results_displayed": 60,
  "items": [
    {
      "title": "Apple iPhone 15 Pro Max 256GB (Original Malaysia Set)",
      "price_myr": 5499.00,
      "original_price_myr": 5999.00,
      "discount_percent": 8,
      "sold_count_text": "1.2k sold",
      "rating": 4.9,
      "shop_name": "Apple Authorized Reseller",
      "is_shopee_mall": true,
      "url": "https://shopee.com.my/Apple-iPhone-15-Pro-Max-256GB-i.237895353.23156929148"
    }
  ]
}

// 2. Anti-bot wall (the deterministic guest outcome today)
{
  "success": false,
  "reason": "antibot_blocked",
  "block_url": "https://shopee.com.my/verify/traffic/error?...&type=4",
  "block_page_title": "Page Unavailable",
  "block_page_message": "Looks like you're not logged in yet. Log in to continue or head back to the homepage.",
  "tracking_id": "245387aa2ba-0cae-4e7f-9f02-2b18f4af926b",
  "remedy": "Provide a buyer-account Browserbase context (cookie-seeded via /buyer/login) or a Shopee Open Platform partner credential."
}

// 3. API endpoint refusal (when an agent tries the v4 JSON path directly)
{
  "success": false,
  "reason": "api_blocked",
  "http_status": 403,
  "api_error_code": 90309999,
  "api_tracking_id": "5064bc3bec3-5b5b-4387-ba9b-df90426ff2f2",
  "endpoint": "/api/v4/search/search_items",
  "remedy": "Same as antibot_blocked — Shopee's SGW gate rejects all unauthenticated value-extraction API calls regardless of proxy / region / verified flag."
}

// 4. No results (would surface from an authenticated session that found nothing)
{
  "success": true,
  "method_used": "browser-authenticated",
  "keyword": "xyzzy123nonexistent",
  "filters_applied": { "sort": "relevancy" },
  "total_results_displayed": 0,
  "items": [],
  "no_results_message": "We didn't find anything for \"xyzzy123nonexistent\"."
}
```
