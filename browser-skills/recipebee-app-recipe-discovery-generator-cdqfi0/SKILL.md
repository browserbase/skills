---
name: recipebee-app-recipe-discovery-generator-cdqfi0
title: RecipeBee Recipe Discovery & Extraction
description: >-
  Discover and extract structured recipes from recipebee.app — by direct URL,
  natural-language query mapped to tag/category enums, or bulk sitemap mirror.
  Returns full schema.org/Recipe JSON-LD: ingredients, numbered steps, prep/cook
  times, yield, cuisine, keywords, nutrition. Read-only; AI meal-plan and
  shopping-list features require login and are out of scope.
website: recipebee.app
category: food-and-cooking
tags:
  - recipes
  - cooking
  - meal-planning
  - json-ld
  - schema-org
  - nextjs
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Recipe extraction is a pure HTTP fetch of /recipes/{slug} followed by
      JSON-LD parsing — no browser needed. This is the hot path and what
      'hybrid' leads with.
  - method: browser
    rationale: >-
      Required only for the /browse index (fully client-rendered — 0 anchors in
      initial HTML, ~20 after hydration). Tag and category pages are partial-SSR
      so a bare HTTP fetch returns the above-the-fold subset; open in a browser
      to scroll for the full list.
  - method: api
    rationale: >-
      Confirmed unavailable. /api/ is robots.txt-Disallowed and returns nothing
      useful unauthenticated. The site uses Next.js App Router (RSC) with no
      /_next/data/ JSON sidecars exposed. JSON-LD inlined in /recipes/{slug}
      HTML is the structured-data source.
verified: false
proxies: false
---
# RecipeBee Recipe Discovery & Extraction

## Purpose

Discover and extract structured recipe data from RecipeBee — the public catalog at `recipebee.app`. Given either a natural-language query (e.g. *"chicken stir-fry"*, *"vegan breakfast"*, *"30-minute dinner"*) or a direct recipe URL, return the full `schema.org/Recipe` payload: name, description, hero image, author, ingredients with quantities, numbered cooking steps, prep/cook/total times, yield, recipe category, cuisine, keywords, and nutrition metadata. Also supports topic-based browsing via category and tag indexes, and bulk discovery via `sitemap.xml`. Read-only.

**Out of scope (login-gated):** RecipeBee's AI recipe generation, meal planning, shopping lists, and personal cookbooks live under `/auth/`, `/meal-plans/`, `/shopping-lists/`, and `/dashboard/` — all `Disallow`'d in robots.txt and require an authenticated session. The iOS app drives those features; the public web surface is discovery + extraction only. Do not attempt to scrape or trigger those — they will redirect to `/login`.

## When to Use

