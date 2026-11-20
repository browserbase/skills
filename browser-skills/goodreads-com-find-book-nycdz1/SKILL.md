---
name: goodreads-com-find-book-nycdz1
title: Goodreads Book & Author Lookup
description: >-
  Resolve a Goodreads URL, book ID, work ID, ISBN, ASIN, title, or author into a
  structured record with core metadata, ratings, shelf signals, awards, and top
  reviews.
website: goodreads.com
category: books
tags:
  - books
  - goodreads
  - ratings
  - reviews
  - isbn
  - metadata
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Direct `browse cloud fetch` against `/book/show/{id}`,
      `/author/show/{id}`, and `/work/editions/{workId}` returns fully-populated
      HTML (200 OK, no proxies needed) carrying both an `application/ld+json`
      Book block and a `__NEXT_DATA__` Apollo cache with Book + Work +
      Contributor + Reviews + Awards. This is the primary path for any
      URL/ID/ISBN/ASIN input.
  - method: api
    rationale: >-
      `/book/auto_complete?format=json&q=…` is a real JSON endpoint (not
      WAF-gated) that resolves titles, ISBNs (any format), ASINs, and author
      names to bookId/workId. Cheapest path to normalize free-form input before
      hitting the detail page.
  - method: browser
    rationale: >-
      Only required when the caller needs `/search?q=…` filter dimensions (which
      is AWS WAF-gated). Use a Verified Browserbase session with `--verified
      --proxies`. For the vast majority of 'find a book' inputs, the
      static-fetch + autocomplete path is sufficient and avoids the WAF
      entirely.
verified: false
proxies: false
---
# Goodreads Book & Author Lookup

## Purpose

Resolve a book reference (URL, Goodreads book ID, work ID, ISBN-10/13, ASIN, title, title + author, or "books by Author") to a structured Goodreads record. Returns core metadata (title, authors, series, publisher, ISBN/ASIN, page count, format, language, publication date), ratings (average, total, 1–5 star distribution), shelf signals (top genre/shelf tags, "Want to Read" count when surfaced), full description, top reviews, awards, edition links, and the canonical Goodreads URL. Author lookups additionally return name, profile URL, bio, photo, average rating across works, total works, and birth/death dates when present. **Read-only — never click Want to Read, Add to Shelf, Rate, Write a Review, or Sign In.**

## When to Use

- A user pastes a Goodreads URL, ISBN, ASIN, or book title and wants the structured record.
- A reading-list / library-import agent needs to enrich a list of titles or ISBNs.
- A recommendation agent needs ratings + shelf tags + genre signals for a known title.
- A "books by {Author}" listing for an author's full bibliography (works listing).
- Any flow that previously would have called Goodreads' retired public API (sunset Dec 2020).

## Workflow

The optimal path is **static-HTML scraping via Browserbase Fetch API** — Goodreads renders nearly all of the data you need into either an `application/ld+json` `Book` block or the `__NEXT_DATA__` Apollo cache embedded in `/book/show/{id}` pages. **No JS execution, no CDP browser session, and (for `/book/show/`, `/author/show/`, `/work/editions/`) not even residential proxies are required.** A bare `browse cloud fetch` against the canonical ID URL returns 200 OK with 700KB–1MB of fully-populated HTML.

Lead with the static-fetch path. Only reach for a Verified Browserbase session (`--verified --proxies`) if you need filter dimensions that exist only on `/search?q=…` — and even then, prefer the autocomplete fallback below before paying the session cost.

### 1. Normalize the input to a Goodreads book ID

