---
name: amazon-in-browse-products-bbcv7y
title: Amazon.in Product Search
description: >-
  Search amazon.in for a product query and return the first results page —
  title, ASIN, INR price, rating, rating count, sponsored flag, and canonical
  /dp URL. Read-only; HTTP-fetch led with a browser fallback.
website: amazon.in
category: ecommerce
tags:
  - ecommerce
  - amazon
  - product-search
  - india
  - read-only
  - scraping
source: 'browserbase: agent-runtime 2026-06-04'
updated: '2026-06-04'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      When the HTTP fetch is served a persistent captcha/robot check, drive a
      --verified --proxies Browserbase session, pull `browse get html body`
      once, and run the same regex parser. ~100x more expensive (~$8/run, hit
      max_turns in testing) and the a11y/snapshot path is unusable, so only a
      last resort.
verified: false
proxies: true
---
# Amazon.in Product Search

## Purpose

Given a product search query (keyword or phrase), search amazon.in and return the first results page's products — each with title, ASIN, price (INR), star rating, rating count, a sponsored/organic flag, and the canonical `/dp/<ASIN>` URL. Read-only: never signs in, adds to cart, or purchases.

## When to Use

- "What wireless earphones / running shoes / <product> show up on Amazon India for <query>?"
- Price / rating monitoring of the first results page for a keyword over time.
- Bulk catalog extraction across many queries — the HTTP path is cheap enough to run at scale.
- Anywhere you'd otherwise drive a headless browser over amazon.in search. The rendered HTML is fully server-side, so a single HTTP GET returns everything; scripted browsing is ~100× more expensive and far less reliable here (see gotchas).

## Workflow

amazon.in serves the **search results page fully server-rendered** — the product grid, prices, ratings, and ASINs are all present in the initial HTML response with no client-side hydration required. A single authenticated HTTP GET through a residential proxy returns the complete page; you parse it with regex/HTML selectors. **Lead with the HTTP-fetch path.** Driving a real browser works as a fallback but burns ~$8/run and 30 turns because amazon.in's a11y tree is too large to snapshot and `browse get html <selector>` returns only the first match (see Browser fallback + gotchas).

### 1. Fetch the results page (recommended — HTTP)

```bash
QUERY="wireless earphones"
ENC=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]).replace(/%20/g,'+'))" "$QUERY")
browse cloud fetch "https://www.amazon.in/s?k=$ENC" --proxies > /tmp/amz.json
```

- Use `https://www.amazon.in/s?k=<query>`. Spaces → `+` (or `%20`; both work).
- `--proxies` routes through a residential IP. A bare datacenter fetch *often* succeeds too, but amazon.in intermittently serves a "Enter the characters you see" robot check to datacenter IPs — proxies make the path reliable. The response sets `i18n-prefs=INR` and `Content-Language: en-IN`, so prices come back in INR by default.
- Response is a JSON envelope: `{ statusCode, headers, content }`. The `content` field is the full HTML (~1.8 MB).

### 2. Confirm the page is real, not a block

```bash
node -e '
const o=JSON.parse(require("fs").readFileSync("/tmp/amz.json","utf8"));
const h=o.content||"";
if(/captcha|Enter the characters you see|To discuss automated access|Robot Check/i.test(h)){
  console.log(JSON.stringify({success:false,error_reasoning:"robot/captcha check served"})); process.exit(0);
}
console.log("results:", (h.match(/data-component-type="s-search-result"/g)||[]).length);
'
```

### 3. Parse products

Iterate over the organic result blocks. Each is a `<div data-component-type="s-search-result" data-asin="...">`. Split the HTML on that marker, then per block extract:

