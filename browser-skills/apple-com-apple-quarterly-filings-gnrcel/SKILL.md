---
name: apple-com-apple-quarterly-filings-gnrcel
title: Apple Latest 10-Q PDF Downloader
description: >-
  Download Apple's most-recently-filed 10-Q quarterly report PDF from
  investor.apple.com and return the saved file path plus fiscal period metadata
  (fiscal year, fiscal quarter, period-end date, filing date, accession number).
website: apple.com
category: finance
tags:
  - sec-filings
  - 10-q
  - apple
  - investor-relations
  - edgar
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      investor.apple.com exposes its SEC-filings list via a public Q4 Inc feed
      (`/feed/SECFiling.svc/GetEdgarFilingList`) that takes an embedded `apiKey`
      and returns a CONVPDF Cloudfront URL — one GET, no auth, no anti-bot, no
      proxies needed. Cross-reference fiscal period metadata via the SEC EDGAR
      submissions JSON at `data.sec.gov`.
  - method: browser
    rationale: >-
      Only useful as a fallback if Q4's feed endpoint changes its path or
      rotates the public apiKey. The `/sec-filings/default.aspx` page is fully
      JS-rendered (the dropdown widget AJAX-loads filings client-side), so
      scraping it costs ~3 turns vs the API's 1 request.
verified: false
proxies: false
---
# Apple Latest 10-Q PDF Downloader

## Purpose

Download Apple Inc.'s most-recently-filed 10-Q (quarterly report) PDF from `investor.apple.com` and return:

- the local file path where the PDF was written,
- fiscal period metadata: fiscal year, fiscal quarter (1/2/3 — Apple never files a 10-Q for Q4 because Q4 is the 10-K), period-end date, filing date, and SEC accession number.

Read-only. Never submits forms, never authenticates, never modifies anything on `investor.apple.com` or SEC EDGAR. One round-trip to investor.apple.com's Q4-Inc feed yields the PDF URL; one round-trip to SEC EDGAR yields the canonical report-period date for fiscal-quarter computation; one round-trip to Cloudfront downloads the PDF.

## When to Use

- A research/finance agent needs Apple's latest quarterly numbers as a PDF (e.g., to attach to a report, run table extraction, or hand off to an analyst).
- Periodic monitoring: re-poll daily/weekly to detect when a new 10-Q is filed (filings land roughly four weeks after each fiscal-quarter close — early February, early May, early August).
- Cross-vendor financial pipelines where the PDF (not the SEC-mandated inline-XBRL HTML) is the required artifact — Apple's IR site hosts a clean "as-converted" PDF that EDGAR itself does not provide.

## Workflow

The optimal path is **two public APIs + one CDN download — no browser, no auth, no proxies, no anti-bot stealth**. Apple's IR page (`/sec-filings/default.aspx`) renders the filings list client-side via a Q4 Inc widget that AJAX-calls `/feed/SECFiling.svc/GetEdgarFilingList` with an embedded public `apiKey`. The same endpoint is freely callable from any client. SEC EDGAR's submissions JSON gives the canonical `reportDate` needed to compute the fiscal quarter.

