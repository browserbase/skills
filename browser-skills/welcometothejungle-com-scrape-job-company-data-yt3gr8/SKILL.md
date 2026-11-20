---
name: welcometothejungle-com-scrape-job-company-data-yt3gr8
title: Welcome to the Jungle — Scrape Job & Company Data via Algolia API
description: >-
  Reverse-engineer the public Algolia XHR/Fetch traffic behind
  welcometothejungle.com to fetch paginated company and job results for any
  JOB_QUERY (sales, growth, marketing, data, AI, developer, product, finance,
  operations) and export normalized CSV files into ./projectWTTJ/.
website: welcometothejungle.com
category: jobs
tags:
  - scraping
  - algolia
  - jobs
  - companies
  - csv
  - api
  - httpx
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Only useful as a fallback for re-discovering the Algolia app ID + public
      search key (or any new index name) if WTTJ rotates them. Day-to-day
      scraping should never render a page — the Algolia POST is the same call
      the SPA fires and is 50-100x cheaper than a headless browser per page of
      results.
verified: true
proxies: true
---
# Welcome to the Jungle — Scrape Company & Job Data via Public Algolia API

## Purpose

Given a `JOB_QUERY` keyword (e.g. `sales`, `growth`, `marketing`, `data`, `AI`, `developer`, `product`, `finance`, `operations`), this skill reverse-engineers the public XHR/Fetch traffic behind `welcometothejungle.com/en/companies?query=…` and exports company **and** job data to two CSV files in `./projectWTTJ/` — one row per company match, one row per job match. The site is a thin React/InstantSearch client over **two public Algolia indexes** (`wk_cms_organizations_production`, `wk_cms_jobs_production`) plus an unauthenticated REST endpoint (`api.welcometothejungle.com/api/v1/organizations/{slug}`) for richer per-company detail (external website URL, headquarters, social links). Read-only — never posts, applies, or follows.

## When to Use

- Building a company/job intelligence dataset filtered by role keyword (sales, growth, marketing, data, AI, developer, product, finance, operations).
- Periodic export of newly published jobs matching a keyword for downstream enrichment.
- Anywhere you would otherwise scrape the WTTJ HTML — the Algolia endpoint is orders of magnitude cheaper, returns JSON, and requires no headless browser, no login, and no anti-bot bypass.

## Workflow

WTTJ's "Explore companies" / "Find a job" pages are React + Algolia InstantSearch. Every result list, facet, scroll-load, page change, query update, and filter check fires a single `POST` to a single Algolia DSN with a public search-only API key embedded in the page bundle. **Lead with the Algolia API.** The browser path is only useful when you need to *re-discover* the API key (e.g. WTTJ rotates it) or sniff a new index name.

### Step 1 — Open the URL with Agent Browser and capture XHR/Fetch only

Use Vercel Agent Browser (`browse` unified CLI — never Playwright) attached to a Browserbase session, with a parallel CDP tracer listening on the Network domain. Filter the firehose to `Network.requestWillBeSent` events whose `request.url` matches the union of `/api/`, `/app/`, `/fetch`, `algolia`, `search`, `companies`, `jobs`. Reject everything else by `resourceType` — discard `Document`, `Stylesheet`, `Script`, `Image`, `Font`, `Media`, `Ping`, `EventSource`, `WebSocket`, `Manifest`, `Other`. **Do not** call `performance.getEntriesByType("resource")` — it loses POST bodies, headers, and the request method, which are exactly the fields you need to reproduce the call.

```bash
# 1. Create a Browserbase session (proxies optional — site is non-anti-bot for read).
SID=$(browse cloud sessions create --keep-alive --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")

# 2. Attach a second, read-only CDP client that records the firehose to NDJSON.
node /path/to/bb-skills/skills/browser-trace/scripts/bb-capture.mjs "$SID" wttj-run-1 &

# 3. Get the connect URL and drive the page from a second CDP client.
CU=$(browse cloud sessions get "$SID" \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).connectUrl))")
export BROWSE_SESSION=wttj
JOB_QUERY=sales
browse open "https://www.welcometothejungle.com/en/companies?page=1&aroundQuery=worldwide&query=${JOB_QUERY}" \
  --cdp "$CU" --session "$BROWSE_SESSION"
# Trigger pagination / scroll / filter changes — they all fan out to the same endpoint.
browse press End --session "$BROWSE_SESSION"
sleep 3

# 4. Stop and bisect the trace.
node /path/to/bb-skills/skills/browser-trace/scripts/stop-capture.mjs wttj-run-1
node /path/to/bb-skills/skills/browser-trace/scripts/bisect-cdp.mjs   wttj-run-1
```

