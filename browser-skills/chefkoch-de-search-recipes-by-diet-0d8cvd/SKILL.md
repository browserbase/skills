---
name: chefkoch-de-search-recipes-by-diet-0d8cvd
title: Chefkoch Search Recipes by Diet
description: >-
  Search Chefkoch.de's recipe catalog by diet (vegan, vegetarian, low-carb,
  keto, paleo, low-fat, etc.) and optional keyword, returning title, rating,
  prep time, difficulty, image, and URL. Also fetches the daily 'Was koche ich
  heute' editorial picks.
website: chefkoch.de
category: food
tags:
  - recipes
  - cooking
  - german
  - diet
  - vegan
  - vegetarian
  - food
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      Only needed to interact with the diet filter modal UI; runtime extraction
      does not require it. Cookie consent dialog blocks the page until
      dismissed.
verified: false
proxies: true
---
# Chefkoch Search Recipes by Diet

## Purpose

Search Chefkoch.de's catalog (≈384,000 recipes) for those matching one or more diet/allergen filters and optionally a keyword, returning each recipe's title, canonical URL, image, rating + vote count, preparation time, difficulty, short description, and recipe ID. Also covers the daily "Was koche ich heute?" suggestion stream when no diet filter is requested. Read-only — never posts, rates, saves to Kochbuch, or interacts with the Wochenplaner.

## When to Use

- "Find me vegan main-course recipes rated ≥4 stars."
- "Give me 30-minute low-carb dinners."
- "What's on Chefkoch's daily 'Was koche ich heute' picks?"
- "Glutenfreie Suppe für 4 Personen" (free-text keyword + diet tag).
- Bulk extraction of search-result metadata for meal-planning agents, recipe aggregators, or RAG pipelines targeting German-language cooking content.

## Workflow

Chefkoch's search-result page is fully server-rendered into a stable URL grammar with **embedded `data-vars-*` attributes on every recipe card** and a parallel `<script type="application/ld+json">` ItemList. There is no JSON API, no GraphQL, and no XHR endpoint needed — `browse cloud fetch <url> --proxies` returns the full result set in one HTTP request (~0.5s for 30-result page, status 200, no anti-bot stealth required). **Lead with the URL-param HTTP path; reserve the browser flow only for inspecting the filter modals interactively, which the agent shouldn't need to do at runtime.**

### 1. Construct the search URL

URL grammar (all modifiers optional except `s<page>`):

```
https://www.chefkoch.de/rs/s<page>[t<id>,<id>,…][r<minRating>][p<maxMinutes>][o<sort>][/<query>]/<slug>-Rezepte.html
```

- **`s<N>`** — page index, zero-based. `s0` = first page (≤30 cards), `s1` = next page, etc. The trailing `-Rezepte.html` slug is informational only — the server canonicalizes whatever you submit, so you can pass `/Rezepte.html` and follow the 301 to learn the canonical slug. **A request with `s<N>` beyond the available page count 301-redirects back to `s1`** (verified `s30` → `s1` for vegan). Read `Location` header to detect exhaustion.
- **`t<id>[,<id>,…]`** — comma-separated tag IDs from the table below. The server auto-sorts ascending and rewrites the URL via 301 (e.g. `t57,21` → `t21,57`). Combining tags ANDs them: `t21,57` returns recipes that are both `Hauptspeise` AND `Vegan`.
- **`r<n>`** — minimum average rating, 1..5. Decimal allowed (`r4.5`). `r4` returned 18,491 vegan recipes vs. 26,393 unfiltered.
- **`p<minutes>`** — maximum preparation time ("Arbeitszeit") in literal minutes. Verified values: `p15`, `p30`, `p60`, `p120`. The UI slider in the modal exposes 5 stops (15/30/60/120/unlimited) but the URL accepts any positive integer.
- **`o<n>`** — sort order: `o2` Empfehlung (default — *can be omitted*), `o3` Bewertung (best-rated first), `o6` Neuheiten (newest first). Other values 301 back to default.
- **`/<query>/`** — optional free-text keyword **between the modifier block and the slug**, e.g. `/rs/s0t57/glutenfrei/Rezepte.html` for vegan + "glutenfrei" keyword. Use this for allergens/ingredients not in the diet enum (gluten-free, laktosefrei, nussfrei, sojafrei, etc.) — Chefkoch's diet enum doesn't cover specific allergens beyond Vegan/Vegetarisch, so allergy intent falls back to keyword.

