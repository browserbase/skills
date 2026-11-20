---
name: apple-com-apple-pdf-reducto-extract-385j2s
title: Apple 10-Q/10-K PDF → Reducto Structured Financials
description: >-
  Resolves the latest Apple 10-Q or 10-K PDF on investor.apple.com (Q4Inc-hosted
  CDN), then calls Reducto's Extract API by URL-passthrough to return revenue,
  product + geographic segment breakdown, EPS, and key balance-sheet items as
  schema-validated JSON. Read-only.
website: apple.com
category: finance
tags:
  - finance
  - sec-filings
  - 10-k
  - 10-q
  - reducto
  - pdf-extraction
  - investor-relations
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: api
alternative_methods:
  - method: api
    rationale: >-
      Reducto's /extract endpoint accepts a public URL as `input` (URL
      passthrough). The PDF is fetched server-side by Reducto's workers — no
      local download, no multipart upload, no 24-hour file_id expiry. Verified
      live: 10-Q (980 KB), 10-K (1.85 MB), and the slim Consolidated Financial
      Statements (110 KB) all serve as 200 application/pdf from
      s2.q4cdn.com/470004039.
  - method: hybrid
    rationale: >-
      When URL passthrough is impossible (PDF behind VPN, custom auth, etc.),
      download to local disk first then POST to /upload to get a `reducto://...`
      file_id (valid 24 h), then call /extract with that file_id as `input`.
      Same schema, 2 HTTP round-trips instead of 1.
  - method: browser
    rationale: >-
      Fallback only — used when both investor.apple.com homepage parsing AND SEC
      EDGAR's submissions JSON are unreachable. Apple's IR site is bare-friendly
      (no anti-bot wall observed); a non-stealth `browse cloud sessions create`
      session fetches the homepage and PDF anchors fine.
verified: true
proxies: true
---
# Apple 10-Q / 10-K PDF → Reducto Structured Financial Extraction

## Purpose

Download a quarterly (10-Q) or annual (10-K) financial PDF from Apple's investor relations site (`investor.apple.com`), send it to Reducto's document-AI platform (`platform.reducto.ai`), and return structured JSON containing revenue, segment breakdown (product line + geographic), EPS (basic + diluted), and key balance-sheet items. Read-only — never submits forms or modifies Apple/Reducto state.

## When to Use

- Quarterly financial-data refresh for an Apple watchlist (run after each 10-Q/10-K filing — Apple files ~Jan 30, ~May 1, ~Aug 1, ~Oct 31 each fiscal year).
- Backfilling historical fundamentals across multiple Apple fiscal quarters or years.
- Any pipeline that needs structured financials sourced *from the original SEC PDF* rather than a third-party API, with citations linking each field back to a page/bbox in the source document.
- Comparable extraction against other large-cap issuers — the same `platform.reducto.ai/extract` schema works on any 10-Q/10-K PDF; this skill encodes the Apple-specific PDF-discovery half.

## Workflow

The fastest path **skips the PDF download entirely**: Reducto's `/parse` and `/extract` endpoints accept a public URL as `input` (URL passthrough), so the runtime simply hands Reducto the `s2.q4cdn.com/...` URL and lets Reducto fetch it server-side. No local file I/O, no multipart upload, no 24-hour `file_id` expiry to manage. The browser path exists as a fallback for when the canonical PDF index moves.

**Prerequisites the caller must supply**

- `REDUCTO_API_KEY` — Bearer token from `studio.reducto.ai` → API Keys. The skill cannot run without one; Reducto does not have an unauthenticated tier for `/parse` or `/extract`.

### 1. Resolve the target PDF URL

Apple publishes every 10-Q and 10-K as a PDF on its Q4Inc-powered CDN (`s2.q4cdn.com/470004039/...`) and surfaces the links directly on the `investor.apple.com` homepage in a section titled **Financial Data → Quarterly Earnings Reports**. The canonical resolver is to scrape that homepage — naming conventions drift year over year so hand-constructing the URL from a template is unreliable (see Gotchas).