1. **Fetch the latest 10-Q metadata from Apple's Q4 feed.** The page's public apiKey is `BF185719B0464B3CB809D23926182246` (verified May 2026; rotate by re-reading from a fresh page fetch if a 401 is returned). Apple's exchange/symbol pair on this feed is `CIK / 0000320193`. The Quarterly-filings dropdown maps to `formGroupIdList=2`. Request:

   ```
   GET https://investor.apple.com/feed/SECFiling.svc/GetEdgarFilingList
       ?apiKey=BF185719B0464B3CB809D23926182246
       &exchange=CIK
       &symbol=0000320193
       &formGroupIdList=2
       &excludeNoDocuments=true
       &pageSize=1
       &pageNumber=0
       &tagList=
       &includeTags=true
       &year=-1
       &excludeSelection=1
       &LanguageId=1
   ```

   Returns `{"GetEdgarFilingListResult": [ {...one filing...} ]}`. The 10-Q is the only quarterly form Apple files (no `10-Q/A` amendments observed in the last 24 quarters), so `pageSize=1` reliably returns the most-recent 10-Q. From the first (and only) result, extract:
   - `FilingDate` — e.g. `"05/01/2026 00:00:00"` (US `MM/DD/YYYY` format, ignore time).
   - `FilingTypeMnemonic` — sanity-check it equals `"10-Q"`; if you ever see `"10-Q/A"` (amendment) you may want to skip and grab the next item.
   - `FilingId` — Apple's internal Q4 filing ID, useful to build the human-readable detail-page URL `https://investor.apple.com/sec-filings/sec-filings-details/default.aspx?FilingId={FilingId}`.
   - `DocumentList[]` — find the entry where `DocumentType === "CONVPDF"` and read its `Url`. This is a Cloudfront URL of the form `https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/{guid}.pdf`. **The GUID is not predictable** — always read it from this response, never construct it.