| Input shape | Resolution |
|---|---|
| Full URL `/book/show/{id}-{slug}` | Strip query string; the ID is in the path. |
| Bare book ID (e.g. `54493401`) | Use `https://www.goodreads.com/book/show/{id}` — Goodreads 301s to the canonical slug. |
| Work ID | Hit `https://www.goodreads.com/work/{workId}` — 301s to the work's "best edition" `/book/show/{bookId}` page. |
| ISBN-10, ISBN-13 (hyphens OK), ASIN | `GET /book/auto_complete?format=json&q={isbn-or-asin}` — JSON array, take `result[0].bookId`. |
| Free-form title or "title, author" | `GET /book/auto_complete?format=json&q={url-encoded-query}` — JSON array, ranked by relevance, take `result[0]` (and consider returning the top-N as candidates when the caller's intent is ambiguous). |
| "books by {Author}" | First resolve any book by the author via `/book/auto_complete?…&q={author}`, then read `result[0].author.id`. Fetch `/author/list/{authorId}` for the works listing, or `/author/show/{authorId}` for author metadata + the first page of their books. |

**Endpoint detail — `/book/auto_complete`:**
- URL: `https://www.goodreads.com/book/auto_complete?format=json&q={URL-encoded-query}`
- Returns `[]` of up to ~5 ranked items. Per item: `bookId`, `workId`, `bookUrl`, `title`, `bookTitleBare`, `imageUrl` (small `_SY75_` thumb), `numPages`, `avgRating` (string), `ratingsCount` (int), `author` (`{ id, name, isGoodreadsAuthor, profileUrl, worksListUrl }`), and `description` (`{ html, truncated, fullContentUrl }`).
- **Not WAF-gated** — bare `browse cloud fetch` (no `--proxies`) returns 200 OK every time observed.
- Use this even when the input is an ISBN/ASIN — it's the cheapest and most flexible resolver. `/book/isbn/{isbn}` and `/book/asin/{asin}` legacy redirects also exist but are less reliable.

### 2. Fetch the canonical book page

```bash
browse cloud fetch "https://www.goodreads.com/book/show/{bookId}" --allow-redirects --output book.html
```

Status: **200 OK · 700KB–1MB HTML · no `--proxies` needed.** Extract two JSON blocks:

**a. `<script type="application/ld+json">` — schema.org `Book`:**
- `name`, `bookFormat`, `numberOfPages`, `inLanguage`, `isbn` (ISBN-13 with no hyphens), `image` (full cover URL), `awards` (comma-joined string), `author[]` (`{ @type: Person, name, url }`), `aggregateRating` (`{ ratingValue, ratingCount, reviewCount }`).
- One block per page. Quick path for the "headline" record.

**b. `<script id="__NEXT_DATA__" type="application/json">` — Apollo cache:**
- Lives under `props.pageProps.apolloState`. Keys are `Book:kca://…`, `Work:kca://…`, `Contributor:kca://…`, `Series:kca://…`, `Review:kca://…`, `User:{id}`.
- **`Book:` entry** (one per page): `legacyId` (the numeric ID), `webUrl`, `title`, `titleComplete` (e.g. `"A Game of Thrones (A Song of Ice and Fire, #1)"`), `description` (HTML) and `description({"stripped":true})` (plaintext), `imageUrl`, `primaryContributorEdge` + `secondaryContributorEdges`, `bookGenres[]` (top-voted shelves, ~5–8), `bookSeries[]` (each `{ userPosition, series: { __ref } }`), `details` (`{ asin, format, numPages, publicationTime (ms epoch), publisher, isbn, isbn13, language: { name } }`), `links.primaryAffiliateLink`, `work: { __ref }`.
- **`Work:` entry**: `legacyId` (the work ID — separate from book ID), `details.webUrl`, `details.shelvesUrl`, `details.originalTitle`, `details.publicationTime` (ms epoch — original publication, may differ from this edition), `details.awardsWon[]` (each `{ name, webUrl, awardedAt (ms epoch), category, designation: "WINNER"|"NOMINEE" }`), `choiceAwards[]` (Goodreads Choice Awards), `editions: { webUrl }` (link to `/work/editions/{workId}`), `stats` (`{ averageRating, ratingsCount, ratingsCountDist: [1★, 2★, 3★, 4★, 5★], textReviewsCount, textReviewsLanguageCounts[] }`).
- **`Contributor:` entries**: dereference via `primaryContributorEdge.node.__ref`. Fields: `legacyId`, `name`, `description` (bio), `isGrAuthor`, `works.totalCount`, `profileImageUrl`, `webUrl`, `followers.totalCount`.
- **`Series:` entries**: dereference via `bookSeries[].series.__ref`. Fields: `id`, `title`, `webUrl`.
- **`Review:` entries**: ~25 reviews. Per-review: `id`, `creator: { __ref }` (dereference to `User:{id}` for `name` + `webUrl`), `text` (HTML, can include embedded `<img>` and `<blockquote>`), `createdAt` (ms epoch), `updatedAt`, `spoilerStatus`. The rating + helpful-count fields are NOT in the apolloState — they require either a screenshot of the rendered card or a follow-up call to `/review/show/{reviewId}`.

**Mapping note — Apollo time fields are millisecond epochs.** Convert with `new Date(publicationTime).toISOString()` etc.

### 3. (Optional) Fetch additional edition / language / format data

If the caller filtered on `format`, `language`, or wants all edition cover URLs:

```bash
browse cloud fetch "https://www.goodreads.com/work/editions/{workId}" --output editions.html
```

Status: 200 OK · ~125KB · legacy HTML (no Apollo, no `ld+json`). One `.editionData` block per edition. Per-edition selectors:
- `a.bookTitle` → `"<Title> (<Format>)"` — strip the trailing `(Hardcover|Paperback|Kindle|Audiobook|ebook|Mass Market Paperback|...)` for the bare title and the format token.
- `div.dataRow` (1st) → `"Published <Date> by <Publisher>"`.
- `div.dataRow` (2nd) → `"<Edition descriptor>, <Format>, <NN> pages"`.
- `div.dataTitle` text `"ISBN:"` followed by `div.dataValue` → ISBN-13 with `(ISBN10: …)` suffix.
- `div.dataTitle` text `"ASIN:"` followed by `div.dataValue` → ASIN.
- `a[itemprop="url"]` under the author block → `/author/show/{authorId}` URL.

Editions pages typically list 30–200 editions. Paginate via the `&page=N` query param (default page size 30).

### 4. Author lookup

```bash
browse cloud fetch "https://www.goodreads.com/author/show/{authorId}" --output author.html
```

Status: 200 OK · ~170KB · **legacy HTML** (no `__NEXT_DATA__`, no `ld+json`). Schema.org microdata on the page; CSS-selector extraction:

- `h1.authorName > span[itemprop="name"]` → name.
- `img[itemprop="image"]@src` → photo URL.
- `span[itemprop="ratingValue"]` → average rating across all works (decimal).
- `span[itemprop="ratingCount"][content]` → total ratings count (numeric attribute, the visible text is comma-formatted).
- `span[itemprop="reviewCount"][content]` → total text-reviews count.
- `a[href*="/author/list/{authorId}"]` text — `"N distinct works"`.
- `span[id^="freeTextContainerauthor"]` inner text — full bio.
- `span[itemprop="birthDate"]` → birth date when surfaced (often absent for living authors who haven't disclosed; uses MMMM Do YYYY format).
- `span[itemprop="deathDate"]` → death date when applicable.
- Author book table — under `.tableList`, each row is one of the author's books (cover, title link, avg rating, ratings count, year). Useful when the caller asked "books by {Author}" and wants a quick listing without paginating `/author/list/`.

### 5. Search-results page (only when filter dimensions force it)

Goodreads' global search page at `/search?q=…` is **AWS WAF-gated** (returns a 202 challenge stub on every direct fetch — verified 2026-05-18). The challenge requires a real browser to execute `challenge.js` and exchange a cookie. **For 95%+ of "find a book" inputs, the static-fetch + autocomplete path covers the case fully — skip the search page.**

When you genuinely need the search page (e.g., the caller asked for `search_type=lists`, `search_type=groups`, or a faceted filter that autocomplete doesn't expose), use a Verified Browserbase session:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies | jq -r .id)
export BROWSE_SESSION=$SID
browse open --remote "https://www.goodreads.com/search?q={URL-encoded-query}&search_type={books|authors|lists|groups}"
browse wait load --remote
browse wait timeout 2000 --remote   # WAF cookie roundtrip
browse get html body --remote > results.html
browse cloud sessions update $SID --status REQUEST_RELEASE
```

Per-result selectors on the rendered `/search` page (verified via Goodreads HTML conventions; the `tableList` structure is the same as the author works listing):
- Each result is a `tr[itemtype="http://schema.org/Book"]` row inside `table.tableList`.
- `a.bookTitle` (link to `/book/show/{id}-{slug}`) — title + canonical ID.
- `a.authorName > span[itemprop="name"]` — author name.
- `span.greyText.smallText.uitext` — `"4.51 avg rating — 1,593,461 ratings — published 2021"` blob; parse with `/([\d.]+) avg rating — ([\d,]+) ratings — published (\d{4})/`.
- `img.bookCover@src` — cover thumb.

**Once you have the IDs from the search-results page, immediately hand off to step 2 (static fetch) for the full record — don't try to pull all per-book detail from the rendered search HTML; it's lossy.**

### 6. Filter / sort surface — what Goodreads actually exposes

The caller-facing filter wish list is broader than Goodreads' real search UI. Honest matrix:

| Filter dimension | Where it lives | How to honor it |
|---|---|---|
| `search_type` (Books / Authors / Lists / Groups) | `/search?q=…&search_type=…` URL param | Browser-Verified path (step 5). `Quotes` and `Genres` are NOT real `search_type` values — quotes are surfaced under `/quotes/search` and genres under `/genres/{slug}`. |
| Genre / shelf | `/genres/{slug}` listing pages and `/shelf/show/{slug}` | Static-fetch the listing; for finer scoping use `/genres/most_read/{slug}`. The genre taxonomy is exposed on every book's `bookGenres[]` — emit-side filter is often cheaper than server-side. |
| Publication year (exact or range) | NOT a `/search?q=` filter. | Emit-side filter on `Book.details.publicationTime` or `Work.details.publicationTime` from step 2. For "best books of {year}", use `/choiceawards/best-books-{year}`. |
| Format / edition (Hardcover/Paperback/Kindle/Audiobook/ebook/Mass Market) | `/work/editions/{workId}?per_page=100&filter_by_format=<format>` (verified; legacy query param). | Fetch editions page with the filter param OR emit-side filter on extracted editions. |
| Language | NOT a search-page filter; per-edition only. | Use `/work/editions/{workId}?filter_by_format=…` and inspect each `.editionData`, or read `inLanguage` / `details.language.name` per book. Goodreads also exposes `textReviewsLanguageCounts` on the work for review-language distribution. |
| Page count (min/max) | NO server filter. | Emit-side filter on `Book.details.numPages`. |
| Minimum average rating | NO server filter on `/search`. | Emit-side filter on `Work.stats.averageRating`. |
| Awards (Hugo / Nebula / Booker / Pulitzer / Newbery / …) | `/award/show/{awardId}-{award-slug}` listing pages. Per-book awards appear in `Work.details.awardsWon[]`. | Static-fetch `/award/show/` for the canonical winner list, or emit-side filter on per-book `awardsWon`. |
| Sort order (Relevance / Avg rating / Number of ratings / Published year / Title) | `/search?q=…&search_type=books&qid=…` does NOT expose sort. Sort lives on `/genres/most_read/{slug}` and `/list/show/{id}` (Listopia). | Server-sort via Listopia or genre pages; otherwise emit-side sort the autocomplete or aggregated results. |
| Pagination | `?page=N` on `/search`, `/author/list/{id}`, `/work/editions/{id}`, `/genres/{slug}`, `/list/show/{id}`. | Standard 1-indexed paging, ~20–30 results per page depending on the surface. |

**Implementation principle: resolve to IDs cheaply (autocomplete), fetch detail pages individually, and apply caller filters / sort in the agent layer.** This is faster, cheaper, and avoids the WAF entirely for the common cases.

## Site-Specific Gotchas

- **Goodreads' public API was retired December 2020.** Every endpoint matching `*.goodreads.com/.../oauth/*` and the old XML feeds (`/book/isbn/{isbn}.xml`, `/author/show.xml`) return 404 or HTML error pages. The site is scrape-only.
- **`/search?q=…` is AWS WAF-gated, but `/book/show/`, `/author/show/`, `/work/editions/`, and `/book/auto_complete` are NOT.** Confirmed 2026-05-18: bare `browse cloud fetch` on the search page returns a 202 challenge stub (~2KB containing `window.gokuProps` + a `challenge.js` script tag pointing at `awswaf.com`); the same fetch against `/book/show/54493401` returns 200 OK with a fully-populated 745KB page. **Always prefer the autocomplete-then-detail path over the search page.**
- **`--proxies` is NOT required for `/book/show/`, `/author/show/`, `/work/editions/`, or `/book/auto_complete`.** Bare cloud fetch from a datacenter IP returns 200 OK with no rate-limit on single-digit requests. Reserve `--proxies` for the rare Verified-session search path or if you hit a rate-limit on bulk fetches (no rate-limit observed in iter-1 testing, but Goodreads is owned by Amazon and the WAF tolerance is finite).
- **The autocomplete endpoint is the canonical resolver — use it instead of `/book/isbn/{isbn}` or `/book/asin/{asin}`.** `/book/auto_complete?format=json&q={query}` accepts plain titles, ISBN-10, ISBN-13 (with or without hyphens), ASINs, and author names. The legacy `/book/isbn/{isbn}` redirect still works but is less consistent for non-US editions.
- **Book ID ≠ work ID.** A book is a specific edition; a work is the abstract "title". `Book.legacyId` and `Work.legacyId` live in different namespaces and have different magnitudes (book IDs are typically in the tens of millions; work IDs vary). The work ID is what `/work/editions/{workId}` and `/work/{workId}` use. Always extract both; emit both.
- **Apollo time fields are millisecond epochs, not seconds.** `Book.details.publicationTime`, `Work.details.publicationTime`, `Review.createdAt`, `Award.awardedAt` — all in milliseconds. Convert with `new Date(ms).toISOString()`. Confusing this with seconds shifts dates by 50,000 years.
- **`titleComplete` vs `title`.** `Book.title` is the base title ("A Game of Thrones"); `Book.titleComplete` includes series info ("A Game of Thrones (A Song of Ice and Fire, #1)"). When series data is in `bookSeries[]`, prefer constructing the display string yourself from `Series.title` + `bookSeries[].userPosition` rather than parsing `titleComplete`.
- **`bookSeries[]` can have multiple entries.** Some books belong to both a main series and an omnibus/collected-works series (e.g., A Song of Ice and Fire + a meta-series). Emit all of them. Each entry's `userPosition` is a string ("1", "1-3", "0.5" for novellas, sometimes empty).
- **`Book.details.publicationTime` is the publication date of THIS EDITION; `Work.details.publicationTime` is the original publication.** They can differ by decades for classics. Emit both, and label them clearly to the caller.
- **`Work.stats.ratingsCountDist` is `[1★, 2★, 3★, 4★, 5★]`** — five integers, sum equals `ratingsCount` (within rounding). Star buckets are ascending. Easy to mis-emit as descending.
- **`Work.details.awardsWon[]` is for non-Choice-Awards (Hugo, Nebula, Booker, Pulitzer, Newbery, etc.). `Work.choiceAwards[]` is for Goodreads Choice Awards specifically.** They're separate arrays. Merge them when emitting a flat awards list. The `application/ld+json` `awards` string is a comma-joined human-readable summary that includes both — useful as a sanity check.
- **`ld+json.aggregateRating.ratingCount` may lag `Work.stats.ratingsCount` by a few thousand.** Both update on different cycles; `Work.stats.ratingsCount` from `__NEXT_DATA__` is the more current value. (Observed: `ld+json` `1,593,480` vs `apolloState` `1,593,461` on the same page snapshot — the count moves while the page is being served.)
- **Reviews in `__NEXT_DATA__` are missing the per-review rating + helpful count.** The apolloState `Review` entries have text + creator ref + timestamps but NOT the 1–5 star value or the helpful-vote count. The visible card on the page renders those from a separate `getReviews` query. For full review records (including rating + helpful), fetch `/review/show/{reviewId}` individually, or render the page with a Verified session and screenshot the review cards.
- **Author pages use legacy HTML, not Apollo.** `/author/show/{authorId}` predates the Next.js migration. Plan for two parser paths: Apollo for `/book/show/` and `/work/editions/`-ish pages, schema.org-microdata + CSS selectors for `/author/show/` and `/work/editions/` legacy pages.
- **Author birth/death dates are frequently absent.** Living authors who haven't disclosed have no `itemprop="birthDate"` element. Treat as optional, emit `null`.
- **`work/editions/{workId}` may surface 30 editions per page; use `?per_page=100` for a single fetch.** Goodreads allows up to 100 per page; with 200+ editions you still need pagination.
- **Goodreads' bare-ID URLs (`/book/show/{id}` without a slug) work via 301 redirect.** Convenient for caller-supplied IDs where the slug isn't known. The Apollo response on the redirected page is identical to the canonical URL.
- **Wrong slug in the URL still resolves correctly.** Observed: `/book/show/13497.A_Clash_of_Kings` resolves to book ID 13497 which is actually *A Feast for Crows*. Goodreads doesn't validate the slug against the ID — it uses the numeric prefix only. Always trust `Book.legacyId` from the response, not the slug in the URL.
- **`/quotes/search?q=…` is a separate surface from `/search?q=…&search_type=quotes`.** The latter is not a valid `search_type` value; use the direct quotes path. Same for groups (`/group/search?q=…`).
- **Verified-session screenshots: `wait timeout 2000` after `wait load` is mandatory** before the search-page results render. The WAF challenge transition (challenge → search results) doesn't complete on `load` alone.
- **Goodreads is owned by Amazon — anti-bot escalates if you hammer it.** Single-digit fetches/minute are fine bare. For bulk imports (>50 books), spread fetches at ≥0.5s intervals and add `--proxies` to rotate exit IPs. No formal rate-limit headers are returned, but sustained 5+ req/s from one IP starts returning challenge stubs on previously-unprotected endpoints.
- **`/book/show/{id}` HTML carries the cover image as an Amazon CDN URL** (`m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/{revision}i/{bookId}.jpg`). The same image is hot-linkable. Smaller variants exist as `_SY75_`, `_SX98_`, `_SY475_` suffixes on the autocomplete `imageUrl`.

## Expected Output

The skill emits one of three top-level shapes depending on input intent.

### A. Single book (URL / ID / ISBN / ASIN / single-best-match title)

```json
{
  "intent": "single_book",
  "book": {
    "id": "54493401",
    "work_id": "79106958",
    "url": "https://www.goodreads.com/book/show/54493401-project-hail-mary",
    "title": "Project Hail Mary",
    "title_complete": "Project Hail Mary",
    "series": [],
    "authors": [
      {
        "id": "6540057",
        "name": "Andy Weir",
        "url": "https://www.goodreads.com/author/show/6540057.Andy_Weir",
        "role": "Author"
      }
    ],
    "cover_image_url": "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1764703833i/54493401.jpg",
    "isbn10": "0593135202",
    "isbn13": "9780593135204",
    "asin": "0593135202",
    "publisher": "Ballantine Books",
    "published_date": "2021-05-04T07:00:00.000Z",
    "original_published_date": "2021-05-04T07:00:00.000Z",
    "format": "Hardcover",
    "language": "English",
    "num_pages": 476,
    "ratings": {
      "average": 4.51,
      "count": 1593480,
      "reviews_count": 225457,
      "distribution": { "1": 7381, "2": 23516, "3": 115977, "4": 447316, "5": 999290 }
    },
    "description": "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the earth itself will perish. …",
    "description_html": "<p>Ryland Grace is the sole survivor…</p>",
    "genres": [
      { "name": "Science Fiction", "url": "https://www.goodreads.com/genres/science-fiction" },
      { "name": "Fiction", "url": "https://www.goodreads.com/genres/fiction" },
      { "name": "Audiobook", "url": "https://www.goodreads.com/genres/audiobook" }
    ],
    "awards": [
      { "name": "Hugo Award", "category": "Best Novel", "year": 2022, "designation": "NOMINEE", "url": "https://www.goodreads.com/award/show/9-hugo-award" },
      { "name": "Audie Award", "category": "Best Audiobook and Science Fiction", "year": 2022, "designation": "WINNER", "url": "https://www.goodreads.com/award/show/3572-audie-award" },
      { "name": "Goodreads Choice Award", "category": "Readers' Favorite Science Fiction", "year": 2021, "designation": "WINNER", "url": "https://www.goodreads.com/choiceawards/best-science-fiction-books-2021" }
    ],
    "editions_count": null,
    "editions_url": "https://www.goodreads.com/work/editions/79106958",
    "top_reviews": [
      {
        "id": "kca://review:goodreads/amzn1.gr.review:goodreads.v1.svjEy_sStAh8OoUteh5V-A",
        "reviewer": { "name": "Emily May", "url": "https://www.goodreads.com/user/show/3672777" },
        "rating": null,
        "date": "2021-05-11T03:08:19.667Z",
        "text_snippet": "2025: Four years later this book is just as good and just as much fun…",
        "helpful_count": null
      }
    ],
    "want_to_read_count": null
  }
}
```

### B. Search results (free-form query with multiple candidates)

```json
{
  "intent": "search",
  "query": "the martian weir",
  "total_results": 5,
  "results": [
    {
      "id": "18007564",
      "work_id": "21825181",
      "url": "https://www.goodreads.com/book/show/18007564-the-martian",
      "title": "The Martian",
      "authors": [{ "id": "6540057", "name": "Andy Weir", "url": "https://www.goodreads.com/author/show/6540057.Andy_Weir" }],
      "cover_image_url": "https://...books/1413706054i/18007564.jpg",
      "num_pages": 369,
      "average_rating": 4.42,
      "ratings_count": 1332920
    }
  ]
}
```

### C. Author listing ("books by {Author}" or author show page)

```json
{
  "intent": "author",
  "author": {
    "id": "6540057",
    "name": "Andy Weir",
    "url": "https://www.goodreads.com/author/show/6540057.Andy_Weir",
    "photo_url": "https://images.gr-assets.com/authors/1382592903p5/6540057.jpg",
    "bio": "ANDY WEIR built a career as a software engineer until the success of his first published novel, THE MARTIAN, allowed him to live out his dream of writing fulltime. …",
    "average_rating_across_works": 4.37,
    "total_ratings": 3381546,
    "total_reviews": 374575,
    "total_works": 55,
    "followers": 71958,
    "birth_date": null,
    "death_date": null,
    "is_goodreads_author": true
  },
  "books": [
    { "id": "54493401", "title": "Project Hail Mary", "average_rating": 4.51, "ratings_count": 1593480, "url": "https://www.goodreads.com/book/show/54493401-project-hail-mary" },
    { "id": "18007564", "title": "The Martian", "average_rating": 4.42, "ratings_count": 1332920, "url": "https://www.goodreads.com/book/show/18007564-the-martian" }
  ]
}
```

### D. Not found

```json
{ "intent": "not_found", "query": "asdfqwerzxcv", "reason": "no_autocomplete_results" }
```

When emitting, prefer ISO-8601 strings for dates, decimals for ratings (not strings), and integers (not strings) for counts. Drop fields whose source is genuinely absent rather than emitting empty strings.
