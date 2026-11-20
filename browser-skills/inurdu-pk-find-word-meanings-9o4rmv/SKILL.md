---
name: inurdu-pk-find-word-meanings-9o4rmv
title: InUrdu.pk Name & Vocabulary Meaning Lookup
description: >-
  Look up a name's English + Urdu meaning, pronunciation, gender, syllables,
  origin, and lucky details on inurdu.pk — or fetch curated Urdu vocabulary
  lists by topic.
website: inurdu.pk
category: reference
tags:
  - names
  - urdu
  - dictionary
  - meanings
  - vocabulary
  - pakistani
  - muslim
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: url-param
alternative_methods:
  - method: url-param
    rationale: >-
      Direct GET to /?s={name} returns a 302 to /name/{slug}/, or 200 with a
      clear 'no results' marker. One round-trip, server-side rendered HTML, no
      JS or browser required.
  - method: browser
    rationale: >-
      Only needed as fallback if Cloudflare ever interposes a challenge — none
      observed in testing. Adds latency and cost with no data-completeness
      benefit since the canonical HTML already carries every field.
  - method: api
    rationale: >-
      No public JSON API exists. Probed paths return the site's 404. Sitemap.xml
      is the only structured-data surface and only enumerates URLs, not name
      data.
verified: false
proxies: true
---
# InUrdu.pk Name & Vocabulary Meaning Lookup

## Purpose

Look up the meaning of a personal name (Muslim / Pakistani / Arabic / Urdu) — or a thematic vocabulary word — on inurdu.pk and return its structured details: English meaning, Urdu-script meaning (e.g. `عظیم`), Roman-Urdu pronunciation, gender, syllable count, origin/history paragraphs (English + Urdu), and lucky attributes (number, color, alphabets, days, dates, hours, stones, metals). Read-only. The site is a public, server-side-rendered Astro static site fronted by Cloudflare with no observed anti-bot, login, captcha, or JS-only rendering — every field is in the initial HTTP response, so the optimal path is a direct HTTPS fetch with HTML parsing, not browser automation.

## When to Use

- A user asks "what does the name X mean?" / "what is the Urdu meaning of X?" / "is X a boy or girl name?"
- A user wants the Urdu script (Nastaliq) rendering of a given English name.
- A user asks for "lucky" numerological details (lucky number, lucky color, stones, days) tied to a name.
- A user wants Roman-Urdu pronunciation for a name they have only seen written in English or Urdu.
- A user wants Urdu vocabulary for a thematic category (fruits, vegetables, body parts, colors, family relations, days, months, animals, etc.) — these live at `/{topic}-in-urdu/`.
- A user asks for the 99 Names of Allah in Urdu (`/names-of-allah-in-urdu/`).

Do **not** use this skill for: dictionary translation of arbitrary English-to-Urdu sentences (the site only covers names + the curated vocab list), authoritative Islamic-jurisprudence rulings on naming, or numerology advice that goes beyond what the page literally states.

## Workflow

The site exposes a search redirect that turns the lookup into a single HTTP round-trip. Use it. Browser automation is unnecessary overhead here.

1. **Normalize the query.** Lowercase the user-provided name and strip surrounding whitespace. Diacritics and non-ASCII characters can stay in the query string — the redirect handler matches case-insensitively against the canonical lowercase slug.

2. **Hit the search redirect with a residential-proxied HTTPS GET, following at most one redirect:**
   ```
   GET https://www.inurdu.pk/?s={url-encoded-query}
   ```
   - **`302 Location: /name/{slug}/`** → the name exists. Follow the redirect (or fetch the location URL directly) to get the canonical name page.
   - **`200 OK`** with `<h1>Uh oh, no results found</h1>` in the body → the name is not in inurdu.pk's corpus. Return an `outcome: not_found` payload to the caller and stop. Do not invent a meaning; the corpus is curated and missing-from-corpus is meaningful signal.
   - **`301` from the bare apex `inurdu.pk` to `www.inurdu.pk`** is normal — always use the `www.` host to skip it.

3. **Fetch the canonical name page** at `https://www.inurdu.pk/name/{slug}/` (which may also be reached directly if the caller already knows the slug — same lowercase rules). Status `200` on success, `404` on a missing slug.

