---
name: apple-com-apple-pdf-reducto-extract-8cbngf
title: Apple Financial PDF → Reducto Structured Extract
description: >-
  Download Apple's quarterly Condensed Consolidated Financial Statements PDF
  from apple.com/newsroom and POST it to Reducto's /extract endpoint with a JSON
  Schema to return structured revenue, segment + product breakdowns, EPS, and
  balance-sheet line items. Read-only.
website: apple.com
category: finance
tags:
  - finance
  - earnings
  - pdf
  - reducto
  - apple
  - document-ai
  - extract
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      PDF discovery + download is pure HTTPS GET — Apple publishes the
      financial-statements PDF at a predictable, unauthenticated URL under
      /newsroom/pdfs/. No browser session needed in the happy path.
  - method: api
    rationale: >-
      Reducto's /extract endpoint accepts the public PDF URL directly as `input`
      — no upload step required. Single POST returns structured JSON matching
      the supplied schema.
  - method: browser
    rationale: >-
      Only useful as a discovery fallback if Apple changes the URL pattern AND
      search indexing hasn't caught up. Note: Browserbase Chrome does not render
      PDFs inline in the viewport — fetch the bytes via `browse cloud fetch`
      instead.
verified: false
proxies: false
---
# Apple Financial PDF → Reducto Structured Extract

## Purpose

