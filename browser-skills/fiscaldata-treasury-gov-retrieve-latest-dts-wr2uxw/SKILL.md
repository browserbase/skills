---
name: fiscaldata-treasury-gov-retrieve-latest-dts-wr2uxw
title: Retrieve Latest Daily Treasury Statement (DTS)
description: >-
  Fetch the most recently published U.S. Daily Treasury Statement from
  fiscaldata.treasury.gov — either as structured JSON across the seven active
  DTS data tables or as the canonical PDF report, via the open Fiscal Data REST
  API (no auth required).
website: fiscaldata.treasury.gov
category: finance
tags:
  - finance
  - treasury
  - fiscal-data
  - government
  - api
  - dts
source: 'browserbase: agent-runtime 2026-05-23'
updated: '2026-05-23'
recommended_method: api
alternative_methods:
  - method: fetch
    rationale: >-
      The PDF report at
      /static-data/published-reports/dts/DailyTreasuryStatement_{YYYYMMDD}.pdf
      is a plain HTTPS GET with no auth; ideal when the consumer wants the
      official archival document rather than JSON.
  - method: browser
    rationale: >-
      Useful only as a last-resort fallback when egress to
      api.fiscaldata.treasury.gov is blocked but a browser session is available.
      Adds no data the API doesn't already expose.
verified: false
proxies: false
---
# Retrieve Latest Daily Treasury Statement (DTS)

## Purpose

Retrieve the most recently published U.S. Daily Treasury Statement (DTS) from
`fiscaldata.treasury.gov` — either as structured JSON across the nine DTS data
tables (Operating Cash Balance, Deposits/Withdrawals, Public Debt Transactions,
etc.) or as the canonical PDF report. The skill is fully read-only and is best
served by the open Fiscal Data REST API at `api.fiscaldata.treasury.gov`
(no API key required, CORS-open, returns JSON). Browser scripting against the
dataset web page is documented as a fallback but is strictly slower and offers
no additional data.

## When to Use

- An agent or downstream automation needs the latest TGA opening/closing
  balance, daily federal deposits/withdrawals, debt-subject-to-limit, etc.
- A user asks for "today's DTS", "yesterday's Treasury cash report", or
  "the latest Operating Cash Balance".
- Macro/fiscal dashboards need to refresh DTS-derived figures on a
  business-day cadence.
- A user wants the official Daily Treasury Statement PDF for archival.

## Workflow

The recommended path is the documented public REST API. No authentication,
no proxy, no browser required — a plain HTTPS GET works from any environment.

1. **Discover the latest published `record_date`.** Hit the Operating Cash
   Balance table (Table I — populated every business day and the canonical
   "is the DTS out yet" signal), sorted descending by date, asking for one row:

   ```
   GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance
       ?sort=-record_date
       &page[size]=1
       &fields=record_date
       &format=json
   ```

   URL-encode the brackets when calling from tooling that validates URIs
   (`page[size]` → `page%5Bsize%5D`). Parse `data[0].record_date` (format
   `YYYY-MM-DD`). That's `LATEST_DATE`.

2. **(Optional) Fetch the official PDF.** The Fiscal Service publishes a
   companion PDF at a deterministic S3-backed URL using `YYYYMMDD`
   (no separators):

   ```
   GET https://fiscaldata.treasury.gov/static-data/published-reports/dts/DailyTreasuryStatement_{YYYYMMDD}.pdf
   ```

   Example: `DailyTreasuryStatement_20260521.pdf`. Returns
   `Content-Type: application/pdf` with `Last-Modified` matching the
   publication time (typically the next business morning).

3. **Pull every DTS table filtered to `LATEST_DATE`.** Iterate the seven
   currently-active table endpoints (see list below) using a `record_date`
   equality filter. Use a generous page size — a single DTS day has < 500
   rows total across all tables:

   ```
   GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/{endpoint}
       ?filter=record_date:eq:{LATEST_DATE}
       &page[size]=500
       &format=json
   ```

   Active endpoints (each maps to a DTS table in the printed report):

   | Endpoint | Table | Description |
   |---|---|---|
   | `operating_cash_balance` | I | TGA open/close + deposits/withdrawals summary |
   | `deposits_withdrawals_operating_cash` | II | Detailed cash deposits & withdrawals by source |
   | `public_debt_transactions` | IIIA | Issues and redemptions of public debt |
   | `adjustment_public_debt_transactions_cash_basis` | IIIB | Adjustments to Table IIIA to cash basis |
   | `debt_subject_to_limit` | IIIC | Statutory debt-ceiling components |
   | `inter_agency_tax_transfers` | IV | Tax transfers between TGA and trust funds |
   | `income_tax_refunds_issued` | V | IRS refunds by check vs. EFT |

