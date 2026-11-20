---
name: ramp-com-submit-reimbursement
title: "Ramp Submit Reimbursement"
description: "Submit an employee reimbursement through Ramp MCP or Ramp CLI with receipt extraction, policy/category validation, draft review, and explicit confirmation before submission."
website: "ramp.com"
category: "finance"
tags: ["finance", "expenses", "reimbursements", "mcp", "cli", "policy", "human-confirmation"]
status: "launched"
partner: true
source: "official Ramp MCP support + Ramp CLI docs + non-mutating endpoint checks, 2026-05-08"
updated: "2026-05-08"
recommended_method: "cli"
alternative_methods:
  - method: "mcp"
    rationale: "Ramp's official MCP server at https://mcp.ramp.com/mcp exposes natural-language tools for reimbursements, receipts, policies, funds, categories, and tracking categories. Prefer MCP when an interactive Ramp MCP connection is already wired into the agent client."
  - method: "browser"
    rationale: "Use Ramp's web UI only when MCP/CLI is unavailable or the tool reports that a required field cannot be edited through the API surface. Browser submission is authenticated, stateful, and should still stop for user confirmation before clicking Submit."
---

# Ramp Submit Reimbursement - CLI Skill

## Purpose

Create, complete, and submit an employee reimbursement in Ramp using the first-party Ramp MCP or Ramp CLI whenever available. This is a write workflow: extract receipt details, validate required policy/accounting fields, build or update a draft reimbursement, present the exact draft back to the user, and only submit after explicit confirmation.

Official references:

```
https://support.ramp.com/hc/en-us/articles/45516494479891-Ramp-MCP
https://support.ramp.com/hc/en-us/articles/4417618448403-Submitting-reimbursements
https://docs.ramp.com/llms-guides/cli.txt
https://docs.ramp.com/llms-guides/ramp-mcp.txt
https://mcp.ramp.com/mcp
https://demo-mcp.ramp.com/mcp
https://github.com/ramp-public/ramp-cli
```

## When to Use

- "Submit this lunch receipt as a Ramp reimbursement."
- "Reimburse me for the Uber to the client meeting."
- "File these out-of-pocket expenses in Ramp."
- "Create a reimbursement draft and tell me what is missing."
- "Check my recent reimbursements / invoices / spend history" when write access is unavailable.

## Guardrails

- Do not approve, reject, pay, or mark reimbursements paid unless the user explicitly asks and has the proper approver role. This skill is for employee submission, not manager approval.
- Do not submit a reimbursement without a final user confirmation that includes amount, currency, merchant, date, memo/business purpose, category/fund/accounting fields, receipt filenames, and any policy exceptions.
- Prefer drafts. If a tool can create or edit a draft separately from submitting, create/update the draft first, then confirm.
- Respect Ramp permissions. Ramp MCP and CLI actions run as the authenticated Ramp user and can only access data that user can already see in Ramp.
- Do not invent CLI flags. Use `--help` discovery for exact command syntax in the installed CLI version before invoking a write command.
- Use the demo MCP server only for sample-data exploration. Never submit a real employee reimbursement through demo data.
- If credentials are unavailable, stay read-only and provide a missing-fields checklist or retrieve only public docs/support guidance.

## Preferred Path: Ramp MCP

Ramp's official MCP server is the best fit for interactive reimbursement submission because it exposes natural-language tools for reimbursements, receipts, policies, funds, categories, tracking categories, and Help Center answers.

### 1. Confirm MCP connection

Production server:

```
https://mcp.ramp.com/mcp
```

Demo server for sample data only:

```
https://demo-mcp.ramp.com/mcp
```

For Codex / Claude Code / Cursor-style setups, confirm the Ramp server is connected using the client-native MCP inspection command. If the client exposes tool names, look for reimbursement-related tools such as:

- `ramp_get_reimbursements`
- `ramp_get_reimbursements_for_approval`
- `ramp_edit_reimbursement`
- `ramp_approve_or_reject_reimbursement`
- `ramp_get_tracking_categories`
- `ramp_get_tracking_category_options`
- `ramp_answer_policy_question`
- `ramp_ask_help_center`

