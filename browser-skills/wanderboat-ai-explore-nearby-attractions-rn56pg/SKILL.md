---
name: wanderboat-ai-explore-nearby-attractions-rn56pg
title: Wanderboat AI Nearby Attractions
description: >-
  Discover top-rated nearby attractions on Wanderboat AI by IP-geolocated
  proximity or by specifying any city worldwide. Returns ranked places with
  name, rating, review count, opening hours, and AI-curated commentary.
  Read-only.
website: wanderboat.ai
category: travel
tags:
  - travel
  - attractions
  - discovery
  - places
  - ai-search
  - read-only
  - cloudflare
source: 'browserbase: agent-runtime 2026-05-28'
updated: '2026-05-28'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Wanderboat has no documented public API and the page is fully JS-rendered.
      The `/chat` UI is the only reliable surface — bare HTTP fetches return a
      Cloudflare managed challenge.
  - method: fetch
    rationale: >-
      Pre-rendered static listicle pages at
      `/listicle/{city-slug}/attractions/{nanoid}` exist and are discoverable
      via the public sitemap, but the slug→nanoid mapping is not exposed by any
      documented endpoint, so they're only useful for bulk crawl jobs where
      you've already harvested the sitemap — not for interactive city-by-name
      queries.
verified: true
proxies: true
---
# Wanderboat AI — Explore Nearby Attractions

## Purpose

Given an optional destination (city name or "nearby"/no-input → IP-located) and optional vibe filter (outdoors, coffee, late-night, cocktails, etc.), return a ranked list of attractions with name, rating, review count, opening hours, a short AI-generated summary, and (when available) Google-style place metadata. Read-only — never books, never submits a reservation. Wanderboat's homepage redirects to `/chat`, which is the AI-powered search/discovery surface; this skill drives that surface.

## When to Use

- "Show me top attractions in {city}" — generic discovery for any city worldwide.
- "What's good to do nearby?" — IP-geolocated quick-look for the current location.
- Vibe-scoped local discovery: outdoors, coffee, late-night bites, kid-friendly, etc.
- Comparing top attractions between two cities (run twice with different destinations).
- Any flow needing photo-rich attraction cards with embedded user reviews and AI-curated commentary that mainstream Google/Yelp APIs don't surface.

## Workflow

Wanderboat is Cloudflare-protected (managed challenge + Turnstile). A bare HTTP fetch of any page below `/sitemaps/*` or `/robots.txt` returns the CF challenge HTML — **stealth + residential proxy session is mandatory** for everything else. The site has no documented public API; the only reliable surface is the JS-rendered `/chat` interface.

### 1. Start stealth + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are required. Without them, the Cloudflare challenge HTML (`/cdn-cgi/challenge-platform/`) is served instead of the app.

### 2. Open `/chat` — the main discovery surface

```bash
browse open "https://wanderboat.ai/" --remote                # redirects to /chat
browse wait load --remote
browse wait timeout 3000 --remote                            # Mapbox + Discover panel render progressively
browse snapshot --remote
```

The chat page has three usable affordances for "explore attractions":

| Affordance | Snapshot ref pattern | Purpose |
|---|---|---|
| `textbox: Enter your destination` (top-left header) | `textbox: Enter your destination` | Hard-set destination context — placeholder shows your IP-located city (e.g. "Hermiston") |
| `textbox: input-textarea` (center chat box) | `textbox: input-textarea` | Free-form natural-language query — the canonical surface |
| `button: Find me a good hike nearby` etc. (right-side Discover panel) | `button: <prompt-text> <prompt-text>` | Pre-baked quick-action seeds, IP-located |

### 3. Choose the right path

**Path A — IP-located "nearby" via quick-action button (fastest, 1 click):**

```bash
# Snapshot, then click the quick-action whose label matches the vibe.
# Observed quick-actions: "Find me a good hike nearby", "I need a coffee break,
# what's close?", "Take me to the latest events", "I want to get outside today",
# "Find me a cool cocktail spot", "I need places that kids will enjoy".
# Refs are dynamic per snapshot — match by visible label, not by ref number.
browse click "<ref-for-quick-action>" --remote
browse wait timeout 12000 --remote          # AI generation takes ~8–12s; the URL flips to /chat/cov_<nanoid>
```

**Path B — Specific city via custom query (most flexible):**

```bash
# After snapshot of /chat, fill the input-textarea and click send-button.
browse fill "<ref-for-input-textarea>" "Show me top attractions in Paris" --remote
browse wait timeout 1500 --remote
browse click "<ref-for-send-button>" --remote
browse wait timeout 15000 --remote          # international cities sometimes take a touch longer
```

`browse fill` on `input-textarea` does NOT auto-press Enter (returns `pressedEnter: false`) — you must click the send-button (label `send-button`) separately. The "Search" button next to it (with magnifying-glass icon) triggers the `@`-mention place-picker instead of submitting; do not click it for free-form queries (see Gotchas).

