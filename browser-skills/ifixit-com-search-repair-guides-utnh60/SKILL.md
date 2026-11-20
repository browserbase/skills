---
name: ifixit-com-search-repair-guides-utnh60
title: iFixit Search Repair Guides
description: >-
  Search iFixit for repair guides by device model, brand, or category and return
  structured results — title, difficulty, time, step count, tools, parts, and
  direct guide URL — plus optional full step-by-step instructions with image
  URLs. Read-only.
website: ifixit.com
category: repair
tags:
  - repair
  - guides
  - diy
  - electronics
  - read-only
  - public-api
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      iFixit's public site is a thin client over the same `/api/2.0/` endpoints
      used by this skill. The browser path costs ~10x more (one HTTP round-trip
      per page vs one for the entire structured envelope) and surfaces no extra
      data — use only as a backstop if the API is unreachable. Steps + tool list
      are accessible from the rendered guide page via
      `window.__INITIAL_STATE__.guide` or the embedded
      `script[type="application/ld+json"]` block.
verified: false
proxies: false
---
# iFixit Search Repair Guides

## Purpose

Search iFixit for repair guides matching a device model, brand, or category (phone, laptop, desktop, printer, etc.) and return a structured list of guides with title, difficulty level, time required, step count, required tools, replacement parts, and direct guide URL. For any individual guide, return the full step-by-step instructions including step titles, bullet text, and per-step image URLs at multiple resolutions. Supports filtering by device type, brand, and difficulty. **Read-only — never edits guides, never posts comments, never adds items to cart, never reaches checkout.**

## When to Use

- "Find iPhone 14 battery replacement guides and return tools + steps."
- "List all laptop screen repair guides for Dell Latitude with difficulty Easy or Moderate."
- "Get the full step-by-step (with image URLs) for guide #152966."
- Enumerating repairability data for a device family for a downstream agent (product research, parts shopping, repairability scoring).
- Bulk extraction of repair-procedure metadata across hundreds of devices — the API is faster, cheaper, and structurally more reliable than HTML scraping.

## Workflow

iFixit exposes a fully public REST API at `https://www.ifixit.com/api/2.0/` — **no authentication, no API key, no cookies, no anti-bot stealth, no residential proxy needed**. The site's web search page is a thin client over the same API. Always lead with the API; the browser path exists only as a backstop if the API is ever rate-limited or temporarily unreachable (no evidence either has happened in normal use).

### 1. Search for guides

```
GET https://www.ifixit.com/api/2.0/search/{URL-encoded query}
    ?filter=guide
    &limit={1-100}
    &offset={N}
```

- `{query}` is free text: device model (`iPhone 14`), brand + model (`Dell Latitude 7420`), part + device (`MacBook Pro keyboard`), or category (`PC Laptop battery`). URL-encode spaces as `%20` or `+`.
- **`filter=guide` is mandatory** if you only want repair guides. Without it, the search mixes `dataType: "guide"`, `"wiki"` (device taxonomy pages), `"question"` (community Q&A), and `"page"` (static content). Typical unfiltered mix observed: ~30% guides, ~50% wikis, ~15% questions, ~5% pages.
- `limit` defaults to 100; max practical value is 100. `offset` pages through additional results when `moreResults: true` is set on the response.

**Response shape** — each result already contains everything the listing-card UI needs:

```json
{
  "search": "iphone 14 battery",
  "offset": 0,
  "limit": 5,
  "totalResults": 4,
  "moreResults": false,
  "results": [
    {
      "dataType": "guide",
      "guideid": 152966,
      "title": "iPhone 14 Battery Replacement",
      "subject": "Battery",
      "category": "iPhone 14",
      "type": "replacement",
      "difficulty": "Moderate",
      "time_required_max": 7200,
      "summary": "Use this guide to replace a worn-out or dead…",
      "url": "https://www.ifixit.com/Guide/iPhone+14+Battery+Replacement/152966",
      "username": "Tobias Isakeit",
      "flags": ["GUIDE_STARRED"],
      "image": { "thumbnail": "...", "standard": "...", "large": "...", "original": "..." }
    }
  ]
}
```

**Important: this endpoint does NOT return the `tools[]`, `parts[]`, or `steps[]` arrays — those only come from the per-guide endpoint in step 3.** Step count is also absent at search time. If the caller asked for "list of guides matching X" with no step-level detail, you can stop here.

### 2. Apply client-side filters

The search endpoint has no native filter for device type, brand, or difficulty — fold them in after the response lands:

