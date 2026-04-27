# CSV Schemas — Event Follow-Up

The `parse_csv.mjs` script auto-detects column headers across common event-platform exports. This document is the reference for what gets recognized and how to override the mapping when auto-detection fails.

## Auto-detected columns (canonical → header candidates)

| Canonical key | Recognized headers (case-insensitive, underscores/hyphens treated as spaces) |
|---|---|
| `email` (REQUIRED) | `Email`, `Email Address`, `Work Email`, `Attendee Email`, `Contact Email`, `E-mail` |
| `name` | `Name`, `Full Name`, `Attendee Name`, `Contact Name` |
| `first` | `First Name`, `Firstname`, `Given Name`, `First` |
| `last` | `Last Name`, `Lastname`, `Surname`, `Family Name`, `Last` |
| `company` | `Company`, `Company Name`, `Organization`, `Organisation`, `Org`, `Employer`, `Account`, `Account Name` |
| `title` | `Title`, `Job Title`, `Role`, `Position`, `Job Role`, `Jobtitle` |
| `linkedin` | `LinkedIn`, `LinkedIn URL`, `LinkedIn Profile` |
| `notes` | `Notes`, `Note`, `Comments`, `Comment`, `Team Notes` |
| `scanned_at` | `Scanned At`, `Badge Scan`, `Scan Time`, `Check-in Time`, `Checkin Time`, `Timestamp` |
| `track` | `Track`, `Event Track`, `Session Track`, `Topic` |

If `name` isn't found, the parser builds it from `first + last`. If neither exists, it falls back to the email local-part.

## Common event platforms (verified)

| Platform | Notable headers | Notes |
|---|---|---|
| **Hubspot list export** | `First Name`, `Last Name`, `Email`, `Company`, `Job Title` | Auto-detects cleanly. |
| **Stripe Sessions scanner** | `First Name`, `Last Name`, `Email`, `Company`, `Job Title`, `Notes` | Auto-detects cleanly. |
| **Eventbrite check-in CSV** | `Attendee Name`, `Email`, `Company` | Title may be missing — pass `--col-title` if available in a custom field. |
| **Lu.ma attendee export** | `Name`, `Email`, `Position` (sometimes `Job Title`) | "Position" is recognized; "Tagline" is not — pass `--col-title="Tagline"` if needed. |
| **Sessionize speakers export** | `Speaker Name`, `Email`, `Tagline`, `Company` | "Speaker Name" is NOT auto-detected. Use `--col-name="Speaker Name"`. |
| **Custom badge scanner** | varies | Inspect headers in `parse_stats.json.csv_headers` and override as needed. |

## Override mapping

If auto-detection misfires (`parse_stats.json.detected_columns` shows wrong mapping), re-run with explicit flags:

```bash
node {SKILL_DIR}/scripts/parse_csv.mjs input.csv {OUTPUT_DIR} \
  --user-company browserbase \
  --col-name "Speaker Name" \
  --col-email "Contact Email" \
  --col-company "Account" \
  --col-title "Tagline"
```

Override values are matched against the CSV header line by exact (normalized) name.

## Email-based company derivation

When a row has an email but no `company` field, the parser derives one from the email domain (`alice@acme.com` → `Acme`). Public-mail domains (`gmail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, `icloud.com`, `aol.com`, `proton.me`, `protonmail.com`, `live.com`, `me.com`, `msn.com`) yield `null` — those rows are kept but flagged for the ICP triage subagent to skip cheaply.

## Filters applied at parse time

- Rows with no email or malformed email (`@` missing) → dropped, counted in `skipped.no_email`
- Rows with `company` matching `--user-company` (case-insensitive) → dropped, counted in `skipped.user_company`
- Duplicate emails → first wins, rest counted in `skipped.dup`

## Output schema (`people.jsonl`)

One JSON object per line:

```json
{
  "name": "Greg Brockman",
  "email": "greg@openai.com",
  "company": "OpenAI",
  "title": "Cofounder and President",
  "linkedin": "https://www.linkedin.com/in/thegdb/",
  "notes": "Spoke about ChatGPT Agent",
  "scanned_at": null,
  "track": null,
  "slug": "greg-brockman"
}
```

`null` values mean the column was absent or empty for this row. Downstream subagents must handle nulls gracefully (no fabrication).
