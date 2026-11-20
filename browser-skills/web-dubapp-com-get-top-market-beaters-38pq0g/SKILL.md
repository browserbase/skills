---
name: web-dubapp-com-get-top-market-beaters-38pq0g
title: Dub Top Market Beaters (Core Creators)
description: >-
  Return Dub's Top Market Beaters leaderboard — the 20 Core-creator portfolios
  currently outperforming the market — with rank, name, ticker, creator, today
  and all-time % returns, description, and profile URL. Single anonymous HTTP
  GET to /explore/market-beaters returns the fully SSR'd grid; no auth, no
  proxy, no JS execution required.
website: web.dubapp.com
category: investing
tags:
  - copy-trading
  - leaderboard
  - investing
  - dub
  - core-creators
  - read-only
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: api
alternative_methods:
  - method: url-param
    rationale: >-
      The Core vs Premium variant is path-based (/explore/market-beaters for
      Core, /explore/premium/market-beaters for Premium). Query-string ?type= is
      silently ignored on /explore/market-beaters but does work on /leaderboard.
  - method: browser
    rationale: >-
      Unnecessary — the SSR'd HTML already contains every card and field.
      Browser path is identical to HTTP path in extractable data but ~100× the
      cost. Only justified if Dub adds an anti-bot wall to the HTML route in the
      future (none observed across 3 fetches: 200 OK with and without proxies).
verified: false
proxies: false
---
# Dub Top Market Beaters (Core Creators)

## Purpose

Return the current **Top Market Beaters** leaderboard from Dub's Core Creators on `web.dubapp.com` — the curated list of Core portfolios that are outperforming the market. For each ranked portfolio: name, ticker, creator display name, today's % return, all-time % return, short strategy description, and canonical profile URL. Read-only; never copies, follows, or invests.

## When to Use

- Daily / hourly tracking of which Core creator portfolios are leading the market on Dub.
- Building dashboards or alerts on top-performing copy-trading portfolios.
- Comparing Core (free-to-copy, curated) vs. Premium (paid) leaderboards on Dub.
- Any agent task that says "top creators / top portfolios / market beaters on Dub" — that exact phrase is a literal h2 section heading on `/explore`.

## Workflow

The full leaderboard is **fully server-side rendered** in the HTML returned by a single anonymous HTTP GET to a stable, public URL. No JavaScript execution, no login, no proxy, no captcha, no `?type=` toggle parsing — just `GET → parse HTML`. Sub-second, ~$0.0001 per fetch via Browserbase Fetch. **Lead with the HTTP path; the browser flow is an unnecessary 100× cost wrapper around the same SSR'd payload.**

1. **Fetch the page** (Core Creators):
   ```
   GET https://web.dubapp.com/explore/market-beaters
   ```
   For Premium creators use `GET https://web.dubapp.com/explore/premium/market-beaters` (returns the analogous 20-card grid with title `Top Market Beaters - Premium`). The query-string form `?type=premium` is **silently ignored on this URL** — the Core vs Premium toggle is path-based, not param-based.

   Headers: none required. No `Referer`, no `User-Agent`, no `Cookie`. The page returns 200 OK with the full grid SSR'd into the HTML.

2. **Confirm the page rendered**. Sanity-check by looking for the canonical h1 in the response body:
   ```html
   <h1 class="... font-serif text-display-lg">Top Market Beaters</h1>
   ```
   and the subtitle `<p>Portfolios outperforming the market</p>`. If the h1 is missing, you were probably redirected (e.g. AppsFlyer smart-banner injecting JS); refetch.

3. **Split the grid into card chunks**. Each portfolio card begins with the literal anchor open-tag:
   ```
   <a class="flex h-full w-full" href="/portfolios/{HANDLE}">
   ```
   Splitting the HTML on `<a class="flex h-full w-full" href="/portfolios/` yields one chunk per card. The page renders **exactly 20 cards** on a single page (no pagination, no infinite scroll, no "See more" — `/explore/market-beaters` is the canonical full list as of the trace). Order is by rank: index 0 = rank 1.

