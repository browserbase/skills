---
name: prazocerto-me-pzct-blog-i8yyot
title: Prazo Certo — Check for a New Blog Post
description: >-
  Checks whether Mário's site Prazo Certo (prazocerto.me) has a new/recent blog
  post and returns the newest post's title, publish date, author, and URL — via
  the open WordPress REST API.
website: prazocerto.me
category: content-monitoring
tags:
  - blog
  - wordpress
  - rest-api
  - content-monitoring
  - prazo-certo
source: 'browserbase: agent-runtime 2026-08-01'
updated: '2026-08-01'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      Plain HTTPS GET of the blog HTML also works, but you'd have to scrape the
      newest-post card; the JSON API is cleaner and already newest-first.
  - method: browser
    rationale: >-
      Rendering /blog/ works but needs Cloudflare stealth (verified + proxies)
      and a cookie-consent dismiss; only useful as a fallback if the REST API is
      ever locked down.
verified: true
proxies: true
---
# Prazo Certo — Check for a New Blog Post

## Purpose
Answers the question *"Tem um blogpost novo no site do Mário?"* — is there a new blog post on Prazo Certo (`prazocerto.me`), Mário Lúcio's site? This is a **read-only** skill that returns the newest post's title, publish date, author, and URL, plus a simple `has_new_post` recency judgement. The fast, reliable path is the site's **open WordPress REST API**, which returns posts already sorted newest-first as JSON — no scraping, no browser, no anti-bot friction.

## When to Use
- A user asks whether Mário / Prazo Certo published anything new, or wants "the latest post."
- You need the newest post's title / date / link to summarize, share, or monitor.
- You want to poll for new content on a schedule (compare the newest `id` or `date` against a stored value).
- You need the last N posts (change `per_page`), not just the single newest one.

## Workflow

The recommended method is the WordPress REST API. `prazocerto.me` is a WordPress site (LiteSpeed + Cloudflare) that exposes the standard `wp-json` API publicly, discoverable via the `Link: <https://prazocerto.me/wp-json/>; rel="https://api.w.org/"` header on any page.

1. **GET the newest post(s) as JSON.** Request only the fields you need with `_fields`:
   ```
   GET https://prazocerto.me/wp-json/wp/v2/posts?per_page=1&orderby=date&_fields=id,date,modified,slug,link,title
   ```
   - The response is a JSON array **already sorted newest-first** (`orderby=date` is the default; kept explicit for clarity). Element `[0]` is the newest post.
   - Increase `per_page` (max 100) to pull a list; the `X-WP-Total` / `X-WP-TotalPages` response headers tell you the full post count (~31 posts / 11 pages of 3 at time of authoring).
   - This endpoint returns **HTTP 200 from datacenter IPs** — it does **not** require residential proxies or stealth. (`browse cloud fetch <url>` works with or without `--proxies`.)
2. **Read the fields** from element `[0]`:
   - `title.rendered` → post title (HTML-entity encoded; decode if displaying).
   - `date` → publish datetime, site-local (`America/Sao_Paulo`), e.g. `2026-07-25T21:17:27`. Take the date part for `published_date`.
   - `link` → canonical post URL (note: posts live at the site root, e.g. `/projetos-praticos/`, **not** under `/blog/`).
   - `modified` → last-edited datetime (useful to distinguish "new post" from "edited old post").
