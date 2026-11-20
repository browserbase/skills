---
name: cnyes-com-search-financial-news-5m6h9i
title: Cnyes Financial News Search
description: >-
  Search Cnyes (鉅亨網) for financial news, stock-related articles, market updates,
  company news (財報/股東會/公告), and macro themes (AI, 半導體, 美債, 匯率, 加密幣). Returns
  structured fields (title, Taipei publish time, byline, category, keywords,
  related tickers, URL) plus optional full-body dereference. Read-only; output
  in Traditional Chinese; never gives investment advice.
website: cnyes.com
category: financial-news
tags:
  - finance
  - news
  - taiwan
  - stocks
  - zh-tw
  - rag
  - cnyes
source: 'browserbase: agent-runtime 2026-05-22'
updated: '2026-05-22'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Cnyes ships a public JSON news API at api.cnyes.com/media/api/v1/ — no
      auth, no anti-bot, no proxies. /search/news?q= covers keyword search
      across TC/SC/EN and ticker codes; /newslist/category/{slug} covers
      latest-in-category. Article snippets, byline, category, keywords,
      publishAt epoch, and cover image all returned as structured JSON. ~50×
      faster and ~100× cheaper than scripted browsing.
  - method: fetch
    rationale: >-
      Article full body is NOT exposed via JSON (all detail-endpoint variants
      tested 404/422). Fetch the SSR'd HTML at
      https://news.cnyes.com/news/id/{newsId} via `browse cloud fetch` (no
      browser session, no proxies needed) and parse the
      title/byline/category-breadcrumb/body/inline-ticker-links.
  - method: browser
    rationale: >-
      Only needed as last-resort fallback when the API path is blocked. A bare
      session (no --verified, no --proxies) suffices — no Akamai/captcha
      observed. Three search-page URL variants documented
      (news.cnyes.com/search?q=, www.cnyes.com/search/news?keyword=,
      www.cnyes.com/search/all?keyword=). Browser is also the only path to
      extract live price data from the JS-hydrated /twstock/, /usstock/detail/,
      /funds/detail/ pages.
verified: false
proxies: false
---
# Cnyes Financial News Search

## Purpose

