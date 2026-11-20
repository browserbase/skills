---
name: bccourts-ca-search-supreme-court-judgments-23e2la
title: Search BC Supreme Court Judgments
description: >-
  Search the BC Supreme Court (bccourts.ca) public judgments index by full-text
  (boolean), case name, neutral citation, judge, docket, registry, or date
  range. First-class support for landlord-tenant matters that reached BCSC via
  judicial review of Residential Tenancy Branch decisions, large-dollar
  petitions for possession, or RTA/foreclosure intersections. Returns case name,
  citation, decision date, court level, judgment HTML URL, and
  highlighted-snippet URL. Read-only.
website: bccourts.ca
category: legal
tags:
  - legal
  - case-law
  - court
  - british-columbia
  - tenancy
  - read-only
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      No public JSON/REST API exists. Direct GET with form fields as query
      string is silently ignored (the page is ASP.NET WebForms — server expects
      a POST with a fresh __VIEWSTATE + __EVENTVALIDATION blob). Reconstructing
      the POST out-of-band is possible but brittle (viewstate rotates each
      request), so the browser is the only reliable path.
  - method: browser
    rationale: >-
      Mandatory. Stealth + residential proxies are NOT required — bccourts.ca is
      a public-sector site with no anti-bot. A bare session handles form
      submission, postback-based pagination, and judgment HTML retrieval
      end-to-end.
verified: true
proxies: true
---
# Search BC Supreme Court Judgments

## Purpose

Search the public judgments database of the **Supreme Court of British Columbia** (BCSC — the superior trial court of BC) on bccourts.ca and return a paged list of matching decisions with neutral citation, case name, decision date, court level, and a direct URL to the full-text judgment HTML. Designed to work for any topic but with first-class support for **landlord-tenant disputes** that reached BCSC (typically via judicial review of Residential Tenancy Branch decisions, petitions for orders of possession, or foreclosure proceedings affecting tenants). Read-only — does not file, comment on, or otherwise mutate court records.

**Naming disambiguation — this matters.** The user prompt often says "BC Supreme Court of Canada" or "Supreme Court of Canada" when they actually mean the **Supreme Court of British Columbia** (BCSC, on `bccourts.ca`). The **Supreme Court of Canada** (SCC) is a separate federal apex court whose judgments live at `decisions.scc-csc.ca`, not on bccourts.ca, and the bccourts.ca search page explicitly tells you so. If the request is about BC law / a BC dispute / a BC tribunal review, you want BCSC on bccourts.ca — that's this skill. If the user genuinely needs SCC decisions, redirect to `scc-csc.ca`; this skill cannot serve them.

## When to Use

- "Find recent BC Supreme Court judgments about residential tenancy / eviction / Residential Tenancy Branch judicial review."
- Boolean / phrase / case-name / citation / judge / docket / registry-location search of the official BC judgments index.
- Locating the canonical full-text HTML URL of a known BCSC decision (`2024 BCSC 1234` → `https://www.bccourts.ca/jdb-txt/sc/24/12/2024BCSC1234.htm`).
- Date-bounded surveys (e.g. "all BCSC RTA judicial reviews in 2024").
- Distinguishing whether a tenancy dispute actually reached BCSC (vs. staying at the administrative tribunal or in Provincial Court Small Claims).

Not appropriate for: searching Supreme Court of Canada decisions (different domain — `scc-csc.ca`); searching BC Provincial Court judgments (different domain — `provincialcourt.bc.ca`); searching the Residential Tenancy Branch's own decisions (that's `housing.gov.bc.ca`, and most RTB arbitration decisions are not publicly indexed at all).

## Workflow

The bccourts.ca judgments search is a classic **ASP.NET WebForms** page driven by a server-side `__VIEWSTATE` blob. There is **no public JSON/REST API**, no GET-with-query-string shortcut (verified — a GET to `search_judgments.aspx?TabContainer$search$txtFullText=...` returns the empty form, no results), and CanLII (the third-party mirror at canlii.org) is Datadome-protected and returns 403 to headless fetch. Therefore the browser is the only viable surface.

Stealth is **not required**: bccourts.ca is a public-sector site with no anti-bot. Residential proxy is **not required**. A bare `browse cloud sessions create` (no `--verified`, no `--proxies`) handles the workflow end-to-end and is the cheapest, fastest configuration. The validation run that produced this skill used `--verified --proxies` out of caution; subsequent runs should drop them.

### 1. Open a session and the search page

```bash
SID=$(browse cloud sessions create --keep-alive \
      | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s.slice(s.indexOf('{'))).id))")
export BROWSE_SESSION="$SID"
browse open "https://www.bccourts.ca/search_judgments.aspx" --remote --session "$SID"
browse wait load --remote --session "$SID"
```

### 2. Fill the form via `browse eval`