#### Tag ID reference (complete enum, extracted 2026-05-20 from `/rs/s0/Rezepte.html`)

**Diet (Ernährung) — primary group for this skill:**

| id | label | id | label |
|---|---|---|---|
| 32 | Vegetarisch | 7710 | Paleo |
| 57 | Vegan | 56 | Fettarm |
| 55 | Kalorienarm | 112 | Trennkost |
| 9948 | Low Carb | 143 | Vollwert |
| 9947 | Ketogen | 111 | Für das Baby |

**Meal type (Mahlzeit):** 21 Hauptspeise · 19 Vorspeise · 36 Beilage · 90 Dessert · 71 Snack · 53 Frühstück

**Category (Rezeptkategorie):** 30 Auflauf · 82 Pizza · 94 Reis-/Nudelsalat · 15 Salat · 3669 Salatdressing · 122 Tarte · 52 Fingerfood · 35 Dips · 34 Saucen · 40 Suppe · 166 Klöße · 108 Brot/Brötchen · 46 Brotspeise · 51 Aufstrich · 89 Süßspeise · 127 Eis · 92 Kuchen · 147 Kekse · 93 Torte · 157 Confiserie · 11 Getränke · 113 Shake · 313 Gewürzmischung · 243 Pasten · 211 Studentenküche

**Characteristic (Rezepteigenschaften):** 50 Einfach · 49 Schnell · 79 Basisrezepte · 48 Preiswert

**Cuisine (Länderküche):** 65 Deutsch · 28 Italienisch · 43 Spanisch · 149 Portugiesisch · 84 Französisch · 117 Englisch · 86 Osteuropäisch · 133 Skandinavisch · 44 Griechisch · 103 Türkisch · 212 Russisch · 163 Naher Osten · 14 Asiatisch · 13 Indisch · 148 Japanisch · 38 Amerikanisch · 74 Mexikanisch · 95 Karibisch · 114 Lateinamerikanisch · 101 Afrikanisch · 131 Marokkanisch · 168 Ägyptisch · 145 Australisch

**Occasion (Anlass):** 78 Frühling · 27 Sommer · 99 Herbst · 64 Winter · 91 Für Kinder · 120 Ostern · 39 Halloween · 102 Weihnachten · 87 Silvester · 106 Festlich · 63 Grillen · 152 Camping · 45 Party

**Technique (Zubereitung):** 144 Kochen · 69 Braten · 107 Dünsten · 153 Blanchieren · 66 Schmoren · 23 Backen · 137 Überbacken · 116 Wok · 135 Mikrowelle · 162 Römertopf · 62 Fondue · 136 Marinieren · 134 Frittieren · 128 Flambieren · 150 Haltbarmachen · 1147 Wursten

Example URLs (all return HTTP 200, fully rendered HTML with 30 recipe cards on s0):

```
# Vegan, sorted by rating, min 4 stars
https://www.chefkoch.de/rs/s0t57r4o3/Vegan-Rezepte.html      # 18,491 results

# Low-carb main courses, min 4 stars, sorted by rating
https://www.chefkoch.de/rs/s0t21,9948r4o3/Hauptspeise-Low-Carb-Rezepte.html

# Vegetarian + glutenfrei keyword, max 30 minutes
https://www.chefkoch.de/rs/s0t32p30/glutenfrei/Vegetarisch-Rezepte.html

# Vegan pasta dishes
https://www.chefkoch.de/rs/s0t57/pasta/Vegan-Rezepte.html    # 2,767 results
```

### 2. Fetch the page

