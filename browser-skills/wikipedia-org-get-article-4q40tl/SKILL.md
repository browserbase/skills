---
name: wikipedia-org-get-article-4q40tl
title: Wikipedia Get Article
description: >-
  Given a Wikipedia article reference (URL, lang+title, or free-form name),
  return structured content: canonical URL, title, language, lead summary, full
  section tree, infobox key/value pairs, thumbnail, image list, outbound article
  links, external links with section attribution, categories, last-revised
  timestamp, pageid, and revid. Handles redirects, disambiguation pages, and
  non-English editions.
website: wikipedia.org
category: knowledge
tags:
  - wikipedia
  - mediawiki
  - knowledge
  - reference
  - read-only
  - api
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Strictly a fallback for the (so-far unobserved) case where a language
      edition's REST/Action API is unreachable from the caller's network.
      Wikipedia's public site is fully scrapeable without anti-bot stealth, but
      the browser path is ~50× more expensive than the API per article — DOM
      walk for canonical URL / h1 / first <p> / infobox <table> / category
      footer, plus `browse eval 'RLCONF.wgArticleId + ":" +
      RLCONF.wgRevisionId'` to recover pageid+revid.
verified: false
proxies: false
---
# Wikipedia Get Article

## Purpose

Given a Wikipedia article reference (full URL like `https://en.wikipedia.org/wiki/Albert_Einstein`, a `lang + title` pair like `de:Albert Einstein`, or a free-form title needing resolution), return the article's structured content: canonical URL, page title, language, summary/lead paragraph, full section tree (heading text + level + body text), infobox key/value pairs, first-paragraph thumbnail image URL, list of all images referenced, list of outbound (intrawiki) article links, list of external links (with section attribution), categories, last-revised timestamp, and the underlying `pageid` + `revid`. **Read-only** — never click Edit/Watch/Talk or any mutation control; the API path has no surface for mutation in the first place.

## When to Use

- Any RAG / agent flow that needs Wikipedia article text *with structure* (lead vs. body, section headings, infobox fields broken out as key/value).
- Bulk metadata extraction across many articles — pageid, revid, last-modified timestamp, categories, image manifest.
- Disambiguation-aware lookups — caller wants "Mercury" surfaced as `{kind: disambiguation, candidates: [...]}` rather than silently landing on the planet.
- Cross-language article comparison — pull `de.wikipedia.org/wiki/Albert_Einstein` and `en.wikipedia.org/wiki/Albert_Einstein` in parallel.
- Anywhere you'd otherwise scrape a Wikipedia article HTML page. The API is faster, returns clean JSON, resolves redirects automatically, and is officially supported.

## Workflow

The Wikipedia (MediaWiki) public API is the right answer. Two complementary surfaces are used together:

- **REST v1** (`/api/rest_v1/page/...`) — opinionated, clean JSON for the most common views (summary, media list). One round-trip per page. Resolves redirects.
- **Action API** (`/w/api.php?action=query|parse|opensearch`) — the full MediaWiki feature set. Lets you combine `info`, `extracts`, `pageimages`, `revisions`, `categories`, `images`, `extlinks`, `links`, `pageprops` in one HTTP round-trip per page.

**No auth, no cookies, no anti-bot stealth, no residential proxy.** All HTTP GET. The only WMF policy requirement is a meaningful `User-Agent` (see gotcha below). Browser scripting is strictly a fallback for the (extremely rare) case where the API is unreachable for a given language wiki — every active Wikimedia language edition exposes the same API at the same paths.

### 1. Resolve the input reference

Three input shapes, normalize all of them to `(lang, title)`:

| Input shape | Normalize → |
|---|---|
| Full URL `https://en.wikipedia.org/wiki/Albert_Einstein` | `lang=en`, `title=Albert_Einstein` (URL-decoded; preserve underscores) |
| `de:Marie Curie` or "Marie Curie, German Wikipedia" | `lang=de`, `title=Marie Curie` |
| Free-form ("Einstein", "the physicist who wrote E=mc^2") | call **opensearch** (step 1a) on `en.wikipedia.org`, take top hit, surface remaining hits as `alternates` |

