---
name: vitrocad-ru-news-feed-02y0ef
title: VitroCAD News Feed
description: >-
  Extract the reverse-chronological news feed from vitrocad.ru — title, article
  URL, category, Russian date, status label, view count, and thumbnail for each
  item — via plain server-rendered HTML with pagination and URL dedup.
website: vitrocad.ru
category: content
tags:
  - news
  - feed
  - content
  - vitrocad
  - scraping
source: 'browserbase: agent-runtime 2026-07-02'
updated: '2026-07-02'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Works as a last resort if plain fetch is ever blocked (not observed), but
      is dramatically slower/costlier — an autobrowse run paginating with browse
      open + get text body exhausted 30 turns/~$6.69 without converging. Use
      browse get html body, not text body, and dedupe by URL.
verified: false
proxies: false
---
# VitroCAD News Feed

## Purpose

Extract the news feed from vitrocad.ru (the site of Russian BIM/CDE vendor «Витро Софт» / Vitro-CAD). Returns a reverse-chronological list of news items — each with title, canonical article URL, category, publication date (Russian long form), status label, view count, and thumbnail image. Read-only; never posts, comments, or authenticates.

## When to Use

- Monitoring VitroCAD company news, product releases, webinars, events, and expert articles.
- Building a change feed / digest of new posts (poll `/news` and diff by article URL).
- Filtering news by category (events, webinars, expert articles, releases, press).
- Bulk-harvesting the full news archive (currently ~163 items across 8 pages).

## Workflow

The news section is **plain server-rendered HTML** (Laravel + PHP 8.3, UIkit frontend). There is no JSON/API endpoint and no anti-bot — a bare HTTP GET returns the fully-populated markup (HTTP 200, no JS execution, no cookies, no proxy, no stealth required). **Prefer `browse cloud fetch` (or any plain HTTP GET) and parse the HTML.** Do NOT drive a headless browser to read this feed: an autobrowse run that paginated with `browse open` + `browse get text body` burned all 30 turns / ~$6.69 without converging, because per-page browser navigation is ~100× slower than a fetch and the flattened text body is hard to segment into structured cards.

1. **Fetch the listing page**:
   ```
   GET https://vitrocad.ru/news
   GET https://vitrocad.ru/news?page={N}    # N = 2..8 for older items
   ```
   No auth, no headers required. Each page returns ~27 cards (page 8 returns fewer).

2. **Parse each news card** from the HTML. Every card is anchored by:
   ```html
   <a class="uk-reset" href="{ARTICLE_URL}">
     <h2 class="uk-h4">{TITLE}</h2>
   </a>
   ...
   <span class="uk-date">{DATE}
     <span class="uk-label uk-label-success">{STATUS_LABEL}</span>
   </span>
   ...
   <span class="uk-icon" data-uk-icon="icon: eye; ratio: 1"></span> {VIEWS}
   ...
   <div class="uk-images ..." data-src="{IMAGE_URL}" data-uk-img>
   ```
   Extract per card:
   - **title** — text of `<h2 class="uk-h4">` inside the `a.uk-reset`.
   - **url** — the `href` (absolute, `https://vitrocad.ru/news/{category}/{slug}`).
   - **category** — the path segment after `/news/`: one of `events`, `webinars`, `expert`, `release`, `press`.
   - **date** — text in `<span class="uk-date">` before the nested `uk-label` (Russian long form, e.g. `19 июня 2026`).
   - **status_label** — nested `<span class="uk-label ...">` text when present (`Завершен`, `Видеозапись`, `Через 5 дней`, etc.); often absent for `events`/`expert`.
   - **views** — integer following the `icon: eye` span.
   - **image** — the `data-src` URL (`https://vitrocad.ru/storage/upload/news/....png|jpg`).

3. **Dedupe by URL.** A highlighted "upcoming/webinars" block (~5 cards) is rendered at the **top of every page** and also reappears inside the main feed — so raw card count over-reports. Collect into a `Set` keyed on the article URL. On page 1, 27 cards → 22 unique; on pages 2–7 the 5 highlighted cards repeat (22 new each); page 8 has 14 cards → 9 new.

4. **Paginate** until exhaustion. Increment `?page=N`. **Stop when a page yields zero article cards** (`?page=9` currently returns an empty feed) or when no new unique URLs are added. The visible pager only shows a sliding window (max link `8`), so don't trust it as the true last page — drive the loop off "no new items".