4. **Extract fields per card chunk** (regex against each chunk):

   | Field | Source |
   |---|---|
   | `handle` (portfolio ticker, uppercase) | The leading capture `([A-Za-z0-9_]+)` immediately after the split delimiter |
   | `name` (portfolio display name) | `<p class="truncate text-md font-semibold text-primary">([^<]+)</p>` |
   | `ticker` | `<span class="font-mono ... text-action">\$<!-- -->([A-Z0-9_]+)</span>` — note the literal `<!-- -->` comment node Next.js injects between `$` and the value |
   | `creator` (display name) | `<span class="truncate text-secondary">([^<]+)</span>` — the first such span after the `·` separator. May be a first-name + last-initial (e.g. `John P.`), a single name (`Jeremy`, `Seb`), or an org/handle (`APMIA`, `Hugh Mungus`) |
   | `today_return_pct` | `>Today<.*?<span ... text-(gain\|loss\|primary)[^"]*>([+-]?\d+\.\d+%)</span>` (DOTALL) |
   | `all_time_return_pct` | `>All-Time<.*?<span ... text-(gain\|loss\|primary)[^"]*>([+-]?\d+\.\d+%)</span>` (DOTALL) |
   | `description` | `<p class="line-clamp-\d ... text-secondary ...">([^<]+)</p>` — HTML-decode `&quot;`, `&amp;`, `&#x27;`, `&#39;`, Unicode entities (`’` → `'`) |
   | `profile_url` | `https://web.dubapp.com/portfolios/{handle}` |

5. **Sort sanity-check**: the page is ranked by **all-time return**, with rank 1 being the highest. Rank-1's `all_time_return_pct` should be the largest positive value among the 20 cards. The marketing copy ("Portfolios outperforming the market") means all 20 entries are alpha-positive over the lifetime window — but `today_return_pct` can be deeply negative on a market-wide red day and that's expected (the page does not re-rank intraday).

6. **Stamp `as_of`** with the current UTC date — the page itself does not include a server-side "last updated" timestamp. Cache-Control on the response is `private, no-cache, no-store, max-age=0, must-revalidate`, so each fetch is freshly regenerated server-side.

### Browser fallback

Only justified if Dub introduces a future anti-bot wall on the HTTP path (none observed). If needed:

```
browse open https://web.dubapp.com/explore/market-beaters --remote
browse wait load
browse get html body          # returns the same SSR'd HTML as the HTTP fetch
# parse with the same regexes from step 4 — the browser does not unlock any
# additional fields, it just adds cost and turn count
```

Do **not** click any portfolio card during fallback — the portfolio detail page is not needed for the leaderboard task, and a stray click on the rendered "Copy" or "Invest" button is a real-money action surface (`dub` is a SEC-registered broker-dealer; this is a real trading app, not a paper demo).

## Site-Specific Gotchas

- **No anti-bot wall observed.** Verified by 2 successive fetches with `proxies: true` and 1 fetch with `proxies: false` — all 3 returned 200 OK with the identical 20-card payload in the same rank order. `proxies` are **not required** for this endpoint. Default to omitting `--proxies` to save ~$0.0008 per fetch.
- **The phrase "Top Market Beaters" is a literal h2 section heading on multiple pages.** Disambiguate by URL: `/explore` shows a 3-card *carousel preview* of Top Market Beaters with a "See all" link pointing to `/explore/market-beaters`; the latter is the full 20-card grid. The carousel on `/explore` only contains 3 cards in SSR — don't scrape it directly, follow the "See all" link.
- **Core vs Premium routing is path-based, not param-based.** `/explore/market-beaters` is Core (free copy-trading creators). `/explore/premium/market-beaters` is Premium (paid creators — Pelosi, Buffett, Infinity, etc.). The query-string `?type=premium` is silently ignored on `/explore/market-beaters` (page title stays "Top Market Beaters", not "...- Premium"). The `?type=core|premium` toggle **only** works on `/leaderboard`, not on `/explore`.
- **Don't confuse `/leaderboard` with `/explore/market-beaters`.** They are different surfaces with different data:
  - `/leaderboard?type=core` has three tables (Highest Returns, Most Copiers, Most Copying Capital), 9 rows each, with three time-window tabs (All Time / Monthly / Today). Only the *active* tab (All Time by default) is SSR'd — the Monthly and Today panels exist in the DOM but their `<div>` body is empty until a client-side fetch fires on tab click. There is no observed URL param that selects a different default tab — tested `?window=`, `?period=`, `?tab=`, `?time=` (all monthly/today empty).
  - `/explore/market-beaters` is the dedicated "Top Market Beaters" page — 20 cards, no tabs, no time-window switcher. Today's % and All-Time % are both shown on every card.