#### 1a. Free-form resolution

```
GET https://{lang}.wikipedia.org/w/api.php?action=opensearch&format=json&search={q}&limit=5&namespace=0
```

Returns a 4-tuple array: `[query, titles[], descriptions[], urls[]]`. Take `titles[0]` and `urls[0]`. If the user prompt is ambiguous, surface `titles[1..n]` as `alternates`.

For richer ranking (handles "the physicist who wrote E=mc^2" style queries), prefer:

```
GET https://{lang}.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch={q}&srlimit=5
```

Returns `query.search[].title, pageid, wordcount, snippet`.

### 2. Single-call article fetch (Action API — preferred)

One HTTP GET returns ~95% of what the prompt asks for:

```
GET https://{lang}.wikipedia.org/w/api.php
    ?action=query
    &format=json
    &titles={Title}
    &redirects=1                            # auto-resolve redirects, surface mapping in query.redirects
    &prop=info|pageprops|extracts|pageimages|revisions|categories|images|extlinks|links
    &inprop=url|displaytitle                # canonicalurl, fullurl, displaytitle
    &exintro=1&explaintext=1                # lead paragraph as plain text (no wiki markup)
    &piprop=thumbnail|original|name         # thumbnail (250×) + original image
    &pithumbsize=500
    &rvprop=ids|timestamp                   # revid + parentid + last-edit timestamp
    &cllimit=max&imlimit=max&ellimit=max&pllimit=max
```

Response shape (single page, abridged):

```jsonc
{
  "query": {
    "redirects": [{"from": "NYC", "to": "New York City"}],   // present iff input was a redirect
    "normalized": [{"from": "albert einstein", "to": "Albert einstein"}],  // case fix (see gotcha)
    "pages": {
      "736": {                                                // <-- numeric key IS the pageid
        "pageid": 736,
        "title": "Albert Einstein",
        "canonicalurl": "https://en.wikipedia.org/wiki/Albert_Einstein",
        "fullurl": "https://en.wikipedia.org/wiki/Albert_Einstein",
        "displaytitle": "Albert Einstein",
        "pagelanguage": "en",
        "pagelanguagehtmlcode": "en",
        "pagelanguagedir": "ltr",
        "lastrevid": 1354874994,                              // <-- revid
        "touched": "2026-05-18T18:42:15Z",                    // most-recent touch (cache invalidation)
        "pageprops": {
          "wikibase_item": "Q937",                            // Wikidata QID
          "wikibase-shortdesc": "German-born theoretical physicist (1879–1955)",
          "page_image_free": "Albert_Einstein_Head_cleaned.jpg",
          "defaultsort": "Einstein, Albert"
          // "disambiguation": ""                             // <-- present iff this is a disambig page
        },
        "thumbnail": {"source": "https://upload.wikimedia.org/.../500px-Albert_Einstein_Head_cleaned.jpg", "width": 500, "height": 619},
        "original":  {"source": "https://upload.wikimedia.org/.../Albert_Einstein_Head_cleaned.jpg", "width": 4530, "height": 5607},
        "pageimage": "Albert_Einstein_Head_cleaned.jpg",
        "extract": "Albert Einstein (14 March 1879 – 18 April 1955) was …",  // lead paragraph (plain text)
        "revisions": [{"revid": 1354874994, "parentid": 1354568651, "timestamp": "2026-05-18T18:42:15Z"}],
        "categories": [{"ns": 14, "title": "Category:1879 births"}, ...],
        "images":     [{"ns": 6, "title": "File:03 ALBERT EINSTEIN.ogg"}, ...],   // filenames only
        "extlinks":   [{"*": "https://doi.org/10.1098%2Frsbm.1955.0005"}, ...],
        "links":      [{"ns": 0, "title": "1901 Nobel Prize in Physics"}, ...]
      }
    }
  }
}
```

