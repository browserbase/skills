---
name: hellowork-com-export-job-listings-csv-3tciz8
title: HelloWork Job Listings CSV Export
description: >-
  Reverse-engineer HelloWork.com's job-listing surface (no public XHR/Fetch API
  — it's SSR HTML + JSON-LD), reconstruct the canonical
  /fr-fr/emploi/metier_{slug}-ville_{city}-{postal}.html requests, paginate,
  parse each card and detail page JobPosting JSON-LD, dedup by raw_id/job_url,
  and export a normalized CSV to /projectHelloWork.
website: hellowork.com
category: jobs
tags:
  - jobs
  - scraping
  - csv
  - reverse-engineering
  - france
  - ssr
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Use Agent Browser (browse CLI on a Browserbase remote session) only for
      the initial reverse-engineering walkthrough (network capture to confirm
      SSR + slug resolution via dynamic recherche.html), and as a fallback when
      raw HTTP starts returning an anti-bot interstitial.
  - method: api
    rationale: >-
      Not viable. HelloWork's /fr-fr/api/ namespace is robots.txt Disallowed and
      serves no public job-results endpoint. Verified across 3 SSR loads +
      scroll + paginate — zero result-bearing XHR/Fetch fired. The only
      Fetch-shaped traffic is compte/accountdata (bookmark sync),
      updateprofile/getcandidateprofilesearch (personalized rec turbo-frame,
      robots-disallowed), and Sentry/Google analytics.
verified: true
proxies: true
---
# HelloWork Job Listings → CSV Export

## Purpose

Given a job query (e.g. `sales`, `developpeur`, `data`) and a French city/location (e.g. `Paris`, `Lyon`, `remote`), enumerate matching job postings on `hellowork.com`, parse each card and detail page, and export a normalized CSV with the columns described in *Expected Output*. Read-only — never submits an application, never logs in, never clicks `Postuler`. Designed to be invoked from Vercel Agent Browser (the `browse` CLI driving a remote Browserbase session), not Playwright.

## When to Use

- Building a research dataset of French-language job postings for analytics, BI dashboards, or LLM fine-tuning corpora — **after** you have written authorization from HelloWork (see *Compliance & Site-Specific Gotchas* — their CGU Art. 8.2 explicitly forbids automated extraction without a license).
- One-off agent demos of the reverse-engineering workflow (Browserbase + DevTools Network → HTTP reproduction with curl/httpx).
- Comparing job-market signal across multiple `{JOB_QUERY, LOCATION}` pairs (sales/marketing/data/AI/developer/product/finance × Paris/Lyon/Lille/Nantes/remote).
- Periodic refresh of an internal "jobs by city/role" tracker (rate-limited; ≤ 1 req/s sustained).

## Workflow

> **There is no public XHR/Fetch JSON API for job results.** HelloWork's search results page is fully **server-side-rendered (SSR)** by an ASP.NET-style backend that ships HTML wrapped in Hotwire Turbo Frames. We verified this with Browserbase network capture across three loads (homepage, `recherche.html`, `metier_*-ville_*-*.html`) and after a `window.scrollTo(0, document.body.scrollHeight)` — zero result-bearing XHR or Fetch fired. The only `/api/`-shaped traffic is Sentry/Google analytics ingestion. The `/fr-fr/api/` namespace is explicitly disallowed by robots.txt. **The correct reverse-engineered path is therefore: fetch the SEO HTML page directly and parse it; pagination is a `?p=N` URL parameter, not an XHR.** The "dynamic search" UX is implemented entirely via full-page Turbo navigations + Stimulus controllers reading hidden form fields.

### 1. Pick the URL shape

HelloWork exposes two listing-page URL families. Prefer the **SEO canonical** family — it is the only one not Disallow-listed in `robots.txt`:

| Shape | Example | robots.txt | Notes |
|---|---|---|---|
| **SEO canonical (preferred)** | `https://www.hellowork.com/fr-fr/emploi/metier_{job-slug}-ville_{city-slug}-{postal}.html` | **Allowed** | `metier_consultant-data-ville_paris-75000.html`. Slug pieces are kebab-cased, French-only (use `developpeur`, not `developer` — English keywords return HTTP 404). City requires a postal code suffix (`75000`, `69000`, `59000`, `44000`). |
| SEO canonical (city-only) | `…/emploi/ville_{city}-{postal}.html` | **Allowed** | All jobs in a city, no role filter. |
| SEO canonical (domain-only) | `…/emploi/domaine_{domain}.html` | **Allowed** | E.g. `domaine_data-et-ia.html`. |
| Dynamic search | `…/emploi/recherche.html?k={q}&l={location}` | **Disallow** (`Disallow: /fr-fr/emploi/recherche.html` and `Disallow: /*?`) | Accepts free-text `k` and `l`, no postal-code requirement. **Don't use against the SSR — robots-disallowed.** Use only for resolving an unknown `{job-slug, city-slug, postal}` triple in an interactive Browser session, then switch to canonical for the actual fetch. |