**Path C — Set destination first, then query:**

```bash
# Use the top-of-page destination textbox to lock context before sending.
browse fill "<ref-for-Enter-your-destination>" "Tokyo" --remote
# Then proceed with Path A or B. The destination textbox persists across queries
# in the same session.
```

### 4. Extract attractions from the conversation page

After step 3, URL flips to `https://wanderboat.ai/chat/cov_{nanoid}` and the layout is:

- **Center column**: AI commentary paragraph + per-attraction cards in narrative order. Each card has `StaticText: <name>`, `StaticText: <rating>`, `StaticText: (<review-count>)`, `StaticText: Open until <time>` or `Closed`, a reviews carousel, an AI summary paragraph mentioning hours and seasonality, and a post-count footer (`<N> posts`).
- **Right sidebar `Places` panel** — *this is the cleanest structured data source*. Toggle between `tab: List` and `tab: Map`. The `List` tab exposes one `listitem` per attraction with predictable nesting:
  ```
  listitem
    image: <attraction-name>
    paragraph → StaticText: <attraction-name>
    paragraph → StaticText: <rating>      (e.g. "4.5")
    paragraph → StaticText: (<n_reviews>) (e.g. "(248)")
    StaticText: Open until <HH:MM AM|PM> | Open 24 hours | Closed
    StaticText: Click for details
  ```
- **Top tabs**: `Attractions <N>` / `Events <N>` — switching tabs changes the body content but keeps the same chat URL.

Prefer extracting from the `Places` sidebar `listitem`s. The center column's text is richer but cards are deeply nested with reviews/videos mixed in, and parsing order is fragile.

To get all results: the sidebar is virtualized — only ~5–6 items render before a `Load more` boundary. Scroll the sidebar's `scrollable, div` until the `<N>` count matches the `Attractions <N>` tab badge.

### 5. (Optional) Switch to Map tab for coordinates

```bash
browse click "<ref-for-tab: Map>" --remote
browse wait timeout 2000 --remote
browse snapshot --remote
```

The Map view exposes `image: Map marker` refs per attraction but **does not expose lat/lng in the a11y tree** — only DOM-level marker positions. If you need coordinates, click a marker → details panel opens with the address, then geocode externally.

### 6. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Cloudflare-protected, stealth + proxy mandatory.** `browse cloud fetch` against `https://wanderboat.ai/` (with or without `--proxies`) returns the `_cf_chl_opt` challenge HTML. Only `--verified --proxies` browser sessions clear it. `robots.txt` and `sitemap.xml` are fetchable bare (CDN-cached), but the app HTML is not.
- **`/` → `/chat` 302 redirect** happens on first navigation; don't assume the URL after `browse open` matches what you sent. Always `browse get url` to confirm.
- **IP-geolocation drives "nearby" defaults.** The destination placeholder, the Discover panel cards, and any quick-action labelled "nearby"/"close" use the request's source-IP city, NOT the `Where to` textbox's placeholder string. With Browserbase's default `us-west-2` residential proxy, expect Hermiston, OR (a low-population locale — useful for testing but not realistic). To target a specific city, **always type the city into the chat textarea** (Path B) or set the destination textbox (Path C); do not rely on the proxy IP being where you want.
- **"Search places" button is a place-picker, not a submit.** The button with magnifying-glass icon next to the chat input (label `Search`, ref-pattern `button: Search`) inserts `@` into the input and opens a dropdown of nearby Google places (logos + addresses) — it is the `@-mention` affordance, not a query submitter. The actual submit is `button: send-button` (paper-airplane icon). Verified: clicking `Search` after a blank input opened a `dialog` of 10 nearby places (McDonald's, Denny's, etc.) — not what you want for an attractions search.
- **Quick-action labels are dynamic and personalized.** Observed labels in one session: `Find me a good hike nearby`, `I need a coffee break, what's close?`, `Take me to the latest events`, `I want to get outside today`, `Find me a cool cocktail spot`, `I need places that kids will enjoy`, plus event-specific items like `*FREE* Healthy Cooking on a Budget`, `Babysitting Basics Course (Ages 10-15)`. Don't pin to a label — match by intent keywords (`outside`, `hike`, `coffee`, `cocktail`) when matching by string.
- **Conversations are sticky to the session.** Subsequent sends in the same Browserbase session append to the same `/chat/cov_{nanoid}` URL — they do NOT create a new conversation. To start a fresh thread, `browse open "https://wanderboat.ai/chat" --remote` again. Multi-query test verified: a Paris query sent after a Hermiston "outside today" quick-action both landed in `cov_XPPGLGUaWXo86hxkynUxL9` with the Paris response appended below.
- **AI generation delay is variable.** Quick-action (cached-prompt) responses: 8–12s. Custom natural-language queries: 10–18s. Cross-region cities (Paris from a US proxy): occasionally up to 20s. `browse wait timeout 15000` is a safe default for Path B.
- **The `Attractions <N>` / `Events <N>` tab badges are the source of truth for result count.** The sidebar virtualizes — only the top 5–6 items render until you scroll. Don't assume the visible sidebar list is complete; cross-check against the tab badge.
- **Map tab exposes markers without names or coordinates in the a11y tree** — only the List tab gives you structured attraction data. If you need lat/lng, you'll have to either parse the DOM `data-*` attributes via `browse eval` or geocode externally.
- **Static listicle pages exist but require a slug+nanoid.** Sitemaps surface URLs like `https://wanderboat.ai/listicle/{city-slug}/attractions/{nanoid}` and `https://wanderboat.ai/localities/{country}/{slug}/{nanoid}` — these are pre-rendered city-attraction pages, indexed for SEO. They're potentially a faster deep-link path *if* you already know the slug + nanoid for a target city; but there's no documented slug→nanoid lookup endpoint, so for ad-hoc queries the `/chat` flow is the only practical surface. The sitemap index lists ~5 locality + ~5 listicle shards (`locality_1.xml` through `locality_5.xml`, etc.) — useful for bulk discovery but not for interactive querying.
- **`robots.txt` disallows `/chat?` (with query string), `/chat/`, and `/posts?*` — but allows bare `/chat`.** Honor this. Our flow uses `/chat` and the dynamic `/chat/cov_{nanoid}` — the latter is what `/chat/` disallows for crawlers, so don't curl those URLs out-of-band; interact only through the browser session.
- **No GraphQL/REST endpoints observed in the page snapshot to bypass the UI.** A network trace would reveal the backend (`/api/...`) but per browse.sh policy, we don't reverse-engineer undocumented private APIs — drive the UI.
- **"Closed" vs "Open until X" is real-time and timezone-localized.** The open-hours strings reflect the moment the AI generated the response, in the target city's local time. Don't cache them — they go stale within hours.
- **No login required, no captcha walls past Cloudflare.** A single session can run an arbitrary number of queries; only rate-limiting concern is the AI generation throughput on Wanderboat's side.