| Field | Source pattern (within a block) |
|---|---|
| `asin` | `data-asin="([A-Z0-9]{10})"` |
| `title` | text inside the block's `<h2>…</h2>` (strip inner tags); fallback to the product link's `aria-label` |
| `price_inr` | `<span class="a-price-whole">([\d,]+)</span>` → strip commas → Number |
| `rating` | `(\d(?:\.\d)?) out of 5 stars` |
| `rating_count` | `aria-label="([\d,]+) ratings?"` (the count lives in the rating-link's aria-label, **not** inline text) |
| `sponsored` | block contains `Sponsored`, an `aax-eu` ad-redirect href, or `sbx_s_sparkle` |
| `url` | construct `https://www.amazon.in/dp/<asin>` |

Reference parser (validated against live HTML, 22/22 organic items parsed cleanly):

```javascript
const fs=require("fs");
const html=JSON.parse(fs.readFileSync("/tmp/amz.json","utf8")).content;
const re=/<div[^>]*data-component-type="s-search-result"[^>]*>/g;
const starts=[]; let m; while((m=re.exec(html))) starts.push(m.index);
const decode=s=>s.replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g," ");
const products=starts.map((s,i)=>{
  const b=html.slice(s, i+1<starts.length?starts[i+1]:html.length);
  const asin=(b.match(/data-asin="([A-Z0-9]{10})"/)||[])[1];
  const h2=b.match(/<h2[^>]*>(.*?)<\/h2>/s);
  let title=h2?decode(h2[1].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()):null;
  if(!title){const al=b.match(/<a[^>]*a-link-normal[^>]*aria-label="([^"]+)"/);if(al)title=decode(al[1]);}
  const pw=(b.match(/<span class="a-price-whole">([^<]+)<\/span>/)||[])[1];
  const rm=b.match(/(\d(?:\.\d)?) out of 5 stars/);
  let rc=(b.match(/aria-label="([\d,]+) ratings?"/)||[])[1];
  return {
    title, asin,
    price_inr: pw?Number(pw.replace(/[,\s]/g,"")):null,
    rating: rm?Number(rm[1]):null,
    rating_count: rc?Number(rc.replace(/,/g,"")):null,
    sponsored: /Sponsored|aax-eu|sbx_s_sparkle/i.test(b),
    url: asin?`https://www.amazon.in/dp/${asin}`:null
  };
}).filter(p=>p.asin);
console.log(JSON.stringify({success:true, query:"wireless earphones", result_count:products.length, products},null,2));
```

### 4. Emit JSON

Return the shape in **Expected Output**. Sponsored items appear interleaved with organic ones (typically 2–3 ad slots at the top + 1 sponsored-brand carousel); keep the `sponsored` flag so the consumer can filter.

### Browser fallback (only if the HTTP path is blocked)

If step 2 detects a captcha/robot check that persists across proxy retries, drive a real browser:

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.amazon.in/s?k=wireless+earphones" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse get html body --remote --session "$SID"   # then run the same regex parser on the returned HTML
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Use `browse get html body` (whole-page HTML) and parse it exactly like the fetch path — **do not** try to enumerate items via `browse snapshot` or per-item `browse get html <selector>`; both are dead ends here (see gotchas). A `--verified --proxies` session loads the page without a captcha.

## Site-Specific Gotchas

- **READ-ONLY.** Never click add-to-cart, sign-in, or buy. Stop at the results page.
- **The page is fully server-rendered** — everything (titles, prices, ratings, ASINs) is in the initial HTML. No need to wait for JS, no XHR to chase. A single `browse cloud fetch` gets the whole grid.
- **`--proxies` is the reliability lever, not `--verified`.** Bare datacenter fetches returned 200 with full results in testing, but amazon.in is known to intermittently serve "Enter the characters you see" robot checks to datacenter IPs. Residential proxies make the HTTP path dependable. The fetch path has no `--verified` concept (that's a browser-session flag).
- **`browse snapshot` is unusable on amazon.in search.** The results DOM is enormous; in iter-1 every `browse snapshot` call errored/returned nothing actionable. Don't build the browser fallback around the accessibility tree.
- **`browse get html <selector>` returns ONLY the first matching element.** This is the single biggest browser-path trap — the inner agent burned 25+ turns (~$8) trying to enumerate per-item HTML with selectors like `.s-result-item[data-asin]` and got one element each time. In the browser fallback, always pull `browse get html body` once and parse the whole blob; never loop selectors.
- **`rating_count` is in an aria-label, not inline text.** It lives in the rating-link's `aria-label="9,667 ratings"`, not in a visible `<span>`. The visible underline-text span is often empty. Match the aria-label.
- **Sponsored slots are interleaved and use obfuscated class names.** The new amazon.in layout wraps cards in randomized `_c2Itd_*` CSS classes, so don't key on visual classes. The stable hooks are `data-component-type="s-search-result"` (organic result container) and `data-asin` (10-char ASIN). Sponsored items carry an `aax-eu...amazon.in` ad-redirect href and/or a `Sponsored` label and/or `sbx_s_sparkle` in the ref; flag them but don't drop them silently.
- **Prices are INR by default.** The response sets `i18n-prefs=INR` / `Content-Language: en-IN` cookies/headers without any locale handling on your part. `a-price-whole` is the rupee integer part (e.g. `1,399`); the fractional part is usually `.` (whole rupees).
- **A `/dp/<ASIN>` URL is the stable canonical product link.** The hrefs in the page are tracking-laden (`aax-eu-zaz.amazon.in/x/c/...` for ads, `/gp/aw/d/<ASIN>/?...` with query junk). Reconstruct `https://www.amazon.in/dp/<ASIN>` from the ASIN instead of trusting the raw href.
- **Result count varies per fetch.** The same query returned 14–22 organic blocks across fetches (Amazon rotates sponsored density and layout). The parser is count-agnostic — just take what's present.
- **The `browse` CLI prints an "Update available: 0.7.2 -> 0.8.2" notice to stderr** that occasionally got mis-parsed as command output in iter-1. Harmless for the fetch path; in the browser path, ignore that banner when reading results.

## Expected Output

```json
{
  "success": true,
  "query": "wireless earphones",
  "result_count": 14,
  "products": [
    {
      "title": "OnePlus Nord Buds 3r TWS Earbuds up to 54 Hours Playback, 2-mic Clear Calls, 3D Spatial Audio, 12.4mm Drivers, 47ms Low Latency - Aura Blue",
      "asin": "B0FMDLD86P",
      "price_inr": 1799,
      "rating": 4.3,
      "rating_count": 45267,
      "sponsored": false,
      "url": "https://www.amazon.in/dp/B0FMDLD86P"
    },
    {
      "title": "Fire-Boltt Aero TWS Earbuds Custom EQ, Wireless Bluetooth 5.4, 50H Playtime, 50ms Low Latency, IPX4 Waterproof - Black",
      "asin": "B0FM6B9Z45",
      "price_inr": 699,
      "rating": 3.8,
      "rating_count": 11163,
      "sponsored": true,
      "url": "https://www.amazon.in/dp/B0FM6B9Z45"
    }
  ],
  "error_reasoning": null
}
```

Blocked outcome (captcha/robot check served and not clearable):

```json
{
  "success": false,
  "query": "wireless earphones",
  "result_count": 0,
  "products": [],
  "error_reasoning": "robot/captcha check served (\"Enter the characters you see\") — retry via browser fallback with --verified --proxies"
}
```
