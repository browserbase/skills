---
name: openpets-sh-search-codex-pets-f0oals
title: Search OpenPets Codex Pet Registry
description: >-
  Search the OpenPets community registry for Codex / Claude Code / OpenCode / Pi
  Code pets matching user criteria, returning ranked pet metadata and universal
  one-click install links for the OpenPets macOS app.
website: openpets.sh
category: developer-tools
tags:
  - codex
  - openpets
  - registry
  - search
  - ai-tools
  - macos
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Drive the public gallery UI (form#gallery-form on openpets.sh) as a
      fallback if /api/pets becomes unreachable. Strictly slower due to
      IntersectionObserver-driven lazy loading; the JSON API returns the same
      records in one round trip.
verified: true
proxies: true
---
# Search OpenPets Codex Pet Registry

## Purpose

Anonymously search the [OpenPets](https://openpets.sh) community registry — the largest catalog of pixel-art "pets" (desktop companions) built for Codex, Claude Code, OpenCode, and Pi Code — and return ranked pet metadata plus a universal one-click install link suitable for handoff to the OpenPets macOS app. Read-only. No authentication required. Returns JSON.

## When to Use

- A user wants pets matching free-text criteria ("show me cat pets", "find a dragon", "anime girl with a staff").
- A user wants to filter by pet kind: `animal`, `creature`, `object`, or `person`.
- A user wants the most-popular, most-liked, or newest pets in the registry.
- A user wants a copy-pasteable install link to hand to the OpenPets macOS app (or share with a friend who has it installed).
- A user wants the preview spritesheet / share image URL for a pet to embed in a chat or doc.

## Workflow

The OpenPets website exposes a public, paginated REST endpoint at `/api/pets` that powers the on-page gallery. **Always prefer this over scripted browsing** — no auth, no rate limits observed, returns the full record set including install-link material in one round trip.

1. Issue a single GET to the search endpoint:

   ```
   GET https://openpets.sh/api/pets?q={query}&kind={kind}&sort={sort}&page={n}&pageSize={n}
   Accept: application/json
   ```

2. Map user criteria to query params:

   | Param      | Type    | Required | Notes |
   |------------|---------|----------|-------|
   | `q`        | string  | no       | Full-text search over `displayName`, `description`, and `tags`. URL-encode it. |
   | `kind`     | enum    | no       | One of `animal`, `creature`, `object`, `person`. Any other value returns zero results (`total: 0`). |
   | `sort`     | enum    | no       | One of `new` (default), `popular`, `liked`. Invalid values silently fall back to `new`. |
   | `page`     | int     | no       | 1-indexed. Default `1`. |
   | `pageSize` | int     | no       | Default ~24. `pageSize=100` works; upper bound undocumented. |

3. Parse the JSON response. Top-level shape:

   ```json
   { "page": 1, "pageSize": 24, "total": 239, "totalPages": 10,
     "generatedAt": "2026-05-18T11:13:49.412Z", "pets": [ ... ] }
   ```

4. For each pet in `pets[]`, extract:

   - `id` — slug used in URLs (e.g. `qwq`, `apupepe`, `aobing`)
   - `displayName`, `description`, `kind`, `ownerName`, `tags[]`
   - `viewCount`, `downloadCount`, `likeCount`
   - `previewUrl` (relative `/api/pets/{id}/preview`) — animated WebP preview
   - `spritesheetUrl` (relative `/api/pets/{id}/spritesheet`) — full sprite atlas
   - `shareImageUrl` — 1200×630 OpenGraph card

5. **Construct the install link** for each pet:

   ```
   https://openpets.sh/install/{pet.id}
   ```

   This URL is **public and anonymous**. Hitting it returns a `302` with:

   ```
   Location: openpets://install?url=<signed-download-url-with-ticket>&id={pet.id}
   ```

   The signed `ticket` is a server-issued JWT-style token with a ~24h expiry (`exp`, `nonce`, `id` payload). The OpenPets macOS app intercepts the `openpets://` protocol and pulls the bundle. **Always hand out the `https://openpets.sh/install/{id}` URL** — never try to construct the `openpets://` deep-link yourself (the ticket is server-signed).

6. Optional detail enrichment: `GET https://openpets.sh/api/pets/{id}` returns `{ "pet": { ... } }` with the same record shape if you need a single record without searching.

7. Return the ranked list with `id`, `displayName`, `description`, `kind`, `ownerName`, `tags`, stats, `previewUrl`, and `installUrl`.

### Browser fallback

If `/api/pets` ever becomes unreachable, drive the gallery UI directly. This is strictly slower (lazy-loaded sprites, IntersectionObserver pagination) but the contract is stable:

1. Open `https://openpets.sh`. Optionally pre-seed query state via URL params (`?q=cat&kind=animal&sort=popular`) — the gallery script reads them on load.
2. Fill `input#q` with the search term, set `select#sort` and `select#kind`.
3. Click `button[type="submit"]` inside `form#gallery-form`.
4. Wait for `#gallery-results` to populate. Each card is `<article class="pet-card">` with a link `<a class="pet-card-preview-link" href="/pets/{id}">`.
5. Read pet IDs from the `href` attribute. Construct install URLs as `https://openpets.sh/install/{id}`.
6. To paginate, scroll `#gallery-sentinel` into view or click `#load-more-pets`.

No proxies or stealth required for either path — the site is behind Cloudflare but the API and gallery are CORS-open and bot-tolerant.

## Site-Specific Gotchas

- **Two response shapes from `/api/pets`** depending on sort order. With `sort=new` (the default), the response is served from a registry mirror and includes lighter, mirror-flavored fields: `installTicketUrl`, `downloadUrl`, `validationReport`, `source.apiBase`, `mirroredAt`, `registryNumber`. With `sort=popular` or `sort=liked`, the response is served live from the primary database and includes richer fields: `spritesheetPath`, `ownerId`, `ownerHandle`, `likedByMe`, `reactionCounts`, `myReactions`, `ownerShadowbanned`. Both share the core set (`id`, `displayName`, `description`, `kind`, `ownerName`, `tags`, `uploadedAt`, `viewCount`, `downloadCount`, `likeCount`). Don't depend on the extended fields being present.

- **Invalid `kind` ⇒ empty results; invalid `sort` ⇒ silent fallback.** `kind=foo` returns `total: 0`; `sort=foo` returns the full registry sorted by `new`. Validate `kind` against the enum before sending or you'll mislead the user with "0 matches".

- **`installTicketUrl` and `downloadUrl` in the response require auth.** `POST /api/pets/{id}/install-ticket` returns 404 anonymously, and `GET /api/pets/{id}/download` returns 401 `{"error":"download ticket required"}`. **Ignore those fields for anonymous flows.** The public `/install/{id}` redirect is the supported anonymous path; it generates the signed ticket server-side and embeds it in the `openpets://` Location header.

- **`/install/{id}` requires the OpenPets macOS app to actually resolve.** The `openpets://` URI scheme is registered by the app from the [alterhq/openpets](https://github.com/alterhq/openpets) release. Users on Linux/Windows, or macOS without the app, will see "no app to handle this URL". If unsure, prefix the response with a one-liner: *"Install [OpenPets](https://github.com/alterhq/openpets/releases/latest) first, then click the install links."*

- **Registry has two upstream sources.** Pets mirrored from `codex-pets.net` (the original Codex Pet Share, which OpenPets succeeded) carry a `source.apiBase` field and `mirroredAt` timestamp; native OpenPets uploads don't. Useful for de-duping if a user uploads to both registries.

- **Catalog size**: ~3,500 pets as of May 2026. Default `pageSize=24`; `pageSize=100` is fine. Don't paginate past `totalPages` — the gallery JS loops back to page 1 in that case, which would loop your scraper.

- **Read-only via the API.** Liking, favoriting, uploading, commenting all require a Cloudflare Access + Supabase session. Don't promise mutation flows from an anonymous client. For uploads point users to `/upload` in the OpenPets web app after signin.

- **Pet IDs are author-chosen slugs** (`qwq`, `aobing`, `apupepe`, `ro-job-female-runeknightdragon`) — not UUIDs. They're URL-safe but can be long. Don't try to alphabetize them — they aren't ordered.

- **No anti-bot wall observed.** Cloudflare is configured permissively for the registry: anonymous `GET /api/pets`, anonymous `GET /api/pets/{id}`, and anonymous `GET /install/{id}` all return 200/302 without challenges from datacenter IPs. Browser fallback also works without `--verified` / `--proxies` flags, though the metadata in this skill was captured with both enabled as a defensive default.

## Expected Output

Recommended return shape per query (one of three outcomes):

**A — Successful search (q="cat"):**

```json
{
  "query": { "q": "cat", "kind": null, "sort": "new", "page": 1, "pageSize": 24 },
  "total": 239,
  "totalPages": 10,
  "pets": [
    {
      "id": "qwq",
      "displayName": "qwq",
      "description": "Neutral cool white-haired cat-tail pet: aloof outside, warm inside, cute, playful, and subtly enchanting.",
      "kind": "person",
      "ownerName": "taytaya",
      "tags": [],
      "uploadedAt": "2026-05-17T15:06:19.058Z",
      "stats": { "views": 14, "downloads": 0, "likes": 0 },
      "previewUrl": "https://openpets.sh/api/pets/qwq/preview",
      "spritesheetUrl": "https://openpets.sh/api/pets/qwq/spritesheet",
      "shareImageUrl": "https://openpets.sh/api/pets/qwq/share.png",
      "detailUrl": "https://openpets.sh/pets/qwq",
      "installUrl": "https://openpets.sh/install/qwq"
    }
  ]
}
```

**B — Kind-filtered popular search (kind="animal", sort="popular"):**

```json
{
  "query": { "q": null, "kind": "animal", "sort": "popular", "page": 1, "pageSize": 2 },
  "total": 2072,
  "totalPages": 1036,
  "pets": [
    {
      "id": "apupepe",
      "displayName": "Pepe",
      "description": "A compact Codex-style green frog pet in a plain blue shirt.",
      "kind": "animal",
      "ownerName": "kegashin",
      "tags": ["cute", "animated", "pixel", "animal", "celeb", "mascot"],
      "stats": { "views": 601, "downloads": 0, "likes": 5 },
      "previewUrl": "https://openpets.sh/api/pets/apupepe/preview",
      "spritesheetUrl": "https://openpets.sh/api/pets/apupepe/spritesheet",
      "detailUrl": "https://openpets.sh/pets/apupepe",
      "installUrl": "https://openpets.sh/install/apupepe"
    }
  ]
}
```

**C — Empty results (no matches):**

```json
{
  "query": { "q": "unicornthatdoesnotexist", "kind": null, "sort": "new", "page": 1, "pageSize": 24 },
  "total": 0,
  "totalPages": 0,
  "pets": []
}
```

For outcome C, surface to the user: *"No OpenPets match your criteria. Try a broader term, drop the `kind` filter, or browse the newest pets at https://openpets.sh."*
