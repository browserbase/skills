---
name: fgk-chinatax-gov-cn-lookup-tax-regulation-90wo3h
title: Look Up Chinese Tax Law or Regulation
description: >-
  Find an authoritative Chinese tax law, regulation, departmental rule, or
  normative document from the State Taxation Administration's policy library
  (fgk.chinatax.gov.cn) and return its full text together with every
  defining/explaining document — parent statutes, official interpretations, Q&A,
  and version history — via the site's JSON API.
website: fgk.chinatax.gov.cn
category: legal-research
tags:
  - tax
  - china
  - regulation
  - law
  - government
  - compliance
  - finance
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      GET https://fgk.chinatax.gov.cn/search5/search/s for keyword/文号 search
      returns clean JSON; POST
      https://www.chinatax.gov.cn/queryManuscriptAssociation with id={articleId}
      returns the document plus all related interpretations, parent statutes,
      and Q&A. Both endpoints are CORS-open, unauthenticated, and return
      well-structured data — strictly faster and more complete than scraping the
      rendered search-results page (which renders almost nothing on first paint
      anyway).
  - method: browser
    rationale: >-
      Fallback only. The search-results page is heavily JS-driven and frequently
      leaves the body at ~109px scrollHeight on first paint, so screenshots are
      nearly blank. Detail pages render fine but you'd be reinventing what the
      related-docs API gives you for free.
verified: true
proxies: true
---
# Look Up Chinese Tax Law or Regulation (fgk.chinatax.gov.cn)

## Purpose

Look up an authoritative Chinese tax law, administrative regulation, departmental rule, normative document, or fiscal-tax notice from the State Taxation Administration's official policy & regulation library (国家税务总局政策法规库). Returns the full body text plus every defining-and-explaining document the regulation depends on — the upstream statute, downstream implementation rules, official interpretations (政策解读), policy Q&A (政策问答), operational guidance (政策指引), and previous versions (规章版本归集) — so the answer is complete rather than depending on a single article. Read-only.

## When to Use

- A finance / tax user asks "what does Chinese tax law say about X?" and you need the authoritative primary source, not a third-party summary.
- You need a specific document referenced by 文号 (document number, e.g. `财税〔2022〕13号`, `国家税务总局公告2018年第28号`, `国务院令第587号`).
- You need to verify the **current effectiveness** of a regulation (全文有效 / 已修改 / 全文失效 / 全文废止) before quoting it.
- You need the full text of a tax law (法律), administrative regulation (行政法规), departmental rule (税务部门规章), tax normative document (税务规范性文件), fiscal-tax document (财税文件), or State Council document (国务院文件).
- You need the official interpretation (政策解读) or Q&A (政策问答) that explains how a regulation is to be applied — these are published as *separate* documents from the regulation itself, which is why a single-document lookup is incomplete.

## Workflow

The recommended path is the JSON API, not scripted browsing. The site exposes two clean, CORS-open endpoints — one for keyword search, one for fetching a document plus everything that defines/explains it. Both return well-structured JSON. Use them directly.