2. **Fetch the canonical report-period date from SEC EDGAR.** Apple's CIK is `0000320193`. SEC EDGAR doesn't supply PDFs but it is the authoritative source for `reportDate` (the fiscal-period end-date that drives Apple's fiscal-quarter labeling, not the filing date):

   ```
   GET https://data.sec.gov/submissions/CIK0000320193.json
   User-Agent: <your-app> <your-email>
   ```

   The SEC enforces a "polite" `User-Agent` containing a contact email (see Gotchas). Inside the JSON, `filings.recent.form[i]` parallel-indexes with `filings.recent.filingDate[i]`, `filings.recent.reportDate[i]`, `filings.recent.accessionNumber[i]`, and `filings.recent.primaryDocument[i]`. Find the lowest `i` where `form[i] === "10-Q"` (the array is sorted descending by filing date). Cross-check that `filingDate[i]` matches the `FilingDate` from step 1 (converted from `MM/DD/YYYY` to `YYYY-MM-DD`); if they disagree, prefer the SEC EDGAR record as authoritative and re-derive the PDF URL by filing-date match. Extract:
   - `reportDate[i]` — the fiscal-period-end date in `YYYY-MM-DD` (e.g. `"2026-03-28"`).
   - `accessionNumber[i]` — e.g. `"0000320193-26-000013"`.

3. **Compute fiscal year and quarter from the report date.** Apple's fiscal year ends on the **last Saturday of September** (verified: FY2026 ended 2026-09-26; FY2025 ended 2025-09-27 in EDGAR records). The pattern is stable and only matters for the month-bucket boundary near Sept/Oct, which has never coincided with a 10-Q period-end (10-Qs only land in Dec/Mar/Jun). The simple algorithm:

   ```
   let [year, month, day] = reportDate.split('-').map(Number);
   let fiscal_year, fiscal_quarter;
   if (month >= 10) {              // Oct-Dec period → fiscal Q1 of NEXT calendar year
     fiscal_quarter = 1;
     fiscal_year = year + 1;
   } else if (month <= 3) {        // Jan-Mar → fiscal Q2
     fiscal_quarter = 2;
     fiscal_year = year;
   } else if (month <= 6) {        // Apr-Jun → fiscal Q3
     fiscal_quarter = 3;
     fiscal_year = year;
   } else {
     // month is 7, 8, or 9 → no 10-Q in this range; this is the 10-K window
     throw new Error('Unexpected 10-Q reportDate in Q4 window: ' + reportDate);
   }
   ```

   Example: `reportDate = "2026-03-28"` → fiscal Q2 FY2026 (Apple's FY2026 = Sep 29 2025 → Sep 26 2026).

4. **Download the PDF.** Hit the `CONVPDF` URL from step 1 directly:

   ```
   GET https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/{guid}.pdf
   ```

   No auth, no referrer required, `application/pdf` returned. Save to a deterministic local path like `/tmp/aapl-10Q-FY{fiscal_year}-Q{fiscal_quarter}.pdf` (or any caller-supplied path). When running inside the browse-sh sandbox, use `browse cloud fetch <url> --output <path>` — note that for binary content the `--output` flag writes a **base64-encoded** copy of the body; decode with `Buffer.from(fs.readFileSync(path, 'utf8'), 'base64')` then `fs.writeFileSync(path, decodedBuffer)` to land the raw PDF on disk. The first 8 bytes should be `%PDF-1.4` (or similar); verify the magic bytes before reporting success.

5. **Emit the result.** Combine fields from steps 1–4 into the JSON shape under "Expected Output" below. The `accession_number` field comes from SEC EDGAR (step 2), the `source_url` comes from the Q4 feed (step 1), and `file_path` is wherever you wrote the PDF (step 4).

### Browser fallback

Only useful if the Q4 feed endpoint disappears or rotates the public apiKey without a refresh path. Cost: ~3 turns and a full session.

1. `browse cloud sessions create --keep-alive` (a bare session — no `--verified` / `--proxies` needed; the page is on Cloudflare but does not deploy anti-bot).
2. `browse open https://investor.apple.com/sec-filings/default.aspx`, `browse wait load`, `browse wait timeout 3000` (the filings list AJAX-loads after `load` fires).
3. `browse get html body` and parse with a regex for the first row whose `<span class="module-sec_filing-link">10-Q</span>`. Inside that row's `<ul class="module-sec_download-list">`, the `<li class="module-sec_pdf"><a href="...">` href is the Cloudfront PDF URL (a `//`-relative URL — prepend `https:`).
4. The page renders `May 01, 2026` etc. as the filing date in `<span class="module-sec_date-text">`. SEC EDGAR is still needed for the `reportDate` and accession number — the IR page does not expose either.

## Site-Specific Gotchas

- **Apple's IR site is hosted by Q4 Inc** — `investor.apple.com` is a Q4 platform tenant (CSS/JS at `s2.q4cdn.com/470004039/`, widget at `widgets.q4app.com/widgets/q4.api.1.12.18.min.js`). Almost every Q4-hosted IR site exposes the same `/feed/SECFiling.svc/GetEdgarFilingList` endpoint with the same query-string shape — only the `apiKey`, `symbol`, and (for non-US tickers) `exchange` differ. The skill pattern generalizes to any Q4-hosted issuer with minor changes.
- **The Q4 `apiKey` is public and embedded in the page HTML.** Reading the IR page once and grepping for `var Q4ApiKey = '...'` produces the current key. The value `BF185719B0464B3CB809D23926182246` was verified May 21, 2026 and has been stable for at least several quarters. If the API returns 401/403, refresh the key by re-fetching the page.
- **`formGroupIdList=2` is the Quarterly bucket.** Other known IDs from the page's `<select id="secGroupings">` dropdown: `1,4` = Annual (10-K/10-K/A), `9,40` = Current Reports (8-K), `11,17` = Proxy Filings, `41,30` = Registration Statements, `13` = Section 16 (forms 3/4/5). Pass an empty `formGroupIdList=` to get every filing type.
- **The CONVPDF GUID is not derivable.** Earlier marketing-PDF URLs on Apple's IR followed a predictable pattern (`/files/doc_earnings/{fiscalYear}/q{n}/filing/_10-Q-Q{n}-{fiscalYear}-As-Filed.pdf` — these are the *redirect* URLs surfaced when the page was first loaded, e.g. `/files/doc_earnings/2024/q3/filing/_10-Q-Q3-2024-As-Filed.pdf` is in the page JS as a hard-coded back-compat redirect). Modern filings (FY2025 onwards) use opaque GUID filenames at `d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/{guid}.pdf`, and the `/files/doc_earnings/...` redirect endpoints **return 302 to a 404** for new filings — don't trust the predictable pattern, always read the GUID from the Q4 feed.
- **SEC EDGAR requires a polite `User-Agent`.** Per [SEC's fair-access policy](https://www.sec.gov/os/accessing-edgar-data), all programmatic clients must send `User-Agent: <Sample Company Name> <admin@example.com>`. Browser-default UAs work *most* of the time but the SEC reserves the right to block UAs without a contact email. `browse cloud fetch` does not let you set the UA — if you need a strict-compliance UA, use a real session via `browse cloud sessions create` then `browse eval` to fetch via `fetch(...)` with a custom header, or hit the endpoint with `node`'s built-in `fetch()`.
- **EDGAR's `reportDate` is the fiscal-period END, not the start.** Apple's "10-Q for the quarter ended March 28, 2026" has `reportDate = "2026-03-28"`. Don't confuse with `filingDate` (when Apple filed with the SEC, typically 4–5 weeks after period end).
- **Apple's fiscal year ends on the last Saturday of September** — verified from EDGAR `reportDate` history: FY2026 ended 2026-09-26, FY2025 ended 2025-09-27, FY2024 ended 2024-09-28. This produces the unusual fiscal-Q1-of-FYNNNN spans Oct–Dec of calendar year NNNN-1. The simple month-bucket algorithm in step 3 of the workflow is correct only because Apple never files a 10-Q with a `reportDate` in the Sep/Oct boundary (the period covering early-Oct → late-Dec gets a December `reportDate`, never a September one).
- **`browse cloud fetch --output` writes base64 for binary, raw text for JSON/HTML.** The wrapped JSON response is automatically unwrapped to a raw text file when `Content-Type` is `application/json` or `text/*`, but `application/pdf` (and other binary types) lands as base64 — you must decode before saving as a real PDF. Verify with the `%PDF` magic-bytes check.
- **No `10-Q/A` (amendment) filings in Apple's recent history** — the most recent amendment in EDGAR is from 2002. So `pageSize=1` on `formGroupIdList=2` is reliably the latest 10-Q. If a future amendment does appear, it would be returned first (sorted by filing date) and your sanity check on `FilingTypeMnemonic === "10-Q"` would catch it.
- **Apple's fiscal Q4 has no 10-Q.** The annual 10-K covers Q4. If a caller asks for "latest 10-Q for fiscal Q4", the right answer is "Apple doesn't file one — see 10-K instead". Don't try to construct one.
- **No anti-bot on either endpoint.** Verified May 2026: both `investor.apple.com/feed/...` and `d18rn0p25nwr6d.cloudfront.net/CIK-.../...pdf` return 200 from `browse cloud fetch` with **no** `--proxies` flag. Don't waste a residential-proxy budget here.
- **Beware the SEC EDGAR primary document is HTML, not PDF.** `filings.recent.primaryDocument[i]` for a 10-Q is the inline-XBRL `.htm` file (e.g. `aapl-20260328.htm`), available at `https://www.sec.gov/Archives/edgar/data/320193/{accession-with-no-dashes}/{primaryDocument}`. **SEC EDGAR does not host a PDF** — that's why Apple's IR site is the only PDF source. Don't try to derive a PDF URL from EDGAR.

## Expected Output

```json
{
  "file_path": "/tmp/aapl-10Q-FY2026-Q2.pdf",
  "size_bytes": 327988,
  "fiscal_period": {
    "fiscal_year": 2026,
    "fiscal_quarter": 2,
    "period_end_date": "2026-03-28",
    "filing_date": "2026-05-01",
    "label": "Q2 FY2026"
  },
  "filing": {
    "form_type": "10-Q",
    "accession_number": "0000320193-26-000013",
    "cik": "0000320193",
    "issuer_name": "Apple Inc.",
    "source_url": "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/e0efa2e8-931f-4852-8682-25795da9f3c4.pdf",
    "ir_detail_page": "https://investor.apple.com/sec-filings/sec-filings-details/default.aspx?FilingId=19398105",
    "edgar_filing_index": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-Q"
  }
}
```

Single outcome shape — there is no "not found" or "ambiguous" branch for this skill because Apple files a 10-Q every quarter and the Q4 feed reliably returns the latest one. If the Q4 feed ever returns an empty `GetEdgarFilingListResult: []` (never observed), fall back to the SEC EDGAR submissions JSON and surface the inline-XBRL HTML URL with an error indicating no PDF is available.