```bash
# Fetch the IR homepage and pull every Q4 CDN PDF link
curl -fsSL 'https://investor.apple.com/' \
  | grep -oE 'https://s2\.q4cdn\.com/470004039/files/[^"]+\.pdf' \
  | sort -u
```

Observed shape of the result (2026-05-21 snapshot, fiscal-year sorted desc):

| Filing | URL pattern (verified live) |
|---|---|
| Latest 10-Q (Q2 FY26) | `https://s2.q4cdn.com/470004039/files/doc_earnings/2026/q2/filing/10Q-Q2-2026-as-filed.pdf` |
| Q1 FY26 10-Q | `https://s2.q4cdn.com/470004039/files/doc_earnings/2026/q1/filing/10Q-Q1-2026-as-filed.pdf` |
| FY25 10-K (Q4) | `https://s2.q4cdn.com/470004039/files/doc_financials/2025/ar/_10-K-2025-As-Filed.pdf` |
| FY25 Q3 10-Q | `https://s2.q4cdn.com/470004039/files/doc_earnings/2025/q3/filing/10Q-Q3-2025-as-filed.pdf` |
| FY24 10-K | `https://s2.q4cdn.com/470004039/files/doc_earnings/2024/q4/filing/10-Q4-2024-As-Filed.pdf` |
| FY23 10-K | `https://s2.q4cdn.com/470004039/files/doc_earnings/2023/q4/filing/_10-K-Q4-2023-As-Filed.pdf` |
| FY22 10-K | `https://s2.q4cdn.com/470004039/files/doc_financials/2022/q4/_10-K-2022-(As-Filed).pdf` |

For lighter parsing, Apple also publishes a 3-page **Consolidated Financial Statements** PDF per quarter (~110 KB vs ~1 MB for the full 10-Q) at `https://www.apple.com/newsroom/pdfs/fy{YYYY}{q}/FY{YY}_{Q}_Consolidated_Financial_Statements.pdf` — same income statement, segment, EPS, and balance sheet, just stripped of MD&A. Use this when you don't need the narrative sections.

**Alternate discovery** — if `investor.apple.com` is unreachable, fall back to SEC EDGAR's JSON submissions API which is rock-solid and unauthenticated:

```bash
curl -fsSL 'https://data.sec.gov/submissions/CIK0000320193.json' \
  -H 'User-Agent: your-name your-email@example.com'  # SEC requires a UA
```

The JSON has `filings.recent.{form, filingDate, accessionNumber, primaryDocument}` parallel arrays; for entries where `form == "10-K"` or `"10-Q"`, the primary document URL is `https://www.sec.gov/Archives/edgar/data/320193/{accessionNumber-with-dashes-stripped}/{primaryDocument}`. **Note: the EDGAR primary document is the inline HTML, not a PDF.** Reducto's Parse + Extract accept HTML input ("Supported file types: PDF, ... DOCX, ... + HTML via URL"), so this path still works — but it returns HTML-derived structure, not PDF-derived. Prefer the Q4 CDN PDF for Reducto-native PDF parsing.

### 2. Call Reducto Extract with a JSON schema (URL passthrough)

The most efficient call is a single POST to `https://platform.reducto.ai/extract` with the PDF URL as `input`. Reducto runs Parse server-side, then the LLM-backed extractor returns only the fields you defined.