- **Device type filter** (`phone | laptop | desktop | printer | tablet | mac | game-console | ...`): each result's `category` field is the canonical iFixit device-taxonomy node (e.g. `"iPhone 14"`, `"Dell Latitude 7420"`, `"Brother HL-2270DW"`). To filter by device type, walk the `category` against the iFixit category tree at `GET /api/2.0/categories` — Phone lives under `Phone`, laptops under `PC > PC Laptop` or `Mac > Mac Laptop`, desktops under `PC > PC Desktop` or `Mac > Mac Desktop`, and printers under `Computer Hardware > Printer`. For most use cases a simple substring match on `category` (`"iPhone"`, `"MacBook"`, `"Latitude"`) is sufficient and avoids the extra request.
- **Brand filter**: put the brand directly in the search query (`"Dell Latitude"`, `"Brother HL"`, `"Samsung Galaxy"`) — far simpler than post-filtering. Or post-filter on `category` containing the brand string.
- **Difficulty filter**: post-filter `difficulty in {"Very easy", "Easy", "Moderate", "Difficult", "Very difficult"}`. The set is closed-vocabulary.

### 3. Fetch full guide detail (tools, parts, steps with images)

For each `guideid` of interest:

```
GET https://www.ifixit.com/api/2.0/guides/{guideid}
```

Returns the full guide envelope — fields used by this skill:

| Field | Type | Meaning |
|---|---|---|
| `guideid`, `title`, `url`, `category`, `subject`, `type` | various | guide identity (`type` ∈ `replacement | installation | repair | disassembly | technique | teardown`) |
| `difficulty` | string | `Very easy | Easy | Moderate | Difficult | Very difficult` |
| `time_required` | string | pretty-printed (`"1 - 2 hours"`, `"30 minutes - 1 hour"`) |
| `time_required_min`, `time_required_max` | int | **seconds** — `3600`/`7200` for "1 - 2 hours" |
| `summary`, `introduction_raw`, `introduction_rendered`, `conclusion_raw`, `conclusion_rendered` | string | preamble + closing (Markdown + HTML variants) |
| `tools` | array | required tools — see below |
| `parts` | array | replacement parts — see below |
| `steps` | array | step-by-step procedure — see below |
| `image` | object | hero image at `mini | thumbnail | 140x105 | 200x150 | standard | 440x330 | medium | large | huge | original` |
| `revisionid`, `modified_date`, `published_date`, `created_date` | int | unix-seconds timestamps |
| `author`, `username` | object/string | contributor |
| `flags` | array | `GUIDE_STARRED` (verified by iFixit team), `GUIDE_MISSING_IMAGES`, `GUIDE_LOUSY_PICTURES`, `GUIDE_USER_CONTRIBUTED`, `INTRODUCTION_ISSUES` |
| `prerequisites` | array | other guides that must be completed first |

**Step count** is simply `steps.length`. No top-level `step_count` field is exposed.

**`tools[]` shape**:
```json
{ "text": "SIM Card Eject Tool", "quantity": 1, "isoptional": false, "type": "",
  "url": "https://www.ifixit.com/products/sim-card-eject-tool",
  "thumbnail": "https://cart-products.cdn.ifixit.com/cart-products/OKbwbsAqNCv4lWAP.thumbnail",
  "notes": null }
```

**`parts[]` shape** (same shape as tools — iFixit treats them as cart products):
```json
{ "text": "iPhone 12/12 Pro Battery", "quantity": 1, "isoptional": false, "type": "",
  "url": "https://www.ifixit.com/products/iphone-12-12-pro-replacement-battery",
  "thumbnail": "...", "notes": null }
```

**`steps[]` shape**:
```json
{
  "stepid": 280491,
  "orderby": 1,
  "title": "Eject the SIM card tray",
  "lines": [
    { "text_raw": "Insert a SIM card eject tool …", "text_rendered": "…", "bullet": "black", "level": 0 },
    { "text_raw": "Press firmly to eject the tray.", "text_rendered": "…", "bullet": "black", "level": 0 }
  ],
  "media": {
    "type": "image",
    "data": [
      { "id": 2328713, "guid": "3DrAgS2S2IaCnYj6",
        "thumbnail": "...", "standard": "...", "medium": "...", "large": "...", "huge": "...", "original": "..." }
    ]
  },
  "comments": [...]
}
```

Each step has up to three images in its `media.data[]` array (the iFixit UI shows up to three side-by-side per step). `media.type` can also be `"embed"` (YouTube/Vimeo intro video) — those steps have `data: []` and instead carry an `embed_url` field; rare.

### 4. Compose the structured output

