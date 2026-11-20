---
name: finance-yahoo-com-search-stock-news-dnf5k3
title: Yahoo Finance Stock News Search
description: >-
  Given a stock ticker, return Yahoo Finance's per-ticker news headlines (title,
  URL, publisher, age, content type, related tickers) plus the AI-generated
  Yahoo Scout summary, by deep-linking to /quote/{TICKER}/news/ and extracting
  from .mainContent.
website: finance.yahoo.com
category: finance
tags:
  - finance
  - stocks
  - news
  - yahoo
  - tickers
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: url-param
alternative_methods:
  - method: browser
    rationale: >-
      The user-requested UI flow (fill form#ybar-sf with the ticker, press Enter
      to let the typeahead route to /quote/{TICKER}/, then click the <a
      title="News"> anchor in the quote nav) works reliably and is documented as
      the Browser fallback. It costs ~3 extra turns vs. the direct
      /quote/{TICKER}/news/ deep-link and depends on the typeahead intercepting
      form submission — preferred only when the deep-link is blocked or when the
      goal is to validate the search box behavior itself.
  - method: api
    rationale: >-
      Yahoo Finance's public unauthenticated JSON endpoints
      (query1.finance.yahoo.com) cover quotes, charts, and options but do NOT
      expose the per-ticker news stream as seen on /quote/{TICKER}/news/. RSS at
      /rss/headline?s={TICKER} returns a small subset (~20 items, no
      related-ticker chips, no content-type discrimination) and is
      deprecated-but-functional; not a full replacement. Not recommended as
      primary.
verified: true
proxies: true
---
# Yahoo Finance Stock News Search

## Purpose

Given a stock ticker symbol (e.g. `AAPL`, `TSLA`, `^GSPC`), return the latest news headlines listed on Yahoo Finance's per-ticker news tab. Each item carries title, article URL, publisher, relative age, content type (`story` / `video` / `press` / `ad`), and the tickers + percent changes annotated in the stream. Read-only — never follows article links, never submits forms beyond the search box, never interacts with sponsored content.

## When to Use

- "What's the latest on $TICKER?" / "Show me news for Apple."
- Periodic monitoring of headlines for a watchlist of tickers.
- Pre-trade sentiment lookup before a price decision is taken elsewhere.
- Anywhere you would otherwise hand-navigate Yahoo Finance's quote → news tab.

## Workflow