```bash
PDF_URL='https://s2.q4cdn.com/470004039/files/doc_earnings/2026/q2/filing/10Q-Q2-2026-as-filed.pdf'

curl -fsSL -X POST 'https://platform.reducto.ai/extract' \
  -H "Authorization: Bearer $REDUCTO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "$(cat <<EOF
{
  "input": "$PDF_URL",
  "instructions": {
    "schema": {
      "type": "object",
      "properties": {
        "company_info": {
          "type": "object",
          "properties": {
            "name":             {"type": "string"},
            "ticker":           {"type": "string"},
            "cik":              {"type": "string"},
            "filing_type":      {"type": "string", "enum": ["10-K", "10-Q"]},
            "fiscal_period":    {"type": "string", "description": "e.g. 'Q2 FY26' or 'FY25'"},
            "period_end_date":  {"type": "string", "description": "Fiscal period end, YYYY-MM-DD"}
          }
        },
        "income_statement": {
          "type": "object",
          "description": "Consolidated Statements of Operations. All currency in USD millions unless noted.",
          "properties": {
            "total_net_sales":    {"type": "number"},
            "cost_of_sales":      {"type": "number"},
            "gross_margin":       {"type": "number"},
            "operating_expenses": {"type": "number"},
            "operating_income":   {"type": "number"},
            "net_income":         {"type": "number"},
            "eps_basic":          {"type": "number", "description": "Earnings per share, basic, in USD"},
            "eps_diluted":        {"type": "number", "description": "Earnings per share, diluted, in USD"},
            "shares_basic":       {"type": "number", "description": "Weighted-avg shares used in basic EPS (in thousands)"},
            "shares_diluted":     {"type": "number", "description": "Weighted-avg shares used in diluted EPS (in thousands)"}
          }
        },
        "segment_breakdown_products": {
          "type": "object",
          "description": "Net sales by product category from the segment information disclosure.",
          "properties": {
            "iphone":                          {"type": "number"},
            "mac":                             {"type": "number"},
            "ipad":                            {"type": "number"},
            "wearables_home_and_accessories":  {"type": "number"},
            "services":                        {"type": "number"}
          }
        },
        "segment_breakdown_geographic": {
          "type": "object",
          "description": "Net sales by reportable geographic segment.",
          "properties": {
            "americas":             {"type": "number"},
            "europe":               {"type": "number"},
            "greater_china":        {"type": "number"},
            "japan":                {"type": "number"},
            "rest_of_asia_pacific": {"type": "number"}
          }
        },
        "balance_sheet": {
          "type": "object",
          "description": "Selected items from the Consolidated Balance Sheets as of the period-end date.",
          "properties": {
            "cash_and_cash_equivalents":   {"type": "number"},
            "marketable_securities_current": {"type": "number"},
            "total_current_assets":        {"type": "number"},
            "total_assets":                {"type": "number"},
            "total_current_liabilities":   {"type": "number"},
            "long_term_debt":              {"type": "number"},
            "total_liabilities":           {"type": "number"},
            "total_shareholders_equity":   {"type": "number"}
          }
        }
      },
      "required": ["company_info", "income_statement", "segment_breakdown_products", "balance_sheet"]
    }
  },
  "settings": {
    "citations": {"enabled": true, "numerical_confidence": false}
  }
}
EOF
)"
```

The response is a `V3ExtractResponse` whose `result[0]` matches your schema. `citations` (when enabled) attaches per-field source bboxes so the caller can verify each number against the original PDF. Cost is roughly **5–7 Reducto credits per 10-Q** (≈25–40 pages) and **15–25 credits per 10-K** (≈80–100 pages); use the smaller Consolidated Financial Statements PDF (~3 pages, ~1 credit) when MD&A isn't needed.

**SDK form (Python)** — identical semantics, terser:

```python
import os
from reducto import Reducto

client = Reducto()  # reads REDUCTO_API_KEY
result = client.extract.run(
    input="https://s2.q4cdn.com/470004039/files/doc_earnings/2026/q2/filing/10Q-Q2-2026-as-filed.pdf",
    instructions={"schema": SCHEMA_DICT},
    settings={"citations": {"enabled": True, "numerical_confidence": False}},
)
print(result.result[0])
```

### 3. (Optional) Two-step Upload + Extract when you must hold the PDF locally

Skip this unless URL passthrough is impossible (e.g., you have a PDF behind your VPN that Reducto's servers can't reach).

```bash
# Step a — upload
UPLOAD=$(curl -fsSL -X POST 'https://platform.reducto.ai/upload' \
  -H "Authorization: Bearer $REDUCTO_API_KEY" \
  -F "file=@10Q-Q2-2026-as-filed.pdf")
FILE_ID=$(node -pe "JSON.parse(process.argv[1]).file_id" "$UPLOAD")
# FILE_ID is "reducto://<uuid>.pdf"; valid for 24 hours.

# Step b — extract using the file_id as input (same body as Section 2 with input=$FILE_ID)
curl -fsSL -X POST 'https://platform.reducto.ai/extract' \
  -H "Authorization: Bearer $REDUCTO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"input\":\"$FILE_ID\",\"instructions\":{\"schema\":{...}}}"
```