Pull each piece you need from this single response. If the response includes `query.continue` (the API paginated some `prop`), follow it with `&continue=...` until empty — `links`, `extlinks`, `images`, `categories` are the four that can paginate on long articles.

### 3. Detect disambiguation BEFORE returning a result

Check `query.pages[*].pageprops.disambiguation`. If the property is present (its value is the empty string `""` — presence-as-flag, MediaWiki convention), the page is a disambiguation list, NOT a content article. Surface as:

```json
{
  "kind": "disambiguation",
  "title": "Mercury",
  "canonical_url": "https://en.wikipedia.org/wiki/Mercury",
  "candidates": [
    /* dereferenced from query.pages.*.links — each link from the disambig page is a candidate */
    {"title": "Mercury (planet)", "url": "https://en.wikipedia.org/wiki/Mercury_(planet)"},
    {"title": "Mercury (element)", "url": "https://en.wikipedia.org/wiki/Mercury_(element)"}
  ]
}
```

**Do not silently pick a candidate.** The disambig page's own `prop=links` (or `prop=extracts` lead-text) is the candidate list. Return all of them.

### 4. Section tree (heading + level + body)

The Action API parse endpoint gives heading metadata; the Action API extracts endpoint gives plain-text body with section markers. Combine them.

#### 4a. Section TOC (headings, levels, anchors)

```
GET https://{lang}.wikipedia.org/w/api.php
    ?action=parse&page={Title}&format=json&redirects=1
    &prop=sections
```

Returns `parse.sections[]`, each entry:

```json
{"toclevel": 1, "level": "2", "line": "Life and career", "number": "1",
 "index": "1", "fromtitle": "Albert_Einstein", "byteoffset": 10724,
 "anchor": "Life_and_career", "linkAnchor": "Life_and_career"}
```

- `toclevel` is the TOC depth (1 = top-level section, 2 = subsection, …).
- `level` is the HTML heading level as a string ("2" → `<h2>`, "3" → `<h3>`).
- `line` is the human heading text.
- `anchor` is the URL fragment (use for deep-linking: `…/wiki/Albert_Einstein#Life_and_career`).

#### 4b. Section bodies (plain text)

```
GET https://{lang}.wikipedia.org/w/api.php
    ?action=query&format=json&titles={Title}&redirects=1
    &prop=extracts&explaintext=1&exsectionformat=wiki
```

Returns `query.pages.*.extract` — the full article as plain text with `== Heading ==`, `=== Subheading ===`, `==== Sub-subheading ====` markers preserved (number of `=` matches the heading level). Split on `^(=+)\s*(.+?)\s*\1$` to get `(level, heading, body)` triples and merge with the TOC from 4a by matching `heading` to `section.line`.

**Alternative for HTML bodies:** `action=parse&page={Title}&prop=text&redirects=1` returns the full rendered HTML (~60 KB on a medium article, ~300 KB on a long one). Split on `<div class="mw-heading mw-heading2"><h2 id="...">` etc. The HTML route is preferred when downstream consumers need the *rendered* content (footnote markers, math, formatting); the plain-text route is preferred for LLM context windows. **`browse cloud fetch` caps response bodies at 1 MB** — for huge articles fetched via the rendered-HTML endpoint, use plain-text extracts (section-formatted) or fall through to a browser session.

### 5. Infobox key/value extraction

The Action API doesn't expose a structured "infobox" prop. Two approaches:

**Preferred (wikitext):** Fetch the page's lead-section wikitext, slice the first balanced `{{Infobox …}}` template, and parse `| key = value` pairs.

```
GET https://{lang}.wikipedia.org/w/api.php
    ?action=parse&page={Title}&format=json&redirects=1
    &prop=wikitext&section=0
```