1. **Search for the regulation by keyword or 文号** — `GET https://fgk.chinatax.gov.cn/search5/search/s` returns JSON.

   Minimum parameters:
   - `siteCode=bm29000002` (fixed — this site's code)
   - `searchWord={URL-encoded keyword or 文号}` — e.g. `%E5%A2%9E%E5%80%BC%E7%A8%8E` for 增值税 (VAT), or `%E8%B4%A2%E7%A8%8E%E3%80%942022%E3%80%9513%E5%8F%B7` for 财税〔2022〕13号
   - `pageNum=1`, `pageSize=10` (1-indexed; up to ~50 works)
   - `orderBy=5` (relevance — the default)
   - `uc=1`, `left_right_index=0` (boilerplate the site requires)

   Useful filter parameters:
   - `label={comma-separated document types}` — restrict to authoritative sources. The full vocabulary is `法律,行政法规,税务部门规章,税务规范性文件,财税文件,工作通知,国务院文件,其他文件,文字政策解读,政策问答,政策指引`. **For pure regulation lookup, use `label=法律,行政法规,税务部门规章,税务规范性文件,财税文件,国务院文件,工作通知,其他文件`** to exclude news/blog noise.
   - `column=政策法规` — top-level channel filter (政策法规 = Policy & Regulations).
   - `orderBy=1` to sort by publication date desc instead of relevance.

   The response is a large JSON envelope. The hits are at `searchResultAll.searchTotal[]`. Total match count is at `searchResultAll.total`.

   Per-hit fields you care about:
   - `title` — title with `<span>` highlight tags around matched chars. **Strip `<[^>]+>` to get plain text.**
   - `url` — canonical detail URL, shape `http://fgk.chinatax.gov.cn/zcfgk/c{channelCode}/c{articleId}/content.html`. Channel codes map to document types (`c100009`=法律, `c100010`=行政法规, `c100011`=税务部门规章, `c100012`=税务规范性文件, `c100013`=财税文件, `c100014`=工作通知, `c100015`=政策解读, `c100016`=政策问答, etc.) — do not hardcode them; trust the `url` field.
   - `pubDate` — publication date.
   - `pubName` — issuing authority (e.g. 国家税务总局, 财政部).
   - `govDoc.docNum` / `govDoc.docNo` / `govDoc.docType` — official document number (e.g. `国务院令第587号`).
   - `xxgk_effectLevel` — document type (法律, 行政法规, 税务部门规章, …).
   - **`xxgk_aging`** — current effectiveness: `全文有效` (fully effective), `已修改` (amended), `全文废止` (fully repealed), `全文失效` (expired), or empty. **Always check this before quoting — repealed regulations still appear in search results.**
   - `xxgk_taxPolicy` / `xxgk_son_taxPolicy` — JSON-stringified tax-category array (e.g. `["税费征管","税收政策"]`, `["增值税"]`).
   - `xxgk_formulatedYear` — year enacted.
   - `xxgk_abolishDate` — repeal date if applicable.
   - `shortContent` — ~500-char preview of the document body.
   - `downloadAppendix` — pipe/`яяяяя`-delimited list of attached files in shape `{filename}|{ext}|{absolute-url}`. Used for the official DOCX/PDF version.
   - `id` — composite id, but the **article id** for the related-docs lookup in step 3 is the second `c{n}` in `url`, e.g. `5238560` from `/zcfgk/c100011/c5238560/content.html`.

   The response also has aggregations under `searchResultAll`: `effectLevelList` / `labelList` (document-type histogram), `agingList` (effectiveness histogram), `taxPolicyList[].sonDatas` (tax-category histogram), `formulatedYearList` (year histogram). Useful for narrowing a noisy query.

2. **Fetch the full body of each promising hit** — the `url` returned in step 1 already serves a complete HTML article (clean static page, no auth, no JS gating). Fetch it with any HTTP client.

   For machine-readable content prefer the related-docs endpoint in step 3 — it returns the document's `contentHtml` field as structured JSON alongside attachments and breadcrumb metadata, which is friendlier to parse than scraping the rendered page.

3. **CRITICAL — fetch everything that defines and explains the regulation.** The task prompt is explicit: *"the tax law/regulations might be defined and explained in different documents, you will never forget to check all the details from them."* This is what the related-docs API exists for. Do not skip this step.

   `POST https://www.chinatax.gov.cn/queryManuscriptAssociation`
   `Content-Type: application/x-www-form-urlencoded`
   Body: `id={articleId}` — the article id from step 1 (e.g. `5238560`).

   Response shape: `{ code:200, results:{ data:{ total:2, results:[ <currentDoc>, <associations> ] } } }`
   - `results[0]` — the current document itself, fully expanded:
     - `contentHtml` — the complete document body as HTML (preferred over scraping the rendered page).
     - `resList[]` — attached files (DOCX, PDF) with `fileName` + `url` (resolve relative to `https://fgk.chinatax.gov.cn` if path-relative).
     - `channel[]` — breadcrumb (e.g. `政策法规文件 / 税务部门规章`).
     - `title`, `subTitle`, `publishedTimeForDate`, `keywords`, `keyword`.
   - `results[1]` — associations (the "different documents" the task prompt warns about):
     - **`policyDocument[]`** — upstream/parent statutes the current document cites or implements. Each item: `{ title, url, effectlevel, writtentext (文号), aging }`. **Recurse into each — these are the laws/regulations the current document is *defined by*.**
     - **`policyInterpretation[]`** — official interpretations (政策解读) of the current document. Each: `{ title, url }`. **Always fetch these — they are how STA explains what the regulation means in practice.**
     - **`policyQA[]`** — official Q&A documents (政策问答) keyed off the current document. Each: `{ title, url }`. Fetch these for edge-case rulings.
     - `policyGuidance[]` — operational guidance documents (政策指引). Fetch if the user asks "how to apply".

4. **Optional — fetch version history for departmental rules and laws.** When `effectLevel` is 法律, 行政法规, or 税务部门规章, those documents have versioned amendments. Call the same endpoint with `id=policyFile_{articleId}` instead of `id={articleId}`. Response `results[0].policyFile[]` lists every version with `writtenDate`, `title`, `aging`, and `url`. Use this to surface "the version effective on date X" rather than just the latest.

5. **Compose the answer.** Return at minimum:
   - The primary regulation (title, 文号, issuing authority, publication date, current effectiveness, full body text or relevant article excerpts).
   - The cited upstream laws from `policyDocument[]` (title + 文号 + url, recursed if the user's question depends on the upstream rule).
   - At least one official interpretation from `policyInterpretation[]` if it exists, summarised.
   - The relevant Q&A from `policyQA[]` if any directly answer the user's scenario.
   - A note on effectiveness — never quote a repealed (`全文废止` / `全文失效`) regulation without flagging it; if `已修改`, point the user at the current version via the version-history endpoint.

### Browser fallback

If your HTTP stack can't reach the API (network policy, proxy issues), use a stealth browser session — the site is on a CDN that occasionally throttles bare HTTP from unusual ASNs and the JSON API requires no anti-bot bypass when called via residential proxy.

1. `browse cloud sessions create --keep-alive --verified --proxies` then `browse open https://fgk.chinatax.gov.cn --remote --session $sid`.
2. `browse fill --remote --session $sid '#header-search-txt' '{query}'` then `browse press --remote --session $sid 'Enter'`. The page redirects to `https://fgk.chinatax.gov.cn/search5/html/searchResult.html?siteCode=bm29000002&searchWord=…`.
3. **The search-results page is heavily JS-driven** and renders results into a body that often measures `scrollHeight: 109` on first paint — visible screenshots come back nearly empty. Either wait 10+ seconds and force a `window.dispatchEvent(new Event('resize'))`, or skip the rendered page entirely and call the underlying API via `browse eval`: `fetch('/search5/search/s?siteCode=bm29000002&searchWord=…').then(r=>r.json())`.
4. To get the related documents (step 3 above) inside the browser: `browse eval --remote --session $sid "fetch('https://www.chinatax.gov.cn/queryManuscriptAssociation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'id={articleId}'}).then(r=>r.json())"`.

The detail pages (`/zcfgk/c{channel}/c{id}/content.html`) render fine in the browser and can be scraped without any tricks if you really need rendered HTML rather than the API's `contentHtml`.

## Site-Specific Gotchas

- **Always check `xxgk_aging` before quoting.** Search results include repealed (`全文废止`) and expired (`全文失效`) documents with no visual demotion. For VAT/个税 queries especially, multiple superseded versions coexist with the current one. The 2025-02-26 STA Order #57 (个人所得税综合所得汇算清缴管理办法) supersedes earlier 汇算清缴 announcements that still show up first by relevance — sort/filter by `aging`/year to avoid quoting stale rules.
- **The "defining and explaining different documents" requirement maps directly to `queryManuscriptAssociation`.** The fgk index returns a single article per hit; the *interpretations, Q&A, and parent statutes* that explain how to apply it are stored as separate articles linked only through this endpoint. Skipping step 3 means you'll quote a regulation without its operational guidance, which is the most common failure mode for tax-policy lookups.
- **Document numbers (文号) are the highest-precision search key.** Use `searchWord=财税〔2022〕13号` (URL-encode the full string including the 〔〕 brackets — note these are CJK fullwidth brackets `〔〕`, NOT ASCII parens) and you typically get the exact document in position 1. Fall back to keywords only when the 文号 is unknown.
- **Title fields contain inline `<span>` highlight tags** for every matched character: `"title": "<span>个</span><span>人</span><span>所</span><span>得</span><span>税</span>综合所得…"`. Strip with `s.replace(/<[^>]+>/g, '')` before display.
- **`downloadAppendix` uses a strange delimiter.** Multiple files are separated by `яяяяя` (five Cyrillic 'я' characters, `я`). Each entry is `{filename}|{ext}|{absolute-url}`. Split on `яяяяя`, then on `|`.
- **The `id` field is composite (`{articleId}_{channelGuid}_{siteCode}`) — do NOT pass it raw to `queryManuscriptAssociation`.** Extract the article id from the `url` field instead: `url.match(/\/c(\d+)\/content\.html$/)[1]`.
- **`http://` URLs in the response auto-upgrade to `https://` via 302.** The site redirects on cleartext detail-page requests but serves the API and content directly over HTTPS. Always call HTTPS and follow redirects.
- **The related-docs endpoint lives on `www.chinatax.gov.cn`, NOT `fgk.chinatax.gov.cn`.** A common mistake is to call `https://fgk.chinatax.gov.cn/queryManuscriptAssociation` and get a 404. Use `https://www.chinatax.gov.cn/queryManuscriptAssociation` exactly as the site's `content.js` does.
- **`policyDocument[]` URLs sometimes contain the substring `zcfgknw`** (an internal preview hostname). The site's own JS rewrites this to `zcfgk` before use: `url.replace('zcfgknw', 'zcfgk')`. Do the same.
- **Channel codes are stable but undocumented.** Observed mapping: `c100009`=法律 (Laws), `c100010`=行政法规 (Administrative Regulations), `c100011`=税务部门规章 (Tax Bureau Departmental Rules), `c100012`=税务规范性文件, `c100013`=财税文件, `c100014`=工作通知, `c100015`=政策解读, `c100016`=政策问答. They appear in the `url` path but you should not need to construct URLs by hand — always use the `url` field returned by search.
- **Search results page (`searchResult.html`) renders almost nothing on first paint.** `document.body.scrollHeight` measures ~109 px even with 8 of 48 result `<li>`s in the DOM. Screenshots will look blank. This is why this skill recommends calling the API directly rather than scraping the rendered list. If you must scrape the rendered page, wait at least 10 seconds, dispatch a window resize, and force `document.body.style.minHeight='1000px'`.
- **The site is fronted by a Chinese CDN (PSCdn) and returns 200 to bare `fetch`/`curl` from many ASNs without proxies.** Iteration with `--proxies` was used for safety, but the JSON API has no observable anti-bot beyond standard rate limiting. No captcha, no login wall, no Akamai 403s observed.
- **A `JSESSIONID` cookie is set on first call.** It is not required for subsequent requests — the search and association APIs are unauthenticated.
- **`searchWord` URL-encodes Chinese as UTF-8, then percent-encodes.** A double-encoded value (e.g. `%25E4%25B8%25AA%25E4%25BA%25BA%25E6%2589%2580%25E5%25BE%2597%25E7%25A8%258E`) is auto-decoded once by the server, so single-encoding is correct.
- The site advertises a related GraphQL/SOAP API on government metadata (`SiteIDCode bm29000002`), but no public GraphQL endpoint was discoverable. Don't waste time hunting for one — the `/search5/search/s` REST endpoint is the canonical interface.

## Expected Output

```json
{
  "query": "个人所得税综合所得汇算清缴",
  "primary_document": {
    "article_id": "5238560",
    "title": "个人所得税综合所得汇算清缴管理办法",
    "doc_number": "国家税务总局令第57号",
    "issuing_authority": "国家税务总局",
    "doc_type": "税务部门规章",
    "publication_date": "2025-02-26",
    "formulated_year": "2025",
    "effectiveness": "全文有效",
    "abolish_date": null,
    "tax_categories": ["个人所得税", "税费征管"],
    "url": "https://fgk.chinatax.gov.cn/zcfgk/c100011/c5238560/content.html",
    "attachments": [
      {
        "filename": "个人所得税综合所得汇算清缴管理办法.docx",
        "type": "docx",
        "url": "http://fgk.chinatax.gov.cn/zcfgk/c100011/c5238560/5238560/files/个人所得税综合所得汇算清缴管理办法.docx"
      },
      {
        "filename": "个人所得税综合所得汇算清缴管理办法.pdf",
        "type": "pdf",
        "url": "http://fgk.chinatax.gov.cn/zcfgk/c100011/c5238560/5238560/files/个人所得税综合所得汇算清缴管理办法.pdf"
      }
    ],
    "content_html": "<p>国家税务总局令</p><p>第57号</p><p>《个人所得税综合所得汇算清缴管理办法》…第一章 总则…第一条 为保护纳税人合法权益，规范个人所得税综合所得汇算清缴工作，根据《中华人民共和国个人所得税法》及其实施条例…</p>"
  },
  "parent_statutes": [
    {
      "title": "中华人民共和国个人所得税法",
      "doc_type": "法律",
      "url": "https://fgk.chinatax.gov.cn/zcfgk/c100009/c5193028/content.html",
      "doc_number": "",
      "effectiveness": "全文有效"
    },
    {
      "title": "中华人民共和国税收征收管理法",
      "doc_type": "法律",
      "url": "https://fgk.chinatax.gov.cn/zcfgk/c100009/c5195081/content.html",
      "effectiveness": "全文有效"
    }
  ],
  "official_interpretations": [
    {
      "title": "关于《个人所得税综合所得汇算清缴管理办法》的解读",
      "url": "https://fgk.chinatax.gov.cn/zcfgk/c100015/c5238563/content.html"
    },
    {
      "title": "2024年度个人所得税综合所得汇算清缴问答",
      "url": "https://fgk.chinatax.gov.cn/zcfgk/c100015/c5238556/content.html"
    },
    {
      "title": "个人所得税综合所得汇算清缴提示案例",
      "url": "https://fgk.chinatax.gov.cn/zcfgk/c100015/c5238558/content.html"
    }
  ],
  "policy_qa": [],
  "version_history": [],
  "related_total": 557,
  "answer_summary": "国家税务总局令第57号《个人所得税综合所得汇算清缴管理办法》自2025年2月26日公布之日起施行，依据《中华人民共和国个人所得税法》《中华人民共和国税收征收管理法》制定。当前状态：全文有效。综合所得包括工资薪金、劳务报酬、稿酬、特许权使用费四项；汇算清缴扣除费用六万元及专项扣除等后按综合所得税率计算应纳税额。详细操作参见解读及2024年度问答。"
}
```

Outcome variations:

1. **Not found** — `searchResultAll.total === 0`. Suggest the user provide the 文号 directly, or try a synonym (e.g. 增值税 vs. 营业税 historically).
2. **Found but repealed** — `xxgk_aging === "全文废止"` or `"全文失效"`. Return the document but prepend `effectiveness_warning: "This regulation is no longer in force as of <abolish_date>. Cite only for historical context."` and surface the replacement via `policyDocument[]` (the repealing document usually references the repealed one).
3. **Amended** — `xxgk_aging === "已修改"`. Always pull `version_history` via the `policyFile_{id}` association call and surface both the original and the current consolidated text.
4. **Ambiguous query** — `total > 50` with multiple effectiveness levels. Narrow with `label=` filter to authoritative document types first, then by tax category via `xxgk_son_taxPolicy` from the aggregations, then by year.
5. **Interpretation found without primary** — when the user describes the rule informally, the top hit may be a 政策解读 (`label=文字政策解读` / channel `c100015`) rather than the regulation itself. In that case, follow `policyDocument[]` from the interpretation back to its primary statute and return *that* as `primary_document`.