Stitch the search result + per-guide detail responses into the final shape (see "Expected Output" below). For "list-only" queries skip step 3 entirely; for "list + step-by-step" queries fetch the per-guide detail for each `guideid` (parallelizable — the API is happy with concurrent reads, but keep ≤ 5 in-flight requests as a courtesy).

### Browser fallback

Only if the public API is unreachable. The HTML pages are stable, server-rendered (no SPA), and contain the same data as the API.

1. **Search page** — `https://www.ifixit.com/Search?query={URL-encoded query}`. Each result is an `<a>` whose `href` points to `/Guide/<slug>/<guideid>` and whose adjacent markup includes `data-difficulty="..."`, `data-time="..."`, plus the title text. Use `browse get html body` then regex-match `/Guide/[^/"]+/(\d+)` to pull guide IDs.
2. **Guide page** — `https://www.ifixit.com/Guide/<slug>/<guideid>`. The page has structured data at `script[type="application/ld+json"]` containing `name`, `totalTime` (ISO 8601 duration), `step[]` (each with `name`, `text`, `image`), and `tool[]`. iFixit also embeds a `window.__INITIAL_STATE__` JSON blob in `<script>` with everything the API returns. Extract via `browse eval "JSON.stringify(window.__INITIAL_STATE__.guide)"`.

**Cost premium for the browser path is ~10×** (one HTTP round-trip per page vs one for the entire structured envelope) and offers no extra data. Use only as a backstop.

## Site-Specific Gotchas