The fastest and most reliable path is a **direct deep-link to the per-ticker news page** — `https://finance.yahoo.com/quote/{TICKER}/news/`. This skips the search box, the typeahead, and the `[title="News"]` click entirely. The UI-traversal path (search form #ybar-sf → quote page → click `[title="News"]`) works and is documented under *Browser fallback* below, but it costs ~3 extra turns and depends on the search-box typeahead intercepting Enter correctly (an undocumented behavior — see gotchas).

1. **Resolve the ticker.** Accept the ticker exactly as given. Yahoo's ticker space includes `.`-suffixed regional listings (`AAPL.B`), `^`-prefixed indices (`^GSPC`), `=X` currencies (`EURUSD=X`), `-USD` cryptos (`BTC-USD`), and `=F` futures (`CL=F`). Do NOT uppercase or normalize — pass through verbatim.

2. **Open the news page directly.**
   ```bash
   browse open "https://finance.yahoo.com/quote/${TICKER}/news/" --remote --session "$SID"
   ```
   - **200 OK + News page** → proceed. Page title matches `^${TICKER_NAME} \(${TICKER}\) Latest Stock News.*Yahoo Finance$`.
   - **Redirect to `/lookup/?s=${TICKER}`** → ticker not found. The page renders "No results for '${TICKER}'" inside `.mainContent`. Emit `{ "success": false, "reason": "ticker_not_found", "ticker": "${TICKER}" }` and stop. Detect via `location.href.includes('/lookup/')` after navigation.

3. **Wait for the stream to render.** The headline list inside `.mainContent` is server-rendered for the first ~25 items, but story-tile metadata (publisher, age, related-ticker chips) fills in progressively. Wait 2–3 seconds after navigation, or until `document.querySelectorAll('.mainContent a[data-ylk*="elm:hdln"]').length >= 20`.

4. **(Optional) Filter to news-only.** The default `All` tab inside `.mainContent` includes sponsored slots (`ct:ad`) interleaved with stories. To filter to editorial news only, click the `[title="News"]` filter tab on the news page (it's an `<a class="tabBtn">` with `data-ylk` containing `subsec:news`). This is a *different* `[title="News"]` element from the one in the quote-nav (see gotchas). Alternative tabs: `[title="Earnings Calls"]`, `[title="Press Releases"]`, `[title="SEC Filings"]`. Skipping this step and filtering client-side by `ct === "story"` is equivalent and saves a click.

5. **Extract headlines from `.mainContent`.** Each story tile contains *two* anchors with the same href — one wrapping the thumbnail image (empty text), one wrapping the headline text. Dedupe by href, keep the text-bearing anchor:
   ```js
   const mc = document.querySelector('.mainContent');
   const headlines = Array.from(mc.querySelectorAll('a[data-ylk*="elm:hdln"]'));
   const seen = new Set();
   const items = [];
   for (const a of headlines) {
     if (seen.has(a.href) || !a.textContent.trim()) continue;
     seen.add(a.href);
     const dy = a.getAttribute('data-ylk') || '';
     const ct = (dy.match(/ct:(\w+)/) || [])[1] || null;          // story | video | ad
     const container = a.closest('section, li, article, div');
     const m = (container?.innerText || '').match(/\n([^\n]+)\n•\n([^\n]+)/);
     items.push({
       title: a.textContent.trim(),
       url: a.href,
       ct,
       publisher: m?.[1] || null,
       age: m?.[2] || null,
     });
   }
   ```
   The `data-ylk` attribute is Yahoo's per-element tracking payload; `elm:hdln` is the stable, site-wide marker for "this anchor is a headline link" and survives the various visual layouts (story tile, video tile, press release).

6. **(Optional) Paginate via scroll.** The page lazy-loads on scroll. Each `window.scrollTo(0, document.body.scrollHeight)` followed by a 2-second wait fetches the next ~20 headlines. Loop until the headline count stops growing or you hit a desired N. Verified iter-1: 25 → 45 after one scroll on AAPL.

7. **Skim the AI summary** (optional, top-of-stream). At the top of `.mainContent`, a "News headlines" block under heading text "Updated Xm ago · Powered by Yahoo Scout" contains a 2–3-sentence machine-generated synopsis of recent coverage. Useful as a one-line answer when the user asks for *a summary*, not a list. Text content can be read via `mc.querySelector('section[data-testid*="summary"], section:has(> div:contains("Yahoo Scout"))')?.innerText` — selector varies; safer is to grab the first non-nav text block in `.mainContent`.

### Browser fallback — via the user-requested UI flow

Use this path when the direct deep-link is blocked or when validating the searchbox flow itself.

1. Open `https://finance.yahoo.com/`.
2. Fill the search box inside `form#ybar-sf` — the input is `input#ybar-sbq` (name `p`):
   ```bash
   browse fill --remote --session "$SID" "#ybar-sbq" "${TICKER}"
   ```
3. Wait ~1 second for the typeahead `ul[role="listbox"]` to render. Confirm the top `li[role="option"]` text begins with `${TICKER}` followed by the company name and the tag `equity` / `etf` / `index`. If the top option does not match (e.g. user passed a partial / wrong ticker), abort.
4. Press Enter — the typeahead intercepts the form submission and navigates to `https://finance.yahoo.com/quote/${TICKER}/`, **not** the form's stated action of `/lookup/`. This is undocumented behavior and is what makes the searchbox flow work as a ticker shortcut. (If you instead submit the form bypassing the typeahead — e.g. by POSTing to the action URL — you land on the lookup results page, which is wrong.)
   ```bash
   browse press --remote --session "$SID" Enter
   ```
5. On the quote page, locate `[title="News"]` — **there are two matches**: an `<a class="item yf-8g9x85" href=".../news/">` in the quote-nav bar (this is the one to click) and a `<button class="tabBtn l1 yf-zzox3x">` in some headers that is a non-navigating UI duplicate. Click the anchor specifically:
   ```bash
   browse eval --remote --session "$SID" 'document.querySelector("a[title=\"News\"]").click()'
   ```
6. Wait 2–3 seconds, then continue from step 3 of the optimal workflow above (extract from `.mainContent`).

## Site-Specific Gotchas

- **Two `[title="News"]` elements coexist on the quote overview page.** The `<a class="item yf-8g9x85">` is the navigation link (goes to `/quote/${TICKER}/news/`). The `<button class="tabBtn l1 yf-zzox3x">` next to it is a visual duplicate that does *not* navigate. A naïve `document.querySelector('[title="News"]')` picks up the anchor first, which works — but `[title="News"]` is not a unique selector. Prefer `a[title="News"]` to be explicit. On the news page itself, `[title="News"]` is a third element — the *filter sub-tab* — which switches the stream from `All` to news-only.
- **Typeahead hijacks the search form's submit.** `form#ybar-sf` declares `action="https://finance.yahoo.com/lookup/"` and would normally GET `/lookup/?p=${TICKER}`. But when the typeahead `ul[role="listbox"]` is open and its top option is an equity match, pressing Enter triggers the typeahead's `option.click()` handler instead of the form submit, navigating to `/quote/${TICKER}/`. If the typeahead has not rendered yet (the box value was set without a synthetic input event, or you submitted within ~200ms of filling), Enter falls through to the form and you land on `/lookup/?p=${TICKER}` — a different page with no `.mainContent` news stream. Always wait for the listbox before pressing Enter, or click the first `li[role="option"]` explicitly.
- **Invalid ticker → silent redirect to `/lookup/?s=${TICKER}`.** Yahoo does *not* return 404 for unknown tickers on the `/quote/...` path. The URL silently rewrites to the lookup search results, which renders inside the same `.mainContent` container but with the text `Symbols similar to '${TICKER}' ... No results for '${TICKER}'`. Always check `location.href` after navigation; do not assume the request URL is the rendered URL.
- **Ticker casing and special characters matter.** `aapl` (lowercase) → 301 to uppercase URL, fine. `BRK.B` → works. `BRK-B` → silent rewrite to lookup. `^GSPC`, `=X`, `=F`, `-USD` suffixes are preserved verbatim by `/quote/`. URL-encode `^` as `%5E` for safety inside templated URLs.
- **`.mainContent` is shared across the entire `/quote/${TICKER}/*` route.** It contains the quote header, sticky price ticker, ad slots, *and* the news stream. Do NOT grab `mc.innerText` and treat it all as news — the first ~10 lines are nav tabs ("Summary | News | Research | Chart | …") and the price block. Scope queries to `mc a[data-ylk*="elm:hdln"]` instead.
- **Each story tile renders the same anchor twice (image + headline).** Without deduping by `href`, every headline appears as one empty-text entry plus one text entry. Dedupe by href and drop empty `textContent.trim()`.
- **`data-ylk` is the stable extraction surface, not CSS classes.** Yahoo ships utility classes like `yf-8g9x85`, `yf-ew9gqf`, `yf-zzox3x` that rotate with every redeploy. Stable hooks: `data-ylk*="elm:hdln"` (headline link), `data-ylk*="ct:story"` / `ct:video` / `ct:ad` (content type), `data-ylk*="elm:tab"` (filter tab), `data-testid="quote-nav-bar"` / `quote-sticky-hdr` / `quote-hdr`. Build selectors on these, not on the hashed class names.
- **Stream is lazy-loaded on scroll.** Initial render gives ~25 headlines; subsequent scrolls fetch ~20 more each. There is no "Load more" button — `window.scrollTo(0, document.body.scrollHeight)` is the only trigger. After ~5 scrolls the stream tapers off (~100 headlines is the practical ceiling per ticker).
- **Sponsored slots (`ct:ad`) are interleaved with editorial.** Filter them out client-side via `ct !== "ad"`, or click the `[title="News"]` sub-tab to get the editorial-only feed. Press releases live under `[title="Press Releases"]`, earnings transcripts under `[title="Earnings Calls"]`, and SEC filings under `[title="SEC Filings"]` (this last one is actually a dropdown, not a tab — `data-ylk` contains `elm:dropdown`).
- **No anti-bot wall observed.** Iter-1 ran with `--verified --proxies` and saw clean 200s end-to-end on `/`, `/quote/AAPL/`, `/quote/AAPL/news/`, `/quote/TSLA/news/`, `/lookup/?s=XYZNOTREAL`. No Akamai 403s, no GDPR consent banner (US IP), no rate-limit responses. Stealth is *not* required but was used as a safe default; a bare session is likely fine for low-volume use. Cookies: ~10 set on first load (Yahoo session, A1/A3 trackers); not required for content access.
- **`form#ybar-sf` is the unified Yahoo search box — same form/id on news.yahoo.com, sports.yahoo.com, etc.** On `finance.yahoo.com`, the typeahead is finance-scoped (equities, ETFs, indices, futures, currencies, crypto). On other Yahoo properties, the same form id produces a generic web/news typeahead, which will not route to a quote page. Always start from `finance.yahoo.com/`.
- **AI summary block ("Powered by Yahoo Scout") is opt-in machine output.** It appears above the headline list, paraphrases the top stories, and is regenerated every few minutes. Useful for `summary` mode but should never be quoted verbatim as if it were a primary source — emit it under a distinct field (`ai_summary`) and never confuse it with a headline.

## Expected Output

Three distinct outcome shapes:

```json
// 1. Headlines returned (most common)
{
  "success": true,
  "ticker": "AAPL",
  "company_name": "Apple Inc.",
  "page_url": "https://finance.yahoo.com/quote/AAPL/news/",
  "ai_summary": "Recent developments indicate Apple is strategically enhancing its market position through premium content offerings and competitive analysis in tech sectors. The company's engagement in healthcare APIs and application processors highlights its focus on growth in emerging tech markets.",
  "headlines": [
    {
      "title": "Analyze Apple stock on Yahoo Finance's new AI platform AlphaSpace",
      "url": "https://finance.yahoo.com/video/analyze-apple-stock-on-yahoo-finances-new-ai-platform-alphaspace-194037185.html",
      "ct": "video",
      "publisher": "Yahoo Finance Video",
      "age": "19h ago",
      "related_tickers": ["AAPL"]
    },
    {
      "title": "150 Years of Market History Predicts Trump's Bull Market Is Almost Over",
      "url": "https://finance.yahoo.com/markets/stocks/articles/150-years-market-history-predicts-145544565.html",
      "ct": "story",
      "publisher": "24/7 Wall St.",
      "age": "21m ago",
      "related_tickers": ["NVDA", "^GSPC", "MSFT"]
    },
    {
      "title": "Healthcare API Strategic Business Research Report 2026, Competitive Analysis of Apple, Athenahealth, eClinical Works, Google, Greenway Health, Microsoft, Oracle, Postman, Practice Fusion, Salesforce",
      "url": "https://finance.yahoo.com/sectors/healthcare/articles/healthcare-api-strategic-business-research-131500629.html",
      "ct": "story",
      "publisher": "GlobeNewswire",
      "age": "2h ago",
      "related_tickers": ["AAPL", "GOOG", "MSFT"]
    }
  ],
  "headline_count": 25,
  "filter_applied": "all"
}

// 2. Ticker not found (silently redirected to /lookup/)
{
  "success": false,
  "reason": "ticker_not_found",
  "ticker": "XYZNOTREAL",
  "redirected_to": "https://finance.yahoo.com/lookup/?s=XYZNOTREAL",
  "message": "No results for 'XYZNOTREAL'"
}

// 3. Page reached but news stream empty (rare — newly-listed ticker or thin-coverage symbol)
{
  "success": true,
  "ticker": "BRK.B",
  "company_name": "Berkshire Hathaway Inc.",
  "page_url": "https://finance.yahoo.com/quote/BRK.B/news/",
  "ai_summary": null,
  "headlines": [],
  "headline_count": 0,
  "filter_applied": "all",
  "note": "Page rendered with zero headlines in .mainContent — distinct from ticker_not_found."
}
```