4. **Parse the HTML** (server-rendered, no JS execution needed). Two reliable extraction strategies:
   - **Structured key/value rows** under the overview card — each `<div class="explain-contents">` contains `<div class="explain-title">{Label}</div>` and `<div class="explain-subtitle">{Value}</div>`. Labels observed: `Name`, `Meaning`, `Urdu Meaning`, `Pronunciation`, `Gender`, `Syllables`.
   - **Lucky grid** — `<div class="lucky-grid">` contains `<div class="lucky-item">` children, each with `<div class="lucky-label">` + `<div class="lucky-value">`. Labels observed: `Lucky Number`, `Lucky Color`, `Lucky Alphabets`, `Lucky Days`, `Lucky Dates`, `Lucky Hours`, `Supportive Numbers`, `Auspicious Stones`, `Auspicious Metals`, `Alternate Stones`.
   - **Long-form description** — the `<h2>{Name} Name Details</h2>` heading is followed by an English paragraph; the `<h2>{Name} Name Details (Urdu)</h2>` heading by an Urdu paragraph. Both live in `<p class="overview-text-subheader">`.
   - **JSON-LD** at `<script type="application/ld+json">` carries `BreadcrumbList` + `Article` schema for the canonical URL + title — useful as a cross-check on the slug-to-name mapping.

5. **For vocabulary lookups** (fruits, vegetables, colors, body parts, etc.), fetch `https://www.inurdu.pk/{topic}-in-urdu/` directly. The list of available topics is in the footer of any page; an abbreviated set includes: `alphabet`, `numbers`, `fruits`, `vegetables`, `family-relations`, `pronouns`, `vowels`, `consonants`, `days-of-the-week`, `months`, `islamic-months`, `seasons`, `dates`, `body-parts`, `emotions`, `dry-fruits`, `spices`, `sweets`, `drinks`, `foods`, `animals`, `plants`, `shapes`, `colors`, `greetings`, `occupations`, `diseases`, `flowers`, `birds`, `insects`, `clothes`, `vehicles`, `musical-instruments`, `weather`, `directions`, `time-words`, `riddles`, `proverbs`, `idioms`. Each page renders an `<div class="alpha-grid">` of `<div class="alpha-card">` items, each containing `<div class="alpha-name">` (Urdu script), `<div class="alpha-sound">English: <b>{English}</b></div>`, and `<div class="alpha-num">{Roman-Urdu transliteration}</div>`.

6. **For browsing the whole name corpus** (e.g. "give me a list of all girl names starting with A"), iterate `/names/{category}/page/{N}/` where category ∈ `{muslim, boy, girl, arabic, urdu, pakistani, islamic}` and N starts at 1. The `<a href="/names/{category}/page/{N+1}/">Next Page</a>` link inside `<div class="paginate">` terminates the iteration when absent. For exhaustive enumeration prefer `https://www.inurdu.pk/sitemap_index.xml`, which fans out to ~40 `/name-sitemap{N}.xml` files listing every `/name/{slug}/` URL.

### Browser fallback

Only fall back to a real browser if Cloudflare ever starts returning challenge pages (none seen during testing — `cf-cache-status` and a normal `cloudflare` server header are the only signs of CF). If needed:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.inurdu.pk/?s=azeem" --remote --session "$sid"
browse get markdown body --remote --session "$sid"
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

`--verified` is **not** required (no captcha encountered). `--proxies` is the safe default but the site responded normally from datacenter IPs as well during initial probes — keep proxies on if you're making many requests in a tight loop to avoid Cloudflare rate-limiting.

## Site-Specific Gotchas