- **Search returns mixed `dataType`s — always pass `?filter=guide`.** Without the filter, ~70% of results are wikis (device taxonomy nodes), Q&A threads, and static pages — useless for a "repair guides" task. Other filter values exist (`wiki`, `question`, `page`, `device`, `team`) but this skill should always pin to `guide`.
- **`time_required_min`/`max` are integer seconds**, NOT minutes or ISO durations. Sample: `3600 / 7200` = "1 – 2 hours". A pretty-printed `time_required` string is also available, but use the integer fields for any arithmetic / sorting / comparison.
- **`parts[]` are iFixit store SKUs, not OEM/manufacturer part numbers.** The API exposes only iFixit's own commerce product (name, store URL, thumbnail, quantity). The original task description asks for "part numbers" — the closest stable identifier is the URL slug (e.g. `iphone-12-12-pro-replacement-battery`) or the product's `text` (display name). Canonical OEM part numbers (e.g. Apple's `661-19586`) are not in the API and are not on the rendered guide page either — they live only in iFixit's commerce catalog for some SKUs and are surfaced inconsistently. Be explicit with downstream callers that "part number" = iFixit SKU URL/slug, not manufacturer part number.
- **`difficulty` is a closed vocabulary**: `Very easy | Easy | Moderate | Difficult | Very difficult`. Anything else means the field is null or the guide is malformed.
- **Search is fuzzy but tokenizes oddly on hyphenated model numbers.** `"brother hl-2270dw"` → `totalResults: 0`. Drop the hyphen (`"brother hl2270dw"` or `"brother hl 2270dw"`) for a chance at matches, or fall back to a broader query (`"brother hl printer"`) and post-filter on `category`. Stop-words and case are normalized; punctuation is not.
- **The `/api/2.0/categories/<name>/guides` endpoint does NOT exist** — it 404s with `{"message":"Endpoint not found"}`. To enumerate guides for a whole device category, search for the category name itself (e.g. `search/iPhone%2014%20Pro?filter=guide&limit=100`) and post-filter on the `category` field. The category tree at `/api/2.0/categories` is for taxonomy navigation only.
- **`/api/2.0/wikis/CATEGORY/<Title>` returns the device-taxonomy node** (description, ancestors, children, related parts/tools) but **not** the list of guides for that device — guides arrive only through the search endpoint or by enumerating known `guideid`s. Spaces in titles become `_` (e.g. `MacBook_Pro`, not `MacBook%20Pro`).
- **Invalid `guideid` → HTTP 200 with `{"message":"Guide not found"}`** (NOT a 4xx status). Always check for the `message` key before assuming the body is a guide envelope.
- **Pagination quirks**: `offset` is accepted but for small result sets (≤ `limit`) the API ignores it and returns the same first page. Trust `totalResults` and `moreResults` for paging logic — only request a non-zero offset if `moreResults: true` was on the prior response.
- **Locale**: the API defaults to `en`. Pass `&langid=de` (or any of `available_langids` on the guide envelope) to get a translated guide. Search results also vary by locale; for international device names (`"iPhone 14"` works in any locale, `"PC Laptop"` only in English) prefer the English query.
- **No rate-limiting observed** during normal use, but keep concurrency ≤ 5 in-flight requests and overall ≤ 10 req/s to avoid tripping CloudFront's edge throttle. Responses carry `Cache-Control: no-store` — repeated identical requests are not cached client-side.
- **No anti-bot, no Cloudflare/Akamai interstitial, no captcha, no login wall**. Sessions created with `--proxies` or `--verified` flags are unnecessary cost — bare `browse cloud fetch` works.
- **READ-ONLY discipline**: do not POST to any endpoint, do not authenticate with `/api/2.0/user/token`, do not call `/api/2.0/cart/*`, and on the browser fallback never click "Add to cart", "Edit this guide", "Add a comment", or "Mark as done" — they all attempt to mutate state or open a paywall.

## Expected Output

The skill returns one of these JSON shapes:

```json
// Success — list of guides matching the search (no step-by-step requested)
{
  "success": true,
  "query": "iPhone 14 battery",
  "filters": { "device_type": "phone", "brand": "Apple", "difficulty": ["Easy", "Moderate"] },
  "total_results": 4,
  "more_results": false,
  "guides": [
    {
      "guide_id": 152966,
      "title": "iPhone 14 Battery Replacement",
      "url": "https://www.ifixit.com/Guide/iPhone+14+Battery+Replacement/152966",
      "category": "iPhone 14",
      "subject": "Battery",
      "type": "replacement",
      "difficulty": "Moderate",
      "time_required": "1 - 2 hours",
      "time_required_seconds": { "min": 3600, "max": 7200 },
      "summary": "Use this guide to replace a worn-out or dead…",
      "hero_image_url": "https://guide-images.cdn.ifixit.com/igi/2qpgDse6XOHTCuJY.large",
      "author": "Tobias Isakeit",
      "flags": ["GUIDE_STARRED"]
    }
  ]
}
```

```json
// Success — single guide with full step-by-step + tools + parts
{
  "success": true,
  "guide": {
    "guide_id": 152966,
    "title": "iPhone 14 Battery Replacement",
    "url": "https://www.ifixit.com/Guide/iPhone+14+Battery+Replacement/152966",
    "category": "iPhone 14",
    "subject": "Battery",
    "type": "replacement",
    "difficulty": "Moderate",
    "time_required": "1 - 2 hours",
    "time_required_seconds": { "min": 3600, "max": 7200 },
    "step_count": 49,
    "introduction": "iPhone batteries are rated to hold 80% of their capacity for up to 500 charge cycles…",
    "tools": [
      {
        "name": "SIM Card Eject Tool",
        "quantity": 1,
        "optional": false,
        "ifixit_product_url": "https://www.ifixit.com/products/sim-card-eject-tool",
        "thumbnail": "https://cart-products.cdn.ifixit.com/cart-products/OKbwbsAqNCv4lWAP.thumbnail"
      }
    ],
    "parts": [
      {
        "name": "iPhone 14 Battery",
        "quantity": 1,
        "optional": false,
        "ifixit_product_url": "https://www.ifixit.com/products/iphone-14-replacement-battery",
        "ifixit_sku_slug": "iphone-14-replacement-battery",
        "thumbnail": "https://cart-products.cdn.ifixit.com/cart-products/...thumbnail"
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "step_id": 280491,
        "title": "Eject the SIM card tray",
        "instructions": [
          { "text": "Insert a SIM card eject tool or a paperclip into the small hole in the SIM card tray.", "bullet": "black", "level": 0 },
          { "text": "Press firmly to eject the tray.", "bullet": "black", "level": 0 }
        ],
        "images": [
          "https://guide-images.cdn.ifixit.com/igi/3DrAgS2S2IaCnYj6.standard",
          "https://guide-images.cdn.ifixit.com/igi/3DrAgS2S2IaCnYj6.large"
        ]
      }
    ]
  }
}
```

```json
// No guides matched
{
  "success": true,
  "query": "brother hl-2270dw",
  "total_results": 0,
  "more_results": false,
  "guides": [],
  "note": "No guides matched. Try dropping hyphens from model numbers or broaden the query."
}
```

```json
// Guide id not found (per-guide fetch)
{
  "success": false,
  "reason": "guide_not_found",
  "guide_id": 99999999,
  "message": "Guide not found"
}
```

```json
// API unreachable (after retries) — fall back to browser path or surface the failure
{
  "success": false,
  "reason": "api_unreachable",
  "details": "GET /api/2.0/search/... returned <status> after 3 retries; browser fallback also failed."
}
```