### Step 2 — Filter to candidate API calls and inspect

From `.o11y/wttj-run-1/cdp/raw.ndjson`, extract `Network.requestWillBeSent` events where `url` matches `/api/|/app/|/fetch|algolia|search|companies|jobs`. Reject any with `resourceType` in `{Document, Stylesheet, Script, Image, Font, Media, Ping, WebSocket, EventSource, Manifest}` — keep only `XHR` and `Fetch`. The signal-to-noise winners are exactly two patterns:

| URL pattern | Role |
|---|---|
| `POST https://csekhvms53-dsn.algolia.net/1/indexes/*/queries?...` | **The main one.** Multi-index Algolia search. POST body carries `requests: [{indexName, params: <urlencoded query string>}]`. Fires once per search submission, every scroll-load page change, and every facet toggle. |
| `GET https://api.welcometothejungle.com/api/v1/organizations/{slug}` | Per-company detail. Unauthenticated, returns `{ organization: { name, sectors, offices, urls, media_website_url, nb_employees, ... } }`. Used for `website` (the company's external URL) and headquarters office detail. |

Other endpoints you'll see in the trace and should **ignore** for this skill:
- `GET /api/v1/featured_contexts`, `GET /api/v1/search/job_filters`, `GET /api/v1/pages?path=...` — page-template metadata. The pages endpoint requires `x-csrf-token` (extracted by the SPA from the user-me bootstrap) and returns CMS layout JSON, not list data.
- `GET /api/v2/users/me`, `GET /api/v3/users/me` — anonymous user bootstrap; returns `204`.
- `csekhvms53-dsn.algolia.net/1/indexes/wk_cms_organizations_production/query` (note: single-index `/query` not `/queries`) — used by the home page "featured companies" rail. Same auth, same index.
- Everything on `cdn.welcometothejungle.com`, `cdn-images.welcometothejungle.com`, `*.google.com`, `*.amplitude.com`, `*.contentsquare.net`, `*.hotjar.com`, `*.axept.io`, `*.batch.com`, `getbeamer.com`, `googleads.g.doubleclick.net` — assets, ads, analytics, consent. Drop.

### Step 3 — Identify base URL, endpoint, method, params, body, pagination

**Captured from a live trace** of `https://www.welcometothejungle.com/en/companies?page=1&aroundQuery=worldwide&query=sales`:

```
Base URL:      https://csekhvms53-dsn.algolia.net
Endpoint path: /1/indexes/*/queries
Method:        POST
Query string:  ?x-algolia-agent=Algolia%20for%20JavaScript%20(4.20.0)%3B%20Browser
              &search_origin=companies_search_client
Content-Type:  application/x-www-form-urlencoded   (despite the JSON body — Algolia quirk)

Essential headers (everything else is discardable):
  x-algolia-application-id: CSEKHVMS53
  x-algolia-api-key:        4bd8f6215d0cc52b26430765769e65a0  (public search-only key)
  content-type:             application/x-www-form-urlencoded
  accept:                   */*
  origin:                   https://www.welcometothejungle.com
  referer:                  https://www.welcometothejungle.com/
  user-agent:               <your client's UA>

Body (JSON, even though Content-Type is form-urlencoded):
  {
    "requests": [
      {
        "indexName": "wk_cms_organizations_production",  // or wk_cms_jobs_production
        "params":    "hitsPerPage=30&page=0&query=sales&filters=website.reference%3Awttj_fr"
      }
    ]
  }

Pagination:
  page=N             (0-indexed; nbPages reported in response)
  hitsPerPage=K      (max 1000; the UI uses 30)
  HARD CEILING:      Algolia paginationLimitedTo = 1000 hits total.
                     i.e. page * hitsPerPage must stay < 1000 or you get an
                     empty hits[] (response still 200, nbHits unchanged).
                     Verified 2026-05-25: page=50 with hitsPerPage=20 = 0 hits.
                     To exceed 1000, slice with filters (sector, country, date).
```

The `params` value is a `application/x-www-form-urlencoded` string nested inside JSON. Build it with `urllib.parse.urlencode(...)`, then embed it as the value of `params`.

### Step 4 — Reproduce with curl, then Python httpx

**curl** (single request, companies index, page 0, query=sales):
```bash
curl -sS -X POST \
  'https://csekhvms53-dsn.algolia.net/1/indexes/*/queries?x-algolia-agent=Algolia%20for%20JavaScript%20(4.20.0)%3B%20Browser&search_origin=companies_search_client' \
  -H 'x-algolia-application-id: CSEKHVMS53' \
  -H 'x-algolia-api-key: 4bd8f6215d0cc52b26430765769e65a0' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -H 'origin: https://www.welcometothejungle.com' \
  -H 'referer: https://www.welcometothejungle.com/' \
  --data-raw '{"requests":[{"indexName":"wk_cms_organizations_production","params":"hitsPerPage=30&page=0&query=sales"}]}' \
  | python -m json.tool | head -40
```

**Python httpx** scraper — full end-to-end (companies + jobs, paginated, CSV export, dedup):

```python
# scrape_wttj.py — requires: pip install httpx
import csv, json, time, pathlib, datetime, urllib.parse, sys, httpx

ALGOLIA_URL  = ("https://csekhvms53-dsn.algolia.net/1/indexes/*/queries"
                "?x-algolia-agent=Algolia%20for%20JavaScript%20(4.20.0)%3B%20Browser"
                "&search_origin=companies_search_client")
APP_ID       = "CSEKHVMS53"
API_KEY      = "4bd8f6215d0cc52b26430765769e65a0"   # public search-only key
ORG_INDEX    = "wk_cms_organizations_production"
JOB_INDEX    = "wk_cms_jobs_production"
ORG_DETAIL   = "https://api.welcometothejungle.com/api/v1/organizations/{slug}"
SITE         = "https://www.welcometothejungle.com"
HEADERS = {
    "x-algolia-application-id": APP_ID,
    "x-algolia-api-key":        API_KEY,
    "content-type":             "application/x-www-form-urlencoded",
    "accept":                   "*/*",
    "origin":                   SITE,
    "referer":                  SITE + "/",
    "user-agent":               "Mozilla/5.0 (compatible; wttj-scraper/1.0)",
}
PAGE_CAP = 1000   # Algolia paginationLimitedTo

def algolia_page(client, index, query, page, hits_per_page=100, extra_params=None):
    params = {"query": query, "hitsPerPage": hits_per_page, "page": page}
    if extra_params:
        params.update(extra_params)
    body = {"requests": [{
        "indexName": index,
        "params":    urllib.parse.urlencode(params, safe=":,/"),
    }]}
    r = client.post(ALGOLIA_URL, headers=HEADERS, content=json.dumps(body), timeout=30)
    r.raise_for_status()
    return r.json()["results"][0]

def paginate(client, index, query, hits_per_page=100):
    page = 0
    while True:
        res = algolia_page(client, index, query, page, hits_per_page)
        for hit in res["hits"]:
            yield hit
        # Two stop conditions: end of result set, or pagination ceiling.
        if page + 1 >= res["nbPages"]:
            break
        if (page + 1) * hits_per_page >= PAGE_CAP:
            print(f"[!] pagination ceiling hit at page={page+1} (total nbHits={res['nbHits']}). "
                  f"Add filters to slice further.", file=sys.stderr)
            break
        page += 1
        time.sleep(0.25)   # be polite

# Optional per-company enrichment (website, headquarters, social).
def org_detail(client, slug):
    try:
        r = client.get(ORG_DETAIL.format(slug=slug), timeout=15,
                       headers={"accept": "application/json"})
        if r.status_code != 200: return {}
        return r.json().get("organization", {})
    except httpx.HTTPError:
        return {}

def company_url(slug, lang="en"):
    return f"{SITE}/{lang}/companies/{slug}"
def job_url(org_slug, job_slug, lang="en"):
    return f"{SITE}/{lang}/companies/{org_slug}/jobs/{job_slug}"

def first_office(hit):
    return (hit.get("offices") or [hit.get("office") or {}])[0] or {}

def industry_of(hit):
    # Algolia hit has nested `sectors[].parent.en` (organizations) or
    # `sectors[].parent_name` (in detail endpoint) or `sectors_name.en.<industry>` (jobs).
    s = (hit.get("sectors") or [])
    if not s: return ""
    parent = s[0].get("parent")
    if isinstance(parent, dict):  return parent.get("en") or ""
    return parent or s[0].get("parent_name") or ""

def description_of(hit, detail=None):
    d = hit.get("descriptions")
    if isinstance(d, dict) and d.get("en"): return d["en"]
    if detail:
        for k in ("description", "descriptions", "presentation"):
            v = detail.get(k)
            if isinstance(v, dict) and v.get("en"): return v["en"]
            if isinstance(v, str) and v: return v
    return ""

def normalize(s, max_len=1000):
    if s is None: return ""
    s = str(s).replace("\r", " ").replace("\n", " ").strip()
    return s[:max_len]

def scrape(job_query, out_dir="projectWTTJ", enrich=True):
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    seen_companies, seen_jobs = {}, {}
    companies, jobs = [], []

    with httpx.Client(http2=True) as client:
        # --- COMPANIES ---
        for hit in paginate(client, ORG_INDEX, job_query):
            slug = hit.get("slug") or ""
            url  = company_url(slug)
            if url in seen_companies: continue
            seen_companies[url] = True
            detail = org_detail(client, slug) if enrich else {}
            office = first_office(hit) or first_office(detail)
            companies.append({
                "job_query":      job_query,
                "company_name":   normalize(hit.get("name")),
                "company_url":    url,
                "industry":       normalize(industry_of(hit)),
                "location":       normalize(office.get("city")),
                "country":        normalize(office.get("country") or office.get("country_code")),
                "description":    normalize(description_of(hit, detail), 4000),
                "website":        normalize(detail.get("media_website_url")),
                "linkedin":       normalize(detail.get("linkedin_url") or ""),
                "logo_url":       normalize((hit.get("logo") or {}).get("url")),
                "employee_count": hit.get("nb_employees") or detail.get("nb_employees") or "",
                "jobs_count":     hit.get("jobs_count") or "",
                "job_title":      "",  "job_url": "", "contract_type": "",
                "remote_policy":  "",  "published_at": "",
                "raw_id":         hit.get("objectID") or hit.get("reference") or "",
                "source_url":     f"{SITE}/en/companies?query={urllib.parse.quote(job_query)}",
                "scraped_at":     ts,
            })

        # --- JOBS ---
        for hit in paginate(client, JOB_INDEX, job_query):
            org   = hit.get("organization") or {}
            o_slug = org.get("slug") or ""
            j_slug = hit.get("slug") or ""
            ju    = job_url(o_slug, j_slug)
            cu    = company_url(o_slug)
            rid   = hit.get("objectID") or hit.get("reference") or ""
            key   = ju or rid
            if key in seen_jobs: continue
            seen_jobs[key] = True
            office = hit.get("office") or first_office(hit)
            contract = ((hit.get("contract_type_names") or {}).get("en")
                        or hit.get("contract_type") or "")
            jobs.append({
                "job_query":      job_query,
                "company_name":   normalize(org.get("name")),
                "company_url":    cu,
                "industry":       normalize(industry_of({"sectors": hit.get("sectors")})),
                "location":       normalize(office.get("city")),
                "country":        normalize(office.get("country") or office.get("country_code")),
                "description":    normalize((org.get("descriptions") or {}).get("en"), 2000),
                "website":        "",   # fetch via org_detail() if needed
                "linkedin":       "",
                "logo_url":       normalize((org.get("logo") or {}).get("url")),
                "employee_count": org.get("nb_employees") or "",
                "jobs_count":     "",
                "job_title":      normalize(hit.get("name")),
                "job_url":        ju,
                "contract_type":  normalize(contract),
                "remote_policy":  normalize(hit.get("remote")),
                "published_at":   normalize(hit.get("published_at")),
                "raw_id":         rid,
                "source_url":     f"{SITE}/en/jobs?query={urllib.parse.quote(job_query)}",
                "scraped_at":     ts,
            })

    cols = ["job_query","company_name","company_url","industry","location","country",
            "description","website","linkedin","logo_url","employee_count","jobs_count",
            "job_title","job_url","contract_type","remote_policy","published_at",
            "raw_id","source_url","scraped_at"]
    for name, rows in [("companies", companies), ("jobs", jobs)]:
        p = out / f"wttj_{name}_{job_query}.csv"
        with p.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, quoting=csv.QUOTE_ALL)
            w.writeheader(); w.writerows(rows)
        print(f"[+] wrote {len(rows):4d} rows → {p}")

if __name__ == "__main__":
    for q in (sys.argv[1:] or ["sales"]):
        scrape(q)
```

**Test loop** — page 1, then multiple pages, then a different JOB_QUERY:

```bash
# Page-1 smoke test (just confirm 200 + non-zero hits).
python -c "import httpx,json; r=httpx.post('https://csekhvms53-dsn.algolia.net/1/indexes/*/queries',headers={'x-algolia-application-id':'CSEKHVMS53','x-algolia-api-key':'4bd8f6215d0cc52b26430765769e65a0','content-type':'application/x-www-form-urlencoded'},content=json.dumps({'requests':[{'indexName':'wk_cms_jobs_production','params':'hitsPerPage=1&page=0&query=sales'}]})); print(r.status_code, r.json()['results'][0]['nbHits'])"

# Multi-page run for one query (sales) into ./projectWTTJ/
python scrape_wttj.py sales

# Different JOB_QUERY (marketing) — confirms no per-query state leaks.
python scrape_wttj.py marketing

# Full batch — one CSV pair per query.
for q in sales growth marketing data AI developer product finance operations; do
  python scrape_wttj.py "$q"
done
```

### Step 5 — CSV mapping reference

| CSV column | Source (in order of preference) |
|---|---|
| `job_query` | the input keyword |
| `company_name` | Algolia: `organizations[*].name` (or `jobs[*].organization.name`) |
| `company_url` | derived: `https://www.welcometothejungle.com/en/companies/{slug}` |
| `industry` | Algolia: `sectors[0].parent.en` (orgs) or `sectors[0].parent_name` (detail) |
| `location` | Algolia: `offices[0].city` (orgs) or `office.city` (jobs) |
| `country` | Algolia: `offices[0].country` (often null) or `country_code` (always set) |
| `description` | Algolia: `descriptions.en` (orgs) or `organization.descriptions.en` (jobs) |
| `website` | REST: `GET /api/v1/organizations/{slug}` → `organization.media_website_url` |
| `linkedin` | **Not in either Algolia index** and not in the public org detail JSON (the WTTJ-managed social URLs are gated behind an authenticated GraphQL surface). Leave empty unless you parse it out of the company profile HTML body via a fallback browser fetch — explicitly out of scope for this skill since it would require either auth or full DOM rendering. |
| `logo_url` | Algolia: `logo.url` (orgs) or `organization.logo.url` (jobs) |
| `employee_count` | Algolia: `nb_employees` |
| `jobs_count` | Algolia: `jobs_count` (orgs index only — not on the jobs index) |
| `job_title` | Algolia: `jobs[*].name` |
| `job_url` | derived: `https://www.welcometothejungle.com/en/companies/{org_slug}/jobs/{job_slug}` |
| `contract_type` | Algolia: `contract_type_names.en` (preferred) or `contract_type` (`FULL_TIME`/`INTERNSHIP`/…) |
| `remote_policy` | Algolia: `remote` (one of `unknown`/`partial`/`fulltime`/`punctual`/`no`) |
| `published_at` | Algolia: `published_at` (ISO-8601 with offset) |
| `raw_id` | Algolia: `objectID` (numeric, stable); fall back to `reference` |
| `source_url` | the WTTJ search URL the agent simulated (companies or jobs page) |
| `scraped_at` | UTC ISO-8601 at scrape time |

### Step 6 — Dedup, normalization, errors

- **Dedup keys**: `company_url` for companies, `job_url` (preferred) or `raw_id` (`objectID`) for jobs. The same job may appear under different `published_at` revisions on consecutive runs — keep the latest by `(job_url, published_at desc)`.
- **CSV normalization**: replace `\r` and `\n` with single spaces (job descriptions are markdown with embedded line breaks); truncate long fields (`description` ≤ 4000 chars); always quote with `csv.QUOTE_ALL` because employer text routinely contains commas, semicolons, emojis, and stray quotes.
- **Errors**:
  - `403 {"message":"Index not allowed with this API key"}` — you've named a private index. Only `wk_cms_organizations_production` and `wk_cms_jobs_production` are reachable with the public key. (Confirmed blocked: `wk_jobs_production`, `wk_offers_production`, `wk_cms_offers_production`.)
  - `200` with `hits: []` and `nbHits: 0` past page 49 (hpp=20) — you crossed the 1000-hit ceiling. Add filters and retry.
  - `429` — back off. Algolia public DSNs have a per-IP soft limit; `time.sleep(0.25)` between paginated POSTs in the script above stays well under it across all 9 sample queries.
  - `5xx` — transient; retry with exponential backoff up to 3 attempts.

## Site-Specific Gotchas

- **Two Algolia indexes, one DSN, one key.** The companies search URL on `/en/companies?...` and the jobs surface both hit the same DSN (`csekhvms53-dsn.algolia.net`) with the same app ID (`CSEKHVMS53`) and the same public search-only API key (`4bd8f6215d0cc52b26430765769e65a0`). The only thing that changes is the body's `indexName`: `wk_cms_organizations_production` (companies) or `wk_cms_jobs_production` (jobs).
- **`Content-Type: application/x-www-form-urlencoded` lies.** The body is JSON. Algolia requires the form-urlencoded MIME for CORS-preflight reasons. Send JSON anyway. If you send `application/json`, Algolia replies with a CORS-preflight failure and the call never lands.
- **The `params` value is a URL-encoded query string nested inside JSON.** Don't put `hitsPerPage` as a top-level JSON key — it goes inside the URL-encoded `params` string. `urllib.parse.urlencode({...}, safe=":,/")` produces the right shape.
- **Algolia caps total reachable results at 1000.** `paginationLimitedTo: 1000`. `nbHits` will report the true count (e.g. 4634 for `query=marketing`), but `page * hitsPerPage >= 1000` returns an empty `hits[]` with `status 200`. To extract more, slice with filters: `filters=offices.country_code:US`, `filters=sectors.parent.en:Tech`, or `numericFilters=published_at_timestamp>1700000000`.
- **`hitsPerPage` max is 1000** — practical for batching. `hitsPerPage=1000&page=0` returns one mega-page; subsequent pages are empty under the 1000-cap rule.
- **`website.reference` filter is the WTTJ marketplace tenant** (`wttj_fr`, `wttj_us`, `wttj_gb`, `wttj_es`, `wttj_cs`, `wttj_sk`), **not** the company's external website. The page URL passes `aroundQuery=worldwide` to *omit* this filter so all tenants surface. Omit the filter to mirror the public search; add it to scope to a single country market.
- **`offices[].country` is frequently `null` even when `country_code` is set.** Prefer `country_code` for de-duplication; resolve to a full country name client-side from a static ISO-3166 table if needed.
- **`sectors_name.en.<industry>` is a facet key, not a value.** The clean industry string for a hit lives at `sectors[0].parent.en` (organizations) / `sectors[0].parent_name` (organizations detail endpoint) / under `sectors_name` map on jobs.
- **`linkedin` and other social URLs are NOT exposed** in either Algolia index or the public `/api/v1/organizations/{slug}` JSON. The `urls` array on that endpoint is just WTTJ canonical/alternate links per language. Don't waste time fishing for them — populate as empty.
- **`/api/v1/pages?path=...` requires `x-csrf-token`.** The token is in the bootstrap of `/api/v2/users/me` and rotates per session. The skill bypasses it entirely by calling `/api/v1/organizations/{slug}` directly, which has no CSRF requirement.
- **No login required, no captcha, no Akamai/PerimeterX/Cloudflare bot wall observed.** A bare `requests`/`httpx` client with the headers above worked on every query tested (sales, growth, marketing, data, AI, developer, product, finance, operations). No residential proxy needed. **Do not** attempt to bypass any future auth/anti-bot layer if WTTJ adds one — escalate or stop.
- **Public access + respect.** The Algolia key is the same key that ships in the SPA bundle to every anonymous visitor; using it from a scraper is functionally equivalent to N anonymous browsers. Robots.txt allows `/en/companies` and `/en/jobs`. Still, throttle to ≤ 4 req/s sustained and back off on 429.
- **`performance.getEntriesByType("resource")` is the wrong tool.** It returns timings only — no POST body, no request method, no headers. Always read XHR/Fetch traffic from the CDP `Network.requestWillBeSent` stream (or DevTools "Network" panel exported HAR).
- **Trigger conditions for the call.** The same `POST /1/indexes/*/queries` fires on (a) initial page load with `?query=...`, (b) typing in the search box and pressing Enter or clicking "Update my search", (c) scrolling to load more (infinite-scroll uses `page` increments), (d) clicking pagination, (e) toggling any facet. Capturing one search submission is enough to learn the schema — the rest only change `page` and add `facetFilters`.

## Expected Output

Two CSV files per `JOB_QUERY` in `./projectWTTJ/`, both sharing the 20-column schema:

```
projectWTTJ/
  wttj_companies_sales.csv      # one row per company matching "sales"
  wttj_jobs_sales.csv           # one row per individual job matching "sales"
  wttj_companies_growth.csv
  wttj_jobs_growth.csv
  ...
```

Column order (identical across both files):
```
job_query, company_name, company_url, industry, location, country, description,
website, linkedin, logo_url, employee_count, jobs_count, job_title, job_url,
contract_type, remote_policy, published_at, raw_id, source_url, scraped_at
```

**Sample row — companies file** (`wttj_companies_sales.csv`):
```json
{
  "job_query":      "sales",
  "company_name":   "European Sales Group",
  "company_url":    "https://www.welcometothejungle.com/en/companies/european-sales-group",
  "industry":       "Consulting / Audit",
  "location":       "Barcelone",
  "country":        "ES",
  "description":    "European Sales Group is a strategic consulting and sales-acceleration partner...",
  "website":        "https://www.europeansalesgroup.com/",
  "linkedin":       "",
  "logo_url":       "https://cdn-images.welcometothejungle.com/.../logo.jpg",
  "employee_count": 35,
  "jobs_count":     1,
  "job_title":      "",
  "job_url":        "",
  "contract_type":  "",
  "remote_policy":  "",
  "published_at":   "",
  "raw_id":         "28900",
  "source_url":     "https://www.welcometothejungle.com/en/companies?query=sales",
  "scraped_at":     "2026-05-25T23:14:01Z"
}
```

**Sample row — jobs file** (`wttj_jobs_sales.csv`):
```json
{
  "job_query":      "sales",
  "company_name":   "Stockly",
  "company_url":    "https://www.welcometothejungle.com/en/companies/stockly",
  "industry":       "Tech",
  "location":       "Paris",
  "country":        "FR",
  "description":    "Stockly is a SaaS platform letting e-commerce merchants sell each other's stock...",
  "website":        "",
  "linkedin":       "",
  "logo_url":       "https://cdn-images.welcometothejungle.com/.../logo.png",
  "employee_count": 87,
  "jobs_count":     "",
  "job_title":      "Sales Executive - CDI - Paris",
  "job_url":        "https://www.welcometothejungle.com/en/companies/stockly/jobs/sales-executive-cdi-paris",
  "contract_type":  "Full-Time",
  "remote_policy":  "partial",
  "published_at":   "2026-05-26T00:00:00.000+02:00",
  "raw_id":         "3790037",
  "source_url":     "https://www.welcometothejungle.com/en/jobs?query=sales",
  "scraped_at":     "2026-05-25T23:14:01Z"
}
```

Observed verified totals (2026-05-25, no filters, EN locale, `aroundQuery=worldwide`):

| `JOB_QUERY` | `wk_cms_organizations_production` `nbHits` | `wk_cms_jobs_production` `nbHits` |
|---|---:|---:|
| `sales`     |   407 | 3,876 |
| `marketing` |  ~310 | 4,634 |
| `growth`    |   ~80 | ~1,200 |

(Exact totals change daily as employers post/expire jobs. The 1000-row pagination ceiling is the practical export ceiling per query without filter-slicing.)