Search Cnyes (鉅亨網, https://www.cnyes.com/) — Taiwan's largest Chinese-language financial news portal — for articles about any stock symbol (TW, US, HK), company name, ETF, fund, market theme, macro keyword, or news event. Returns a ranked list of recent articles with title, publish timestamp (Taipei time), byline / source, category, keyword tags, related tickers, cover image, snippet, and canonical article URL; can also dereference any article ID to its full body for fact extraction. Read-only — never logs in, never posts comments, never clicks paywalled "訂閱" subscription content. Output is summarised in **Traditional Chinese (zh-TW)** to match the source.

## When to Use

- Pull the latest Cnyes articles about a specific Taiwan stock (e.g. 台積電 / `2330`), US stock (`NVDA`, `AAPL`, `TSM`), ETF, mutual fund, or HK ticker.
- Track a market theme (`AI`, `半導體`, `電動車`, `加密貨幣`, `美債`, `匯率`, `黃金`, `油價`) over recent days.
- Build a Cnyes-backed RAG / research pipeline that needs structured fields (`newsId`, `publishAt`, `category`, `keyword[]`, byline) rather than scraped HTML.
- Monitor company news events: 股東會 (shareholder meetings), 法說會 (earnings calls), 公告 (regulatory announcements), 財報 (earnings reports), M&A / IPO news.
- Pull the latest items in a category (頭條 / 台股 / 美股 / 科技 / 加密幣 / 外匯) without a keyword filter.

## Workflow

Cnyes ships a **public JSON news API** at `https://api.cnyes.com/media/api/v1/` — no auth, no API key, no cookies, no anti-bot stealth, no residential proxy. The web UI is a thin Next.js client over the same data. **Lead with the API.** Browser navigation is a ~50× cost premium fallback for the rare cases when the API is unreachable or you need pixel-level extraction (chart screenshots, paywalled-content detection).

### 1. Keyword search — preferred path

```
GET https://api.cnyes.com/media/api/v1/search/news?q={URL-encoded keyword}&page={1..last_page}
```

- Works for Traditional Chinese (`台積電`, `半導體`, `美債`), Simplified Chinese (`台积电` — auto-mapped to TC results), English (`NVIDIA`, `AAPL`, `OpenAI`), and ticker codes (`2330`, `TSM`, `0050`).
- Response shape (verified 2026-05-22):
  ```json
  {
    "items": {
      "total": 2817,
      "per_page": 20,            // hardcoded — see Gotchas
      "current_page": 1,
      "last_page": 141,
      "next_page_url": "/media/api/v1/search/news?q=...&page=2",
      "prev_page_url": null,
      "from": 1, "to": 20,
      "data": [
        {
          "newsId": 6466886,
          "title": "算力軍備到來！馬斯克砸千億美元建TeraFab ASML訂單排到2029年",
          "signature": "鉅亨網新聞中心",
          "content": "EUV 訂單，已排給<mark>台積電</mark> (TSM-US)(2330-TW)、三星電子",
          "keyword": ["ASML", "TeraFab", "特斯拉", "晶片", "算力"],
          "publishAt": 1779413406,
          "category": [{"name": "美股雷達", "categoryId": 831, "slug": "us_stock"}],
          "coverSrc": { "l": {"src": "https://cimg.cnyes.cool/.../l/....jpg", ...}, ... },
          "hasCoverPhoto": 0,
          "titleWithKwd": 0,
          "contentWithKwd": 1
        }
      ]
    }
  }
  ```
- **Sort order is recency-relevance hybrid** — first ~5 results are usually the most recent strong-match articles; deeper pages skew to older / weaker matches.
- **Pagination**: increment `page=`; the `limit` parameter is silently ignored (see Gotchas). The `next_page_url` is a relative path — prepend `https://api.cnyes.com` to use it directly.

### 2. Decode the search response

For each item in `items.data[]`:

| Field | Source | Notes |
|---|---|---|
| `url` | `https://news.cnyes.com/news/id/{newsId}` | Canonical article URL. |
| `title` | `title` with `<mark>…</mark>` stripped | Highlight tags wrap the query terms — strip before display. |
| `published_at` (UTC) | `new Date(publishAt * 1000)` | `publishAt` is unix-epoch **seconds**, UTC. |
| `published_at_taipei` | UTC + 8h, format `YYYY-MM-DD HH:mm` | Site displays Taipei time (Asia/Taipei, no DST). |
| `category_name` / `category_slug` | `category[0].name` / `category[0].slug` | `category[]` is missing for raw 公告 / 鏈文 reprints — fall back to `(未分類)`. |
| `byline` / `source` | `signature` | e.g. `鉅亨網新聞中心`, `鉅亨網編譯許家華`, `金色財經`, `優分析`, `Knowing 新聞`. |
| `snippet` | `content` with `<mark>…</mark>` and `&lt;p&gt;`-style HTML entities decoded | Often contains inline ticker refs like `(2330-TW)`, `(TSM-US)`. |
| `keywords` | `keyword[]` array | Used by Cnyes for tag pages (`https://news.cnyes.com/tag/{kw}`). |
| `cover_image` | `coverSrc.l.src` (640×360) or `coverSrc.xl.src` (960×539) | `null` when `hasCoverPhoto === 0`. |
| `related_tickers` | Regex `(\d{4,5}-TW)` and `([A-Z]{1,5}-US)` over `content` + (optional) full body | TW format is the 4–5-digit code + `-TW`; US format is the ticker + `-US`. |

### 3. Latest-in-category — no keyword needed

```
GET https://api.cnyes.com/media/api/v1/newslist/category/{slug}?page=1&limit=20
```

Slugs observed in production (others may exist — discover via `https://news.cnyes.com/news/cat/{slug}`):

| slug | Chinese name |
|---|---|
| `headline` | 頭條 |
| `tw_stock` | 台股 |
| `tw_premarket` | 台股盤前 (categoryId 908) |
| `wd_stock` | 美股 |
| `us_stock` | 美股雷達 (categoryId 831) |
| `tech` | 科技 |
| `cn_stock` | 陸港股 |
| `fund` | 基金 |
| `forex` | 外匯 |
| `future` | 期貨 |
| `bc` | 區塊鏈 / 加密幣 |
| `cnyeshouse` | 房產 |
| `tw_money` | 理財 |
| `celebrity_area` | 新視界 |
| `mag` | 雜誌 |
| `anue_live` | 速報 |

The `limit` parameter **is** honoured on this endpoint (unlike `/search/news`).

### 4. Dereference article body — when snippets aren't enough

There is **no public JSON article-detail endpoint** — `https://api.cnyes.com/media/api/v1/news/{id}` returns `422 參數無效` and the `/news/list?newsId=…` / `/news/detail/…` variants all 404 (confirmed during discovery). Get the full body from the SSR'd HTML page:

```bash
browse cloud fetch "https://news.cnyes.com/news/id/{newsId}"
```

This returns 200 over the plain Browserbase fetch path — no `--proxies`, no browser session. Parse:

- **Title**: `<title>{title} | 鉅亨網 - {category_name}</title>` or the page's `<h1>`.
- **Byline + publish time line**: first paragraph after `<h1>` matches `{signature}{YYYY-MM-DD HH:mm}` (Taipei time) with **no separator** between byline and timestamp — e.g. `鉅亨網新聞中心2026-05-22 09:30`. Split on the first 4-digit-year run.
- **Category breadcrumb**: `<a href="/news/cat/{parent_slug}">{parent_name}</a><a href="/news/cat/{child_slug}">{child_name}</a>` directly above the `<h1>`.
- **Body**: paragraphs inside `<article>` / the main content `<div>`. Strip image captions (`<figcaption>`) and the "本網站各類資訊報價由路孚特 REFINITIV 提供…" disclaimer footer.
- **Inline ticker links**: `<a href="https://invest.cnyes.com/usstock/detail/{TICKER}">…</a>` for US, `<a href="https://www.cnyes.com/twstock/{CODE}">…</a>` for Taiwan. Use these as the authoritative ticker list for the article (more reliable than parsing `(TSM-US)` substrings, which can appear inside non-ticker prose).
- **Tags**: bottom of the article — `<a href="/tag/{tag}">{tag}</a>` blocks. Same set as the search response's `keyword[]` in most cases.

### 5. Browser fallback (only when steps 1–4 are blocked)

If a CDN edge ever blocks the API path, drive the search UI:

```bash
sid=$(browse cloud sessions create --keep-alive | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
# Three search URL variants — pick the most useful for the task:
# (a) richest news listing (cards with category + snippet + tags)
browse open "https://news.cnyes.com/search?q={URL-enc keyword}" --remote
# (b) news-only list on www subdomain (compact, same data, fewer ads)
browse open "https://www.cnyes.com/search/news?keyword={URL-enc keyword}" --remote
# (c) combined search — also surfaces quote / ticker matches in a top block
browse open "https://www.cnyes.com/search/all?keyword={URL-enc keyword}" --remote
browse get markdown body --remote   # extract article links + headlines from markdown
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

A bare session (no `--verified`, no `--proxies`) is sufficient — no Akamai or captcha was observed during a 1-iter probe. Cnyes does serve a cookie-consent overlay ("為優化網站服務…"), but it doesn't block content rendering or markdown extraction. If you do need to dismiss it, click `button: 繼續使用` once.

**Last-resort fallback** — if both API and browser are blocked, use Google site-restricted search: `site:cnyes.com OR site:news.cnyes.com "{keyword}"`. Quality is markedly lower (Google's index lag is ~24h for breaking news), and you only get the URL + headline, not structured fields.

### 6. Stock / ETF / fund detail landing pages (not articles — context only)

These pages render prices and charts; they are useful when the user asks "what's the latest on $TICKER" and you want to surface the canonical Cnyes page in addition to news.

| Asset | URL pattern | Example |
|---|---|---|
| Taiwan stock | `https://www.cnyes.com/twstock/{4-5digit code}` | `/twstock/2330` (台積電), `/twstock/0050` (元大台灣50 ETF) |
| US stock | `https://invest.cnyes.com/usstock/detail/{TICKER}` | `/usstock/detail/TSM`, `/usstock/detail/AAPL` |
| HK stock | `https://www.cnyes.com/hkstock/{code}` | (verify via search response if uncertain) |
| Mutual fund | `https://invest.cnyes.com/funds/detail/{name URL-enc}/{id}` | `/funds/detail/.../A13029` |
| Crypto | `https://crypto.cnyes.com/coin/{symbol}` | (subdomain) |
| Forex | `https://www.cnyes.com/forex/{pair}` | e.g. `USDTWD` |

These pages are JS-heavy SPA pages — `browse cloud fetch` returns the empty Next.js shell. To extract price data you must drive a browser session and wait for the React app to hydrate (~2–3s). For most news-search tasks you do **not** need to open these — the article-side ticker references in step 4 are sufficient.

### 7. Honesty layer — required output discipline

Cnyes mixes three content classes in the same search response. The skill **must** tag each result with its evidence class so downstream agents don't conflate them:

| Class | How to detect | Output tag |
|---|---|---|
| **Fact / news reporting** | `signature` matches `鉅亨網新聞中心`, `鉅亨網編譯…`, `路透社`, `中央社`, `MoneyDJ` etc. **and** `category.slug ∈ {headline, tw_stock, wd_stock, us_stock, cn_stock, tech, anue_live, tw_premarket}` | `evidence_class: "fact"` |
| **Opinion / analyst commentary** | `signature` matches 點股成金 / 摩爾投顧 / 江國中 / 優分析 / 一手情報, **or** `category.slug ∈ {mag, celebrity_area}` | `evidence_class: "opinion"` — must NOT be cited as a factual claim |
| **Regulatory announcement / boilerplate / sponsored** | Title starts with `〈台股公告〉` / `公告：` / `盤中速報`; or `signature` matches 金色財經 / 鏈文 reprints (`categoryId: 894`) | `evidence_class: "announcement"` |

Every JSON output field that is **not** directly present in the API/HTML response must carry a `confidence` qualifier: `fact` (verbatim from Cnyes), `inferred` (derived — e.g. sentiment, market-impact label, related-tickers regex), or `unknown` (couldn't determine). Sentiment / market-impact labels are always `inferred`.

**Investment-advice disclaimer**: never recommend buying, selling, holding, or shorting any asset. Limit output to "what Cnyes reported / what analysts in opinion pieces claimed" — direct quotation form. If the user asks "should I buy 2330?", respond with a Traditional-Chinese refusal: 「本工具僅整理鉅亨網新聞與分析內容，無法提供投資建議。請洽合格理財顧問。」 and still return any factual / opinion citations the user might find useful.

## Site-Specific Gotchas

- **`limit` is silently ignored on `/search/news`** — the response always paginates 20 items at a time regardless of `limit=`. Use `page=` to walk the result set. On `/newslist/category/*` the `limit` parameter IS honoured (verified `per_page=3` with `limit=3`).
- **`<mark>...</mark>` highlight tags in `title` and `content`** — the search API wraps the matched query terms with HTML `<mark>` tags. Strip them before display: `re.sub(r'</?mark>', '', s)`.
- **`content` field is HTML-entity-encoded for some categories** — e.g. category-list responses for `tw_stock` return `&lt;p&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;…` etc. Run an HTML-entity unescape (`html.unescape` in Python, etc.) before parsing. Search-API responses are usually plain text but may contain encoded characters in long snippets.
- **`publishAt` is unix-epoch SECONDS, UTC** — not milliseconds. Format for display in Taipei time (UTC+8, no DST). The on-site human-readable timestamp is always Taipei-local.
- **`category[]` is OPTIONAL** — some items (raw 公告, 鏈文 reprints from 金色財經, naked 盤中速報) ship without any `category`. Treat as `category_slug = null` and use `signature` + title-prefix heuristics to classify.
- **There is NO public article-detail JSON endpoint** — verified during discovery: `GET /media/api/v1/news/{id}` returns `{"items":[],"message":"參數無效","statusCode":422}`; `/news/?newsId={id}`, `/newslist?newsId={id}`, `/news/list`, `/news/detail/{id}` all return `404`. Don't waste turns probing for one — fetch the SSR'd HTML at `https://news.cnyes.com/news/id/{newsId}` instead. The HTML is fully server-rendered and parseable without a browser session.
- **`api.cnyes.com` requires network egress that resolves the cnyes domain** — in a fresh Vercel sandbox without DNS to public DNS servers, plain `curl` can fail with "Could not resolve host". Always use `browse cloud fetch <url>` (or `browse cloud fetch <url> --proxies` if a corporate edge blocks the bare path). The fetch path resolves through Browserbase's outbound DNS.
- **Search ranking is recency-weighted but NOT strict** — for a popular keyword (`AI` → 50k+ hits, `台積電` → 2.8k hits), the first page mixes the most-recent ~5 articles with older "hot" content. Always sort the returned items by `publishAt` descending if "latest N articles" is the user intent.
- **Simplified-Chinese query auto-maps to TC results** — `台积电` returns the same set as `台積電`. Useful for cross-region inbound traffic, but means a user query in mixed SC/TC still works.
- **Ticker references inside article body**: TW stocks use the format `(NNNN-TW)` or `(NNNNN-TW)` (4 or 5 digits + suffix), US stocks `(TICKER-US)`. ETFs use the same 4-5-digit + `-TW` pattern. **However**, plain text like `(2330)` (no suffix) also appears in some 公告 articles — these are less reliable. Always prefer the `<a href="">` inline-ticker-link extraction over regex over prose.
- **Opinion vs news boundary is real and observable** — Cnyes hosts content from 投顧 (investment-advisory firms: 摩爾投顧, 凱基投顧, etc.) under the same article infrastructure as its newsroom. The `signature` field is the reliable boundary marker. Mis-categorising 摩爾投顧's bullish/bearish stock pick as a Cnyes news factual claim is a silent integrity failure — the honesty layer in Step 7 prevents this.
- **The `/search?q=` route on `news.cnyes.com` (vs `www.cnyes.com/search/news?keyword=`) is the same data, different UI**. Both render server-side. The `news.cnyes.com/search` page is richer (category badges, tag chips, longer snippets); the `www.cnyes.com/search/news` page is compact. For browser-fallback extraction prefer `news.cnyes.com/search?q=`.
- **`news.cnyes.com/news/{id}` (no `/id/`) redirects to `/news/id/{id}`** — both URLs end at the same canonical page. Don't try to "normalise" the URL by stripping `/id/`; the inverse direction also works (Cnyes' homepage links use both forms inconsistently).
- **Cookie-consent overlay** on first visit ("為優化網站服務，鉅亨網使用Cookie…"). It does **not** block markdown extraction or fetch — but if you do drive a browser session with screenshots in mind, click `button: 繼續使用` to clear it before the user-visible screenshot.
- **Subscription-gated content** (`/anuestore`, `鉅亨買 768`, premium 雜誌 issues) — articles in the `mag` category or under `https://www.cnyes.com/anuestore` may show a paywall card on the HTML page. The search API still returns title + snippet for these, but the full body in the HTML page is truncated. Mark these as `paywalled: true` in output.

## Expected Output

The skill emits one JSON envelope per query. All `evidence_class` and `confidence` qualifiers required by the honesty layer (Step 7) are present.

```json
{
  "query": "台積電",
  "method_used": "api",
  "endpoint": "https://api.cnyes.com/media/api/v1/search/news?q=%E5%8F%B0%E7%A9%8D%E9%9B%BB&page=1",
  "fetched_at_utc": "2026-05-22T02:15:16Z",
  "fetched_at_taipei": "2026-05-22 10:15 (Asia/Taipei, UTC+8)",
  "total_hits": 2817,
  "returned": 5,
  "page": 1,
  "last_page": 141,
  "results": [
    {
      "newsId": 6466886,
      "url": "https://news.cnyes.com/news/id/6466886",
      "title": "算力軍備到來！馬斯克砸千億美元建TeraFab ASML訂單排到2029年",
      "published_at_utc": "2026-05-22T01:30:06Z",
      "published_at_taipei": "2026-05-22 09:30",
      "byline": "鉅亨網新聞中心",
      "category_name": "美股雷達",
      "category_slug": "us_stock",
      "evidence_class": "fact",
      "snippet": "EUV 訂單，已排給台積電 (TSM-US)(2330-TW)、三星電子…",
      "keywords": ["ASML", "TeraFab", "特斯拉", "晶片", "算力"],
      "related_tickers": [
        {"ticker": "TSM",  "market": "US", "confidence": "fact"},
        {"ticker": "2330", "market": "TW", "confidence": "fact"},
        {"ticker": "ASML", "market": "US", "confidence": "fact"},
        {"ticker": "TSLA", "market": "US", "confidence": "fact"}
      ],
      "cover_image": "https://cimg.cnyes.cool/prod/news/6466886/l/e4b6c92c6404bac723b084d9e14d3067.jpg",
      "paywalled": false,
      "summary_zh_tw": "ASML 執行長證實已與馬斯克就 TeraFab 半導體計畫直接溝通；該項目由特斯拉、SpaceX、xAI 共同發起，落腳德州，初始投資 550 億美元、遠期最高 1,190 億美元，鎖定 2 奈米以下製程。ASML EUV 訂單已排至 2029 年，由台積電、三星、Intel 共享。",
      "summary_confidence": "fact",
      "market_impact": {
        "direction": "positive_for_ASML_TSM_supply_chain",
        "confidence": "inferred",
        "rationale": "Article reports a long-dated demand commitment from a new high-spending fab buyer; sentiment label is derived, not stated."
      }
    }
  ],
  "disclaimer_zh_tw": "本資料僅整理鉅亨網公開新聞與分析內容，不構成投資建議。市場影響欄位為自動推論，可能有誤；請以原始報導為準並洽合格理財顧問。"
}
```

### Outcome shape — keyword has no hits

```json
{
  "query": "this-is-definitely-not-a-real-keyword-zzz",
  "method_used": "api",
  "fetched_at_utc": "2026-05-22T02:15:16Z",
  "total_hits": 0,
  "returned": 0,
  "results": [],
  "fallback_suggested": "site:cnyes.com OR site:news.cnyes.com \"<keyword>\""
}
```

### Outcome shape — single-article dereference (step 4 only)

```json
{
  "newsId": 6466886,
  "url": "https://news.cnyes.com/news/id/6466886",
  "title": "算力軍備到來！馬斯克砸千億美元建TeraFab ASML訂單排到2029年",
  "published_at_taipei": "2026-05-22 09:30",
  "byline": "鉅亨網新聞中心",
  "category_breadcrumb": ["美股", "美股雷達"],
  "category_slug": "us_stock",
  "body_zh_tw": "在比利時安特衛普 5 月 15 日一場半導體活動上，ASML(ASML-US) 執行長 Christophe Fouquet 向《路透社》確認了一件事…(full Traditional-Chinese body)",
  "body_word_count_zh": 1834,
  "related_tickers_inline": [
    {"ticker": "ASML", "market": "US", "first_offset_chars": 47, "confidence": "fact"},
    {"ticker": "TSLA", "market": "US", "first_offset_chars": 312, "confidence": "fact"},
    {"ticker": "TSM",  "market": "US", "first_offset_chars": null, "confidence": "fact"},
    {"ticker": "2330", "market": "TW", "first_offset_chars": null, "confidence": "fact"}
  ],
  "tags": ["ASML", "TeraFab", "特斯拉", "晶片", "算力"],
  "evidence_class": "fact",
  "key_facts": [
    {"claim": "ASML 執行長 Christophe Fouquet 已與馬斯克就 TeraFab 進行直接溝通", "confidence": "fact"},
    {"claim": "SpaceX 提交的德州 Grimes 廠區備案文件揭露初始投資 550 億美元、遠期最高 1,190 億美元", "confidence": "fact"},
    {"claim": "目標製程為 2 奈米及以下", "confidence": "fact"}
  ],
  "key_inferences": [
    {"claim": "對台積電、三星、Intel 等已下單 EUV 客戶為中性偏正面（新訂單抬升 ASML 訂單能見度至 2029）", "confidence": "inferred"}
  ],
  "paywalled": false,
  "disclaimer_zh_tw": "本資料僅整理鉅亨網公開新聞內容，不構成投資建議。"
}
```

### Outcome shape — paywalled / truncated article

```json
{
  "newsId": 6466346,
  "url": "https://news.cnyes.com/news/id/6466346",
  "title": "520行情vs.最牛台股",
  "category_slug": "mag",
  "evidence_class": "opinion",
  "paywalled": true,
  "snippet_available": true,
  "body_available": false,
  "snippet_zh_tw": "(API snippet only — article body requires Cnyes 雜誌 訂閱 subscription)",
  "next_step": "Surface title + snippet + URL to user; do NOT attempt to bypass paywall.",
  "disclaimer_zh_tw": "此為訂閱內容，僅能提供標題與摘要。"
}
```