Ramp's docs say tools are added regularly. If an expected tool is missing, disconnect/reconnect Ramp in the MCP client and restart the agent session.

### 2. Parse the receipt and user intent

From the receipt image/PDF/email or user-provided text, extract:

- merchant
- transaction date
- amount and currency
- taxes/tip/fees when visible
- payment method if visible
- line items, especially alcohol, gift cards, personal items, or travel segments
- attendee names for meals if required
- trip/project/client context when present
- business purpose memo
- receipt file path or attachment identifier

If OCR confidence is low, ask the user to confirm the uncertain field before creating a draft.

### 3. Ask Ramp for policy and required fields

Before editing/submitting, use Ramp MCP to answer:

- Is this expense type reimbursable under the user's policy/fund?
- Which fund/spend program should be used?
- Which accounting category or tracking categories are required?
- Are attendees, trip, memo, receipt, entity, department, location, PO, or custom fields required?
- Is the amount over a threshold requiring extra details?
- Is the reimbursement out-of-pocket, mileage, per diem, or tied to a personal card import?

Use Ramp's policy/help tools for ambiguous cases. If the policy answer is uncertain, present it as a blocker rather than guessing.

### 4. Create or update the draft reimbursement

Use the Ramp MCP reimbursement tools exposed by the connected client. The exact tool schema may vary by release, so inspect the available tool description/schema before calling it.

Draft payload should include only verified fields:

```json
{
  "type": "out_of_pocket",
  "merchant": "Acme Cafe",
  "amount": { "currency_code": "USD", "amount": "42.18" },
  "transaction_date": "2026-05-08",
  "memo": "Lunch during onsite customer meeting",
  "receipt_files": ["receipt.pdf"],
  "fund_or_spend_program": "Customer Meetings",
  "category": "Meals",
  "attendees": ["..."],
  "trip": "..."
}
```

If the user supplied several receipts, create separate drafts unless they explicitly ask to group them. Ramp's support docs note that emailing multiple receipts creates multiple draft reimbursements and that bulk/group submission may be available for eligible accounts.

### 5. Validate completeness

After drafting or editing, re-read the draft and check:

- receipt attached
- amount/currency/date/merchant match the receipt
- memo is present and specific enough
- required fund/category/accounting fields are populated
- reimbursement type is correct
- policy exceptions are called out
- duplicate risk checked against recent reimbursements and transactions when available
- payment prerequisites are not blocking submission, such as missing bank details

If anything is missing, stop and ask for the missing value or leave the reimbursement as a draft.

### 6. Confirm before submission

Present a concise confirmation:

```text
Ready to submit this Ramp reimbursement?
Merchant: Acme Cafe
Date: 2026-05-08
Amount: USD 42.18
Memo: Lunch during onsite customer meeting
Category/fund: Meals / Customer Meetings
Receipt: receipt.pdf
Policy: no issues found
```

Ask the user to confirm with an unambiguous yes. After confirmation, submit the draft through the MCP reimbursement submit action if available. Return the reimbursement ID, status, and Ramp URL if the tool provides one.

## CLI Path: Ramp CLI

Use the CLI when a terminal-first or scheduled agent loop is preferred. Ramp's docs verify the CLI install path, OAuth login, agent JSON output, and the reimbursement resource names, but individual flags can change. Always inspect help before writes.

### 1. Install/authenticate if needed

Discover whether `ramp` exists:

```bash
command -v ramp
ramp --help
```

Official install command:

```bash
curl -fsSL https://agents.ramp.com/install.sh | sh
```

Authenticate:

```bash
ramp auth login
ramp users me --agent
```

Ramp CLI defaults to sandbox unless configured otherwise. Confirm target environment before real submissions:

```bash
ramp env --help
ramp config --help
```

### 2. Discover exact reimbursement syntax

Do not assume flags. Inspect the installed CLI:

```bash
ramp reimbursements --help
ramp reimbursements list --help
ramp reimbursements edit --help
ramp reimbursements submit --help
ramp receipts --help
ramp receipts upload --help
ramp receipts attach --help
ramp general policy --help
ramp accounting categories --help
ramp accounting category-options --help
```

The official CLI docs list these reimbursement tools:

```
ramp reimbursements list
ramp reimbursements pending
ramp reimbursements submit
ramp reimbursements approve
ramp reimbursements edit
```

Use `--agent` or JSON output for machine parsing, `--no-input` only after all required values are known, and `--dry_run` when the tool exposes it.

### 3. CLI workflow shape

1. Upload or attach the receipt using the discovered `ramp receipts ...` command.
2. List recent reimbursements/transactions to check for duplicates:
   ```bash
   ramp reimbursements list --help
   ramp transactions list --help
   ```
3. Discover categories/tracking options:
   ```bash
   ramp accounting categories --help
   ramp accounting category-options --help
   ```
4. Create or edit the draft using the exact flags shown by `ramp reimbursements edit --help` or the relevant draft command if present.
5. Read the draft back in JSON.
6. Ask the user for explicit confirmation.
7. Submit with the exact command/flags shown by `ramp reimbursements submit --help`.

If the installed CLI has a `--json TEXT` request-body option for the reimbursement tool, prefer a structured JSON file or heredoc over shell-escaped inline arguments.

## Browser Fallback

Use browser automation only when MCP/CLI cannot complete the workflow. Ramp's support docs describe the web path as Home > New > Reimbursement / Request reimbursement, where users upload receipts and add receipt, memo, and policy-required details.

Browser rules:

- Authenticate as the user.
- Navigate to `https://app.ramp.com/` and use the Reimbursement flow.
- Upload the receipt.
- Fill only verified fields.
- Stop on policy, banking, permission, missing-field, or duplicate warnings.
- Never click Submit until the user confirms the final summary in chat.
- After submission, capture the status and URL.

## Read-Only Fallback

If Ramp credentials, MCP, or CLI are unavailable:

- Do not attempt a write through private web endpoints.
- Extract receipt fields locally and produce a draft summary/checklist.
- Use public Ramp support docs to explain the user's next step.
- If demo MCP is acceptable, use `https://demo-mcp.ramp.com/mcp` only to show the flow with sample data.
- If authenticated read-only access exists, retrieve recent reimbursements, invoices/bills, and spend history to help the user detect duplicates or choose categories, but leave submission to the user.

Read-only output:

```json
{
  "ready_to_submit": false,
  "reason": "Ramp credentials unavailable",
  "draft": {
    "merchant": "Acme Cafe",
    "date": "2026-05-08",
    "amount": "USD 42.18",
    "memo": "Needs user confirmation",
    "receipt": "receipt.pdf"
  },
  "next_steps": [
    "Connect Ramp MCP at https://mcp.ramp.com/mcp or authenticate Ramp CLI",
    "Confirm fund/category and any required accounting fields",
    "Submit after reviewing the final draft"
  ]
}
```

## Expected Output

Successful draft created, not submitted:

```json
{
  "success": true,
  "submitted": false,
  "status": "draft",
  "reimbursement_id": "...",
  "needs_confirmation": true,
  "summary": {
    "merchant": "Acme Cafe",
    "date": "2026-05-08",
    "amount": "USD 42.18",
    "memo": "Lunch during onsite customer meeting",
    "category": "Meals",
    "receipt_attached": true
  }
}
```

Submitted after confirmation:

```json
{
  "success": true,
  "submitted": true,
  "status": "pending_approval",
  "reimbursement_id": "...",
  "url": "https://app.ramp.com/...",
  "submitted_after_user_confirmation": true
}
```

Blocked:

```json
{
  "success": false,
  "submitted": false,
  "reason": "missing_required_fields",
  "missing": ["business purpose memo", "accounting category"],
  "draft_saved": true
}
```