```bash
browse cloud fetch "<URL>" --proxies > /tmp/page.json
```

`--proxies` flag is **optional** (Chefkoch has no anti-bot enforcement against direct US IPs in our testing) but cheap insurance against future enforcement and adds <100ms latency. No `--verified` stealth needed. Response is wrapped in a JSON envelope — the HTML is at `.content`.

### 3. Parse the total result count + recipe cards

```python
import re, json, html

# Total count (German number format, '.' as thousands separator)
m = re.search(r'(\d[\d.]+)\s*Rezepte', content)
total = int(m.group(1).replace('.', '')) if m else None

# Each recipe card has the same shape — extract by data-vars-* attributes
card_re = re.compile(
    r'data-vars-position="(?P<pos>\d+)"\s+'
    r'data-vars-tracking-id="recipe-(?P<id>\d+)"\s+'
    r'data-vars-recipe-title="(?P<title>[^"]+)"'
    r'.{0,200}?data-vars-num-votes="(?P<votes>\d+)"\s+'
    r'data-vars-rating="(?P<rating>[\d.]+)"\s+'
    r'data-vars-has-video="(?P<video>[01])"',
    re.DOTALL,
)

# Within each card, time + difficulty live in <div class="ds-recipe-info">
# with two <span class="ds-recipe-info__text"> children:
#   1st: "10 Min." | "1 Std." | "2 Std. 15 Min."
#   2nd: "simpel" | "normal" | "pfiffig"
info_re = re.compile(
    r'<div class="ds-recipe-info">.+?'
    r'<span class="ds-recipe-info__text"[^>]*>([^<]+)</span>.+?'
    r'<span class="ds-recipe-info__text"[^>]*>([^<]+)</span>',
    re.DOTALL,
)

# Canonical URL is the first <a class="ds-recipe-card__link"> href
url_re = re.compile(r'<a class="ds-recipe-card__link[^"]*"\s+href="([^"]+)"')

# Description (1-line teaser, optional)
desc_re = re.compile(r'<div class="ds-recipe-card__description[^"]*">([^<]+)</div>')

# Image (full-size 640x800 lives in srcset)
img_re = re.compile(r'<img alt="[^"]+"\s+loading="lazy"\s+src="([^"]+)"')
```

The JSON-LD `ItemList` block (`<script type="application/ld+json">`) is a parallel, lighter-weight surface that gives you `{position, url, name, description}` per recipe without HTML scraping — use it when you only need title + URL and want to skip data-vars regex. Cross-check: both surfaces return **42 items per s0 page on filtered queries, 30 on others**. (The page-DOM `data-vars-position` count and the JSON-LD count match exactly per response.)

### 4. Paginate

Increment `s<N>` until the response 301-redirects you back to `s1` (signaling exhaustion) or you hit your target N:

```python
def fetch_page(url): ...
page = 0
while True:
    url = f"https://www.chefkoch.de/rs/s{page}t57r4o3/Vegan-Rezepte.html"
    r = fetch_page(url)
    if r['statusCode'] == 301 and '/rs/s1' in r['headers']['Location']:
        break  # exhausted
    cards = parse(r['content'])
    if not cards: break
    yield from cards
    page += 1
```

Page size is ~30 cards (sometimes 42 with embedded "you-might-also-like" tail). Plan request budget around `ceil(total / 30)` pages.

### 5. Daily "Was koche ich heute?" (no filter)

When the user has no diet/keyword intent and just wants today's editorial picks:

```bash
browse cloud fetch "https://www.chefkoch.de/rezepte/was-koche-ich-heute/" --proxies
```

Returns 8 hand-curated recipes for the day. Extract them from the page's recipe URLs (`https://www.chefkoch.de/rezepte/<id>/<slug>.html`) — the JSON-LD on this page is a `CollectionPage`, not an `ItemList`, so recipe URLs surface via plain anchor regex rather than schema.org structure. The same card shape (`data-vars-rating`, `data-vars-num-votes`, etc.) is **not** present on this page; titles come from the anchor's `title=` attribute or surrounding `<h3>`.