Returns `parse.wikitext.*` — only the lead-section wikitext (typically 5–15 KB). Slice with a balanced-brace walker (start at `{{Infobox`, count `{{` and `}}`, stop at depth 0), then key/value-regex:

```python
pairs = re.findall(
    r'\n\|\s*([\w_\-]+)\s*=\s*((?:[^\n|}]|\|[^\n|]|\n[^|])*?)(?=\n\||\n\}\})',
    infobox_template,
)
# Strips wikilinks: re.sub(r'\[\[([^|\]]+\|)?([^\]]+)\]\]', r'\2', v)
```

Common keys: `birth_name`, `birth_date`, `birth_place`, `death_date`, `death_place`, `alma_mater`, `fields`, `known_for`, `awards`, `image`, `caption` (scientist infobox); other categories use different schemas.

**Fallback (HTML):** parse the full rendered HTML and grab the first `<table class="infobox …">`, walking `<tr>` rows. Less brittle to wikitext template variations but heavier to fetch.

**Be defensive:** templates can nest, `|` characters appear inside `[[…|…]]` wikilinks, and some infoboxes use `<br/>` for multi-value cells. Strip `[[link|text]] → text`, `[[link]] → link`, `<br/>` → `;`, and trim. If parsing fails, return `infobox: null` rather than partial junk.

### 6. External links with section attribution

`prop=extlinks` on the Action API query returns *all* external links flat (no section attribution). For per-section attribution, hit the parse API per section:

```
GET https://{lang}.wikipedia.org/w/api.php
    ?action=parse&page={Title}&format=json&redirects=1
    &section={N}&prop=externallinks
```

`{N}` is the section's `index` from step 4a. Returns `parse.externallinks[]` for that section only. **One HTTP round-trip per section** — only do this when the caller specifically needs section attribution; otherwise prefer the flat `prop=extlinks` from step 2 to save round-trips.

Note: `parse.externallinks` returns the section *and all its subsections* (the parse `section` param is "section N onward up to the next equal-or-higher heading"), not just the section's own paragraphs. For strict per-section attribution, intersect against the next-section's links and subtract.

### 7. Full image list with URLs (not just filenames)

`prop=images` from step 2 returns filenames only (`File:Foo.jpg`). To get the actual upload URLs (with size variants and section attribution for the lead image):

```
GET https://{lang}.wikipedia.org/api/rest_v1/page/media-list/{Title}
```

Returns:

```json
{
  "revision": "1354568651",
  "items": [
    {
      "title": "File:Albert_Einstein_Head_cleaned.jpg",
      "leadImage": true,           // <-- the article's thumbnail/hero image
      "section_id": 0,             // 0 = lead, 1+ matches parse.sections[].index
      "type": "image",             // also "audio", "video"
      "showInGallery": true,
      "srcset": [{"src": "//upload.wikimedia.org/.../500px-...jpg", "scale": "1x"}, ...]
    }
  ]
}
```

Use this when the consumer needs (a) actual image URLs not just filenames, (b) lead-vs-section attribution, (c) media type discrimination (audio/video files surface under the same `images` list in the Action API but `media-list` separates them via `type`).

### 8. Page-not-found handling

Two ways the page can not exist:

- **REST summary `/api/rest_v1/page/summary/{Title}`** returns `HTTP 404` with `{"status":404,"type":"Internal error"}`. Surface as `{kind: "not_found"}`.
- **Action API** returns a successful 200 with the page object keyed by a *negative* pageid (`-1`, `-2`, …) and a presence flag `"missing": ""`. Check `if "missing" in page` before consuming. The `canonicalurl` is still synthesized (`/wiki/Nonexistent_Title`) but the page does not exist.

Prefer the Action API for not-found detection — REST 404s are harder to distinguish from transient infrastructure errors.

### 9. Non-English Wikipedia editions