4. **Assemble the result.** Merge the per-table responses keyed by
   `record_date` (single value) plus `table_nbr` / `account_type` /
   `transaction_type`. All currency amounts are strings expressing whole
   millions of USD (the API's `dataFormats` calls this `$1,000,000`).

### Browser fallback

Only useful when an API call is impossible (e.g. egress blocked but a
browser is available).

1. Open `https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/operating-cash-balance`.
2. Read the **Introduction** card — it shows the date range (e.g.
   `10/03/2005 — 05/21/2026`) and `Last Updated MM/DD/YYYY`. The right-hand
   end of the date range is `LATEST_DATE`.
3. Under **Reports and Files**, the topmost row links to
   `DailyTreasuryStatement_{YYYYMMDD}.pdf`; click "Download" or extract the
   `href` to retrieve it.
4. Under **Data Preview**, the "Choose Data Table" dropdown switches between
   the nine tables. The preview table renders the latest day by default;
   the "API Quick Guide" tab on the same page gives ready-made API URLs
   per table.

Do not attempt to use the Data Preview to scrape full days — it's pulling
the same API behind the scenes, and you'd be adding a rendering layer to
no benefit.

## Site-Specific Gotchas

- **No API key, no auth, no anti-bot.** Plain `curl`/`fetch` from any host
  returns 200 with `Access-Control-Allow-Origin: *`. Don't waste a
  Browserbase session on this — the API route is faster and cheaper.
- **URL-encode bracket params.** `page[size]`, `page[number]`,
  `filter[…]` all use square brackets that some HTTP clients (and the
  built-in `browse cloud fetch` validator) reject as invalid URIs. Encode
  as `%5B` / `%5D` to be safe.
- **Two endpoints are discontinued and frozen at 2023-02-13.**
  `federal_tax_deposits` (Table VI) and `short_term_cash_investments`
  (Table VII) returned no new data after the February 2023 DTS reformat —
  their latest `record_date` will remain `2023-02-13` forever. Do NOT
  treat them as part of the "latest DTS" set; exclude them or note them
  explicitly as legacy.
- **`null` is sometimes the literal string `"null"`, not JSON null.**
  Fields like `close_today_bal` arrive as `"close_today_bal":"null"` on
  intermediate rows (only the "TGA Closing Balance" row carries a real
  value). Always check for the string `"null"` before parsing numerics.
- **Currency amounts are strings in whole millions.** `"open_today_bal":"781979"`
  means $781.979 billion (the `dataFormats` block declares the unit as
  `$1,000,000`). Multiply by `1_000_000` to get USD, or display
  with explicit units. Negative values appear as `"-12345"` (string).
- **DTS is business-day only and posts on T+1.** The page shows a
  "New Data Expected MM/DD/YYYY" hint — if you're hitting the API near
  midnight UTC on a holiday or weekend, `LATEST_DATE` may still be the
  previous business day. Don't assume today's date is available.
- **PDF filename uses an underscore + `YYYYMMDD`, not a hyphen.** Pattern is
  exactly `DailyTreasuryStatement_20260521.pdf`. The Fiscal Data download
  table happens to URL-encode the underscore as `%5F` in its links — both
  the raw underscore and the encoded form resolve.
- **Don't sort the whole table to find the latest date.** Always use
  `sort=-record_date&page[size]=1`. The `operating_cash_balance` table
  alone has > 16,000 rows; downloading it all just to find the max date is
  wasteful (the API does support it but you'll burn time and bandwidth).
- **`fields=record_date` is the cheapest "latest date" probe.** Drops the
  payload to a single field per row — useful when you only need the date,
  not the values.

## Expected Output

The skill is most useful when it returns a structured object combining the
latest date with each table's rows. Recommended schema:

```json
{
  "latest_record_date": "2026-05-21",
  "pdf_url": "https://fiscaldata.treasury.gov/static-data/published-reports/dts/DailyTreasuryStatement_20260521.pdf",
  "tables": {
    "operating_cash_balance": [
      {
        "record_date": "2026-05-21",
        "account_type": "Treasury General Account (TGA) Opening Balance",
        "open_today_bal": "781979",
        "open_month_bal": "969383",
        "open_fiscal_year_bal": "890825",
        "close_today_bal": "null",
        "table_nbr": "I",
        "src_line_nbr": "1"
      },
      {
        "record_date": "2026-05-21",
        "account_type": "Treasury General Account (TGA) Closing Balance",
        "open_today_bal": "785882",
        "close_today_bal": "null",
        "table_nbr": "I",
        "src_line_nbr": "4"
      }
    ],
    "deposits_withdrawals_operating_cash": [ /* ... */ ],
    "public_debt_transactions": [ /* ... */ ],
    "adjustment_public_debt_transactions_cash_basis": [
      {
        "record_date": "2026-05-21",
        "transaction_type": "Issues",
        "adj_type": "Public Debt Issues (Table IIIA)",
        "adj_today_amt": "979397",
        "adj_mtd_amt": "11462394",
        "adj_fytd_amt": "132829817",
        "table_nbr": "IIIB"
      }
    ],
    "debt_subject_to_limit": [ /* ... */ ],
    "inter_agency_tax_transfers": [ /* ... */ ],
    "income_tax_refunds_issued": [ /* ... */ ]
  },
  "currency_unit": "USD millions",
  "source": "api.fiscaldata.treasury.gov v1/accounting/dts"
}
```

If only the headline number is needed (e.g. for a chatbot answer
"What was yesterday's Treasury cash balance?"), the minimal shape is:

```json
{
  "record_date": "2026-05-21",
  "tga_closing_balance_usd_millions": 785882,
  "tga_opening_balance_usd_millions": 781979,
  "source_pdf": "https://fiscaldata.treasury.gov/static-data/published-reports/dts/DailyTreasuryStatement_20260521.pdf"
}
```

Outcome shapes the caller should handle:

- **`fresh`** — `latest_record_date` is today or yesterday (business day);
  all 7 active tables returned rows.
- **`stale-weekend-or-holiday`** — `latest_record_date` is older than
  yesterday because the market was closed; this is expected, not an error.
- **`partial`** — one of the 7 active tables returned `data: []` for the
  latest date. Rare; usually means an intra-day publication race. Retry
  after 15 minutes.
- **`legacy-table-requested`** — if the caller asked for
  `federal_tax_deposits` or `short_term_cash_investments`, the response
  will return rows from 2023-02-13 or earlier. Surface this as
  `{ "status": "discontinued_2023", "last_record_date": "2023-02-13" }`
  rather than silently passing stale data through.