### Browser fallback

Only needed if you want to (a) trigger fresh-Vue rendering of a non-public filter the URL grammar doesn't expose, or (b) demo the diet-modal UI to a human. The runtime skill should not need this. If you do open a browser:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "...parse .id...")
export BROWSE_SESSION="$sid"
browse open "https://www.chefkoch.de/rs/s0/Rezepte.html" --remote
# Dismiss the cookie consent modal — required before any interaction
browse snapshot --remote                            # find button: "Allen Zwecken zustimmen"
browse click @<ref-from-snapshot> --remote
# Click filter chip "Ernährung", check diet boxes, click "Anwenden".
# Read the URL the page navigates to — it is exactly the URL grammar above.
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The cookie consent dialog (`Willkommen bei Chefkoch — Allen Zwecken zustimmen`) blocks all interaction until dismissed; it does **not** appear on `browse cloud fetch` requests because no cookies are persisted, so it is irrelevant for the recommended URL-param path.

## Site-Specific Gotchas

- **No anti-bot enforcement** on direct HTTP fetches in 2026-05-20 testing — bare `curl` + `User-Agent` would likely work, and `browse cloud fetch --proxies` certainly works (status 200, no captcha, no Akamai). Don't waste time on `--verified` stealth sessions for this skill.
- **Server canonicalizes tag order and rewrites URL**: submitting `t57,21` → 301 to `t21,57/Hauptspeise-Vegan-Rezepte.html`. Always follow the redirect chain; the final URL is the canonical one Chefkoch indexes. `browse cloud fetch` does not auto-follow — read the `Location` header and re-fetch.
- **Slug at end is informational only** — `/Vegan-Rezepte.html`, `/Hauptspeise-Vegan-Rezepte.html`, even `/Rezepte.html` all work for the same tag set. The server uses the modifier block to compute its own slug and 301s if you submit a "wrong" one. Don't try to reconstruct the slug from tag names; just submit `/Rezepte.html` and let the server rewrite.
- **Pagination beyond the result set 301s to `s1`** rather than serving an empty page. Use this as a clean exhaustion signal: if you sent `s<N>` and the response is `301 Location: /rs/s1...`, you've gone past the last page.
- **No dedicated allergen filter beyond Vegan/Vegetarisch**: the diet enum (10 values) covers vegetarian, vegan, low-carb, ketogen, paleo, low-fat, low-cal, Trennkost (food-combining), Vollwert (whole-foods), and Baby — but **does not** include glutenfrei, laktosefrei, nussfrei, sojafrei, fructosearm, or histaminarm. For those, fall back to free-text keyword search via the `/<query>/` segment (e.g. `/rs/s0t32p30/glutenfrei/Rezepte.html`). The keyword matches recipe titles, descriptions, ingredient lists, and tags.
- **`r<n>` rating is a *minimum* threshold, not a tier** — `r4` means ≥4.00, not "4-star tier". Decimal precision works (`r4.5` → 10,505 vegan results vs. `r4` → 18,491).
- **`o2` sort is the default and can be omitted** — submitting `o2` explicitly will 301-redirect to a URL without the `o` modifier. Only `o3` (rating) and `o6` (newest) survive in canonical URLs.
- **`p<minutes>` is in literal minutes, not the slider's 1–5 index.** The UI slider snaps to 15/30/60/120; the URL accepts any positive integer.
- **German thousands separator in result count**: "26.393 Rezepte" means **26,393**, not 26.393. Strip the period before parsing.
- **Card count per page varies**: filtered queries return ~42 cards/page (30 results + 12 cross-sell at tail); broad queries return 30. The `data-vars-position` attribute is the authoritative item index — trust it over `len(matches)`.
- **JSON-LD `ItemList` is lossy** — it carries `{position, url, name, description}` but **no rating, vote count, prep time, difficulty, or image**. Use the data-vars regex on the card HTML for full metadata, or hit each recipe page individually for richer schema.org `Recipe` data.
- **Difficulty enum is fixed**: `simpel`, `normal`, `pfiffig`. Not localized in the URL.
- **Cooking-time strings are not zero-padded** — `"5 Min."`, `"45 Min."`, `"1 Std."`, `"1 Std. 30 Min."`. Parse as duration; don't assume two-digit minutes.
- **"Was koche ich heute?" page does NOT carry `data-vars-*` on cards** and uses a `CollectionPage` JSON-LD type, not `ItemList` — its 8 daily recipes need plain-anchor extraction. Use a different parser than the search-result parser for this page.
- **Cookie consent (`dialog: Willkommen bei Chefkoch`) blocks the browser UI** — only relevant if you open a browser session. The "Allen Zwecken zustimmen" button (extracted ref e.g. `[5-1009]`) is what dismisses it. `browse cloud fetch` is unaffected.
- **PLUS-paywalled recipes** exist as a small fraction of results, marked by `data-vars-plus-content="1"` (and the "Nur PLUS-Rezepte" filter toggle). They surface in the result list but the recipe detail page is gated behind a subscription. The skill should still return them as listed; downstream consumers can filter on the `is_plus` flag.

