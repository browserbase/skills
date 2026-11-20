---
name: chefkoch-de-crawl-full-10lk4z
title: 'Crawl Chefkoch Recipes, Details & Images (v2 API)'
description: >-
  Read-only full crawl of Chefkoch via the unauthenticated api.chefkoch.de/v2
  JSON API: discover recipes by tag/search, fetch full recipe detail, then
  enumerate and build downloadable image URLs.
website: chefkoch.de
category: food-recipes
tags:
  - recipes
  - crawler
  - api
  - chefkoch
  - food
  - images
source: 'browserbase: agent-runtime 2026-07-25'
updated: '2026-07-25'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      Same v2 endpoints work with any plain HTTP client (curl/fetch); no key,
      cookie, or stealth needed.
  - method: browser
    rationale: >-
      Last resort only. No sitemap exists and the rendered www.chefkoch.de
      HTML/layout changes regularly, so DOM scraping is fragile and unreliable
      compared to the stable API.
verified: false
proxies: false
---
# Crawl Chefkoch Recipes, Details & Images via the v2 API

## Purpose

Read-only crawl of the entire Chefkoch recipe corpus through the public, unauthenticated `api.chefkoch.de/v2` JSON API. It walks the full chain — **discover recipes (firehose or faceted tag search) → fetch a recipe's full detail → fetch that recipe's image gallery → build downloadable CDN image URLs**. This is the reliable path: Chefkoch publishes no sitemap and its rendered HTML pages change layout regularly, so scraping the browser DOM is fragile. The v2 API is stable, requires no API key, and returns structured JSON for every step. No writes, no login, no purchases.

## When to Use

- Building a dataset/index of Chefkoch recipes (titles, ingredients, instructions, ratings, tags, nutrition).
- Enumerating recipes filtered by cuisine/diet/category/property tags (e.g. all "Russisch" or all "Vegetarisch" recipes).
- Harvesting recipe photos at a chosen resolution from the CDN.
- Any bulk recipe crawl where you need pagination that survives site redesigns.
- You explicitly want to avoid brittle DOM scraping of `www.chefkoch.de`.

## Workflow

The recommended method is **direct HTTP GET against `api.chefkoch.de/v2`** (via `fetch`, `curl`, or any HTTP client). No auth header, no cookies, no stealth/proxy needed — the pre-run probe and all testing returned plain `200 OK`.

### 1. Discover recipes

Two entry points:

- **Firehose (all recipes):**
  `GET https://api.chefkoch.de/v2/recipes?limit=100&offset=0`
  Returns `{ count, results: [{ recipe: {...} }] }`. `count` is the total corpus (~384,844). Page with `offset`. Optional ordering: `&orderBy=<n>&order=<n>`.

- **Faceted / tag search (recommended for targeted crawls):**
  `GET https://api.chefkoch.de/v2/search-gateway/recipes?limit=100&offset=0&query=<text>&tags=<id>&plusCount=6`
  Returns `{ count, results: [{ score, recipe }], tagGroups: [...], hasTypo, ... }`. `query` is optional free-text. `count` reflects the filtered total — use it as your pagination ceiling.

`limit` is capped at **100** per page regardless of what you request; paginate with `offset` up to `count`.

### 2. Discover tag IDs (there is no standalone taxonomy endpoint)

Tag IDs are **only** exposed inside the `tagGroups` array of any `search-gateway` response. Do one seed search, then read `tagGroups`:

- 8 groups, keyed `diet`, `category`, `characteristic`, cuisine, etc. (`name` is the German label).
- Each tag is `{ id, name, count, isActive, isDisabled }` — e.g. `{ id: 212, name: "Russisch", count: 572 }`, `{ id: 32, name: "Vegetarisch" }`, `{ id: 50, name: "Einfach" }`.

Then filter: `&tags=212`. Combine multiple tags with a comma **or** repeated params — both apply an **AND** intersection: `&tags=212,32` (Russisch AND Vegetarisch) → smaller `count`. A selected tag comes back with `isActive: true`.

### 3. Fetch full recipe detail

For each `recipe.id` from step 1:
`GET https://api.chefkoch.de/v2/recipes/{id}`

Returns the full object: `title`, `subtitle`, `ingredientGroups[].ingredients[]` (`name`, `amount`, `unit`, `usageInfo`), `instructions` (plain text), `tags`, `fullTags`, `servings`, `preparationTime`/`cookingTime`/`restingTime`/`totalTime`, `difficulty`, `nutrition`/`kCalories`, `rating`, `categoryBreadcrumb`, `recipeCuisine`, `siteUrl`, `imageCount`, `previewImageId`, and `previewImageUrlTemplate`.

### 4. Fetch the recipe's image gallery

`GET https://api.chefkoch.de/v2/recipes/{id}/images?limit=10&offset=0`

Returns `{ count, offset, results: [{ id, rating, owner, credits, urlTemplate }] }`. `count` is the total image count for the recipe; page with `offset`.

### 5. Build downloadable image URLs

Both `previewImageUrlTemplate` (recipe detail) and `urlTemplate` (gallery items) contain a literal `<format>` placeholder (sometimes JSON-escaped as `<format>`). Substitute it with a **whitelisted** size token to get the real file on `img.chefkoch-cdn.de`:

```
template: https://img.chefkoch-cdn.de/rezepte/{id}/bilder/{imageId}/<format>/slug.jpg
→        https://img.chefkoch-cdn.de/rezepte/{id}/bilder/{imageId}/crop-960x640/slug.jpg
```

Verified working tokens: `crop-240x300`, `crop-360x240`, `crop-960x640`. The CDN serves `image/webp` (despite the `.jpg` suffix). Arbitrary/unlisted sizes (e.g. `fix-1024x0`, `crop-1200x1600`) return **HTTP 400** — stick to the known crop tokens.