3. **Judge recency.** Compute `days_since_published = today − date`. Treat `has_new_post: true` when the newest post is within ~30 days. (Adjust the window to the caller's definition of "new"; document the assumption.)
4. **Author.** All posts are authored by **Mário Lúcio** (the site owner). If you need it programmatically, add `author` to `_fields` and resolve via `/wp-json/wp/v2/users/<id>`, or read the `Por Mário Lúcio` byline on the post page.

Assumption made when the caller doesn't specify: *"new" = published within the last 30 days.* State this in your answer.

### Browser fallback
Only needed if the REST API is ever disabled. The rendered pages sit behind **Cloudflare**, so a plain headless hit may be challenged — use a stealth session (`--verified --proxies`).
1. `browse open https://prazocerto.me/blog/ --remote` (verified + proxies session).
2. `browse wait load`, then dismiss the **"Gerenciar Consentimento de Cookies"** modal (click **"Aceitar cookies"**) — it overlays content on first load.
3. The blog index lists posts newest-first; the first card's title + `DD/MM/YYYY` byline is the newest post. Open it for the full byline (`Mário Lúcio / 25/07/2026 / N comentários`).
4. Do **not** log in, comment, or submit the contact form. Read-only.

## Site-Specific Gotchas
- **Open WP REST API is the whole game.** `https://prazocerto.me/wp-json/wp/v2/posts` is public, unauthenticated, and returns clean JSON newest-first. Prefer it over scraping the HTML in every case.
- **Posts are NOT under `/blog/`.** The blog *index* is `/blog/` (paginated: `/blog/page/2/` …), but individual posts live at the site root, e.g. `https://prazocerto.me/projetos-praticos/`. Use the `link` field from the API rather than constructing URLs.
- **`orderby=date` ≠ `orderby=modified`.** Default ordering is by publish date. An old post that was recently edited will still sort as old — check `modified` if "recently touched" matters more than "newly published."
- **`title.rendered` is HTML-entity encoded** (e.g. `&#8211;`, accented chars as UTF-8). Decode before display.
- **Dates are site-local (America/São Paulo)** with no timezone suffix. Don't assume UTC when computing `days_since_published`.
- **Cloudflare only bites the rendered HTML, not the API.** The API returned 200 from a bare datacenter fetch across multiple runs. The `/blog/` and post *pages* are Cloudflare-fronted; drive them with `--verified --proxies` if you must, and expect a cookie-consent modal.
- **`robots.txt` explicitly welcomes AI crawlers** (GPTBot, ClaudeBot, PerplexityBot, etc. all `Allow: /`) and only blocks `/admin/`, `/wp-admin/`, `/private/`. Reading posts is fully sanctioned.
- **`sitemap.xml` lists only static pages** (`/sobre`, `/portfolio`, `/blog/`, `/contato/`, `/mentorias`, …) — **not** individual posts, and its `lastmod` values are stale (`2025-01-01`). Do **not** use the sitemap to find the newest post; use the API.
- **Recency window is a judgement call.** The API gives you facts (title/date); "new" is subjective. At time of authoring, the newest post was 2026-07-25 (7 days before the 2026-08-01 check) → considered new.

## Expected Output

New post found (recent) — the normal case:
```json
{
  "success": true,
  "has_new_post": true,
  "latest_post": {
    "title": "A teoria é incrível, mas aplique isso em projetos práticos",
    "author": "Mário Lúcio",
    "published_date": "2026-07-25",
    "modified_date": "2026-07-25",
    "url": "https://prazocerto.me/projetos-praticos/",
    "days_since_published": 7
  },
  "total_posts": 31,
  "checked_at": "2026-08-01",
  "error_reasoning": null
}
```

No *recent* post (newest exists but is older than the recency window):
```json
{
  "success": true,
  "has_new_post": false,
  "latest_post": {
    "title": "Nem todas as experiências são individuais",
    "author": "Mário Lúcio",
    "published_date": "2026-06-09",
    "url": "https://prazocerto.me/nem-todas-as-experiencias-sao-individuais/",
    "days_since_published": 53
  },
  "total_posts": 31,
  "checked_at": "2026-08-01",
  "error_reasoning": null
}
```

Failure (API unreachable and browser fallback blocked):
```json
{
  "success": false,
  "has_new_post": null,
  "latest_post": null,
  "checked_at": "2026-08-01",
  "error_reasoning": "wp-json returned 403 and /blog/ hit a Cloudflare challenge that did not resolve"
}
```