The form lives inside an AJAX `TabContainer`. `browse fill` against the human-visible labels works but is brittle (the tab strip and validators occasionally intercept); `browse eval` against the DOM IDs is the reliable path.

| Field | DOM ID | Notes |
|---|---|---|
| Neutral Citation | `TabContainer_search_txtCitation` | Format `YYYY BCSC ####` (e.g. `2024 BCSC 1234`). |
| Case Name | `TabContainer_search_txtCaseName` | Substring against the styled case name (e.g. `Naderi` matches both `Naderi v. Cheng` and `Naderi v. Naderi`). |
| Exact case name | `TabContainer_search_chkExact` | Checkbox; pair with Case Name. |
| Full Text | `TabContainer_search_txtFullText` | Boolean engine. Use `"residential tenancy"` (quoted) for phrase; `A AND B`, `A OR B`, `A NOT B` for operators. **In the absence of operators the engine implies a phrase search**, per the site's own help text. |
| Date From / To | `TabContainer_search_txtFrom` / `TabContainer_search_txtTo` | **`MM/DD/YYYY`** format (US-style, despite the rest of the site using ISO `YYYY/MM/DD` in result rows). Both inclusive. |
| Court | `TabContainer_search_radBCCA` / `radBCSC` / `radBoth` | Pick exactly one. **For BC Supreme Court only, set `radBCSC.checked = true`.** Default if none chosen tends to favour both. |
| Judge | `TabContainer_search_txtJudge` | Surname substring. |
| Docket | `TabContainer_search_txtDocket` | Registry file number. |
| Registry Location | `TabContainer_search_ddlLocation` | `<select>` — values are city names like `Vancouver`, `New Westminster`, `Victoria`. Leave blank for province-wide. |
| Submit | `TabContainer_search_btnSubmit` | `<input type=submit>` — `browse click "#TabContainer_search_btnSubmit"`. |

```bash
browse eval "
(() => {
  document.getElementById('TabContainer_search_txtFullText').value = '\"Residential Tenancy Act\" AND \"judicial review\"';
  document.getElementById('TabContainer_search_radBCSC').checked = true;
  document.getElementById('TabContainer_search_txtFrom').value = '01/01/2023';
  document.getElementById('TabContainer_search_txtTo').value = '12/31/2025';
  return 'ok';
})()
" --remote --session "$SID"
browse click "#TabContainer_search_btnSubmit" --remote --session "$SID"
browse wait load --remote --session "$SID"
```

### 3. Read total count and extract result rows

The total result count is rendered as text on the page in the form `Number found: <N>` (the count is wrapped in the same `<span>` as a discrepancy-disclaimer sentence). The result table has DOM ID `gvResults` — header row at index 0, **50 result rows per page** at indices 1..50, pager row at index 51 (or last). Each result row is a **single `<td>`** containing two `<a>` elements and a free-text block; cell count is always 1.

Each result row's text follows the shape:

```
{CaseName}, {YYYY} BCSC {####} – {YYYY/MM/DD} Supreme Court Highlighted more ...
```

Parse with `/^(.+?), (\d{4}) (BCSC|BCCA) (\d+) – (\d{4}\/\d{2}\/\d{2}) (Supreme Court|Court of Appeal)/`. The two anchors are:

1. **Direct judgment HTML** — `https://www.bccourts.ca/jdb-txt/sc/{YY}/{HH}/{YYYY}BCSC{####}.htm` where `{YY}` is the two-digit year and `{HH}` is `floor(####/100)` zero-padded to 2 digits (file-bucket folder). Corrections add a `cor1`/`cor2` suffix before `.htm`. Example: `2025 BCSC 2362` (corrected) → `/jdb-txt/sc/25/23/2025BCSC2362cor1.htm`. **Always take the URL from the anchor — do not synthesize it, because of `cor1` suffixes and occasional folder anomalies.**
2. **Highlighter snippet URL** — `https://www.bccourts.ca/Highlighter.aspx?DocId={N}&Index=W%3A%5CInternet%5CsearchIndex&HitCount={K}&hits={hex-offsets}` — produces a contextual preview with search terms bolded. Useful as a "preview" link.

