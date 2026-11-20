---
name: github-com-trending-repos-search-gbjpu7
title: GitHub Trending Repositories Search
description: >-
  Return the current set of trending public repositories from
  github.com/trending — owner, repo, description, programming language, total
  stars, total forks, stars gained in the selected period, and top contributing
  developers — with optional filters for spoken language, programming language,
  and date range (daily/weekly/monthly).
website: github.com
category: developer-tools
tags:
  - github
  - trending
  - repos
  - discovery
  - open-source
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Fallback when direct HTTP egress to github.com is blocked. The page
      snapshots cleanly (~558 a11y refs for a 16-repo page) and works on a bare
      Browserbase session — no --verified, no --proxies. Slower (~30×
      wall-clock) and burns inner-agent turns for zero additional information
      vs. parsing the same HTML the fetch path returns.
  - method: api
    rationale: >-
      Not viable. GitHub has no official REST or GraphQL endpoint for Trending.
      /search/repositories with a star-sort + date-range filter does NOT
      reproduce the editorial signal that powers /trending — the result sets
      diverge significantly. The HTML page is canonical.
verified: false
proxies: false
---
# GitHub Trending Repositories Search

## Purpose

Return the current set of trending public repositories from [github.com/trending](https://github.com/trending), with optional filters for spoken language (e.g. Chinese), programming language (e.g. Python), and date range (`daily` / `weekly` / `monthly`). Each entry includes owner/repo name, description, programming language (+ language color), total stars, total forks, stars gained in the selected period, and the top contributing developers ("Built by"). Read-only — no auth, no cookies, no state mutation.

## When to Use

- Daily / weekly / monthly monitoring of what is currently trending on GitHub.
- Tracking trending repos within a specific programming language (e.g. "trending Rust this week").
- Tracking trending repos by **spoken language** (e.g. trending repos whose README is in Chinese, Japanese, Spanish — GitHub detects this from the README's natural-language content, not from anything the maintainer declares).
- Anywhere you'd want a server-rendered, parseable list of "what's hot on GitHub right now" — there is no official GitHub REST/GraphQL endpoint for this; the `/trending` HTML page is the canonical surface.

## Workflow

GitHub Trending is a **plain server-rendered HTML page** with no auth, no anti-bot, no JS rendering, and no XHR/GraphQL data layer behind it. The fastest, cheapest, most reliable path is to GET the URL with a vanilla User-Agent and parse the HTML — one HTTP request, ~1 second wall, no LLM cost. **Always lead with the fetch path.** A scripted browser session works as a fallback (the page snapshots cleanly via `browse snapshot` — verified at 558 a11y refs in a 16-repo run), but it pays a ~30× wall-clock penalty and burns inner-agent turns for zero additional information vs. the raw HTML.

### 1. Build the URL

The three filters compose like this:

| Filter | Where | Example |
|---|---|---|
| Programming language | URL **path segment** (lowercase, kebab-case) | `/trending/python`, `/trending/rust`, `/trending/objective-c`, `/trending/c%2B%2B` (`c++`) |
| Spoken language | Query param `spoken_language_code` (ISO 639-1 two-letter) | `?spoken_language_code=zh` (Chinese), `=ja`, `=es`, `=ko`, `=ru` |
| Date range | Query param `since` (default: `daily`) | `?since=daily`, `?since=weekly`, `?since=monthly` |

Full example (all three filters): `https://github.com/trending/python?since=daily&spoken_language_code=zh`

The unfiltered base URL `https://github.com/trending` works too — it defaults to `since=daily` and "all languages."

### 2. Fetch the HTML

```bash
# via the browse CLI (no proxies needed, no stealth needed)
browse cloud fetch "https://github.com/trending/python?since=daily&spoken_language_code=zh"

# or any HTTP client — a vanilla User-Agent + Accept: text/html is fine
curl -sS -H 'User-Agent: Mozilla/5.0' \
  'https://github.com/trending/python?since=daily&spoken_language_code=zh'
```

Returns `200 OK` with `Content-Type: text/html; charset=utf-8` for anonymous unauthenticated requests. **No residential proxy required**, no `--verified`, no session, no cookies — verified 2026-05-21 from a Vercel Sandbox IP, 0 failed requests across 214 page requests in browser trace.

### 3. Parse the HTML

Each repo is wrapped in `<article class="Box-row">`. Iterate articles, then extract within each one:

| Field | Pattern |
|---|---|
| `owner` / `repo` | The `<h2 class="h3 lh-condensed">` block contains the heading anchor `<a href="/{owner}/{repo}">`. **Scope your href-match to inside the h2** — the article also contains earlier `<a href="/login?return_to=%2F{owner}%2F{repo}">` and `<a href="/{owner}/{repo}/stargazers">` links that will match a naïve "first href" pattern and produce wrong owner/repo (or "repo/stargazers") values. |
| `description` | `<p class="col-9 color-fg-muted my-1 tmp-pr-4">…</p>` — strip inner HTML, collapse whitespace. **Optional.** Some repos have no description. Class name has also been observed historically as `pr-4` (without the `tmp-` prefix) — match `(?:tmp-)?pr-4` for safety. |
| `language` | `<span itemprop="programmingLanguage">Python</span>`. **Optional** — repos with no detected language omit this entirely. |
| `language_color` | `<span class="repo-language-color" style="background-color: #3572A5">` — sits next to the language name. |
| `stars_total` | The text content of `<a href="/{owner}/{repo}/stargazers" …>` — formatted with commas (e.g. `"44,362"`). Strip tags, strip commas, parse as int. |
| `forks_total` | The text content of `<a href="/{owner}/{repo}/forks" …>` — same parse as stars. |
| `stars_period` + `period_label` | Free text inside `<span class="d-inline-block float-sm-right">…N stars today</span>` (or `…this week` / `…this month`). The regex `/([\d,]+)\s*stars?\s*(today\|this\s+week\|this\s+month)/i` works for all observed shapes. **CRITICAL: use `stars?` (singular OR plural).** Repos with exactly 1 star in the period render as `"1 star today"` (singular). **Also CRITICAL: this field is OPTIONAL** — repos with zero stars in the period sometimes omit the span entirely (observed in iter-1: 1 of 16 repos). Treat `null` as "no period-stars displayed" rather than zero. |
| `built_by` | Inside the "Built by" span at the end of the article: list of `<a href="/{username}"><img alt="@{username}"></a>` avatar links. Top 5 contributors of the period. The `@{username}` from `img.alt` is the cleanest extraction. |
| `rank` | 1-indexed position in the article list (top of page = rank 1). |

### 4. Validate filter application

GitHub renders filter chips in the toolbar that confirm which filters were applied. The most reliable verification is to inspect the **page title** in the response: `<title>Trending {Lang} repositories on GitHub today · GitHub</title>` (daily), `… this week · GitHub` (weekly), `… this month · GitHub` (monthly). The title omits "spoken language" but reflects programming language + period.

### 5. Browser fallback

When direct HTTP is blocked (network egress restrictions, captive portals, corporate proxies that MITM github.com), drive a Browserbase session:

```bash
SID=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://github.com/trending/python?since=daily&spoken_language_code=zh" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse snapshot --remote --session "$SID"  # ~558 a11y refs — every article exposed as headings + links
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

`--verified` and `--proxies` are **not** needed (verified 2026-05-21 with a bare session — 0 anti-bot blocks across full trace). Snapshot gives you all 16 article cards directly; alternatively `browse get html body` returns the same HTML the fetch path returns and you parse with the same selectors.

## Site-Specific Gotchas

- **No official API for Trending.** GitHub's REST and GraphQL APIs both have `search/repositories` endpoints that can sort by stars over a date range, but neither reproduces the editorial signal that powers `/trending` (which factors in star velocity, dedupes recently-popular repos, etc.). Don't waste time trying to back-derive `/trending` from `GET /search/repositories` — the result sets diverge significantly. The HTML page is canonical.
- **`Accept: application/json` is ignored.** `/trending` only renders HTML. No JSON variant, no RSS feed, no Atom feed.
- **Programming language is a URL path segment, not a query param.** `?language=python` is silently ignored — the page renders the all-language list. Use `/trending/python` instead. Slugs are lowercase; multi-word languages use the hyphenated form GitHub displays in the "Language" dropdown (e.g. `objective-c`, `common-lisp`, `vim-script`). For `C++` use `c%2B%2B` (URL-encoded `+` is required; `c++` works in browsers because they percent-encode automatically but raw HTTP clients won't).
- **Spoken language code is ISO 639-1, two-letter.** `zh` (Chinese), `ja` (Japanese), `es` (Spanish), `pt` (Portuguese), `ko` (Korean), `ru` (Russian), `de`, `fr`, etc. The dropdown surfaces all valid codes in the page's `<option value="spoken_language_code=XX">` elements — there is no separate API enum. Invalid codes are silently dropped and the page renders the all-languages list. Combining `spoken_language_code` with a programming-language path segment is allowed and works as AND.
- **`stars_period` text uses singular "star" when the count is 1.** `/(\d+)\s*stars\s+today/` will miss `"1 star today"` rows. Use `stars?` in your regex.
- **`stars_period` can be missing entirely** — not all rows have the `<span class="d-inline-block float-sm-right">N star(s) period</span>`. Observed 1 of 16 missing in a single fetch (~6%). Treat the field as nullable; do not default to `0` (the absence likely means the period delta is small/zero/not-yet-computed by GitHub, but the page is unambiguous about not displaying anything).
- **The "Built by" list is top-5 period contributors, not the repo's owners.** Maintainers, dependabot, github-actions, claude, and similar bot accounts routinely show up here. Don't conflate `built_by` with `owner`.
- **Heading anchor extraction must be scoped to the `<h2>`.** A naïve `<a href="/{owner}/{repo}">` regex over the whole article will match the *first* href in the article — which is the "log in to star" affordance `<a href="/login?return_to=%2F{owner}%2F{repo}">` followed by `<a href="/{owner}/{repo}/stargazers">`. Both produce wrong values (the login href URL-encodes the slashes; the stargazers href produces `repo: "actualrepo/stargazers"`). **Match inside `<h2 class="h3 lh-condensed"> … </h2>`** to get the canonical repo link.
- **Description class name has two observed variants.** Currently `col-9 color-fg-muted my-1 tmp-pr-4` (post-Primer-CSS migration); historically and still seen in cached responses as `col-9 color-fg-muted my-1 pr-4`. Match `(?:tmp-)?pr-4`.
- **Max ~25 repos per page; no pagination.** GitHub intentionally caps Trending to a single page (typical: 15–25 entries depending on filter density). There is no `?page=2`. If you need more, change the date range to `weekly` or `monthly` — those produce different (broader) result sets.
- **No rate-limit observed for anonymous fetches at ≤ 1 req/s.** GitHub's standard anonymous rate limit (60 req/hr) applies to the API; HTML pages are throttled separately and `/trending` returns 200 reliably at human-paced polling. Authenticated requests count against the 5000 req/hr API budget but Trending is fine unauthenticated.
- **Third-party "trending API" mirrors are unreliable.** `ghapi.huchen.dev`, `trendings.herokuapp.com`, and similar Heroku/Cloudflare-Workers mirrors of the page exist but go offline regularly (their HTML scrapers break when GitHub re-themes the page — and several of the well-known ones haven't been updated since the 2024 Primer-CSS migration). Always go to source.

## Expected Output

```json
{
  "success": true,
  "url": "https://github.com/trending/python?since=daily&spoken_language_code=zh",
  "filters": {
    "programming_language": "python",
    "spoken_language_code": "zh",
    "since": "daily"
  },
  "count": 16,
  "repos": [
    {
      "rank": 1,
      "owner": "hiroi-sora",
      "repo": "Umi-OCR",
      "url": "https://github.com/hiroi-sora/Umi-OCR",
      "description": "OCR software, free and offline. 开源、免费的离线OCR软件。支持截屏/批量导入图片，PDF文档识别，排除水印/页眉页脚，扫描/生成二维码。内置多国语言库。",
      "language": "Python",
      "language_color": "#3572A5",
      "stars_total": 44362,
      "forks_total": 4379,
      "stars_period": 38,
      "period_label": "stars today",
      "built_by": ["hiroi-sora", "weblate", "chunkiuu", "qwedc001", "plum7x"]
    },
    {
      "rank": 12,
      "owner": "xrayfree",
      "repo": "free-ssr-ss-v2ray-vpn-clash",
      "url": "https://github.com/xrayfree/free-ssr-ss-v2ray-vpn-clash",
      "description": "长期免费维护 VLESS/ VMess / Trojan / SS / V2RAY / VPN / CLASH / 小火箭 免费节点订阅链接！电报群：https://t.me/xrayfree",
      "language": "Python",
      "language_color": "#3572A5",
      "stars_total": 1594,
      "forks_total": 75,
      "stars_period": 1,
      "period_label": "stars today",
      "built_by": ["xrayfree", "github-actions"]
    }
  ],
  "error_reasoning": null
}
```

Failure shape (only realistic outcome — github.com/trending is operationally extremely reliable; the most likely failure is your egress being unable to reach github.com at all):

```json
{
  "success": false,
  "url": "https://github.com/trending/python?since=daily&spoken_language_code=zh",
  "filters": { "programming_language": "python", "spoken_language_code": "zh", "since": "daily" },
  "count": 0,
  "repos": [],
  "error_reasoning": "fetch failed: ECONNREFUSED github.com:443"
}
```

Field types:

- `count` — integer; equals `repos.length`. Typically 15–25.
- `repos[].description` / `repos[].language` / `repos[].language_color` / `repos[].stars_period` / `repos[].period_label` — all **nullable**. Treat missing-in-DOM as `null`, not `0` / `""`.
- `repos[].stars_total` / `repos[].forks_total` — integers, parsed from comma-formatted display strings.
- `repos[].built_by` — array of GitHub usernames (strings), may be empty.
- `period_label` — one of `"stars today"`, `"stars this week"`, `"stars this month"`, or `null`. The label tracks the `since` filter; expect consistency within a single result page.