Limits: 100 MB per direct upload (use presigned URLs for ≤5 GB); `reducto://` file IDs expire after 24 h.

### Browser fallback (only if both API paths fail)

Use this when Apple's homepage HTML changes, the Q4 CDN serves 403s, and SEC EDGAR is also unreachable — extremely unlikely but documented for completeness.

1. `browse cloud sessions create --keep-alive` — bare session is enough; Apple IR and SEC EDGAR are not anti-bot.
2. `browse open https://investor.apple.com/ --remote`
3. `browse eval "[...document.querySelectorAll('a[href$=\".pdf\"]')].map(a=>({text:a.textContent.trim(), href:a.href})).filter(o=>o.href.includes('s2.q4cdn.com') || o.href.includes('newsroom/pdfs'))"` — returns the full filings catalogue as JSON.
4. Pick the most recent 10-Q or 10-K href and feed it back into Section 2 as `PDF_URL`.

Never click into a "Download" or "Subscribe to alerts" button — those start an email-signup flow handled by Q4Inc's `login.q4inc.com` and are out of scope.

## Site-Specific Gotchas

- **`investor.apple.com/investor-relations/financial-data/default.aspx` is 404.** The historical Financial Data subpage was decommissioned in favour of folding all earnings PDFs into the IR homepage's "Financial Data → Quarterly Earnings Reports" accordion. Direct fetch of the old URL returns Q4inc's branded 404. Always start from `https://investor.apple.com/` and parse the homepage.
- **PDF naming is inconsistent across fiscal years — do not templated-construct URLs.** Observed in 2026-05 catalogue: FY26 Q1/Q2 use lowercase `10Q-Q{N}-{YYYY}-as-filed.pdf`; FY25 Q1–Q3 also lowercase; **FY24 10-K is `10-Q4-2024-As-Filed.pdf`** (note the typo-like `Q4` in a 10-K filename, plus mixed-case `As-Filed`); FY23 Q1/Q2 live under `doc_financials/` while FY23 Q3/Q4 and all of FY24/25/26 live under `doc_earnings/`; **FY22 10-K** uses parentheses: `_10-K-2022-(As-Filed).pdf`. The canonical resolver is always to scrape the homepage's anchor list rather than guess.
- **Consolidated Financial Statements PDF path also drifts.** `fy2026q2/FY26_Q2_Consolidated_Financial_Statements.pdf` has no hyphen; `fy2025-q4/FY25_Q4_Consolidated_Financial_Statements.pdf` has one. Scrape, don't template.
- **Apple's fiscal year is not the calendar year.** Apple's FY ends on the last Saturday of September. FY26 Q1 = Sep 28 2025 – Dec 27 2025; Q2 ends Mar 28 2026; Q3 ~Jun 27; Q4 (the 10-K) ~Sep 26. A "2026 10-K" doesn't exist until ~Oct 31 2026. When mapping calendar dates to filings, use SEC EDGAR's `period_end_date` (in the submissions JSON) as the canonical anchor.
- **EDGAR primary document is HTML, not PDF.** `data.sec.gov/submissions/CIK0000320193.json` lists `primaryDocument: "aapl-20260328.htm"` for 10-Q/10-K filings. EDGAR exposes a PDF rendering at `https://www.sec.gov/cgi-bin/viewer?action=view&cik=320193&type=10-Q&dateb=&owner=include&count=40`, but the canonical PDFs are Apple's own Q4-CDN copies. Reducto accepts both — pass whatever URL is closest at hand.
- **SEC EDGAR requires a `User-Agent` header.** `curl https://data.sec.gov/submissions/CIK0000320193.json` without `-H 'User-Agent: name email@example.com'` will succeed today from most IPs but the SEC's fair-use policy mandates it; failing to send a meaningful UA can get your IP rate-limited. The Q4-CDN endpoint has no such requirement.
- **Reducto file_id (`reducto://...`) expires in 24 hours.** If you upload-then-extract across a long delay, re-upload. URL passthrough sidesteps this entirely.
- **Reducto Extract returns numbers in document units, not normalized to USD.** Apple reports income-statement values in millions ("Total net sales $95,359" = $95.359B); EPS in dollars; share counts in thousands. The schema descriptions above match Apple's filings — do *not* try to coerce all numbers to a single unit in the schema.
- **Segment table changed pre-FY18.** Apple's "Wearables, Home and Accessories" line was reclassified in FY18; reading 10-K filings older than FY18 with the current product-segment schema will leave fields null. The Net Sales by Category reclassification PDF (`Net-Sales-By-Category-Qtrly-FY18.pdf` on the IR homepage) is the canonical bridge if you need to backfill.
- **Q4Inc-powered IR site is Akamai-fronted but bare-friendly.** `investor.apple.com` is served via Cloudflare + Q4inc's CDN, and a bare (un-stealthed) session fetches the homepage and Q4-CDN PDFs without issue — verified via `browse cloud fetch` with no proxies in 2026-05-21 run. The browser fallback does not need `--verified` or `--proxies`.
- **Reducto cookbook for this exact task exists.** `https://docs.reducto.ai/cookbooks/web-browsing-browserbase` and `https://docs.reducto.ai/cookbooks/financial-analysis` both use Apple 10-Q/10-K PDFs as their reference document. When in doubt, mirror the schema in those cookbooks — they're known-good against Apple's specific filing structure.
- **`citations: {enabled: true}` doubles roundtrip latency but is recommended.** Without citations, you get raw numbers with no provenance; with them, each field carries a bbox + page reference back into the PDF. For financial data where audit trail matters, the extra latency is worth it.

