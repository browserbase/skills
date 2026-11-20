---
name: paladarsocial-com-tony-y4mwmo
title: Paladar Social — Discover Curated Collections
description: >-
  Retrieve Paladar Social's public catalog of curated restaurant/bar/café
  collections via the unauthenticated GET /api/collections endpoint. Deeper
  discovery and reservations are gated behind Google OAuth.
website: paladarsocial.com
category: restaurants
tags:
  - restaurants
  - discovery
  - reservations
  - collections
  - api
  - argentina
source: 'browserbase: agent-runtime 2026-08-13'
updated: '2026-08-13'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Adds nothing for the public catalog — every human-facing route
      307-redirects to the landing page unauthenticated, and the app is a
      client-rendered SPA with no SSR content. Only useful to visually verify
      the raw JSON at /api/collections.
  - method: browser
    rationale: >-
      Full discover/explore/reserve flows require an authenticated Google OAuth
      session (no email/password, no guest mode). Not automatable without real
      credentials and blocked by Google's bot detection.
verified: false
proxies: false
---
# Discover Curated Restaurant Collections on Paladar Social

## Purpose
Paladar Social (`paladarsocial.com`) is a curated restaurant/bar/café discovery and reservation app (Spanish-first, Argentina-focused). This skill retrieves the platform's catalog of **curated collections** — the "curated locations around the world" that group recommended venues by theme (quick bites, wine bars, grills, cafés, etc.). It is **read-only**. The only data reachable without a user account is the public collections catalog via `GET /api/collections`; deeper discovery (the venues inside a collection), venue detail pages, and the reservation flow are all gated behind Google OAuth and are **not reachable unauthenticated**. Use this skill to enumerate and describe the curated collections; do not expect it to browse individual restaurants or place a reservation without credentials.

## When to Use
- You want the list of Paladar Social's curated restaurant/bar/café collections (id, name, bilingual name/description, and the recommender who curated it).
- You want to answer "what themed collections / curated lists does Paladar offer?" or map a collection name to its stable UUID.
- You are building a downstream flow that first needs a collection `id` (the id every authenticated feed/venue call keys off).
- **Do not** use this skill to fetch the restaurants inside a collection, open a venue page, check reservation availability, or book a table — those require an authenticated Google session (see Gotchas).

## Workflow

The recommended method is a **single unauthenticated HTTP GET** — no browser, no session, no stealth needed. Scripted browsing is strictly worse here because every human-facing route redirects unauthenticated visitors to the landing page; the app is a client-rendered Next.js SPA with no server-rendered content to scrape.

### Recommended: public JSON API (no auth)

1. `GET https://paladarsocial.com/api/collections`
   - No headers, cookies, or auth required. Returns HTTP 200 with `Content-Type: application/json`.
   - Response shape: `{ "collections": [ { id, name, name_en, description, description_en, recommender_handle, recommender_icon_url }, ... ] }`.
   - At time of authoring this returned **33 collections**. The count is not paginated — the full catalog comes back in one response.
2. Parse the `collections` array. Each object's `id` is a stable UUID (e.g. `ad3e673c-a5d8-43c3-a6d8-c7de22f994d4` = "Al Paso" / "Quick Bites").
3. `name`/`description` are the Spanish (default) strings; `name_en`/`description_en` are the English equivalents. `recommender_handle` (e.g. `@paladarsocial`) and `recommender_icon_url` identify who curated the collection.
4. Emit the collections (or a filtered subset) as JSON — see Expected Output.

CLI example (any HTTP client works; residential proxies are **not** required):
```
browse cloud fetch "https://paladarsocial.com/api/collections"
# or: curl -s https://paladarsocial.com/api/collections
```

### Browser fallback (only if the JSON endpoint changes shape)

A browser adds nothing for the public catalog, but if you must verify visually:
1. `browse open https://paladarsocial.com/api/collections --remote` — Chromium renders the raw JSON.
2. `browse get text body` — extract the JSON text and parse it.
   A bare (no `--verified`, no `--proxies`) remote session is sufficient; the domain showed no anti-bot defenses across testing.

### What you CANNOT do without a Google login
Discovering the venues *inside* a collection, opening a restaurant/bar/café detail page, and reserving a table all require an authenticated Google OAuth session. There is no email/password, no guest mode, no anonymous browsing, and no public per-collection or per-venue endpoint. If you have a valid Google-authenticated browser profile, the venue feed is served from `GET /api/feed` (accepts a collection filter) and returns 401 otherwise — but automating Google's OAuth consent screen is out of scope and is blocked by Google's own bot detection. Stop at the collection catalog unless real credentials are supplied.