### Browser fallback

Only if the API is ever unreachable: `https://www.chefkoch.de/rs/s0/<query>/Rezepte.html` renders search results and `recipe.siteUrl` (in every API payload) links to the human recipe page. Treat this as a last resort — the DOM structure changes regularly and there is no sitemap, which is exactly why the API is the primary method. Do not click "save recipe", rate, or comment controls; this skill is read-only.

## Site-Specific Gotchas

- **API v2 is the only reliable surface.** No sitemap exists, and the rendered `www.chefkoch.de` HTML/layout changes regularly. Never build a crawler on the DOM.
- **No standalone tag/category endpoint.** `/v2/tags`, `/v2/categories`, `/v2/recipe-categories`, and `/v2/search-gateway/tags` all return **404**. Tag IDs live exclusively in the `tagGroups` array of `search-gateway` responses — seed one search to enumerate them.
- **`limit` is hard-capped at 100.** Requesting `limit=200` still returns only 100 rows. Paginate with `offset` up to the response's `count`.
- **Multi-tag filtering is AND, not OR.** `tags=212,32` (comma) and `tags=212&tags=32` (repeated) are equivalent and both intersect. Expect the combined `count` to drop.
- **`<format>` must be substituted** in every image template before the URL resolves. Only whitelisted crop tokens work (`crop-240x300`, `crop-360x240`, `crop-960x640` verified); unlisted sizes → **HTTP 400**. Watch for the escaped form `<format>` when parsing raw JSON strings.
- **CDN returns WebP.** `img.chefkoch-cdn.de/...jpg` responds with `Content-Type: image/webp` — decode accordingly, don't trust the extension.
- **Paywalled content flags.** Recipes carry `isPlus` / `isPremium`; the search `plusCount` param controls how many Plus results are surfaced. Detail still returns for these, but some fields may be gated.
- **No auth, no stealth required.** All endpoints return `200 OK` over a plain HTTP GET with no key, cookie, proxy, or verified session. The successful run used a bare (non-verified, non-proxied) configuration.
- **Recipe-detail responses are cacheable** (`Cache-Control: max-age=...`); search and firehose are `no-cache`. Be polite when bulk-crawling — reuse cached detail responses where possible.
- **`count` on search reflects the filtered total**, so it is a safe pagination ceiling; on `/v2/recipes` it is the whole corpus (~384k) — do not naively fetch all of it.

## Expected Output

**Step 1 — search / firehose (`/v2/search-gateway/recipes` or `/v2/recipes`):**
```json
{
  "count": 572,
  "queryId": "",
  "results": [
    {
      "score": 572,
      "recipe": {
        "id": "2060241333351072",
        "title": "Die beste Okroschka nach Mamas Rezept",
        "rating": { "rating": 4.58, "numVotes": 84 },
        "difficulty": 2,
        "hasImage": true,
        "imageCount": 17,
        "previewImageId": "1219363",
        "previewImageUrlTemplate": "https://img.chefkoch-cdn.de/rezepte/2060241333351072/bilder/1219363/<format>/die-beste-okroschka-nach-mamas-rezept.jpg",
        "siteUrl": "https://www.chefkoch.de/rezepte/2060241333351072/Die-beste-Okroschka-nach-Mamas-Rezept.html",
        "isPlus": false,
        "isPremium": false
      }
    }
  ],
  "tagGroups": [
    {
      "key": "diet",
      "name": "Ernährung",
      "tags": [
        { "id": 32, "name": "Vegetarisch", "count": 13235, "isActive": false },
        { "id": 57, "name": "Vegan", "count": 1871, "isActive": false }
      ]
    },
    {
      "key": "cuisine",
      "tags": [ { "id": 212, "name": "Russisch", "count": 572, "isActive": true } ]
    }
  ]
}
```

**Step 3 — recipe detail (`/v2/recipes/{id}`):**
```json
{
  "id": "2060241333351072",
  "title": "Die beste Okroschka nach Mamas Rezept",
  "servings": 4,
  "difficulty": 2,
  "preparationTime": 30,
  "totalTime": 30,
  "ingredientGroups": [
    {
      "ingredients": [
        { "id": "9346692", "name": "Geflügelfleischwurst", "amount": 1, "unit": "Ring/e", "usageInfo": ", fein gewürfelt" }
      ]
    }
  ],
  "instructions": "Die Kartoffeln gar und die Eier hart kochen ...",
  "tags": ["Hauptspeise", "Kartoffeln", "Geflügel", "Schnell"],
  "nutrition": null,
  "kCalories": null,
  "previewImageUrlTemplate": "https://img.chefkoch-cdn.de/rezepte/2060241333351072/bilder/1219363/<format>/die-beste-okroschka-nach-mamas-rezept.jpg",
  "siteUrl": "https://www.chefkoch.de/rezepte/2060241333351072/Die-beste-Okroschka-nach-Mamas-Rezept.html"
}
```

**Step 4 — image gallery (`/v2/recipes/{id}/images`):**
```json
{
  "count": 17,
  "offset": 0,
  "results": [
    {
      "id": "1219363",
      "rating": { "rating": 4.76, "numVotes": 17 },
      "owner": { "username": "ManuGro" },
      "credits": null,
      "urlTemplate": "https://img.chefkoch-cdn.de/rezepte/2060241333351072/bilder/1219363/<format>/Die-beste-Okroschka-nach-Mamas-Rezept.jpg"
    }
  ]
}
```

**Step 5 — resolved image URL (HTTP 200, `image/webp`):**
```
https://img.chefkoch-cdn.de/rezepte/2060241333351072/bilder/1219363/crop-960x640/Die-beste-Okroschka-nach-Mamas-Rezept.jpg
```