- **Next.js `<!-- -->` comment nodes inside spans break naïve regex.** The ticker is rendered as `<span ...>$<!-- -->JOHNDPHAN</span>`, not `<span ...>$JOHNDPHAN</span>`. Always include `<!--\s*-->` in your ticker regex or use a tolerant capture (`\$\s*(?:<!--[^>]*-->)?\s*([A-Z0-9_]+)`).
- **Creator handle may be missing on some leaderboard rows.** On `/leaderboard?type=core`, the row for portfolios without a public creator @username (e.g. `$NUKEFUTURE`) has no `@username` span at all — it shows only the portfolio name and ticker. On `/explore/market-beaters`, every card has a `creator` field (display name), but format varies: first-name + last-initial (`John P.`), single name (`Jeremy`, `Seb`, `APMIA`), or full alias (`Hugh Mungus`). Don't assume a `@handle` pattern.
- **Image srcSet payloads are huge (~30% of HTML weight)** — the cards include 12-width responsive `srcSet` URLs each ~3KB. Strip `<img ... srcSet="..."/>` before regex-extracting fields to make parsing 3× faster, or just regex against the original HTML — both work, the latter is fine for 20-card pages.
- **Cache-Control is `no-store`.** Every fetch hits the origin (X-Vercel-Cache: MISS). Don't rate-limit yourself based on cache-hit assumptions — but also don't hammer: sustained ≤ 1 req/s is polite for a leaderboard that updates intraday at most.
- **Sandbox WebSocket egress note (skill-build environment, not skill-runtime):** the Browserbase remote-browser path (`connect.usw2.browserbase.com` WebSocket) is **not reachable from the Vercel Sandbox host** that built this skill — only the Browserbase REST API (`api.browserbase.com`) was reachable. That's why this skill was verified end-to-end via `POST /v1/fetch` rather than `browse open --remote`. For agents *consuming* this skill from environments with full network egress, both paths work; the HTTP path is still strictly preferred for cost.
- **dub is a regulated SEC-registered broker-dealer.** Treat any clickable button on a portfolio detail page as a potential trade-execution surface. The leaderboard extraction itself touches no execution surface — but during browser fallback, scope to read-only verbs (`get html`, `screenshot`, `snapshot`) and never `click` a portfolio card.

## Expected Output

```json
{
  "success": true,
  "page_url": "https://web.dubapp.com/explore/market-beaters",
  "section": "Top Market Beaters",
  "subtitle": "Portfolios outperforming the market",
  "creator_type": "core",
  "as_of": "2026-05-18T00:00:00Z",
  "card_count": 20,
  "cards": [
    {
      "rank": 1,
      "name": "johndinhphan",
      "ticker": "$JOHNDPHAN",
      "handle": "JOHNDPHAN",
      "creator": "John P.",
      "today_return_pct": "-5.30%",
      "all_time_return_pct": "+543.22%",
      "description": "I find value where others overlook it - safe, growing, and built to last. One year is all it takes.",
      "profile_url": "https://web.dubapp.com/portfolios/JOHNDPHAN"
    },
    {
      "rank": 2,
      "name": "Copy The Cat",
      "ticker": "$COPYDACAT",
      "handle": "COPYDACAT",
      "creator": "Carlos C.",
      "today_return_pct": "-6.54%",
      "all_time_return_pct": "+147.61%",
      "description": "\"Copy the Cat\" monitors the moves of the most successful institutional investors to identify elite starting points for our analysis...",
      "profile_url": "https://web.dubapp.com/portfolios/COPYDACAT"
    }
  ]
}
```

For the Premium-creator variant, set `creator_type: "premium"` and `page_url: "https://web.dubapp.com/explore/premium/market-beaters"` (also 20 cards, same schema).

Failure shapes (rare — only if the HTTP fetch itself fails):

```json
{ "success": false, "reason": "fetch_failed", "status_code": 5xx }
```

```json
{ "success": false, "reason": "card_grid_missing", "note": "h1 'Top Market Beaters' present but 0 cards parsed — possible markup migration; refetch and inspect the leading anchor pattern" }
```