- **Always use the `www.` host.** The apex `https://inurdu.pk/` issues a `301` to `https://www.inurdu.pk/`. Hard-coding the `www.` form saves one round-trip and avoids tooling that doesn't follow the apex redirect cleanly.
- **Search is a redirect, not an API.** `GET /?s=Ayesha` returns `302 Location: /name/ayesha/`. Configure your HTTP client to follow at most one redirect — chained redirects do not occur here, and unbounded redirect-following is a footgun on any site.
- **Slugs are lowercased.** The user types `Ayesha` or `AYESHA`; the canonical URL is `/name/ayesha/`. The search redirect handles the normalization for you; if you bypass search and hit `/name/{slug}/` directly, lowercase the slug first or you'll get `404`.
- **"No results" is a real, intentional outcome.** When the search query has no match, the response is **`200 OK`** (not 404) with a body that contains `<h1 class="container-card-title">Uh oh, no results found</h1>` and a "Page 1" indicator with zero result cards. Detecting "no results" by status code alone is wrong — match on the heading text or on the absence of `.container-card` elements.
- **The corpus is curated, not algorithmic.** If a name isn't on inurdu.pk, do **not** synthesize a meaning. Common Pakistani / Arabic / Urdu names are well-covered (Azeem, Ayesha, Fatima, Hassan, Ali, etc.) but Western names and uncommon transliterations may legitimately be missing.
- **Urdu-meaning field is comma-separated, in Urdu script.** E.g. for Azeem: `عظیم، معزز، ممتاز`. The separator is an Arabic comma (U+060C, `،`), not an ASCII comma. Don't naively `split(",")` — split on `[،,]` or just present the field as-is.
- **Gender is a free-text field, not an enum.** Values observed: `boy`, `girl`, and (for unisex names like "Azer") both `👧👦` emojis on listing cards. The detail page's `.explain-subtitle` under `Gender` carries a single token; if both genders apply the site typically creates two separate slugs (e.g. `/name/azer/` shows both). Treat the field as a string.
- **Lucky-info fields are not always all present.** Newer or sparser entries may omit `Auspicious Metals` or `Alternate Stones` — code defensively against missing `.lucky-item` rows.
- **Pagination is `/names/{category}/page/{N}/`, not `?page=N`.** Hitting `/names/muslim/?page=2` works for a few categories but is not the canonical form; always use the path segment style emitted by the site's own "Next Page" anchor.
- **The site emits `noindex` on combinatorial filter pages with zero results** per `/robots.txt`. Those URLs still return `200` HTML, but they are not part of the canonical corpus and shouldn't be cached as authoritative.
- **JS execution is not required for any field on this skill's target pages** — every value lives in the initial HTML. Driving a browser is pure overhead unless Cloudflare ever interposes a challenge.
- **No public JSON API exists.** All `/api/*` and similar guess-paths return the site's 404. The HTML + sitemap.xml are the only data surfaces. Don't waste time searching for a JSON endpoint.

## Expected Output

Successful name lookup (`outcome: found`):

```json
{
  "outcome": "found",
  "query": "Azeem",
  "url": "https://www.inurdu.pk/name/azeem/",
  "name": "azeem",
  "meaning_english": "great, noble, outstanding",
  "meaning_urdu": "عظیم، معزز، ممتاز",
  "pronunciation": "uh-zeem",
  "gender": "boy",
  "syllables": 2,
  "description_english": "The name Azeem has Arabic origins and is commonly used in Muslim cultures. It carries the meaning of 'great,' 'noble,' or 'outstanding,' symbolizing strength and importance. Azeem is often seen as a powerful and impactful name, embodying qualities of leadership and distinction.",
  "description_urdu": "عظیم نام کی اصل عربی ہے اور عام طور پر مسلم ثقافتوں میں استعمال ہوتی ہے۔ یہ 'عظیم،' 'عظیم،' یا 'باقی،' طاقت اور اہمیت کی علامت کے معنی رکھتا ہے۔",
  "lucky": {
    "number": "3",
    "color": "Yellow",
    "alphabets": "C, L, U",
    "days": "Tuesday, Thursday, Saturday",
    "dates": "3, 12, 21, 30",
    "hours": "9, 12",
    "supportive_numbers": "2, 6",
    "auspicious_stones": "Tiger's Eye, Yellow Topaz",
    "auspicious_metals": "Tin, Mercury",
    "alternate_stones": "Golden Calcite, Yellow Jasper"
  }
}
```

Name not in corpus (`outcome: not_found`):

```json
{
  "outcome": "not_found",
  "query": "NotARealName123",
  "url": "https://www.inurdu.pk/?s=NotARealName123",
  "message": "We could not find any names for the term: NOTAREALNAME123. Please try another name."
}
```

Vocabulary-page lookup (`outcome: vocabulary`):

```json
{
  "outcome": "vocabulary",
  "topic": "fruits",
  "url": "https://www.inurdu.pk/fruits-in-urdu/",
  "items": [
    { "english": "Apple",     "urdu": "سیب",        "roman": "Seb" },
    { "english": "Apricot",   "urdu": "خوبانی",     "roman": "Khubani" },
    { "english": "Avocado",   "urdu": "ایوکاڈو",    "roman": "Avocado" },
    { "english": "Banana",    "urdu": "کیلا",       "roman": "Kela" }
  ]
}
```

Listing-page lookup (`outcome: listing`):

```json
{
  "outcome": "listing",
  "category": "muslim",
  "page": 1,
  "url": "https://www.inurdu.pk/names/muslim/",
  "next_page": "https://www.inurdu.pk/names/muslim/page/2/",
  "names": [
    { "name": "Ghafr",     "gender": "boy",  "pronunciation": "gah-fer",   "url": "https://www.inurdu.pk/name/ghafr/" },
    { "name": "Maahlaqa",  "gender": "girl", "pronunciation": "maah-la-ka","url": "https://www.inurdu.pk/name/maahlaqa/" }
  ]
}
```