Swap the subdomain and the entire stack works identically: `de.wikipedia.org`, `fr.wikipedia.org`, `ja.wikipedia.org`, `zh.wikipedia.org`, `simple.wikipedia.org`, etc. The `pageid` namespaces are *per-edition* — pageid 736 on `en` is Albert Einstein, on `de` it's a different article. Always carry the `lang` in your output keying.

### Browser fallback

Only needed if a language edition's API is unreachable from your network (none observed across `en`, `de`, `fr`, `ja` as of 2026-05). In that case:

1. Create a bare session (no stealth, no proxies — Wikipedia has no anti-bot).
2. `browse open https://{lang}.wikipedia.org/wiki/{URL-encoded-title}` and `browse get html body`.
3. Parse:
   - Canonical URL: the rendered `<link rel="canonical" href="...">` in `<head>`.
   - Title: `<h1 id="firstHeading">` text content.
   - Lead paragraph: first `<p>` inside `<div id="mw-content-text"><div class="mw-parser-output">`, skipping `<p class="mw-empty-elt">`.
   - Sections: `<div class="mw-heading mw-headingN"><hN id="...">` for N in 2..6.
   - Infobox: `<table class="infobox …">`, walk `<tr>` rows reading `<th>` (key) and `<td>` (value).
   - Categories: `<div id="mw-normal-catlinks"> <ul> <li> <a>` text.
   - Last revised: footer `<li id="footer-info-lastmod">` text.
   - pageid / revid: `<head>` contains `<meta name="ResourceLoaderDynamicStyles">` and the inline `RLCONF` object has `wgArticleId` and `wgRevisionId`. Easiest: `browse eval 'RLCONF.wgArticleId + ":" + RLCONF.wgRevisionId'`.

The browser path is ~50× more expensive than the API path (page render + DOM walk vs. one JSON fetch). It exists only for completeness.

## Site-Specific Gotchas

