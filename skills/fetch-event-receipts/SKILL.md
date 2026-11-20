---
name: fetch-event-receipts
description: "Fetch a DoorDash event receipt in an authenticated Browserbase session and optionally attach it to its Ramp card transaction. Use for the Ramp Agent Identity + Browserbase receipt demo, DoorDash receipt retrieval, or a missing DoorDash receipt. Do not use for ordering food, reimbursements, other merchants, or invoices."
license: MIT
compatibility: "Requires browse CLI 0.9.5+, Ramp CLI 0.2.24+, Bash, Node.js 20+, jq, Poppler, Tesseract, and authenticated Browserbase and Ramp accounts."
allowed-tools: Bash Read
---

# Fetch event receipts

Use the bundled deterministic runner. Do not reconstruct the workflow as
individual commands, invent state files, inspect CLI schemas, or add receipt
content validators. The runner owns one Browserbase session, the DoorDash PDF
print, the optional Ramp upload, and cleanup in one foreground process.

## Interpret the request

- Normalize a yearless month/day such as `8/18` to the current calendar year.
- Normalize `~$50`, `about $50`, or `$50-ish` to a 5000-cent hint with a
  500-cent tolerance.
- Retrieval is the default. Add `--attach` only when the user explicitly asks
  to attach or upload the receipt to Ramp.
- The private demo registry resolves the approximate request to one configured
  Ramp transaction and DoorDash order. The runner stops if it is not unique.

## Run

Resolve the absolute directory containing this `SKILL.md` as `skill_root`, then
run exactly one foreground command:

```bash
"$skill_root/scripts/run-demo.sh" \
  --date YYYY-MM-DD \
  --amount-hint-minor INTEGER_CENTS \
  --amount-tolerance-minor INTEGER_CENTS \
  [--attach]
```

For `8/18, the ~$50 order` in 2026, use:

```text
--date 2026-08-18 --amount-hint-minor 5000 --amount-tolerance-minor 500
```

Run it once. Do not background it, split it into commands, retry it, or perform
extra preflight, schema, or help calls. Relay only its five short milestone
updates as they appear. The runner deliberately does not inspect PDF text;
successful DoorDash printing plus Ramp's upload response is the demo contract.

If the runner says Ramp already has a receipt, ask the operator to remove it
before recording. Do not bypass that duplicate guard. If another stage stops,
report the single sanitized error and do not improvise a workaround.

## Return

After a successful run, the runner opens the matched Ramp transaction in the
operator's default browser. It does not open Ramp after a stopped or failed run.

Return the final status plus the clickable `ramp_transaction_url` and
`browserbase_session_url`. For retrieval-only, also return `receipt_pdf`. Never
return the Browserbase CDP URL, cookies, credentials, receipt base64, private
registry contents, or raw CLI responses.