5. **(Optional) Category-scoped feed.** To fetch a single category directly, GET the category index instead of filtering client-side:
   ```
   https://vitrocad.ru/news/events
   https://vitrocad.ru/news/webinars
   https://vitrocad.ru/news/expert
   https://vitrocad.ru/news/release
   https://vitrocad.ru/news/press
   ```

6. **(Optional) Article detail enrichment.** GET an individual article URL and read `<h1>` (title) and `<span class="uk-date">` (date); body copy lives in the main content container. Note the caveats in Gotchas — there is no JSON-LD and `og:description` is a generic site-wide blurb, so don't use OG tags for per-article summaries.

### Browser fallback

Only if plain fetch is ever blocked (not observed): open a **bare** remote session (no `--verified`, no `--proxies`), `browse open https://vitrocad.ru/news?page=N`, then `browse get html body` (NOT `get text body` — you need the markup to segment cards) and apply the same regex extraction as step 2. Expect this to be dramatically slower and costlier than fetch; use it strictly as a last resort.

## Site-Specific Gotchas

- **No API, no JSON-LD.** The feed is HTML only; article pages carry no `application/ld+json`. Parse the UIkit markup directly.
- **`og:description` is site-wide boilerplate**, identical on every article (a generic Vitro-CAD platform pitch). It is NOT a per-article summary — never surface it as the article's description.
- **Top highlighted block repeats on every page AND inside the main feed.** Always dedupe by article URL, or you'll double-count the ~5 pinned webinar/upcoming cards on every page.
- **Pager is a sliding window.** The rendered pagination links max out at a small number (currently `8`) regardless of true page count; `?page={beyond-last}` returns HTTP 200 with an empty card list rather than a 404 or redirect. Detect the end by "no new cards", not by the pager UI.
- **Use `get html body`, not `get text body`, in the browser fallback.** The flattened text body collapses card boundaries and prefixes every page with the same nav chrome ("...лидер по количеству внедрений *по данным TAdviser..."), making structured extraction unreliable — this is exactly what stalled the browser-driven autobrowse run.
- **Dates are Russian long form** (`19 июня 2026`, `16 января 2026`). Month names are Russian genitive; normalize with a RU month map if you need ISO dates.
- **Status labels are event lifecycle, not categories.** `Завершен` (finished), `Видеозапись` (recording available), `Через N дней` (in N days) describe a webinar/event's state; the real taxonomy is the URL path segment.
- **Categories observed in the live feed:** `events` (~113), `webinars` (~37), `release` (~9), `expert` (~4). `press` exists as a nav/index route but had no items in the paginated feed at capture time.
- **No anti-bot / no auth.** Probe and live fetches returned HTTP 200 with no challenge. The site sets `XSRF-TOKEN` and `laravel_session` cookies, but they are not required for GET reads. Residential proxies and verified/stealth sessions are unnecessary — `verified: false`, `proxies: false`.
- **Content is Russian.** Titles, dates, and labels are Cyrillic (UTF-8); ensure your extractor preserves encoding.

## Expected Output

```json
{
  "success": true,
  "source": "https://vitrocad.ru/news",
  "pages_fetched": 8,
  "count": 163,
  "items": [
    {
      "title": "Витро Софт опубликовала открытую спецификацию «Среда общих данных. Обмен данными. Часть 1: Контейнеры»",
      "url": "https://vitrocad.ru/news/events/vitro-soft-opublikovala-otkrytuiu-specifikaciiu-sreda-obshhix-dannyx-obmen-dannymi-cast-1-konteinery",
      "category": "events",
      "date": "29 июня 2026",
      "status_label": null,
      "views": 210,
      "image": "https://vitrocad.ru/storage/upload/news/....png"
    },
    {
      "title": "Приглашаем на экспертную сессию: Среда Общих Данных без хаоса...",
      "url": "https://vitrocad.ru/news/webinars/priglasaem-na-ekspertnuiu-sessiiu-...",
      "category": "webinars",
      "date": "8 июля 2026",
      "status_label": "Через 5 дней",
      "views": 34,
      "image": "https://vitrocad.ru/storage/upload/news/....png"
    }
  ]
}
```

Empty / end-of-feed page shape (used to terminate pagination):

```json
{ "success": true, "count": 0, "items": [], "note": "page beyond last returns HTTP 200 with no cards" }
```
