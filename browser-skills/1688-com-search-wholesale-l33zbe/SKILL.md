---
name: 1688-com-search-wholesale-l33zbe
title: 1688.com Wholesale Product Search
description: >-
  Search 1688.com (Alibaba's China-domestic wholesale platform) by keyword and
  return structured offers — title, CNY wholesale price, MOQ, supplier name +
  location, recent-transaction count, and canonical offer URL. Supports
  price-range, supplier-province, and sort filters. Headed browsers are
  hard-blocked at IP level (cloud_ip_bl); the recommended path is the mtop JSON
  API at h5api.m.1688.com with md5-signed requests.
website: 1688.com
category: wholesale
tags:
  - wholesale
  - '1688'
  - alibaba
  - china
  - sourcing
  - mtop
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Not viable from Browserbase. Every navigation to s.1688.com / m.1688.com /
      detail.1688.com over a Browserbase IP — verified across
      --verified+--proxies, --verified alone, and --proxies alone — is
      hard-redirected to bixi.alicdn.com/punish with action=deny and cloud_ip_bl
      tag. No captcha to solve. Browser fallback is documented for runtimes that
      have access to a non-Browserbase residential egress, but agents running on
      Browserbase cannot use it.
  - method: hybrid
    rationale: >-
      Useful when you already have a Browserbase session warmed: navigate to
      https://h5.m.1688.com/ (the only un-punished *.1688.com origin reachable
      from Browserbase) and run the signed-mtop fetch from that page context.
      document.cookie is visible there, so the _m_h5_tk bootstrap + signed call
      work in one async IIFE.
verified: true
proxies: true
---
# 1688.com Wholesale Product Search

## Purpose