## Expected Output

```json
{
  "query": "I want to get outside today",
  "destination": "Hermiston, OR (IP-located)",
  "conversation_url": "https://wanderboat.ai/chat/cov_XPPGLGUaWXo86hxkynUxL9",
  "result_kind": "attractions",
  "result_count": 20,
  "event_count": 3,
  "ai_commentary": "If you want to get outside in Hermiston today, these are the cleanest bets for a little fresh-air glory. It's Thursday morning, and all of these picks fit the outdoor brief nicely—no indoor detours, no drama.",
  "attractions": [
    {
      "name": "Riverfront Park",
      "rating": 4.5,
      "review_count": 248,
      "open_status": "Open until 10:00 PM",
      "hours_summary": "6 a.m.–10 p.m.",
      "best_seasons": ["spring", "summer", "fall"],
      "post_count": 20,
      "ai_summary": "Riverfront Park is the easygoing pick for a classic outdoor reset: open lawns, river vibes, and a solid 6 a.m.–10 p.m. window today."
    },
    {
      "name": "Hat Rock State Park",
      "rating": 4.5,
      "review_count": 274,
      "open_status": "Open until 9:00 PM",
      "hours_summary": "7 AM–9 PM",
      "best_seasons": ["spring", "summer", "fall"],
      "post_count": 21,
      "ai_summary": "Hat Rock State Park brings the bigger scenery energy, with that state-park feel and a 7 AM–9 PM schedule today."
    }
  ]
}
```

Alternative outcome shapes:

```json
// City-specific query (Path B), international destination
{
  "query": "Show me top attractions in Paris",
  "destination": "Paris",
  "conversation_url": "https://wanderboat.ai/chat/cov_XPPGLGUaWXo86hxkynUxL9",
  "result_kind": "attractions",
  "ai_commentary": "Paris is serving the big-ticket classics today — the kind of spots that make your camera roll look slightly smug...",
  "attractions": [
    { "name": "Eiffel Tower", "rating": 4.7, "review_count": 136900, "open_status": "Open until 11:00 PM", "post_count": 82, "likes": "6.2M" }
  ]
}

// Empty / no-results outcome (when AI cannot find direct matches)
{
  "query": "find outdoor events today",
  "destination": "Hermiston, OR (IP-located)",
  "conversation_url": "https://wanderboat.ai/chat/cov_XPPGLGUaWXo86hxkynUxL9",
  "result_kind": "events",
  "result_count": 0,
  "ai_commentary": "I couldn't find any exact outdoor events in Hermiston that match your request... but here are a few nearby outdoor happenings that still fit the fresh-air vibe.",
  "fallback_results": [
    { "name": "Yakima Federal LIVE@5 - Summer Concert Series", "starts": "2026-05-28T17:00Z", "ends": "2026-05-28T23:59Z", "city": "Richland" }
  ]
}
```