## Expected Output

For a typical filtered query (`/rs/s0t57r4o3/Vegan-Rezepte.html`):

```json
{
  "query": {
    "url": "https://www.chefkoch.de/rs/s0t57r4o3/Vegan-Rezepte.html",
    "tags": [{"id": 57, "label": "Vegan", "group": "diet"}],
    "min_rating": 4.0,
    "max_prep_minutes": null,
    "sort": "rating",
    "keyword": null,
    "page": 0
  },
  "total_results": 18491,
  "page_size": 30,
  "recipes": [
    {
      "position": 1,
      "id": "4410071768223128",
      "title": "Veganes Gnocchi-Ragout",
      "url": "https://www.chefkoch.de/rezepte/4410071768223128/Veganes-Gnocchi-Ragout.html",
      "image": "https://img.chefkoch-cdn.de/rezepte/4410071768223128/bilder/1614973/crop-640x800/veganes-gnocchi-ragout.jpg",
      "rating": 4.71,
      "num_votes": 7,
      "prep_time_minutes": 10,
      "prep_time_raw": "10 Min.",
      "difficulty": "normal",
      "description": "vegan",
      "has_video": true,
      "is_plus": false
    }
  ]
}
```

For the daily-suggestions page (`/rezepte/was-koche-ich-heute/`):

```json
{
  "query": {"url": "https://www.chefkoch.de/rezepte/was-koche-ich-heute/", "type": "daily_suggestions"},
  "date": "2026-05-20",
  "total_results": 8,
  "recipes": [
    {
      "position": 1,
      "id": "111751046790147",
      "title": "Käsesuppe",
      "url": "https://www.chefkoch.de/rezepte/111751046790147/Kaesesuppe.html",
      "rating": null,
      "num_votes": null,
      "prep_time_minutes": null,
      "difficulty": null
    }
  ]
}
```

For an exhausted pagination request (`s<N>` past last page):

```json
{
  "query": {"url": "https://www.chefkoch.de/rs/s99t57/Vegan-Rezepte.html", "page": 99},
  "total_results": 18491,
  "page_size": 0,
  "recipes": [],
  "exhausted": true,
  "redirected_to": "https://www.chefkoch.de/rs/s1t57/Vegan-Rezepte.html"
}
```

For an unknown allergen the diet enum doesn't cover (`glutenfrei`, `laktosefrei`, `nussfrei`), combine a related diet tag with the keyword segment:

```json
{
  "query": {
    "url": "https://www.chefkoch.de/rs/s0t32p30/glutenfrei/Rezepte.html",
    "tags": [{"id": 32, "label": "Vegetarisch", "group": "diet"}],
    "keyword": "glutenfrei",
    "max_prep_minutes": 30,
    "note": "Chefkoch's diet enum has no glutenfrei tag — falling back to keyword match."
  }
}
```