- Importing a single recipe from a known `recipebee.app/recipes/{slug}` URL into a downstream meal-planner, grocery-list builder, or recipe-card store.
- Topic-driven discovery: *"give me three high-protein chicken recipes under 30 minutes"*, *"find me Indian comfort food"*, *"vegan breakfast ideas"*. Resolve the topic to a `/tags/{slug}` or `/categories/{slug}` index page, then extract each recipe.
- Bulk catalog mirroring (e.g. building a search index over RecipeBee's full corpus). Use `sitemap.xml` as the authoritative listing.
- Powering an LLM-side meal-plan or shopping-list synthesizer with verified structured recipes as input. The AI synthesis itself happens in the caller's context; this skill only fetches and structures the source recipes.

## Workflow

RecipeBee is a Next.js App Router site (RSC). Every `/recipes/{slug}` page server-side-renders a complete `schema.org/Recipe` JSON-LD block, plus `HowTo` and `FAQPage` blocks — **lead with HTTP fetch + JSON-LD parsing** for extraction. Browser sessions are only needed to hydrate the `/browse` index (which renders client-side). No anti-bot, no auth required for public pages, no proxies needed. The site explicitly allows `GPTBot`, `ChatGPT-User`, `Claude-Web`, and `PerplexityBot` in robots.txt for the discovery surfaces below.

### 1. Resolve the query to one or more recipe URLs

Pick the discovery surface based on the input shape:

| Input | Surface | Method |
|---|---|---|
| Direct URL `recipebee.app/recipes/{slug}` | n/a — skip to step 2 | — |
| Topic / dietary preference matching a known tag | `/tags/{slug}` | HTTP fetch (partial SSR — see gotcha) |
| Topic matching a known category | `/categories/{slug}` | HTTP fetch (partial SSR) |
| Broad query / "anything" / "popular recipes" | `/browse` | **Browser required** (fully client-rendered) |
| Bulk mirror — all recipes | `/sitemap.xml` | HTTP fetch — complete listing |
| Natural-language free-text search | ⚠️ **broken** — see gotcha | Use sitemap + client-side fuzzy match instead |

**Canonical tag/category enums** (from `sitemap.xml` 2026-05-19):

- *Categories:* `breakfast`, `dinner`, `dessert`, `salads`, `side-dishes`, `drinks`, `coffee`, `30-minute-meals`, `one-pot-meals`, `meal-prep`, `quick-and-easy`, `budget-friendly`, `comfort-food`, `clean-eating`, `kids-friendly`, `baking`, `vegetarian`, `vegan`, `gluten-free`, `low-carb`, `high-protein`, `seed-oil-free`, `asian-cuisine`, `italian-cuisine`, `mediterranean`, `russian-cuisine`, `indian-cuisine`, `middle-eastern`, `chicken`, `beef`, `weird`.
- *Tags:* `comfort-food`, `indian`, `avocado`, `basil`, `beef`, `bell-peppers`, `broccoli`, `chicken`, `creamy`, `cucumber`, `customizable`, `egg`, `fish`, `fruity`, `no-bake`, `potato`, `refreshing`, `salmon`, `sauce`, `spiced`, `stir-fry`, `sweet`, `tomato`, `warming`, `weird`, `breakfast`, `lunch`, `dinner`, `snack`, `dessert`, `quick`.

For a natural-language query, map it to the closest tag or category from these enums (this is the LLM-side intent step). If multiple terms apply, hit each surface and dedupe by recipe slug. Example: *"high-protein chicken stir-fry"* → fetch `/categories/high-protein`, `/categories/chicken`, `/tags/stir-fry`; intersect the recipe slugs.

**Tag/category extraction** (HTTP path):

```bash
curl -s "https://recipebee.app/tags/chicken" \
  | grep -oE 'href="/recipes/[a-z0-9-]+"' \
  | sed 's/href="//;s/"$//' \
  | sort -u
# 6 SSR'd anchors for /tags/chicken as of 2026-05-19
```

Or via the `browse cloud fetch` envelope (same payload, easier to parse with `node`):

```bash
browse cloud fetch "https://recipebee.app/tags/chicken" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const j=JSON.parse(s);
      const links=[...new Set([...j.content.matchAll(/href=\"(\\/recipes\\/[a-z0-9-]+)\"/g)].map(m=>m[1]))];
      console.log(JSON.stringify(links));
    })"
```

**`/browse` extraction** (browser path — only when no tag/category fits):

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open --remote "https://recipebee.app/browse"
sleep 3   # wait for hydration — /browse renders 0 anchors in initial HTML, ~20 after hydration
browse get html body --remote \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const j=JSON.parse(s);
      const links=[...new Set([...j.html.matchAll(/href=\"(\\/recipes\\/[a-z0-9-]+)\"/g)].map(m=>m[1]))];
      console.log(JSON.stringify(links));
    })"
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

**`sitemap.xml` extraction** (bulk discovery — fastest, returns the full corpus):

```bash
browse cloud fetch "https://recipebee.app/sitemap.xml" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const j=JSON.parse(s);
      const slugs=[...j.content.matchAll(/<loc>https:\\/\\/recipebee\\.app\\/recipes\\/([a-z0-9-]+)<\\/loc>/g)].map(m=>m[1]);
      console.log(slugs.length, 'recipes');
      console.log(slugs);
    })"
```

### 2. Extract the recipe via JSON-LD

```bash
browse cloud fetch "https://recipebee.app/recipes/{slug}" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
      const j=JSON.parse(s);
      const blocks=[...j.content.matchAll(/<script[^>]*type=\"application\\/ld\\+json\"[^>]*>([\\s\\S]*?)<\\/script>/g)];
      for (const b of blocks) {
        try {
          const o=JSON.parse(b[1]);
          if (o['@type']==='Recipe') { console.log(JSON.stringify(o, null, 2)); return; }
        } catch(e){}
      }
      console.error('no Recipe JSON-LD found');
      process.exit(1);
    })"
```

The page emits ~9 JSON-LD blocks (`Organization` × 2, `WebSite` × 2, `BreadcrumbList` × 2, `Recipe`, `FAQPage`, `HowTo`). The `Recipe` block is canonical; ignore the duplicate `HowTo` block (it carries the same instructions in a different schema for Google rich-snippet compatibility).

### 3. Normalize the output

Convert ISO-8601 durations (`PT45M`, `PT1H20M`) to integer minutes; split the comma-separated `keywords` string into an array; coerce `recipeYield` to `{ value, unit }` (e.g. `"12 servings"` → `{ value: 12, unit: "servings" }`). See the *Expected Output* section below for the canonical shape.

### 4. (Optional) Enrich with FAQ + HowTo blocks

The same page also exposes `FAQPage` (auto-generated Q&A about prep time, servings, and ingredients) and `HowTo` (re-rendering of `recipeInstructions` with an `estimatedCost` field and a `supply[]` summary). Extract these if your downstream wants user-facing FAQ snippets or a budget hint.

## Site-Specific Gotchas

- **The in-page search backend is currently broken.** `/search?q=<query>` and the on-page search form both return `"Failed to load search results. Please try again later."` (verified 2026-05-19 with `q=chicken` — no recipes returned, even though `/tags/chicken` lists six chicken recipes and the sitemap lists more). The page loads, populates the input from `?q=`, then fails on the XHR. **Do not depend on `/search` for discovery** — fall back to sitemap + tag/category filtering. The breakage is server-side, not anti-bot — a residential proxy will not fix it.
- **`/browse` and `/search` are fully client-rendered.** The initial HTML for these two routes contains **zero** `/recipes/{slug}` anchors. They only populate after React hydration runs. HTTP-fetch discovery from these surfaces will return an empty list. Use a browser session (`browse open` + 2–3s wait), or skip them in favor of `/tags/{slug}`, `/categories/{slug}`, or `sitemap.xml`, which are server-rendered.
- **Tag/category pages are partial-SSR.** `/tags/{slug}` and `/categories/{slug}` server-render the first ~6 recipes above the fold but load the rest after hydration. For complete topic coverage, either (a) open in a browser and scroll, or (b) cross-reference against `sitemap.xml` (which lists all published recipes regardless of tag).
- **JSON-LD has duplicate `Organization`/`WebSite`/`BreadcrumbList` blocks.** Don't be alarmed by `blocks.length === 9` on a single recipe page — only one block matches `@type: 'Recipe'`. Filter on `@type` instead of array position.
- **`recipeInstructions` shape is `HowToStep[]`, not strings.** Each step is an object `{ '@type': 'HowToStep', position: N, text: '...', name: 'Step N' }`. Map to `step.text` for human-readable instructions. The legacy "string array" form of `recipeInstructions` (used by some other recipe sites) does **not** appear on RecipeBee.
- **`recipeIngredient` lines are pre-formatted free text, not parsed.** Each entry looks like `"3 cup all-purpose flour"` or `"2 1/4 teaspoon active dry yeast"`. There's no separate `quantity` / `unit` / `name` decomposition. If the downstream needs a shopping-list aggregation, run an LLM or a recipe-parser library (e.g. `ingreedy`, `recipe-scrapers`) on these strings.
- **Many recipes have sparse metadata.** User-submitted recipes (e.g. `/recipes/fried-rice`) often omit `cookTime`, `recipeCategory`, `recipeCuisine`, and have a one-word `keywords`. Editorial recipes (e.g. `/recipes/butter-chicken-stuffed-buns-soft-fluffy`) carry the full set. **Always defensive-parse**: treat every field except `name`, `recipeIngredient`, `recipeInstructions` as optional. `nutrition` is always present but minimally — most recipes only carry `servingSize`, not calorie/macro counts.
- **`keywords` is a comma-separated string, not an array.** Split on `,` and trim. A typical value: `"chicken, Indian, Snack, Comfort Food, spiced, Lunch, Dinner"`. These overlap with both `tags` and `categories` but are not a strict subset — use them as a third hint signal.
- **Time fields are ISO-8601 durations.** `prepTime: "PT45M"`, `cookTime: "PT20M"`, `totalTime: "PT1H5M"`. Parse with a small regex (`/PT(?:(\d+)H)?(?:(\d+)M)?/`) — `Duration.fromISO` from `luxon` also works if the caller has it.
- **Image URLs come from `images.recipebee.app` CDN.** Some are user-uploaded (`/users/{uuid}/recipes/{uuid}/...`), some are AI-generated (`/recipes/{uuid}/ai-generated/...`). Both are publicly hot-linkable. The `image` field can be a single string or a single-element array — normalize to `imageUrl = Array.isArray(image) ? image[0] : image`.
- **No `/api/` is reachable.** `robots.txt` `Disallow`s it for all bots, and the endpoint returns nothing useful from an unauthenticated session. Don't waste time probing for an undocumented JSON API — the JSON-LD path IS the API.
- **AI meal-plan / shopping-list / recipe-generation features require an account.** Reachable only via the iOS app or after `/login` (which the agent has no credentials for). Do not attempt to drive `/dashboard`, `/meal-plans`, `/shopping-lists`, `/settings`, `/verified`, or `/auth/*` — they will 302 to `/login`. The skill's job is to surface source recipes; downstream AI synthesis (meal plans, shopping lists, recommendations tailored to dietary preferences) is the caller's responsibility, working from the extracted recipes.
- **The iOS app's "import from website / social media" flow is not exposed on the web.** RecipeBee's marketing copy mentions importing recipes from external sites and TikTok-style social videos — that capability lives in the iOS client and the private backend. There is no public `/import` endpoint. If the caller needs to import a recipe from a third-party site, they should use the agent's general `schema.org/Recipe` JSON-LD extraction skill directly on the source URL (most major recipe sites publish the same schema for Google rich snippets).
- **No anti-bot, no rate-limit observed** (Next.js + nginx, ~50ms p50 for `cloud fetch`). A bare cloud session (no `--verified`, no `--proxies`) handles every public surface tested. Keep request volume sane (≤ 2 req/s) as a courtesy.
- **Build-id-tagged Next.js data endpoints (`/_next/data/{buildId}/...json`) are not exposed.** The app uses RSC, not getStaticProps — there's no JSON sidecar to short-circuit to. The JSON-LD inlined in the HTML is the cheapest structured source.

## Expected Output

```json
{
  "url": "https://recipebee.app/recipes/butter-chicken-stuffed-buns-soft-fluffy",
  "slug": "butter-chicken-stuffed-buns-soft-fluffy",
  "name": "Butter Chicken Stuffed Buns (Soft & Fluffy)",
  "description": "Soft, fluffy buns stuffed with creamy butter chicken filling.",
  "imageUrl": "https://images.recipebee.app/users/61e02866-.../gallery/11FEEF66-...jpeg",
  "author": { "name": "RecipeBee", "url": "https://recipebee.app" },
  "datePublished": "2026-05-10T01:36:33.000Z",
  "recipeCategory": "Baking",
  "recipeCuisine": "Indian",
  "keywords": ["chicken", "Indian", "Snack", "Comfort Food", "spiced", "Lunch", "Dinner"],
  "yield": { "value": 12, "unit": "servings" },
  "times": {
    "prepMinutes": 45,
    "cookMinutes": 20,
    "totalMinutes": 65
  },
  "ingredients": [
    "3 cup all-purpose flour",
    "2 1/4 teaspoon active dry yeast",
    "2 tablespoon granulated sugar",
    "1 teaspoon salt",
    "1 cup warm milk (110°F/45°C)"
  ],
  "steps": [
    { "position": 1, "text": "In a small bowl, combine warm milk, sugar, and yeast. Stir gently and let rest for 5-10 minutes until foamy." },
    { "position": 2, "text": "..." }
  ],
  "nutrition": { "servingSize": "1 serving (makes 12)" },
  "faq": [
    { "question": "How long does it take to make ...?", "answer": "..." }
  ],
  "source": {
    "site": "recipebee.app",
    "extractedFrom": "jsonld",
    "method": "http-fetch"
  }
}
```

**Discovery-mode output** (when the input is a query, not a URL — return a list before extracting):

```json
{
  "query": "high-protein chicken stir-fry",
  "resolved": {
    "categories": ["high-protein", "chicken"],
    "tags": ["chicken", "stir-fry"]
  },
  "candidates": [
    { "slug": "spicy-seed-oil-free-beef-and-broccoli-stir-fry", "url": "https://recipebee.app/recipes/spicy-seed-oil-free-beef-and-broccoli-stir-fry", "matchedOn": ["stir-fry"] },
    { "slug": "diabetic-friendly-chicken-and-bell-pepper-stir-fry", "url": "https://recipebee.app/recipes/diabetic-friendly-chicken-and-bell-pepper-stir-fry", "matchedOn": ["chicken", "stir-fry"] }
  ],
  "fetched": [ /* full extracted Recipe objects from the top N candidates */ ]
}
```

**Empty / failure shapes:**

```json
// Query resolves to a tag/category that has no recipes (rare — these are pre-curated enums)
{ "query": "...", "candidates": [], "reason": "no_recipes_in_topic" }

// Direct URL 404s (recipe was unpublished or slug typo)
{ "url": "...", "error": "not_found", "statusCode": 404 }

// Recipe page loaded but JSON-LD Recipe block missing (should not happen on /recipes/ — flag as anomaly)
{ "url": "...", "error": "no_recipe_jsonld", "statusCode": 200, "hint": "page may not be a recipe detail page" }

// Search route invoked — currently broken (see gotcha)
{ "query": "...", "error": "search_backend_unavailable", "fallback": "use sitemap.xml + tag/category filters instead" }
```