```bash
browse eval "
(() => {
  const t = document.getElementById('gvResults');
  if (!t) {
    // 'No Results' page — there is no gvResults table at all
    const msg = document.body.textContent.match(/No Results/i);
    return JSON.stringify({total: 0, rows: [], reason: msg ? 'no_results' : 'unknown'});
  }
  const total = parseInt((document.body.textContent.match(/Number found:?\s*(\d+)/i)||[])[1] || '0', 10);
  const rows = [];
  // Skip header (i=0) and pager (last row).
  for (let i = 1; i < t.rows.length - 1; i++) {
    const r = t.rows[i];
    if (r.cells.length !== 1) continue;
    const txt = r.textContent.replace(/\s+/g,' ').trim();
    const m = txt.match(/^(.+?),\s+(\d{4})\s+(BCSC|BCCA)\s+(\d+)\s+–\s+(\d{4}\/\d{2}\/\d{2})/);
    const aJudg  = r.querySelector('a[href*=\"/jdb-txt/\"]');
    const aHlt   = r.querySelector('a[href*=\"Highlighter.aspx\"]');
    rows.push({
      case_name: m ? m[1] : null,
      citation:  m ? `${m[2]} ${m[3]} ${m[4]}` : null,
      court:     m ? m[3] : null,
      year:      m ? parseInt(m[2],10) : null,
      number:    m ? parseInt(m[4],10) : null,
      decision_date: m ? m[5].replace(/\//g,'-') : null,
      judgment_url:  aJudg ? aJudg.href : null,
      snippet_url:   aHlt  ? aHlt.href  : null
    });
  }
  return JSON.stringify({total, rows});
})()
" --remote --session "$SID"
```

### 4. Paginate

The pager row exposes JavaScript-postback anchors. There is **no URL change** between pages — the result set is reconstructed from `__VIEWSTATE` on the server. Pages are 50 results each. The visible pager shows pages 1..10 plus a `...` link; clicking `...` advances the visible window by 10. To jump to an arbitrary page, drive `__doPostBack` directly:

```bash
browse eval "__doPostBack('gvResults', 'Page\$3')" --remote --session "$SID"
browse wait load --remote --session "$SID"
```

For very wide queries (`Number found: 3174` on the bare term `tenancy`, observed 2026-05-24), iterate until `Math.ceil(total/50)`. A landlord-tenant filter (`"Residential Tenancy Act" AND "judicial review"` 2023-01-01 to 2025-12-31) returns ~144 results — three pages — which is typical.

### 5. Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

### 6. Recommended landlord-tenant query patterns

Tenancy disputes in BC follow a layered jurisdiction. Most disputes start at the **Residential Tenancy Branch (RTB)** — an administrative tribunal under the *Residential Tenancy Act* — and reach **BCSC only by**:

| Path to BCSC | Recommended `Full Text` query |
|---|---|
| Judicial review of an RTB decision | `"Residential Tenancy Branch" AND "judicial review"` |
| Petition for order of possession (above provincial small-claims cap) | `"order of possession" AND landlord` |
| Trespass / occupation disputes outside RTA scope | `"Residential Tenancy Act" AND ("non-residential" OR "not a tenancy")` |
| RTA + foreclosure intersection (tenants of mortgaged properties) | `"Residential Tenancy Act" AND foreclosure` |
| All RTA-citing decisions (broadest useful net) | `"Residential Tenancy Act"` |
| All tenancy-mentioning decisions (very broad — includes commercial leases) | `tenancy` |

Always pair these with `radBCSC` to filter out the Court of Appeal layer. To capture appeals from BCSC judicial-review decisions, run the same query with `radBoth` and post-filter by `court === 'BCCA'`.

## Site-Specific Gotchas