Given a keyword (Chinese strongly preferred; English works but returns sparser hits because 1688's corpus is Mandarin), return the first page of wholesale offers from `s.1688.com` — title, lowest-tier wholesale price in CNY, MOQ + unit, supplier company name, supplier `<province> <city>` location, recent-transaction count, and the canonical `detail.1688.com/offer/{offerId}.html` URL. Supports the platform's price-range, supplier-region (`province=`), and sort-order filters. **Read-only** — never click `加入进货车` / `立即下单` / contact-supplier buttons.

## When to Use

- Sourcing-research agents comparing wholesale prices for the same SKU across multiple suppliers.
- China-domestic-procurement workflows enriching a BOM with current CNY wholesale costs and MOQs.
- Cross-checking Alibaba.com (English-export) prices against 1688.com (China-domestic) prices for the same supplier — the same supplier company is often listed on both at very different unit prices.
- Anywhere a workflow needs structured product metadata from 1688 search results without booking, contacting, or transacting.

## Workflow

1688's PC search page (`s.1688.com/selloffer/offer_search.htm`) is a thin React/Stagehand shell that hydrates from a single `mtop` JSON call to `h5api.m.1688.com`. **Headed browsers cannot reach the search UI** — every Browserbase IP (data-center and residential-proxy alike) is on Alibaba's `cloud_ip_bl` blocklist and gets terminal-action `deny` redirects to `bixi.alicdn.com/punish/...` with no captcha to solve (see Site-Specific Gotchas). The only working path is calling the mtop endpoint directly with a proper md5 sign — that endpoint is *not* punished and accepts requests over both `browse cloud fetch --proxies` and from a Browserbase session sitting on the un-punished `h5.m.1688.com` origin.

### Recommended path — mtop API (signed)

The same JSON endpoint that the PC search shell fires after mount. Method: `mtop.relationrecommend.WirelessRecommend.recommend`, with `appId='32517'` (PC offer search) and a stringified `params` object carrying the search parameters.

**Step 1 — Bootstrap the `_m_h5_tk` token.** Call the endpoint once with a dummy `sign` to get back `Set-Cookie: _m_h5_tk=<token>_<expiry-ms>` and `_m_h5_tk_enc=...`. The body returns `FAIL_SYS_TOKEN_EMPTY::令牌为空` — that's expected; you only care about the cookies.

```
GET https://h5api.m.1688.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/
    ?jsv=2.5.1
    &appKey=12574478
    &t=<ms-epoch>
    &sign=x
    &api=mtop.relationrecommend.WirelessRecommend.recommend
    &v=2.0
    &data=%7B%7D
```

**Step 2 — Compute the sign for the real call.**

```
token  = <part before "_" in the _m_h5_tk cookie>
t      = <fresh ms-epoch>
appKey = "12574478"
data   = JSON.stringify({
  "appId": "32517",
  "params": JSON.stringify({
    "keywords":             "<UTF-8 keyword>",
    "beginPage":            1,
    "pageSize":             20,         // observed range 10–60
    "method":               "getOfferList",
    "verticalProductFlag":  "pcmarket",
    "searchScene":          "pcOfferSearch",
    "charset":              "GBK",
    // --- optional filter fields, omit if unused ---
    "priceStart":           "<min CNY>",     // string, e.g. "1.5"
    "priceEnd":             "<max CNY>",     // string, e.g. "20"
    "province":             "<中文省份>",    // e.g. "广东", "浙江"
    "sortType":             "<sort>"         // see table below
  })
})
sign   = md5(token + "&" + t + "&" + appKey + "&" + data)   // lowercase hex
```

Sort values verified from page traffic:

| `sortType` | Meaning |
|---|---|
| `""` / omitted | Popularity / relevance (default) |
| `"price-asc"` | Wholesale price ↑ |
| `"price-desc"` | Wholesale price ↓ |
| `"booked"` | Transaction count (30-day) ↓ |
| `"newOffer"` | Newest first |

**Step 3 — Make the signed call** with both `_m_h5_tk` and `_m_h5_tk_enc` cookies in `Cookie:`:

```
GET https://h5api.m.1688.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/
    ?jsv=2.5.1
    &appKey=12574478
    &t=<t from sign>
    &sign=<md5 from sign step>
    &api=mtop.relationrecommend.WirelessRecommend.recommend
    &v=2.0
    &data=<URL-encoded data from sign step>
Cookie: _m_h5_tk=<full>; _m_h5_tk_enc=<full>
```

Response is JSON with `ret: ["SUCCESS::调用成功"]` and `data.data.offerList[]` (wrapped — the `params` is parsed by the recommend service and the `getOfferList` response is returned inline). Top-level errors are returned in `ret[0]` as `FAIL_<X>::<message>`.

**Step 4 — Decode each offer.** Per-offer fields (observed key set on `data.data.offerList[i]`):

| Skill output field | mtop path |
|---|---|
| `title` | `subject` (sometimes `title`) — strip newlines and HTML highlight tags `<font>` |
| `price_cny` | `priceInfo.price` (string CNY) or lowest of `priceInfo.priceRange[]` |
| `moq` | `tradeInfo.moq` (or `tradeInfo.minOrderQuantity`) + `tradeInfo.unit` (件/箱/双/kg/米) |
| `supplier_name` | `company.name` (Chinese, usually ends `有限公司`) |
| `supplier_location` | `company.province` + " " + `company.city` (or `address` for the joined string) |
| `transaction_count` | `tradeInfo.tradeNumber` (raw int — "近30天成交X件") or `monthSold` |
| `url` | `https://detail.1688.com/offer/${offerId}.html` (offerId = `id` or `offerId` field) |
| `is_certified` | `feMapping.memberTagIds.isShiliDangKou` (实力商家) OR `marketOfferTag.isShiliDangKou` OR `company.tagIds` contains `3910593` |

Field shapes may vary slightly across the AB-test buckets 1688 routes through; iterate the live response keys defensively rather than assuming the strict map above.

**Step 5 — Total result count + pagination.** `data.data.totalCount` (integer). To paginate, repeat steps 2–4 with `beginPage: 2,3,...`. Page-size hard cap appears to be 60.

### How to actually execute the protocol

Two viable transports — pick based on whether you already have a Browserbase session:

**A. From a Browserbase session on `h5.m.1688.com`** (cheapest if you already have a session warmed):

```bash
SID=$(browse cloud sessions create --keep-alive --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"

# Land on a non-punished origin so document.cookie works for *.1688.com.
browse open "https://h5.m.1688.com/" --remote
# Page loads to "页面不存在" (404 notfound.html) — that's fine, the origin is set
# and the punish service does not fire here.

# Inject blueimp-md5, bootstrap the token, then run the signed call.
# IMPORTANT: do everything in ONE `browse eval` invocation — splitting across
# multiple evals causes `browse stop` to lose the page and `document.cookie`
# starts throwing `Access is denied` from about:blank.
browse eval --remote "$(cat scripts/fetch-offers.js)"
```

`scripts/fetch-offers.js` (single async IIFE — see Site-Specific Gotchas for why this must be one round-trip):

```javascript
(async () => {
  // 1. Load md5
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  // 2. Bootstrap token cookie
  await fetch('https://h5api.m.1688.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.5.1&appKey=12574478&t='+Date.now()+'&sign=x&api=mtop.relationrecommend.WirelessRecommend.recommend&v=2.0&data=%7B%7D', { credentials: 'include' });
  await new Promise(r => setTimeout(r, 300));
  const token = document.cookie.match(/_m_h5_tk=([^;]+)/)[1].split('_')[0];
  // 3. Sign
  const t = Date.now(), appKey = '12574478';
  const params = JSON.stringify({ keywords: '<KEYWORD>', beginPage: 1, pageSize: 20, method: 'getOfferList', verticalProductFlag: 'pcmarket', searchScene: 'pcOfferSearch', charset: 'GBK' });
  const data = JSON.stringify({ appId: '32517', params });
  const sign = md5(token + '&' + t + '&' + appKey + '&' + data);
  // 4. Call
  const url = 'https://h5api.m.1688.com/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/?jsv=2.5.1&appKey=' + appKey + '&t=' + t + '&sign=' + sign + '&api=mtop.relationrecommend.WirelessRecommend.recommend&v=2.0&data=' + encodeURIComponent(data);
  const r = await fetch(url, { credentials: 'include' });
  return await r.json();
})()
```

**B. Out-of-band via your own HTTP client + a residential proxy** (slightly faster if you have a clean proxy already; not via `browse cloud fetch` because it doesn't support custom `Cookie:` headers):

Use any HTTP library (node `fetch` + `https-proxy-agent`, Python `requests` via SOCKS, etc.) routed through a *residential* proxy. Make the two-step token-then-signed-call dance with a cookie jar persisting `_m_h5_tk` and `_m_h5_tk_enc` between requests. Set `Referer: https://www.1688.com/` and `Origin: https://www.1688.com` to avoid `FAIL_SYS_ILLEGAL_ACCESS::非法请求`. **Do not** route through `browse cloud fetch` for the second call — it cannot set the `Cookie:` header so the sign-vs-token binding fails.

### Browser fallback

There is **no working browser fallback today** from Browserbase. Every navigation to `s.1688.com`, `m.1688.com`, or `detail.1688.com` over a Browserbase IP returns the `bixi.alicdn.com/punish/...&action=deny&qrcode=...&cloud_ip_bl` page — a *terminal* block, not a captcha (no slider, no checkbox, no rotating image — the action verb is `deny`, not `verify`). A user running this skill from a clean residential network *can* drive the search UI normally; agents cannot. If your runtime has an alternative residential-egress option besides Browserbase, the conventional browser path is:

1. `https://s.1688.com/selloffer/offer_search.htm?keywords=<urlencoded>&priceStart=<min>&priceEnd=<max>&province=<urlencoded-中文>&sortType=<sort>` — direct URL.
2. `browse wait load` then `browse wait timeout 3000` (the `offerresultData` block populates after a follow-up XHR fires `mtop.relationrecommend.WirelessRecommend.recommend` with `appId=32517` — same call as the API path).
3. `browse eval "JSON.stringify(window.data?.offerresultData?.offerList || [])"` to grab the hydrated state without parsing the rendered grid.
4. Per-card extraction via the same `offerList[i]` schema above.

## Site-Specific Gotchas

- **Browserbase IPs are on Alibaba's `cloud_ip_bl` blocklist — confirmed for headed browsers, all stealth combinations.** Verified 2026-05-20 with three configurations: `--verified --proxies`, `--verified` only, `--proxies` only. Every `browse open` against `s.1688.com / m.1688.com / detail.1688.com / www.alibaba.com` lands on `bixi.alicdn.com/punish/punish:resource:template:cbuSpace:default_38604715.html?...&cloud_ip_bl|0&action=deny`. The `action=deny` is **terminal** — there is no captcha, slider, or verify flow. Curling Alibaba.com via `--proxies` returns the Akamai `Bxpunish: 1` headered HTML loading `sufei-punish/0.1.122/build/main.css` — same block, different CDN. *Do not waste iterations trying to drive the search UI via a Browserbase session.*
- **`h5api.m.1688.com` is NOT punished — this is the load-bearing exception.** The mtop JSON host is on a separate infra path from the HTML edges and accepts Browserbase-IP traffic. Verified by hitting it with both `browse cloud fetch --proxies` (returned `ret:["FAIL_SYS_TOKEN_EMPTY"]` after issuing `_m_h5_tk`) and page-context `fetch()` from a Browserbase session on `h5.m.1688.com`.
- **`h5.m.1688.com` is the only `*.1688.com` origin reachable from Browserbase.** `h5.m.1688.com/` itself 302-redirects to `h5.m.1688.com/wingdev/notfound.html` ("页面不存在" / page-not-found shell) but the navigation completes cleanly — no punish redirect. Use it as the JS execution origin for cookie-jar-bound mtop calls. `h5.m.1688.com/page/offerlist.html` returns its own 404 too. There is no productive UI here; the value is the un-punished same-origin context.
- **`browse cloud fetch --proxies` returns 200 OK shell HTML for `s.1688.com/selloffer/offer_search.htm`, but the shell contains NO offer data.** All product rows are hydrated client-side from the mtop call. Searching the shell for `offerresultData`, `offerList`, `totalCount`, `getOfferList` finds *string references* in JS code — never the actual array. The shell is useful only for sniffing `appKey`, `appId`, and the method name; it's not a viable extraction surface.
- **`browse cloud fetch` doesn't support custom `Cookie:` headers, which blocks the signed mtop call from running over that transport.** The mtop sign is bound to the `_m_h5_tk` cookie; without sending it back on the signed call, you get `FAIL_SYS_ILLEGAL_ACCESS::非法请求`. The protocol requires a real cookie jar. Use page-context `fetch()` from a Browserbase session (transport A above) or an out-of-band HTTP client with cookie support routed through a residential proxy (transport B).
- **`browse eval` must do the whole protocol in one async IIFE.** Splitting bootstrap-token / sign / call across multiple `browse eval` invocations causes intermittent `StagehandEvalError: Failed to read the 'cookie' property from 'Document': Access is denied` because the browse daemon sometimes parks the active target back to `about:blank` between calls, and `about:blank` is a different (sandboxed) origin from `h5.m.1688.com` so the cookie jar isn't visible. Also: large eval result payloads (the full offer list JSON, ~50-200KB) frequently trigger `Error: Timed out waiting for driver daemon session "<sid>"` — write the body to `window.__result` and pull it back in a separate eval that returns only `window.__result` rather than streaming the whole thing through the eval return channel.
- **Token has a ~5400s lifetime** (`Max-Age=5400` on `Set-Cookie`). One token issuance covers up to ~90 minutes of search calls. Cache `_m_h5_tk` + `_m_h5_tk_enc` and only re-bootstrap when the next signed call returns `FAIL_SYS_TOKEN_EMPTY` or `FAIL_SYS_TOKEN_EXOIRED`/`FAIL_SYS_ILLEGAL_ACCESS`.
- **`charset: "GBK"` is correct even though the JSON body is UTF-8.** This is a 1688 quirk — the PC search service tags the result-set ranking pipeline with GBK because legacy Chinese consumers run on GBK pages. Sending `"UTF-8"` returns 200 but with degraded relevance. Mirror the value the PC shell sends.
- **`appId="32517"` is PC offer search; mobile offer search uses a different `appId`.** Inferred from the in-page constant `requestCode: 32517_search_offer_getOfferList`. Don't change it unless you've verified an alternative against live traffic.
- **`appKey="12574478"` is the H5 PC token-issuing app key.** Mobile h5 web pages use the same `appKey`. Confirmed by both reading the page shell and reproducing the token-issue handshake (token returned, cookies set as expected).
- **English keywords work but return junky results.** 1688's corpus is Chinese. "phone case" returns ~10 results; `手机壳` returns ~1.2M. Always machine-translate the user's English keyword to Chinese before searching (`OpenAI: translate the search term to simplified Mandarin retail-product naming convention, return only the term`), keep the original as a fallback if the Chinese hits 0.
- **Province filter expects the Chinese two-character form, not pinyin.** `province=广东` ✓, `province=guangdong` returns no province scoping. URL-encode UTF-8 bytes when passing through query strings (`%E5%B9%BF%E4%B8%9C` for `广东`).
- **`priceStart` / `priceEnd` are strings, not numbers, and represent CNY.** Sub-yuan values are valid (`"0.5"`). When `priceEnd` is omitted, no upper bound is applied.
- **The recommend wrapper returns nested status.** `ret[0]` is the outer mtop status (`SUCCESS::调用成功` even when the inner `params.method=getOfferList` returns 0 results). To distinguish "API succeeded but 0 hits" from "API call failed", check `data.data.totalCount` and `data.data.offerList.length`. An empty offer list with `totalCount: 0` is a valid empty result; `ret[0]` starting with `FAIL_` is a transport failure.
- **`bbb-skills/browser-trace` returns empty CDP events when used against a Browserbase session that's immediately walled** (`totalEvents: 9` with only `Page.frameAttached`/`Page.lifecycleEvent` and no `Network.responseReceived` for the target URL). This is a side-effect of the punish redirect happening before the CDP tracer attaches its observer domains. For debugging, take a screenshot of the landed URL rather than relying on the network trace.
- **Don't curl the search URL from the sandbox directly.** Vercel sandbox egress can't DNS-resolve `*.1688.com` and `h5api.m.1688.com` (verified — `curl: Could not resolve host`). All requests must go through `browse cloud fetch` or `browse cloud sessions`.

## Expected Output

Three distinct outcome shapes:

**Success:**

```json
{
  "success": true,
  "keyword": "手机壳",
  "filters_applied": {
    "priceStart": "1.0",
    "priceEnd": "20",
    "province": "广东",
    "sortType": "booked"
  },
  "search_url": "https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%89%8B%E6%9C%BA%E5%A3%B3&priceStart=1.0&priceEnd=20&province=%E5%B9%BF%E4%B8%9C&sortType=booked",
  "total_results": 1234567,
  "page_size": 20,
  "results": [
    {
      "title": "新款 透明硅胶手机壳 适用于iphone15 防摔保护套 全包边",
      "price_cny": 1.85,
      "moq": "10 件",
      "supplier_name": "深圳市华强北科技有限公司",
      "supplier_location": "广东 深圳",
      "transaction_count": 5823,
      "transaction_label": "近30天成交",
      "url": "https://detail.1688.com/offer/636858321032.html",
      "is_certified": true
    }
  ]
}
```

**Empty (valid keyword, zero matches — usually English keyword or over-restrictive filters):**

```json
{
  "success": true,
  "keyword": "spelaeonomicus",
  "filters_applied": { "priceStart": null, "priceEnd": null, "province": null, "sortType": null },
  "search_url": "https://s.1688.com/selloffer/offer_search.htm?keywords=spelaeonomicus",
  "total_results": 0,
  "page_size": 20,
  "results": []
}
```

**Anti-bot wall (only emitted if the agent attempted the browser fallback and hit `cloud_ip_bl`):**

```json
{
  "success": false,
  "reason": "anti_bot_wall",
  "wall_type": "cloud_ip_bl_punish_deny",
  "wall_url": "https://bixi.alicdn.com/punish/punish:resource:template:cbuSpace:default_38604715.html?...&action=deny&...&cloud_ip_bl|0",
  "remediation": "The mtop API path documented in Workflow does not trigger this wall. Use that path instead of driving the search UI."
}
```