## Expected Output

A single JSON object matching the schema declared in step 2. Real shape from a Q2 FY26 10-Q (filed 2026-05-01) — values are illustrative of the structure, not a guaranteed snapshot:

```json
{
  "company_info": {
    "name": "Apple Inc.",
    "ticker": "AAPL",
    "cik": "0000320193",
    "filing_type": "10-Q",
    "fiscal_period": "Q2 FY26",
    "period_end_date": "2026-03-28"
  },
  "income_statement": {
    "total_net_sales": 95359,
    "cost_of_sales": 53814,
    "gross_margin": 41545,
    "operating_expenses": 15275,
    "operating_income": 26270,
    "net_income": 21882,
    "eps_basic": 1.46,
    "eps_diluted": 1.45,
    "shares_basic": 14994000,
    "shares_diluted": 15083000
  },
  "segment_breakdown_products": {
    "iphone": 46841,
    "mac": 7949,
    "ipad": 6402,
    "wearables_home_and_accessories": 7521,
    "services": 26645
  },
  "segment_breakdown_geographic": {
    "americas": 40315,
    "europe": 24454,
    "greater_china": 16002,
    "japan": 7298,
    "rest_of_asia_pacific": 7290
  },
  "balance_sheet": {
    "cash_and_cash_equivalents": 28162,
    "marketable_securities_current": 35257,
    "total_current_assets": 131697,
    "total_assets": 331233,
    "total_current_liabilities": 142500,
    "long_term_debt": 79100,
    "total_liabilities": 264101,
    "total_shareholders_equity": 67132
  },
  "_meta": {
    "source_pdf": "https://s2.q4cdn.com/470004039/files/doc_earnings/2026/q2/filing/10Q-Q2-2026-as-filed.pdf",
    "reducto_job_id": "<uuid>",
    "credits_used": 7
  }
}
```

When the requested filing does not yet exist (e.g., asking for FY26 10-K in May 2026), the resolver step returns no matching anchor on the homepage; emit `{"success": false, "reason": "filing_not_published", "latest_available": {"filing_type": "10-Q", "fiscal_period": "Q2 FY26", "period_end_date": "2026-03-28"}}` and stop before calling Reducto.

When Reducto returns a field as `null` (e.g., a 10-Q omits the full balance sheet detail), keep the key in the output with a `null` value rather than dropping it — downstream callers depend on the schema shape being stable.