## Site-Specific Gotchas
- **Everything is behind Google OAuth.** `/auth` offers exactly one button: "Continuar con Google". No email/password, no magic link, no guest mode. Confirmed across two independent explorations.
- **All human-facing routes 307-redirect to `/` when unauthenticated.** Verified for `/explore`, `/discover`, `/restaurants`, `/venues`, `/venue`, `/search`, `/feed`, `/home`, `/collections`, `/map`, `/cities`, `/es`, `/en`, `/app`, `/dashboard`, and more. Do not waste turns probing page routes for a public discovery UI — there isn't one.
- **`/api/collections` is the one and only public data endpoint.** It returns 200 JSON with no auth. This is the honest fast path.
- **Auth-gated API endpoints return `401 {"error":"Unauthorized"}` (JSON), not a redirect.** Confirmed for `GET /api/feed`, `GET /api/feed?collection=<id>`, and `GET /api/me`. So the venue-feed-per-collection endpoint exists but is locked.
- **Non-existent API routes return a `404` HTML page** (the Next.js not-found page), not JSON. Useful signal: a JSON 401 means "real endpoint, needs auth"; an HTML 404 means "no such endpoint". Confirmed HTML-404 for `/api/restaurants`, `/api/restaurants/search`, `/api/venues`, `/api/reservations`, `/api/bookings`, `/api/user`, `/api/profile`, `/api/lists`, `/api/reviews`, `/api/collections/<id>`, `/api/collections/<id>/restaurants`.
- **Bilingual fields.** Content is Spanish-first (`lang="es"`, Argentine voice — "Descubrí", "Guardá"). Every collection carries `name`/`name_en` and `description`/`description_en`; pick the pair matching your locale. Some collection names have no distinct English translation (the `name_en` may restate the Spanish).
- **No `robots.txt` or `sitemap.xml`** — both 307-redirect to `/`. There is no crawlable surface.
- **Other `/api/*` strings in the JS bundles are PostHog analytics** (`/api/broadcast`, `/api/surveys/`, `/api/web_experiments/`, `/api/early_access_features/`, `/api/js`), not app data endpoints. Ignore them.
- **No anti-bot.** The site is a Vercel-hosted Next.js app; `/api/collections` returns 200 with or without residential proxies. `--verified`/`--proxies` are unnecessary. The wall here is authentication, not bot protection.
- **The `id` UUIDs are stable** and are the keys the authenticated feed uses (`/api/feed?collection=<id>`). Capture them if a downstream authenticated step will consume them.

## Expected Output

Successful catalog retrieval (recommended path):
```json
{
  "success": true,
  "source": "GET https://paladarsocial.com/api/collections",
  "auth_required": false,
  "collections_count": 33,
  "collections": [
    {
      "id": "ad3e673c-a5d8-43c3-a6d8-c7de22f994d4",
      "name": "Al Paso",
      "name_en": "Quick Bites",
      "description": "Lugares para comer rápido y sin vueltas.",
      "description_en": "Authentic flavors on the go",
      "recommender_handle": "@paladarsocial",
      "recommender_icon_url": "https://pbs.twimg.com/profile_images/1972780099775647744/_ckn96z5_400x400.jpg"
    },
    {
      "id": "05c23923-a6a1-4cb7-84d9-6c19bba1e257",
      "name": "Parrillas, fuegos y fierros",
      "name_en": "Grills, Fire and Iron",
      "description": "...",
      "description_en": "...",
      "recommender_handle": "@paladarsocial",
      "recommender_icon_url": "https://..."
    }
  ]
}
```

Attempt to go deeper (discover venues / reserve) without credentials — expected terminal state:
```json
{
  "success": false,
  "stage": "discover_venues_or_reserve",
  "auth_required": true,
  "auth_method": "Google OAuth only",
  "discovery_reachable_unauthenticated": false,
  "reservation_reachable_unauthenticated": false,
  "error_reasoning": "All human-facing routes redirect to / when unauthenticated; /api/feed (and /api/feed?collection=<id>) returns 401 Unauthorized. The only public data is GET /api/collections. Reserving a table requires a Google-authenticated session, which is not automatable without credentials."
}
```