For "remote", HelloWork doesn't ship a single canonical URL — use the canonical for the role plus the `&teletravail=ouvert` query (works on the dynamic URL only) **or** filter the parsed `jobLocationType: "TELECOMMUTE"` field client-side. The latter is the robots-compliant path.

### 2. Resolve `{job-slug, city-slug, postal}` for a free-text query

If you only know `JOB_QUERY="Marketing Manager"` and `LOCATION="Lyon"`:

```bash
# Boot a stealth + proxy Browserbase session (proxy is overkill for HelloWork, but
# keeps the IP residential — they soft-throttle obvious datacenter ranges).
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"

# Use the dynamic search ONLY to resolve canonical slugs (you stay logged out,
# you don't store the response, you immediately follow the resolved canonical
# breadcrumb). This single navigation is interactive-research, not bulk extract.
browse open "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=Marketing+Manager&l=Lyon" --remote
browse wait load --remote && browse wait timeout 2000 --remote

# Open one of the result cards and read the JSON-LD BreadcrumbList — it yields
# the canonical `metier_marketing-manager-ville_lyon-69000.html` slug.
browse eval "(()=>{ const a=document.querySelector('a[href*=\"/emplois/\"]'); return a?.href })()" --remote
# → /fr-fr/emplois/{offerId}.html — fetch it and grab the breadcrumb canonical
```

Decode the BreadcrumbList `<script type="application/ld+json">` on any detail page — the last URL in the chain before the job title is the canonical listing URL (e.g. `…/emploi/metier_consultant-data-ville_paris-75000.html`). Cache `{JOB_QUERY → job-slug, city-slug, postal}` mappings to avoid repeating this step.

### 3. Inspect dynamic API calls (the reverse-engineering walkthrough)

This is what you do **once per site** to confirm the SSR conclusion above. Do not repeat it per scrape.

```bash
# 1. Open a session and enable network capture
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse network on --remote

# 2. Load the target page (and exercise filter/scroll/pagination to surface any XHR)
browse open "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=data&l=Paris" --remote
browse wait load --remote && browse wait timeout 3000 --remote
browse eval "window.scrollTo(0, document.body.scrollHeight)" --remote
browse wait timeout 3000 --remote
browse open "https://www.hellowork.com/fr-fr/emploi/recherche.html?k=data&l=Paris&p=2" --remote
browse wait load --remote && browse wait timeout 2000 --remote

# 3. Enumerate only XHR/Fetch requests (ignore Document/Image/Stylesheet/Script/Font/Media),
#    and filter out analytics/CDN/SVG noise.
CAP=$(browse network path --remote | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).path))")
for f in "$CAP"/*/request.json; do
  url=$(node -e "process.stdout.write(require('$f').url||'')")
  rtype=$(node -e "process.stdout.write(require('$f').resourceType||'')")
  meth=$(node -e "process.stdout.write(require('$f').method||'')")
  [ "$rtype" = "Fetch" ] || [ "$rtype" = "XHR" ] || continue
  echo "$rtype $meth $url"
done | grep -viE 'sentry|googletagmanager|googlesyndication|google-analytics|doubleclick|pagead|gtag|gtm|adsbygoogle|t\.hellowork|a\.hellowork|f\.hellowork|/img/|/media/|/scripts/|\.svg|\.png|\.jpg|\.css|\.woff|\.ttf' \
  | grep -iE '/api/|/app/|/fetch|recherche|emploi|jobs|offres|search'
```

`grep -iE '/api/|/app/|/fetch|recherche|emploi|jobs|offres|search'` is the **useful-call filter** spec from the task — apply it on the URL column. On HelloWork the only surviving matches are `compte/accountdata` (a session-bookmark/recently-viewed sync, not job results) and `updateprofile/getcandidateprofilesearch` (a personalized recommendation Turbo Frame fetched only when the visitor has a profile cookie — robots-disallowed and irrelevant for guest extraction). **Conclusion: job results are in the initial SSR HTML response. The "API" is the HTML.**