Download Apple's quarterly **Condensed Consolidated Financial Statements PDF** (the financial-data attachment that accompanies every "Apple reports {ordinal} quarter results" press release on `apple.com/newsroom`), POST it to **Reducto's `/extract` endpoint** with a financial JSON Schema, and return structured data: total net sales, segment-by-segment revenue (Americas / Europe / Greater China / Japan / Rest of Asia Pacific) and product-line revenue (iPhone / Mac / iPad / Wearables Home & Accessories / Services), basic & diluted EPS, and balance-sheet line items (cash, marketable securities, receivables, total assets, total liabilities, shareholders' equity, term debt, etc.). Read-only — fetches public PDF URLs and posts to Reducto's API; never logs in, never modifies anything.

## When to Use

- Earnings analysis pipelines that need clean structured numbers within minutes of an Apple earnings release.
- Building a historical dataset of Apple revenue / segment / EPS across multiple quarters or years.
- Any flow where you'd otherwise hand-key Apple's income statement, segment breakdown, or balance sheet from a press release PDF.
- A reference template for "scrape financial PDF off a corporate IR site → Reducto" for other large-cap public companies (the URL-pattern + press-release discovery technique generalizes; the JSON schema does not).

## Workflow

The entire skill runs over HTTP — **no browser session needed in the happy path.** Apple publishes the financial-statements PDF at a public, unauthenticated, predictable CDN URL on `www.apple.com/newsroom/pdfs/...`, and Reducto's `/extract` endpoint accepts a public URL as `input` (no upload step required). Total time per quarter: ~10–30 s wall, ~3–10 Reducto credits depending on `settings.deep_extract` and `settings.citations.enabled`.

**Important framing**: the prompt mentions "10-Q, 10-K" but Apple does **not** post the full 10-Q or 10-K as a PDF on `apple.com` — those are filed with the SEC as `.htm` documents (see Gotchas). What Apple *does* post is the **Condensed Consolidated Financial Statements PDF** — three pages containing the income statement (+ segment + product breakdowns), the balance sheet, and the cash-flow statement. That PDF contains every field this skill is asked to extract (revenue, segments, EPS, balance sheet) and is the right input.

### 1. Resolve the PDF URL for the target quarter

Apple's URL pattern is:

```
https://www.apple.com/newsroom/pdfs/{stem}/FY{YY}_Q{Q}_Consolidated_Financial_Statements.pdf
```

where the `{stem}` directory naming **changed between FY25 and FY26**:

| Fiscal period | `{stem}` directory name | Example |
|---|---|---|
| FY25 Q4 and earlier (and FY26 Q1) | `fy{YYYY}-q{Q}` (with hyphen) | `fy2025-q2`, `fy2024-q4`, `fy2026-q1` |
| FY26 Q2 onwards | `fy{YYYY}q{Q}` (no hyphen) | `fy2026q2`, `fy2026q3` |

The filename portion (`FY25_Q2_Consolidated_Financial_Statements.pdf`) has been stable across all observed quarters.

**Recommended URL-resolution algorithm** — robust against the directory-name change above and against any future renames:

1. **Try both URL variants** in parallel. Whichever returns `200 application/pdf` is the canonical URL:
   ```
   https://www.apple.com/newsroom/pdfs/fy{YYYY}q{Q}/FY{YY}_Q{Q}_Consolidated_Financial_Statements.pdf
   https://www.apple.com/newsroom/pdfs/fy{YYYY}-q{Q}/FY{YY}_Q{Q}_Consolidated_Financial_Statements.pdf
   ```
2. **If both 404** (Apple changed the pattern again), fall back to **press-release discovery**:
   1. Use Browserbase Search (or any web search engine): `apple reports {ordinal} quarter results fy{YY} site:apple.com` — returns the canonical press-release post on `apple.com/newsroom/{YYYY}/{MM}/apple-reports-{ordinal}-quarter-results/`.
   2. `browse cloud fetch` that press-release URL, regex `href="(/newsroom/pdfs/[^"]+\.pdf)"` out of the HTML — every Apple quarterly-results press release embeds exactly one PDF link to the Consolidated Financial Statements.

**Fiscal-year ↔ calendar mapping** (Apple's FY ends in late September):

| Quarter | Quarter-end | Press-release month | Example |
|---|---|---|---|
| FY{YY} Q1 | Late December | Late Jan / early Feb | FY25 Q1 → 2025/01 |
| FY{YY} Q2 | Late March | Late Apr / early May | FY25 Q2 → 2025/05; FY26 Q2 → 2026/04 |
| FY{YY} Q3 | Late June | Late Jul / early Aug | FY25 Q3 → 2025/07 or 2025/08 |
| FY{YY} Q4 | Late September | Late Oct / early Nov | FY25 Q4 → 2025/10 or 2025/11 |

Press-release months drift ±1 month year-over-year. **Don't hardcode the month** — search.

### 2. Fetch the PDF (optional — only if uploading vs. passing the URL)

Reducto accepts a public URL directly as the `input` field on `/extract`, so step 2 is usually a no-op. Only download if you need a local copy for caching, or if you're embedding the PDF in a different downstream pipeline:

```bash
# Direct fetch (when network policy allows direct egress)
curl -sS -o apple-fy25-q2.pdf \
  "https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf"

# Or via Browserbase Fetch (returns the binary as base64 in a JSON envelope)
browse cloud fetch \
  "https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf" \
  > envelope.json
node -e "
  const fs=require('fs');
  const raw=fs.readFileSync('envelope.json','utf8');
  const env=JSON.parse(raw.slice(raw.indexOf('{')));
  fs.writeFileSync('apple-fy25-q2.pdf', Buffer.from(env.content,'base64'));
"
```

Observed PDF sizes (Apple's Q4 PDFs are ~60% larger than Q1–Q3 because Q4 also folds in full-year data):

| Quarter | Approx size |
|---|---|
| Q1–Q3 | ~4 MB / 3 pages |
| Q4 | ~6.5 MB / 4 pages |

### 3. POST to Reducto `/extract` with a financial JSON Schema

Reducto's `/extract` runs Parse internally and applies an LLM pass to populate a JSON Schema you supply. Pass the public URL directly as `input`:

```bash
curl -X POST https://platform.reducto.ai/extract \
  -H "Authorization: Bearer $REDUCTO_API_KEY" \
  -H "Content-Type: application/json" \
  -d @extract-request.json
```

`extract-request.json`:

```json
{
  "input": "https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf",
  "instructions": {
    "system_prompt": "This is Apple Inc.'s Condensed Consolidated Financial Statements PDF (3 pages: Statement of Operations with segment and product breakdowns; Balance Sheet; Statement of Cash Flows). All monetary values are in millions of USD unless the table says 'thousands' (shares). Extract the values for the most-recent (leftmost) Three-Months-Ended column as the primary report; include the prior-year comparison column and the six-months/nine-months columns when present.",
    "schema": {
      "type": "object",
      "properties": {
        "fiscal_period": { "type": "string", "description": "e.g. 'FY25 Q2' — read from the column headers / page footer" },
        "period_end_date": { "type": "string", "description": "ISO date of the most-recent quarter end (e.g. '2025-03-29')" },
        "currency": { "type": "string", "description": "ISO 4217 (always 'USD' for Apple)" },
        "units": { "type": "string", "description": "Should be 'millions' for all monetary values per the table headers" },
        "income_statement": {
          "type": "object",
          "properties": {
            "products_revenue": { "type": "number" },
            "services_revenue": { "type": "number" },
            "total_net_sales": { "type": "number" },
            "products_cost_of_sales": { "type": "number" },
            "services_cost_of_sales": { "type": "number" },
            "total_cost_of_sales": { "type": "number" },
            "gross_margin": { "type": "number" },
            "research_and_development": { "type": "number" },
            "selling_general_administrative": { "type": "number" },
            "total_operating_expenses": { "type": "number" },
            "operating_income": { "type": "number" },
            "other_income_expense_net": { "type": "number", "description": "May be negative — preserve sign" },
            "income_before_income_taxes": { "type": "number" },
            "provision_for_income_taxes": { "type": "number" },
            "net_income": { "type": "number" }
          }
        },
        "eps": {
          "type": "object",
          "properties": {
            "basic": { "type": "number", "description": "Earnings per share — Basic, in USD per share" },
            "diluted": { "type": "number", "description": "Earnings per share — Diluted, in USD per share" },
            "basic_shares_used": { "type": "number", "description": "In thousands of shares per the table header" },
            "diluted_shares_used": { "type": "number", "description": "In thousands of shares per the table header" }
          }
        },
        "segments": {
          "type": "array",
          "description": "Net sales by reportable geographic segment (footnote (1) on page 1).",
          "items": {
            "type": "object",
            "properties": {
              "segment": { "type": "string", "enum": ["Americas", "Europe", "Greater China", "Japan", "Rest of Asia Pacific"] },
              "net_sales": { "type": "number" }
            }
          }
        },
        "product_categories": {
          "type": "array",
          "description": "Net sales by product category (second footnote (1) on page 1).",
          "items": {
            "type": "object",
            "properties": {
              "category": { "type": "string", "enum": ["iPhone", "Mac", "iPad", "Wearables, Home and Accessories", "Services"] },
              "net_sales": { "type": "number" }
            }
          }
        },
        "balance_sheet": {
          "type": "object",
          "properties": {
            "cash_and_cash_equivalents": { "type": "number" },
            "marketable_securities_current": { "type": "number" },
            "accounts_receivable_net": { "type": "number" },
            "vendor_non_trade_receivables": { "type": "number" },
            "inventories": { "type": "number" },
            "other_current_assets": { "type": "number" },
            "total_current_assets": { "type": "number" },
            "marketable_securities_non_current": { "type": "number" },
            "property_plant_equipment_net": { "type": "number" },
            "other_non_current_assets": { "type": "number" },
            "total_non_current_assets": { "type": "number" },
            "total_assets": { "type": "number" },
            "accounts_payable": { "type": "number" },
            "other_current_liabilities": { "type": "number" },
            "deferred_revenue": { "type": "number" },
            "commercial_paper": { "type": "number" },
            "term_debt_current": { "type": "number" },
            "total_current_liabilities": { "type": "number" },
            "term_debt_non_current": { "type": "number" },
            "other_non_current_liabilities": { "type": "number" },
            "total_non_current_liabilities": { "type": "number" },
            "total_liabilities": { "type": "number" },
            "common_stock_and_additional_paid_in_capital": { "type": "number" },
            "accumulated_deficit": { "type": "number", "description": "Negative number — preserve sign" },
            "accumulated_other_comprehensive_loss": { "type": "number", "description": "Negative number — preserve sign" },
            "total_shareholders_equity": { "type": "number" }
          }
        }
      },
      "required": ["fiscal_period", "income_statement", "eps", "segments", "product_categories", "balance_sheet"]
    }
  },
  "settings": {
    "citations": { "enabled": true, "numerical_confidence": true }
  }
}
```

**Schema design notes** that materially affect Reducto accuracy:

- **Name every field after the literal table label** Apple uses ("Vendor non-trade receivables", "Wearables, Home and Accessories"). Reducto's field-name parser is sensitive — generic names like `wearables_revenue` reduce hit-rate on the line-item match vs. the literal phrase.
- **Use enum constraints** on `segment` and `category` to force Reducto to canonicalize against Apple's published labels (which have been stable across many years). This catches OCR drift like "Greater China" → "China" or "Wearables, Home and Accessories" → "Wearables".
- **Both segments and product_categories are nested arrays** under a top-level array property — you must set `settings.array_extract: true` in `settings` if the schema's top-level is just `array` (it's not here; we use `object` with array properties, so `array_extract` is not required).
- **Negative numbers as parenthesized**: Apple prints `(279)` for negative operating-other-income, `(15,552)` for accumulated deficit. Add `"description": "Negative number — preserve sign"` on every field that can go negative; otherwise Reducto sometimes drops the sign.
- **`settings.citations.enabled: true`** is strongly recommended — it returns the source page + bbox + confidence per field. Use it in production to fact-check Reducto's output against the PDF before publishing. Note: citations + chunking are mutually exclusive (per Reducto docs).
- **For Q4 PDFs** that contain both quarterly and full-year columns, add a `period: "quarterly" | "annual"` field to each statement block (or run `/extract` twice with different `system_prompt` instructions) — otherwise Reducto picks one column arbitrarily and can mix quarterly + annual values in the same response.

### 4. Validate

Sanity-check Reducto's output before consuming downstream:

- **Identity**: `total_net_sales` should equal `products_revenue + services_revenue` (off-by-one is sometimes a rounding artifact in source — tolerate ±1).
- **Identity**: `sum(segments[].net_sales) == total_net_sales` and `sum(product_categories[].net_sales) == total_net_sales`.
- **Identity**: `total_assets == total_liabilities + total_shareholders_equity` (fundamental balance-sheet identity — if this fails by > ±1, Reducto mis-extracted at least one line).
- **EPS sanity**: `net_income / diluted_shares_used` (with shares scaled from thousands to actual: `× 1000`) should approximate `eps.diluted` to ~3 decimal places.
- **Sign sanity**: `other_income_expense_net`, `accumulated_deficit`, `accumulated_other_comprehensive_loss`, and parenthesized cash-flow line items should be negative.

If any identity fails, re-run with `settings.deep_extract: true` (higher cost / latency, agentic refinement).

### Browser fallback

The browser path is only useful if (a) Apple changes the URL pattern *and* search-engine indexing hasn't caught up yet, or (b) Reducto's API is down and you need to hand-eyeball the numbers from a rendered PDF. To browse:

```bash
SID=$(browse cloud sessions create --keep-alive \
       | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://www.apple.com/newsroom/" --remote --session "$SID"
# Click into the relevant quarterly-results press release card (year/quarter inferred from prompt),
# then on the post page locate the embedded /newsroom/pdfs/...pdf link.
browse get html body --remote --session "$SID" \
  | grep -oE 'href="/newsroom/pdfs/[^"]+\.pdf"' | head -1
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

Note: when you `browse open` the PDF directly, Browserbase's Chrome does **not** render the PDF inline in the viewport (the screenshot will still show the previously-loaded page even though `browse get url` reports the PDF URL). That's a sandbox artifact — the PDF is fetched correctly server-side; just don't try to OCR a screenshot. Use `browse cloud fetch <pdf-url>` to get the PDF bytes if you need them.

## Site-Specific Gotchas

- **Apple does NOT post the full 10-Q or 10-K as a PDF on apple.com.** The actual SEC filings live at `data.sec.gov/submissions/CIK0000320193.json` (Apple's CIK is `0000320193`) and the primary documents are `.htm` files (e.g. `aapl-20260328.htm` for FY26 Q2), **not PDF**. Reducto's supported input formats do not include `.htm` — see the API reference table (PDF / DOCX / XLSX / PPTX / images only). If a user asks for "the 10-Q PDF", they almost certainly want the Condensed Consolidated Financial Statements PDF this skill targets — it contains every line item asked for (revenue, segments, EPS, balance sheet). If they truly need the full 10-Q (MD&A, footnotes, risk factors), you must either (a) print the EDGAR HTM to PDF first via a headless browser, or (b) use the EDGAR FilingSummary.xml + iXBRL viewer print path — both out of scope for this skill.
- **URL pattern changed between FY25 and FY26.** FY25 and earlier (and FY26 Q1) use `fy{YYYY}-q{Q}` (hyphenated); FY26 Q2 onward dropped the hyphen and uses `fy{YYYY}q{Q}`. Always try both, or use press-release-page discovery rather than hardcoding the URL.
- **`apple.com/investor-relations/` is a 404.** Apple's actual investor relations site is `investor.apple.com`, which is a Q4 Inc.–powered IR platform (`widgets.q4app.com`, `identity.q4inc.com`). The press-release PDFs are NOT served from `investor.apple.com` — they live under `www.apple.com/newsroom/pdfs/`. Do not waste time scraping `investor.apple.com/sec-filings/default.aspx` looking for a PDF link; the SEC-filings list on that page deep-links to SEC EDGAR HTM, not Apple-hosted PDFs.
- **Press-release URL month drifts year-over-year.** FY25 Q2 was `/newsroom/2025/05/...`; FY26 Q2 was `/newsroom/2026/04/...` (one month earlier). Don't hardcode the month — use search.
- **All PDFs are 3 pages (Q1–Q3) or 4 pages (Q4)**, named `CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS` (page 1, with two embedded segment + product footnotes), `CONDENSED CONSOLIDATED BALANCE SHEETS` (page 2), `CONDENSED CONSOLIDATED STATEMENTS OF CASH FLOWS` (page 3). Q4 PDFs add a `(In millions, except per-share amounts)` annual summary page.
- **Apple's fiscal year ends ~Sep 30**, so "Q1 FY25" = Oct–Dec 2024 (NOT Jan–Mar 2025). Reducto extracts the literal column headers, which say `"Three Months Ended March 29, 2025"` — make sure your `fiscal_period` field is derived from the column header, not assumed from the URL. Many tools mis-label Apple quarters by 1.
- **Shares are reported in thousands, dollars in millions.** Every PDF says `(In millions, except number of shares, which are reflected in thousands, and per-share amounts)`. If you compute `net_income / diluted_shares × $/share`, multiply the shares by 1000 first or you'll be off by 1000×.
- **Q4 PDFs have both quarterly AND annual columns** in the same statement. Reducto will pick one arbitrarily without a `period_label` field or system-prompt steer. For Q4, either (a) ask for both via separate `quarterly_*` and `annual_*` schema blocks, or (b) run `/extract` twice with different `system_prompt` overrides.
- **Negative numbers are parenthesized**, not minus-signed. Apple uses `(279)` for negative `other_income/(expense), net`. Reducto handles this correctly *if* the schema field's `description` explicitly says "negative number — preserve sign"; without that, it occasionally returns `279` (positive) for an obviously-negative line item. Mandatory on: `other_income_expense_net`, `accumulated_deficit`, `accumulated_other_comprehensive_loss`, and every parenthesized cash-flow line.
- **PDF passes the public URL straight to Reducto — no upload step needed.** Reducto accepts the apple.com newsroom PDF URL directly as the `input` field on `/extract` (and `/parse`). Don't waste a round-trip uploading via `/upload` unless you need a `file_id` to reuse across multiple endpoints (e.g. you want to classify, then parse, then extract — only then is `/upload` worth it).
- **Q4 CDN can take ~30s on a cold fetch.** First request to a brand-new quarter's PDF in a fresh CDN region can take 20–30s; subsequent requests are sub-second. Don't set Reducto's HTTP timeout too tight; default 60s is fine.
- **Sandbox DNS is not always direct.** From the browse.sh skill-generator sandbox, `curl https://www.apple.com/...` fails with `Could not resolve host` (no direct egress). Use `browse cloud fetch` instead, which routes through Browserbase's egress. End-user agents that DO have direct internet egress can curl directly — this is only a sandbox-specific gotcha.
- **Reducto API key is the agent's, not embedded here.** This skill assumes `REDUCTO_API_KEY` is in the calling agent's environment. Sign up at `studio.reducto.ai` (free tier ~100 pages/mo at time of writing); key format is a long opaque string. The skill does not ship a key.

## Expected Output

For a successful FY25 Q2 extraction (`https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf`), Reducto's `/extract` response shape with `citations.enabled: false` would be:

```json
{
  "result": [
    {
      "fiscal_period": "FY25 Q2",
      "period_end_date": "2025-03-29",
      "currency": "USD",
      "units": "millions",
      "income_statement": {
        "products_revenue": 68714,
        "services_revenue": 26645,
        "total_net_sales": 95359,
        "products_cost_of_sales": 44030,
        "services_cost_of_sales": 6462,
        "total_cost_of_sales": 50492,
        "gross_margin": 44867,
        "research_and_development": 8550,
        "selling_general_administrative": 6728,
        "total_operating_expenses": 15278,
        "operating_income": 29589,
        "other_income_expense_net": -279,
        "income_before_income_taxes": 29310,
        "provision_for_income_taxes": 4530,
        "net_income": 24780
      },
      "eps": {
        "basic": 1.65,
        "diluted": 1.65,
        "basic_shares_used": 14994082,
        "diluted_shares_used": 15056133
      },
      "segments": [
        { "segment": "Americas", "net_sales": 40315 },
        { "segment": "Europe", "net_sales": 24454 },
        { "segment": "Greater China", "net_sales": 16002 },
        { "segment": "Japan", "net_sales": 7298 },
        { "segment": "Rest of Asia Pacific", "net_sales": 7290 }
      ],
      "product_categories": [
        { "category": "iPhone", "net_sales": 46841 },
        { "category": "Mac", "net_sales": 7949 },
        { "category": "iPad", "net_sales": 6402 },
        { "category": "Wearables, Home and Accessories", "net_sales": 7522 },
        { "category": "Services", "net_sales": 26645 }
      ],
      "balance_sheet": {
        "cash_and_cash_equivalents": 28162,
        "marketable_securities_current": 20336,
        "accounts_receivable_net": 26136,
        "vendor_non_trade_receivables": 23662,
        "inventories": 6269,
        "other_current_assets": 14109,
        "total_current_assets": 118674,
        "marketable_securities_non_current": 84424,
        "property_plant_equipment_net": 46876,
        "other_non_current_assets": 81259,
        "total_non_current_assets": 212559,
        "total_assets": 331233,
        "accounts_payable": 54126,
        "other_current_liabilities": 61849,
        "deferred_revenue": 8976,
        "commercial_paper": 5982,
        "term_debt_current": 13638,
        "total_current_liabilities": 144571,
        "term_debt_non_current": 78566,
        "other_non_current_liabilities": 41300,
        "total_non_current_liabilities": 119866,
        "total_liabilities": 264437,
        "common_stock_and_additional_paid_in_capital": 88711,
        "accumulated_deficit": -15552,
        "accumulated_other_comprehensive_loss": -6363,
        "total_shareholders_equity": 66796
      }
    }
  ],
  "job_id": "<uuid>",
  "usage": { "num_fields": 56, "num_pages": 3, "credits": 8.0 },
  "studio_link": "https://studio.reducto.ai/job/<uuid>"
}
```

With `citations.enabled: true`, every leaf value is wrapped:

```json
{
  "products_revenue": {
    "value": 68714,
    "citations": [
      {
        "type": "Table",
        "content": "Products $ 68,714",
        "bbox": { "left": 0.07, "top": 0.18, "width": 0.42, "height": 0.02, "page": 1 },
        "confidence": 0.98
      }
    ]
  }
}
```

### Error outcome — PDF URL not found

If neither URL variant nor press-release discovery surfaces a PDF (e.g. an unreleased future quarter, or Apple removed the file):

```json
{
  "success": false,
  "reason": "pdf_not_found",
  "fiscal_period": "FY26 Q3",
  "attempted_urls": [
    "https://www.apple.com/newsroom/pdfs/fy2026q3/FY26_Q3_Consolidated_Financial_Statements.pdf",
    "https://www.apple.com/newsroom/pdfs/fy2026-q3/FY26_Q3_Consolidated_Financial_Statements.pdf"
  ],
  "note": "Quarter likely not yet released; Apple typically posts Q3 statements late July / early August."
}
```

### Error outcome — Reducto extract failed identity check

When validation step 4 fails (e.g. `total_assets != total_liabilities + shareholders_equity`):

```json
{
  "success": false,
  "reason": "extract_identity_violation",
  "fiscal_period": "FY25 Q2",
  "violations": [
    "total_assets (331233) != total_liabilities (264437) + total_shareholders_equity (66796) → diff 0"
  ],
  "raw_reducto_job_id": "<uuid>",
  "recommendation": "Re-run /extract with settings.deep_extract: true"
}
```