- **`/api/rest_v1/page/mobile-sections/` is DECOMMISSIONED.** Returns HTTP 403 with a body that says `Mobile Content Service is decommissioned. See https://phabricator.wikimedia.org/T328036`. Don't try to use it for section trees — it was the most convenient single-call section-tree endpoint, and it's gone. Use Action API `prop=extracts&exsectionformat=wiki` instead.
- **`/api/rest_v1/page/related/` is also blocked (HTTP 403).** Same decommission. The Action API has no direct equivalent; if you need related articles, use the `MorelikeThis` action or `cirrussearch` with the article title as input.
- **WMF requires a meaningful `User-Agent` header.** Per Wikimedia policy ([meta:User-Agent_policy](https://meta.wikimedia.org/wiki/User-Agent_policy)), every API request must identify the caller (tool name, version, and a contact URL or email). Generic `python-requests/2.x` is grounds for being rate-limited or blocked. Send something like `MyAgent/1.0 (https://example.com/contact)`. The `browse cloud fetch` CLI handles this transparently; if you switch to raw `curl` or `node fetch`, set `--user-agent` / `headers: {'User-Agent': '…'}` explicitly.
- **Title normalization is first-letter only, not Title-Cased.** `albert einstein` → `Albert einstein`, NOT `Albert Einstein`. The redirect/wiki-link layer rescues you (`Albert einstein` redirects to `Albert Einstein`), but if you cache by the normalized form you'll get cache misses. Always key by the post-redirect `title` field, not the input.
- **`pageprops.disambiguation` is a presence flag with empty-string value.** MediaWiki convention. `if (page.pageprops || {}).disambiguation !== undefined` — do NOT test for truthiness, the value is `""`.
- **`pageid` is per-language-edition.** Same article in different languages has different pageids. Always pair with `lang`.
- **Numeric `pages` keys in the Action API query response.** `query.pages` is an *object* keyed by stringified pageid (or `-1`, `-2`, … for missing pages), NOT an array. Iterate `Object.values(query.pages)` rather than indexing.
- **`continue` is the pagination signal, not page count.** Long articles paginate `prop=links` (default `pllimit=10`, max 500), `prop=extlinks` (`ellimit`), `prop=categories` (`cllimit`), and `prop=images` (`imlimit`). Set each `*limit=max` to minimize round-trips; if `query.continue` is present in the response, follow it.
- **`exintro=1` returns only the lead paragraph(s) before the first section heading.** For the full article plain text, drop `exintro`. For section-formatted output add `exsectionformat=wiki` (preserves `== Heading ==`) or `exsectionformat=plain` (strips section markers).
- **`prop=extracts` only returns ONE extract per request if `exintro` or `exlimit=1`.** When fetching extracts for multiple titles in one call (`titles=A|B|C`), set `exlimit=20` (max 20 for full extracts, or unlimited for intro-only).
- **Action API `section=N` parameter is "section N to next equal-or-higher heading" inclusive of subsections.** Not "just section N's own paragraphs". For strict per-section content, walk the byteoffsets from `prop=sections` and slice the wikitext yourself.
- **`browse cloud fetch` caps response bodies at 1 MB.** `/api/rest_v1/page/html/{Title}` exceeds this on long articles (Einstein's full rendered HTML is ~3 MB). Prefer plain-text extracts via Action API, or split into per-section requests, or fall through to a browser session for huge articles.
- **Thumbnails are sized per `pithumbsize` request param.** Default is small (~80 px). Pass `pithumbsize=500` (or larger) to get a useful preview image. `original` (in `piprop=original`) is always the full-resolution source.
- **Lead images may be SVG (rendered to PNG/JPEG on the fly via `/thumb/`).** The `originalimage.source` URL for SVGs ends in `.svg`; if you need a rasterized version, request the `thumbnail` URL which Wikipedia renders to PNG.
- **`extlinks` includes some intra-Wikimedia links** (commons.wikimedia.org, wikidata.org, en.wiktionary.org). Filter by hostname if you want only "true external" non-Wikimedia citations.
- **The disambiguation page's `prop=links` includes navigation/template links, not just candidate articles.** Many disambiguation pages embed `{{disambiguation}}` and `{{Wikipedia disambiguation}}` templates whose links appear in `prop=links`. Filter to `ns: 0` (main namespace) and dedupe; for higher signal, parse the rendered HTML body and extract anchors only from `<ul>` lists inside `<div class="mw-parser-output">`.
- **Rate limits are generous but not unlimited.** WMF documents 200 req/sec sustained per IP for the action API, with read-only requests bypassing some limits. Burst-tolerate. If you ever see HTTP 429 or a `Retry-After` header, back off.
- **No `OPTIONS` / preflight needed.** Action API and REST v1 are GET-only for read operations with permissive CORS — you can call from a browser-context fetch as well as server-side.

## Expected Output

```json
{
  "kind": "article",
  "lang": "en",
  "pageid": 736,
  "revid": 1354874994,
  "title": "Albert Einstein",
  "displaytitle": "Albert Einstein",
  "canonical_url": "https://en.wikipedia.org/wiki/Albert_Einstein",
  "wikibase_item": "Q937",
  "short_description": "German-born theoretical physicist (1879–1955)",
  "last_revised": "2026-05-18T18:42:15Z",
  "summary": "Albert Einstein (14 March 1879 – 18 April 1955) was a German-born theoretical physicist best known for developing the theory of relativity. …",
  "thumbnail": {
    "source": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Albert_Einstein_Head_cleaned.jpg/500px-Albert_Einstein_Head_cleaned.jpg",
    "width": 500,
    "height": 619
  },
  "original_image": {
    "source": "https://upload.wikimedia.org/wikipedia/commons/2/28/Albert_Einstein_Head_cleaned.jpg",
    "width": 4530,
    "height": 5607
  },
  "infobox": {
    "template": "Infobox scientist",
    "fields": {
      "birth_name": "Albert Einstein",
      "birth_date": "1879-03-14",
      "birth_place": "Ulm, Kingdom of Württemberg, German Empire",
      "death_date": "1955-04-18",
      "death_place": "Princeton, New Jersey, U.S.",
      "alma_mater": "ETH Zurich; University of Zurich",
      "fields": "Physics; Philosophy",
      "known_for": "General relativity; Special relativity; Photoelectric effect; …",
      "awards": "Nobel Prize in Physics (1921); …"
    }
  },
  "sections": [
    {"level": 2, "heading": "Life and career", "anchor": "Life_and_career", "body": "Einstein was born in Ulm…", "children": [
      {"level": 3, "heading": "Childhood, youth and education", "anchor": "Childhood,_youth_and_education", "body": "…"},
      {"level": 3, "heading": "Marriages, relationships and children", "anchor": "Marriages,_relationships_and_children", "body": "…"}
    ]},
    {"level": 2, "heading": "Scientific career", "anchor": "Scientific_career", "body": "…", "children": [/* … */]}
  ],
  "images": [
    {"title": "File:Albert_Einstein_Head_cleaned.jpg", "url": "https://upload.wikimedia.org/wikipedia/commons/2/28/Albert_Einstein_Head_cleaned.jpg", "section_id": 0, "lead_image": true, "type": "image"},
    {"title": "File:1919_eclipse_positive.jpg",       "url": "https://upload.wikimedia.org/wikipedia/commons/9/96/1919_eclipse_positive.jpg",       "section_id": 4, "lead_image": false, "type": "image"}
  ],
  "links": [
    {"title": "Photoelectric effect", "url": "https://en.wikipedia.org/wiki/Photoelectric_effect"},
    {"title": "General relativity",    "url": "https://en.wikipedia.org/wiki/General_relativity"}
  ],
  "external_links": [
    {"url": "https://doi.org/10.1098%2Frsbm.1955.0005", "section": "References"},
    {"url": "https://www.nobelprize.org/prizes/physics/1921/einstein/biographical/", "section": "External links"}
  ],
  "categories": [
    "Category:1879 births",
    "Category:1955 deaths",
    "Category:Nobel laureates in Physics"
  ]
}
```

### Disambiguation outcome shape

```json
{
  "kind": "disambiguation",
  "lang": "en",
  "pageid": 19007,
  "revid": 1341736936,
  "title": "Mercury",
  "canonical_url": "https://en.wikipedia.org/wiki/Mercury",
  "candidates": [
    {"title": "Mercury (planet)",  "url": "https://en.wikipedia.org/wiki/Mercury_(planet)"},
    {"title": "Mercury (element)", "url": "https://en.wikipedia.org/wiki/Mercury_(element)"},
    {"title": "Mercury (mythology)","url": "https://en.wikipedia.org/wiki/Mercury_(mythology)"}
  ]
}
```

### Redirect-resolved outcome shape

```json
{
  "kind": "article",
  "lang": "en",
  "pageid": 645042,
  "title": "New York City",
  "canonical_url": "https://en.wikipedia.org/wiki/New_York_City",
  "redirected_from": "NYC",
  "summary": "New York, often called New York City (NYC), is …",
  "...": "rest as above"
}
```

### Not-found outcome shape

```json
{
  "kind": "not_found",
  "lang": "en",
  "input_title": "Nonexistent Page Title xyz12345",
  "canonical_url_guess": "https://en.wikipedia.org/wiki/Nonexistent_Page_Title_xyz12345"
}
```

### Free-form-resolution outcome shape (input was a query, not a title)

```json
{
  "kind": "article",
  "lang": "en",
  "resolved_from_query": "the physicist who wrote E=mc^2",
  "alternates": [
    {"title": "Mass–energy equivalence", "url": "https://en.wikipedia.org/wiki/Mass%E2%80%93energy_equivalence"},
    {"title": "Theory of relativity",    "url": "https://en.wikipedia.org/wiki/Theory_of_relativity"}
  ],
  "...": "rest of article fields as above (for the top-ranked match)"
}
```