- **"BC Supreme Court" ≠ "Supreme Court of Canada".** Users (and LLMs) routinely conflate them. bccourts.ca is the BC superior trial court; the SCC is at `scc-csc.ca` and is out of scope for this skill. The search page itself says: *"To search judgments of the Supreme Court of Canada or of other Canadian courts, please visit their websites."* If your prompt is genuinely SCC-bound, fail loudly rather than returning BCSC results.
- **Residential-tenancy law in BC mostly lives outside BCSC.** The Residential Tenancy Branch handles ~99% of tenancy arbitration; its own decisions are *not* indexed on bccourts.ca and largely not public. A BCSC search for "landlord-tenant disputes" therefore returns the small slice that reached the superior court (judicial reviews, large-dollar petitions, foreclosure intersections). Set user expectations accordingly — a "0 results" or "low double-digit results" outcome can be the right answer for a narrow query.
- **ASP.NET WebForms — no GET shortcut, no JSON API.** The form is driven by `__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR` hidden inputs. A GET to `search_judgments.aspx?TabContainer$search$txtFullText=...` ignores the query string and serves the empty form. POST without a fresh viewstate gets rejected. Browser is mandatory.
- **CanLII (third-party mirror) is Datadome-protected.** `browse cloud fetch https://www.canlii.org/...` returns 403 with `X-Datadome: protected`. Don't try to route around bccourts.ca via canlii.org for headless flows — even with `--proxies`, you'll hit the captcha wall.
- **Stealth + residential proxies are NOT needed.** A bare session works. The validation run that produced this skill used `--verified --proxies` defensively, but every form-submit, pagination postback, and judgment-HTML GET succeeded against unproxied direct IPs in subsequent spot-checks. Save the cost.
- **Date format is `MM/DD/YYYY`** in the search inputs, even though the result rows render dates as ISO `YYYY/MM/DD`. Sending `2024-01-01` or `2024/01/01` in the From/To fields is silently ignored (no validation error — just no date filter applied). Always format as `01/01/2024`.
- **"Full Text" without operators is a phrase search, not a bag-of-words.** Per the page's own help text: *"In the absence of operators, the search engine will imply a phrase search."* So `residential tenancy act` and `"Residential Tenancy Act"` return the same results; `residential AND tenancy` is what gets you the boolean expansion.
- **Result rows are a single `<td>` of mixed text + anchors** — not a multi-column table. Parse by regex on the row's text content; pull the judgment URL from the `a[href*="/jdb-txt/"]` anchor and the snippet preview from the `a[href*="Highlighter.aspx"]` anchor.
- **Pagination is JS-only postback.** Clicking page numbers fires `__doPostBack('gvResults', 'Page$N')`. The URL never changes (it stays `search_judgments.aspx#SearchTitle`), so the page can't be deep-linked. To collect all N pages of a wide query, drive `browse eval "__doPostBack('gvResults', 'Page\$K')"` for `K = 2..ceil(total/50)`, calling `wait load` between each. The pager only renders 10 page links at a time + a `...` link to advance the window — but `__doPostBack` accepts any page number, so jump directly.
- **Judgment URL pattern is `{YY}/{HH}/{YYYY}BCSC{####}.htm` where `{HH} = floor(####/100)`.** Verified across `2026 BCSC 904` → `26/09/`, `2025 BCSC 2082` → `25/20/`, etc. But corrections add a `cor1`/`cor2` suffix (e.g. `2025BCSC2362cor1.htm`), and occasional cases have folder anomalies. **Always take the anchor's `href` from `gvResults` rather than synthesizing the URL from the citation alone** — synthesis will 404 on corrections.
- **Zero results renders no `gvResults` table at all** — just the text "No Results" on the page. Branch on `document.getElementById('gvResults') === null` to detect this case; otherwise the result-row loop iterates over `undefined`.
- **There may be some discrepancies in the search results due to the way the historical data was compiled** — this disclaimer is in the header of the gvResults table on every search. The site warns that older decisions (pre-~2000s) may have incomplete metadata. For dispositive legal research, cross-reference with CanLII (manually — see Datadome note above) or a paid service.
- **Court Registry location dropdown has a stray leading blank entry** before `100 Mile House`. If round-tripping the dropdown value, the empty `value=""` is "no filter" (good); `value="-- Unknown --"` (the first option) is invalid — don't select it.
- **The Court of Appeal and Supreme Court share the same search page**, with `radBCCA` / `radBCSC` / `radBoth` as the discriminator. Despite the URL being `search_judgments.aspx` (no court qualifier), forgetting to select `radBCSC` and leaving the default returns both court levels mixed together, which is rarely what a "BC Supreme Court judgments" prompt wants.

## Expected Output

```json
{
  "query": {
    "full_text": "\"Residential Tenancy Act\" AND \"judicial review\"",
    "court": "BCSC",
    "date_from": "2023-01-01",
    "date_to": "2025-12-31"
  },
  "total_results": 144,
  "page": 1,
  "page_size": 50,
  "results": [
    {
      "case_name": "Banni v. Coast Foundation Society (1974) (Coast Mental Health)",
      "citation": "2025 BCSC 2362",
      "court": "BCSC",
      "year": 2025,
      "number": 2362,
      "decision_date": "2025-12-01",
      "judgment_url": "https://www.bccourts.ca/jdb-txt/sc/25/23/2025BCSC2362cor1.htm",
      "snippet_url": "https://www.bccourts.ca/Highlighter.aspx?DocId=..."
    },
    {
      "case_name": "Ferguson v. Candou Industries Ltd.",
      "citation": "2025 BCSC 2430",
      "court": "BCSC",
      "year": 2025,
      "number": 2430,
      "decision_date": "2025-11-28",
      "judgment_url": "https://www.bccourts.ca/jdb-txt/sc/25/24/2025BCSC2430.htm",
      "snippet_url": "https://www.bccourts.ca/Highlighter.aspx?DocId=..."
    }
  ]
}
```

Zero-results shape:

```json
{
  "query": { "full_text": "xyzqqq-no-match", "court": "BCSC" },
  "total_results": 0,
  "page": 1,
  "page_size": 50,
  "results": [],
  "reason": "no_results"
}
```

Wrong-court warning (when the prompt asked for "Supreme Court of Canada" but the skill defaulted to BCSC):

```json
{
  "warning": "wrong_court",
  "message": "The prompt mentioned 'Supreme Court of Canada' (SCC), which is a different court from the BC Supreme Court (BCSC) indexed at bccourts.ca. For SCC decisions, use https://decisions.scc-csc.ca. Returning BCSC results as a best-guess interpretation."
}
```