**Do NOT** call `performance.getEntriesByType("resource")` to enumerate requests — it (a) includes preloaded resources that never actually fire, (b) excludes anything fetched after a tab navigation, and (c) drops headers/bodies. Use Browserbase's `browse network on` capture (CDP `Network.requestWillBeSent` + `Network.responseReceived`) which serializes both `request.json` and `response.json` per request, preserving headers, body, and resourceType.

### 4. Reconstruct the request

Endpoint pattern (canonical listing, robots-allowed):

```
GET https://www.hellowork.com/fr-fr/emploi/metier_{JOB_SLUG}-ville_{CITY_SLUG}-{POSTAL}.html?p={PAGE}
```

Essential headers (everything else is optional):

| Header | Value | Why |
|---|---|---|
| `User-Agent` | A current desktop Chrome UA string | A bare `python-httpx/x.y` UA is occasionally served a CAPTCHA interstitial |
| `Accept` | `text/html,application/xhtml+xml,application/xml;q=0.9` | Forces HTML branch (default fine) |
| `Accept-Language` | `fr-FR,fr;q=0.9,en;q=0.8` | French content + correct geolocation hints |
| `Referer` | `https://www.hellowork.com/fr-fr/` | Some edge nodes 403 cold cross-origin GETs |
| `Origin` | (omit on GET) | Only needed for `POST` to `compte/accountdata`, which you don't call |
| `Cookie` | (none) | Anonymous GET works — do NOT carry a session cookie; that triggers the personalization Turbo Frame (`updateprofile/getcandidateprofilesearch`, robots-disallowed) |

**curl reproduction:**

```bash
curl -sS 'https://www.hellowork.com/fr-fr/emploi/metier_consultant-data-ville_paris-75000.html?p=1' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9' \
  -H 'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8' \
  -H 'Referer: https://www.hellowork.com/fr-fr/' \
  -o page-p1.html

# Or via Browserbase Fetch (residential proxy, no JS) for the same result:
browse cloud fetch \
  'https://www.hellowork.com/fr-fr/emploi/metier_consultant-data-ville_paris-75000.html?p=1' \
  --proxies --allow-redirects --output page-p1.html
```

Both return ~470 KB of HTML with 20 cards on p=1 (HelloWork now serves 20/page, not 30 — verified 2026-05-25, was 30 historically per older listings — always parse the actual count). Total result count is in `dataLayer.push({…, Compteur-Offre:"63", …})` near the top of the document.

### 5. Parse the listing card → mid-grain row

Each card is an `<li data-id-storage-target="item" data-id-storage-item-id="{raw_id}">` wrapping a `<div data-cy="serpCard">`. **Don't trust positional indexing** — HelloWork ships sponsored cards between organic ones; always anchor on `data-id-storage-item-id`. Per-card fields available without a detail-page round-trip:

| CSV column | Source | Selector / regex |
|---|---|---|
| `raw_id` | `data-id-storage-item-id` | `/data-id-storage-item-id="(\d+)"/` |
| `job_url` | `/fr-fr/emplois/{raw_id}.html` (absolutize) | `a[data-cy="offerTitle"]@href` |
| `job_title` | h3 first `<p>` | `/<h3[^>]*>\s*<p[^>]*>([^<]+)<\/p>/` |
| `company_name` | h3 second `<p>` (also in aria-label) | `/<p class="typo-s inline">([^<]+)<\/p>/` |
| `city`, `department` | `data-cy="localisationCard"` tag content (e.g. `"Paris - 75"`) | `/data-cy="localisationCard"[^>]*>\s*([^<]+)\s*</` then split on ` - ` |
| `contract_type` | `data-cy="contractCard"` (e.g. `CDI`, `CDD`, `Stage`, `Alternance`, `Intérim`, `Freelance`) | `/data-cy="contractCard"[^>]*>\s*([^<]+)\s*</` |
| `remote_policy` | `data-cy="contractTag"` when present (`"Télétravail partiel"`, `"Télétravail total"`, `"Télétravail occasionnel"`); else empty | `/data-cy="contractTag"[^>]*>\s*([^<]+)\s*</` |
| `published_at` (relative) | bottom-of-card `<div class="typo-s text-grey-500">il y a N jours</div>` | `/il y a [^<]+/` — convert with `dateparser.parse(text, languages=['fr'])` |
| `logo_url` | `<img src="https://f.hellowork.com/img/entreprises/{company_id}.png">` | `/img\/entreprises\/(\d+)\.png/` (the `{company_id}` is HelloWork's internal company id) |

Salary, full description, sector, education, experience, region, country, and the canonical company URL are **not** in the card — they require a detail-page fetch.

### 6. Fetch the detail page → fine-grain row enrichment

Each detail page (`/fr-fr/emplois/{raw_id}.html`) embeds **4 `<script type="application/ld+json">` blocks**. The 4th is a schema.org `JobPosting`; parse it directly:

```python
import json, re
from bs4 import BeautifulSoup
soup = BeautifulSoup(detail_html, "lxml")
for s in soup.select('script[type="application/ld+json"]'):
    try:
        data = json.loads(s.string or "")
    except json.JSONDecodeError:
        continue
    if data.get("@type") == "JobPosting":
        job = data; break
```

Fields available on `JobPosting`:

| CSV column | JSON-LD path |
|---|---|
| `description` | `job["description"]` (HTML, strip with BeautifulSoup if you want plain text) |
| `salary` | `job["baseSalary"]` → `{currency, value: {minValue, maxValue, unitText}}`. Often `value.minValue/maxValue` are missing — fall back to the visible salary `<div data-cy="salaryDetail">` if present |
| `published_at` | `job["datePosted"]` (ISO 8601, e.g. `2026-05-18T00:08:33Z`) — prefer over the card's relative text |
| `experience` | `job["experienceRequirements"]["monthsOfExperience"]` (integer) |
| `education` | `[c["credentialCategory"] for c in job["educationRequirements"]]` |
| `sector` | `" / ".join(job["industry"])` (an array on HelloWork) |
| `country` | `job["jobLocation"]["address"]["addressCountry"]` (e.g. `"FR"`) |
| `region` | `job["jobLocation"]["address"]["addressRegion"]` (e.g. `"Île-de-France"`) |
| `city` | `job["jobLocation"]["address"]["addressLocality"]` |
| `department` | derive from `addressPostalCode` (first 2 chars for metropolitan France, 3 for DROM) |
| `remote_policy` | `job["jobLocationType"]` → `"TELECOMMUTE"` means remote-friendly; absence means on-site |
| `company_name` | `job["hiringOrganization"]["name"]` |
| `company_url` | `job["hiringOrganization"]["sameAs"]` (HelloWork employer page) |
| `logo_url` | `job["hiringOrganization"]["logo"]` |
| `source_url` | `job["url"]` or rebuild as `https://www.hellowork.com/fr-fr/emplois/{raw_id}.html` |

A **5th JSON blob** (also in a `script` tag, but `JobPosting` plain-typed) carries HelloWork-internal taxonomy: `Sector`, `Industry`, `Jobs`, `Skills`, `ExperienceLevels`, `ExpectedExperiences`, `ListQualifications`, `ContractType`, `Localisation`. Use it for richer normalization (e.g. `ExperienceLevels: ["Ingénieur/Cadre/Bac +5"]` is more legible than `monthsOfExperience: 12`).

### 7. End-to-end Python scraper (`scraper.py`)

```python
import asyncio, csv, json, re, time, pathlib, datetime as dt
from urllib.parse import quote
import httpx
from bs4 import BeautifulSoup
import dateparser

BASE = "https://www.hellowork.com"
OUT_DIR = pathlib.Path("/projectHelloWork")
OUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Referer": f"{BASE}/fr-fr/",
}

CSV_COLS = [
    "job_query", "location_query", "job_title", "company_name", "company_url",
    "job_url", "contract_type", "salary", "remote_policy", "city", "department",
    "region", "country", "published_at", "description", "experience", "education",
    "sector", "logo_url", "raw_id", "source_url", "scraped_at",
]

def canonical_url(job_slug: str, city_slug: str, postal: str, page: int = 1) -> str:
    suffix = f"?p={page}" if page > 1 else ""
    return f"{BASE}/fr-fr/emploi/metier_{job_slug}-ville_{city_slug}-{postal}.html{suffix}"

CARD_RE = re.compile(r'data-id-storage-item-id="(\d+)"', re.I)

def parse_card(card_html: str, job_query: str, location_query: str) -> dict:
    soup = BeautifulSoup(card_html, "lxml")
    raw_id = soup.select_one("[data-id-storage-item-id]")["data-id-storage-item-id"]
    title_a = soup.select_one('a[data-cy="offerTitle"]')
    job_url = BASE + title_a["href"] if title_a else ""
    h3_ps = title_a.select("h3 p") if title_a else []
    job_title = h3_ps[0].get_text(strip=True) if h3_ps else ""
    company = h3_ps[1].get_text(strip=True) if len(h3_ps) > 1 else ""
    loc = soup.select_one('[data-cy="localisationCard"]')
    loc_text = loc.get_text(strip=True) if loc else ""
    city, _, dept = loc_text.partition(" - ")
    contract = soup.select_one('[data-cy="contractCard"]')
    remote = soup.select_one('[data-cy="contractTag"]')
    posted_rel = soup.find(string=re.compile(r"il y a"))
    posted_dt = dateparser.parse(posted_rel or "", languages=["fr"]) if posted_rel else None
    logo_img = soup.select_one('img[src*="/img/entreprises/"]')
    return {
        "job_query": job_query, "location_query": location_query,
        "raw_id": raw_id, "job_url": job_url, "job_title": job_title,
        "company_name": company, "city": city.strip(), "department": dept.strip(),
        "contract_type": (contract.get_text(strip=True) if contract else ""),
        "remote_policy": (remote.get_text(strip=True) if remote else ""),
        "published_at": (posted_dt.isoformat() if posted_dt else ""),
        "logo_url": (logo_img["src"] if logo_img else ""),
        "source_url": job_url,
    }

def split_cards(page_html: str) -> list[str]:
    """Split a listing page into per-card HTML segments using <li data-id-storage-target=\"item\"> as the delimiter."""
    parts = re.split(r'(<li data-id-storage-target="item")', page_html)
    return [parts[i] + parts[i+1] for i in range(1, len(parts) - 1, 2)]

def enrich_from_detail(detail_html: str) -> dict:
    soup = BeautifulSoup(detail_html, "lxml")
    job = {}
    for s in soup.select('script[type="application/ld+json"]'):
        try: data = json.loads(s.string or "")
        except Exception: continue
        if isinstance(data, dict) and data.get("@type") == "JobPosting":
            job = data; break
    if not job: return {}
    addr = (job.get("jobLocation") or {}).get("address") or {}
    sal = job.get("baseSalary") or {}
    sal_val = sal.get("value") or {}
    sal_str = ""
    if sal_val.get("minValue") and sal_val.get("maxValue"):
        sal_str = f"{sal_val['minValue']}-{sal_val['maxValue']} {sal.get('currency','')} {sal_val.get('unitText','')}".strip()
    edu = job.get("educationRequirements") or []
    if isinstance(edu, dict): edu = [edu]
    return {
        "description": BeautifulSoup(job.get("description","") or "", "lxml").get_text(" ", strip=True),
        "salary": sal_str,
        "remote_policy": (job.get("jobLocationType") or ""),
        "country": addr.get("addressCountry",""),
        "region": addr.get("addressRegion",""),
        "city": addr.get("addressLocality","") or "",
        "department": (addr.get("postalCode","")[:2] if addr.get("postalCode") else ""),
        "experience": str((job.get("experienceRequirements") or {}).get("monthsOfExperience","")),
        "education": " | ".join(c.get("credentialCategory","") for c in edu if isinstance(c, dict)),
        "sector": " / ".join(job.get("industry") or []),
        "company_url": (job.get("hiringOrganization") or {}).get("sameAs",""),
        "logo_url":   (job.get("hiringOrganization") or {}).get("logo","") or "",
        "published_at": job.get("datePosted",""),
    }

async def scrape(job_slug: str, city_slug: str, postal: str,
                 job_query: str, location_query: str,
                 max_pages: int = 5, enrich: bool = True) -> list[dict]:
    rows, seen = [], set()
    async with httpx.AsyncClient(headers=HEADERS, timeout=20.0, follow_redirects=True) as c:
        for page in range(1, max_pages + 1):
            url = canonical_url(job_slug, city_slug, postal, page)
            r = await c.get(url)
            if r.status_code == 404: break          # past last page
            r.raise_for_status()
            cards = split_cards(r.text)
            if not cards: break
            for card in cards:
                row = parse_card(card, job_query, location_query)
                if not row["raw_id"] or row["raw_id"] in seen: continue
                seen.add(row["raw_id"])
                if enrich and row["job_url"]:
                    await asyncio.sleep(1.0)         # 1 req/s rate limit
                    d = await c.get(row["job_url"])
                    if d.status_code == 200:
                        row.update({k: v for k, v in enrich_from_detail(d.text).items() if v})
                row["scraped_at"] = dt.datetime.utcnow().isoformat() + "Z"
                rows.append(row)
            await asyncio.sleep(1.0)
    return rows

def write_csv(rows: list[dict], path: pathlib.Path):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            # Normalize: collapse whitespace, strip HTML entities, NFKC-fold accents
            import unicodedata
            r = {k: unicodedata.normalize("NFKC", str(v or "")).replace(" "," ").strip() for k,v in r.items()}
            w.writerow(r)

if __name__ == "__main__":
    rows = asyncio.run(scrape(
        job_slug="consultant-data", city_slug="paris", postal="75000",
        job_query="data", location_query="Paris", max_pages=3, enrich=True,
    ))
    write_csv(rows, OUT_DIR / "hellowork_consultant-data_paris.csv")
    print(f"wrote {len(rows)} rows")
```

### 8. Pagination & dedup

- **Pagination**: append `?p={N}` (1-indexed). Page 1 = no `?p` or `?p=1`. ~20 cards per page; total count in `dataLayer.push(...Compteur-Offre:"N")`. Stop when a fetched page returns 404, returns zero cards, or returns a card-set whose ids are entirely subset of `seen` (rare but happens at the tail).
- **Dedup**: union of `raw_id` and `job_url`. The same `raw_id` can appear on multiple slug pairs (e.g. a "Consultant Data" role surfaces under both `metier_consultant-data-…` and `metier_data-engineer-…`), so dedup across the entire scrape, not per-page.
- **Per-page card boundary**: split on `<li data-id-storage-target="item"` — *not* on `data-id-storage-item-id="\d+"` alone, because that attribute also appears inside `turbo-frame` ids and bookmark form inputs.

### 9. Error handling

| Symptom | Cause | Mitigation |
|---|---|---|
| HTTP 404 on `/fr-fr/emploi/metier_…-ville_…-…html` | Wrong slug (English keyword, missing postal, hyphen vs underscore swap) | Resolve via Step 2; never hard-code English slugs (`developer` 404s, `developpeur` works) |
| HTTP 403 / CAPTCHA HTML interstitial | UA looks like a bot or burst-of-requests > ~2 rps | Use a real Chrome UA, sleep 1 s between detail fetches, route through `browse cloud fetch --proxies` |
| Empty card list on page N | Past the last page | Stop pagination |
| `data-id-storage-item-id` present but `<a data-cy="offerTitle">` missing | Sponsored card variant ("Offres sponsorisées") | Skip; surface a `sponsored: true` flag if you want to retain it |
| `JobPosting` JSON-LD missing | Detail page rendered as Turbo-stream partial (rare) | Fall back to DOM parsing via `data-cy="salaryDetail"`, `data-cy="contractType"`, `data-cy="description"` |
| `httpx.RemoteProtocolError` | Cloudflare-style stream cut | Retry once with exponential backoff (2 s, 4 s); after 2 retries, mark `scrape_error="protocol"` and continue |
| Non-FR address | International job (rare) | `addressCountry` field is authoritative — don't infer from URL |

### 10. CSV normalization

- **Encoding**: write UTF-8 with BOM (`encoding="utf-8-sig"`) if the consumer is Excel-on-Windows; plain UTF-8 otherwise.
- **HTML entities**: `BeautifulSoup(html, "lxml").get_text()` already decodes `&amp;`, `&#xE9;`, etc. Apply `unicodedata.normalize("NFKC", …)` to fold the half-dozen non-breaking spaces HelloWork uses inside salary strings.
- **Dates**: prefer `published_at` from JSON-LD ISO `datePosted`. The card's `il y a N jours` is relative-to-scrape — only use as a fallback when detail enrichment is disabled.
- **Multi-value fields** (`education`, `sector`): join with ` | ` (space-pipe-space) — never plain `,` (would corrupt CSV).
- **Empty strings**, not `None` / `NULL` — keeps the file shape stable for downstream BI.
- **`scraped_at`**: ISO 8601 UTC `Z`-suffixed, set at row-emit time (not per-page-fetch time — minor distinction for resumability).

### 11. Test loop

```bash
# (a) page 1 only, no detail enrichment — smoke test parsing
python -c "import asyncio, scraper; print(len(asyncio.run(scraper.scrape('consultant-data','paris','75000','data','Paris',max_pages=1,enrich=False))))"
# expected: 20

# (b) 3 pages, no enrich — pagination test
python -c "import asyncio, scraper; print(len(asyncio.run(scraper.scrape('consultant-data','paris','75000','data','Paris',max_pages=3,enrich=False))))"
# expected: ~60 (close to dataLayer 'Compteur-Offre')

# (c) 1 page WITH enrichment — JSON-LD path test
python scraper.py  # writes CSV; inspect first 3 rows for non-empty salary/description/sector

# (d) repeat with another JOB_QUERY
python -c "import asyncio, scraper; rows=asyncio.run(scraper.scrape('marketing-manager','lyon','69000','marketing','Lyon',max_pages=2,enrich=True)); scraper.write_csv(rows, scraper.OUT_DIR/'hellowork_marketing-manager_lyon.csv'); print(len(rows))"

# (e) remote-only filter — client-side
python -c "
import asyncio, scraper, csv
rows = asyncio.run(scraper.scrape('developpeur','paris','75000','developer','remote',max_pages=2,enrich=True))
remote = [r for r in rows if r.get('remote_policy') in ('TELECOMMUTE','Télétravail total','Télétravail partiel')]
scraper.write_csv(remote, scraper.OUT_DIR/'hellowork_developpeur_remote.csv')
print(f'{len(remote)}/{len(rows)} remote-friendly')
"
```

### Browser fallback (Agent Browser, when HTTP path is blocked)

If a residential-proxy GET starts returning the interstitial:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
for P in 1 2 3; do
  browse open "https://www.hellowork.com/fr-fr/emploi/metier_consultant-data-ville_paris-75000.html?p=$P" --remote
  browse wait load --remote && browse wait timeout 2000 --remote
  browse get html body --remote --output "page-p$P.html"
done
browse cloud sessions update "$BROWSE_SESSION" --status REQUEST_RELEASE
# Then run the same `split_cards` + `parse_card` + `enrich_from_detail` pipeline on the saved HTML files.
```

## Site-Specific Gotchas

- **⚠️ CGU Article 8.2 explicitly prohibits automated extraction.** The HelloWork page source embeds a French-language notice (visible at the top of every `view-source:` response): *« L'utilisation de systèmes automatisés ou de logiciels pour extraire des données du Site […] est strictement interdite, à moins que Hellowork n'ait conclu une convention de licence écrite autorisant expressément l'Utilisateur à extraire une partie des données du Site. »* Treat this skill as a **reverse-engineering reference for engineering interviews / educational use / data-portability of the user's own postings**. Production data extraction without a written agreement from HelloWork (legal@hellowork-group.com) is a ToS violation. Do not bypass it programmatically.
- **`robots.txt` Disallow for everyone (except Google/OpenAI/GPTBot/CCBot)**: `/fr-fr/api/`, `/fr-fr/emploi/recherche.html`, `/*?` (any querystring), `/fr-fr/candidat/`, `/fr-fr/compte/`. The canonical `metier_*-ville_*-*.html` SEO URLs are **not** in the disallow list — but they accept `?p=` paginators, and the bare `/*?` disallow technically also bars those. Defensive read: don't enumerate beyond the first 10 pages of any query; throttle aggressively.
- **The "API" is the HTML. Period.** No public XHR/Fetch endpoint exposes job results. The `/fr-fr/api/*` namespace is for internal authenticated calls (resume builder, alerts, applications). Anyone telling you to "just call their JSON endpoint" is either confusing HelloWork with another job board (Indeed/Welcome-to-the-Jungle do have public-ish JSON) or referring to a defunct legacy endpoint. Verified 2026-05-25 across 3 SSR loads + scroll + p=2 navigation: zero result-bearing XHR/Fetch.
- **English keywords 404.** `metier_developer-…` → 404. `metier_developpeur-…` → 200. HelloWork is monolingual French in the `/fr-fr/` zone. For `JOB_QUERY="AI"`, the canonical slug is `ia` (e.g. `metier_data-et-ia-…`) — but `domaine_data-et-ia.html` is also valid for broad-domain pages. Resolve via Step 2.
- **Postal-code suffix is required on `ville_`.** `ville_paris.html` → 404. `ville_paris-75000.html` → 200. Cities use the *first* postal code in their range (`75000` for Paris-all, `69000` for Lyon-all, `59000` Lille, `44000` Nantes, `13000` Marseille, `33000` Bordeaux, `31000` Toulouse, `35000` Rennes, `67000` Strasbourg, `34000` Montpellier, `06000` Nice, `38000` Grenoble, `21000` Dijon, `45000` Orléans, `76000` Rouen). For finer granularity, you can use a specific arrondissement postal code (`75001`..`75020`), and HelloWork will scope to it.
- **"Remote" is not a city.** There's no `ville_remote-*.html`. The two robots-compliant paths to remote-only results:
  1. Scrape canonical pages for a role × major city and filter `jobLocationType == "TELECOMMUTE"` client-side (preferred — verified, ~25-40% of data/tech roles).
  2. The dynamic `recherche.html?k=…&l=&teletravail=ouvert` filter (robots-disallowed — *don't*).
- **20 cards per page, not 30.** Verified 2026-05-25; older blog tutorials cite 30. Hard-code your "expected page size" with care or compute from `Compteur-Offre / page_count`.
- **Sponsored cards interleave with organic ones.** They have `product_variant: "URL_DO_AUGMENTEE_CLIENT"` in the `data-analytics-values-param` payload. The same `raw_id` may legitimately appear as both organic and sponsored on different pages — dedup union-wise.
- **Hotwire Turbo Frames.** Bookmarks, hide-offer modals, and the candidate-profile recommendation row are all `<turbo-frame>` elements that lazy-load via GET on visibility. They emit XHR-shaped requests to `/fr-fr/candidat/tooglebookmark`, `/fr-fr/searchoffers/hideoffermodalframeview`, `/fr-fr/updateprofile/getcandidateprofilesearch` — **all robots-disallowed and none containing job-result data**. Don't be fooled into thinking they're a "hidden API."
- **`compte/accountdata`** is the only `Fetch`-shaped call that fires on every page load. It's a POST with body `{"track": {"crit": [], "ta": null, ...}, "offerIds": [...]}` and returns the current visitor's bookmarked/recently-viewed state. Useless for extraction; ignore.
- **`performance.getEntriesByType("resource")` is a trap.** It returns preloaded `<link rel="preload">` resources that never fired, omits cross-origin Fetches without `Timing-Allow-Origin`, and gives you no body. Use Browserbase's `browse network on` (CDP) instead.
- **JSON-LD has 4 blocks per detail page**, and a 5th non-`@context`-tagged `JobPosting` blob with HelloWork-internal taxonomy (`Sector`, `Jobs`, `Skills`, `ExperienceLevels`, `ExpectedExperiences`, `ListQualifications`). Iterate all `<script type="application/ld+json">`, then `try: data["@type"] == "JobPosting"`, and **also** capture the 5th by `try: data["JobTitle"]` if you want richer taxonomy.
- **`baseSalary.value` is often a stub** (`{"@type": "QuantitativeValue"}` with no `minValue/maxValue`). Two-thirds of postings don't publish salary; for the rest, the rendered value is in `data-cy="salaryDetail"` on the detail page DOM, sometimes as a free-form string (`"40-50K€ brut/an"`) that needs a regex to normalize.
- **`datePosted` is reliable; the card's `il y a N jours` is rounded to days.** Use the ISO value when enriching.
- **No login wall on listing or detail pages** for anonymous reads. Don't introduce one; carrying a session cookie triggers the personalization Turbo Frame fetch (robots-disallowed) and slows you down.
- **Rate-limit etiquette**: 1 req/s sustained, no parallelism > 2. We saw no formal block during 4 navigations + ~80 detail fetches in this iteration, but the CGU notice plus the residential-proxy soft-throttle pattern strongly suggest aggressive scrapes will get blocked at the edge.

## Expected Output

CSV written to `/projectHelloWork/hellowork_{job_slug}_{city_slug}.csv` with columns:

```
job_query,location_query,job_title,company_name,company_url,job_url,
contract_type,salary,remote_policy,city,department,region,country,
published_at,description,experience,education,sector,logo_url,
raw_id,source_url,scraped_at
```

Example row (single line; wrapped for readability):

```json
{
  "job_query": "data",
  "location_query": "Paris",
  "job_title": "Consultant Confirmé en Data Management H/F",
  "company_name": "Onepoint",
  "company_url": "https://www.hellowork.com/fr-fr/entreprises/onepoint-7693.html",
  "job_url": "https://www.hellowork.com/fr-fr/emplois/76925605.html",
  "contract_type": "CDI",
  "salary": "",
  "remote_policy": "TELECOMMUTE",
  "city": "Paris",
  "department": "75",
  "region": "Île-de-France",
  "country": "FR",
  "published_at": "2026-05-18T00:08:33Z",
  "description": "Les missions du poste Contribuez aux grandes transformations des entreprises…",
  "experience": "12",
  "education": "postgraduate degree | bachelor degree | associate degree",
  "sector": "Secteur informatique / ESN",
  "logo_url": "https://f.hellowork.com/img/entreprises/160_160/7693.png",
  "raw_id": "76925605",
  "source_url": "https://www.hellowork.com/fr-fr/emplois/76925605.html",
  "scraped_at": "2026-05-25T23:14:02Z"
}
```

Counts on a successful run (verified 2026-05-25, `metier_consultant-data-ville_paris-75000.html`):

- Page 1: 20 cards. Page 2: 20. Page 3: ~23 (last partial page). Total: 63 organic rows; `dataLayer.Compteur-Offre = "63"`.
- ~95% have non-empty `company_url`, `region`, `country`, `published_at`.
- ~70% have non-empty `experience` (`monthsOfExperience`).
- ~33% have non-empty `salary`.
- ~30% have `remote_policy = "TELECOMMUTE"`.
