---
name: greenhouse-com-apply-to-jobs-dsmal1
title: Greenhouse Job Application
description: >-
  Apply to a Greenhouse-hosted job posting: discover the form schema via the
  public Job Board API, fill identity fields, upload resume/cover letter, answer
  custom and EEOC/demographic questions, and submit the application (with
  explicit user confirmation gating the submit click).
website: greenhouse.com
category: careers
tags:
  - careers
  - ats
  - job-application
  - greenhouse
  - resume-upload
  - write-action
source: 'browserbase: agent-runtime 2026-05-24'
updated: '2026-05-24'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      The public Job Board API
      (boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?questions=true)
      returns the complete form schema with no auth, no proxy, and no rate-limit
      friction. Use it to plan and validate the user's dossier offline. The
      submit POST itself, however, is browser-only: it requires a reCAPTCHA
      Enterprise token plus a page-context fingerprint that cannot be reproduced
      without a live SPA session.
  - method: browser
    rationale: >-
      Mandatory for the actual fill + submit. The form is a React (react-aria)
      SPA that mints captcha and fingerprint tokens client-side and POSTs them
      with the application JSON. Files are uploaded via S3 presigned URLs minted
      in-page.
verified: true
proxies: true
---
# Greenhouse Job Application

## Purpose

Submit a complete job application — applicant identity, contact info, resume/CV upload, optional cover letter, and answers to every required custom + EEOC/demographic question — on a Greenhouse-hosted job posting and confirm submission. This skill is **write**: it creates an application record at the target ATS and the action is generally non-reversible without contacting the employer's recruiter directly. Always require explicit user confirmation of the submission step (see Site-Specific Gotchas).

## When to Use

- A user asks an agent to apply to a specific Greenhouse-hosted job (URLs containing `job-boards.greenhouse.io`, `boards.greenhouse.io`, or any company careers page powered by a Greenhouse embed).
- Auto-applying to a batch of Greenhouse postings from a saved-search worklist, where the user has already approved the resume + answers for each role.
- Re-applying after a deadline change or job edit (resume + answer dossier reused, but the form schema must be re-fetched because question IDs can change).
- *Not* the right skill for LinkedIn Easy Apply, Workday, Lever, Ashby, Workable, or Greenhouse's `quick_apply` referral-link flow (separate skills).

## Workflow

The optimal flow is **hybrid**: lead with a JSON API call to Greenhouse's public Job Board API to discover the complete form schema (questions, types, allowed values, EEOC/demographic blocks), use that schema to plan + validate the user's answers offline, then drive the React browser form for the actual fill + submit. The submit step *cannot* be made API-only because Greenhouse's POST handler validates a reCAPTCHA Enterprise token plus a client-side fingerprint that are minted inside the live page context — verified by reading `entry.client-*.js` (`Ua({application, submitPath, csrfToken, fingerprint, recaptchaClient, securityCode, captchaFailed, jobApplicationRequestToken})` is the only submit path).

### Step 1 — Parse the job URL into `{board_token, job_id}`

Greenhouse application URLs always normalize to one of:

| URL pattern | Notes |
|---|---|
| `https://job-boards.greenhouse.io/{board_token}/jobs/{job_id}` | Modern React SPA. Canonical. |
| `https://boards.greenhouse.io/{board_token}/jobs/{job_id}` | Legacy. **301-redirects** to the modern URL with `Content-Length: 0` (no body) — always follow the `Location` header before doing anything else. |
| `https://job-boards.greenhouse.io/embed/job_app?for={board_token}&token={job_id}` | Embed/iframe variant. Same form, same submit path, different `<form action=>`. |
| `https://{careers-host}/job/{job_id}` (custom) | Many companies (e.g. `careers.acme.com`) iframe the Greenhouse embed URL. Inspect for an iframe with `src=*greenhouse.io*` or extract `board_token + job_id` from the page's structured data. |

Extract `{board_token, job_id}` — they're always the last two path segments on the canonical URL. If the user provided a job ID without a board token, you cannot proceed; ask them to paste the URL.

### Step 2 — Fetch the form schema (API, no auth, no proxy needed)

```
GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?questions=true
```

Returns JSON with these top-level keys you must read before filling anything:

- `questions[]` — every visible custom + standard question (First Name, Last Name, Email, Phone, Resume/CV, Cover Letter, LinkedIn, plus every company-defined question). Each entry has `{label, required, fields: [{name, type, values}]}`. Field `name` is the form input key (e.g. `first_name`, `email`, `resume`, `question_63386696[]`).
- `location_questions[]` — present when the job collects location. Contains `longitude` (input_hidden), `latitude` (input_hidden), and `location` (input_text). On the UI these are a single autocompleted City combobox backed by `api-geocode-earth-proxy.greenhouse.io`.
- `compliance[]` — **classic EEOC schema** (US federal contractors). Array entries with `type: "eeoc"` carry `questions[]` whose `fields[0].name` is one of `disability_status`, `veteran_status`, `race`, `gender` and `values` is `[{label, value}]`. Empty/null when the company doesn't run classic EEOC.
- `demographic_questions{header, description, questions[]}` — **new Inclusive Hiring schema** (used by Twilio, many newer setups). Differs from `compliance[]`: each question carries an integer `id`, a `type`, and `answer_options[{id, label, free_form, decline_to_answer}]`. Either `compliance` *or* `demographic_questions` will be populated (sometimes neither); they cover the same legal need with different shape. **You must handle both.**
- `education` — `"education_required"` / `"education_optional"` / null. When present, the form renders a separate Education subsection (school + degree + discipline + start/end year, repeatable).
- `data_compliance[]` — GDPR + retention consent flags. `demographic_data_consent_applies` controls whether to render demographic block UI at all.

`questions[].fields[].type` enum, observed across 4 boards (Twilio, Anthropic, SpaceX, GitLab):

| Type | Browser widget | Filling pattern |
|---|---|---|
| `input_text` | textbox | `browse fill @<ref> "<value>"` |
| `textarea` | textbox (multi-line) | `browse fill @<ref> "<value>"` |
| `input_file` | hidden `<input type=file>` behind an "Attach" button | `browse upload @<file_input_ref> <local_path>` (see Step 4) |
| `multi_value_single_select` | combobox + "Toggle flyout" button → listbox | click flyout → click option (see Step 5) |
| `multi_value_multi_select` | combobox with multi-select listbox (or checkbox set for "Acknowledge" pseudo-checkboxes) | click flyout → click each option |
| `input_hidden` | hidden — auto-populated by typeahead (lat/lon from geocode) | never fill directly |

Use the schema to **validate the user-provided dossier** before opening a browser session: every `required: true` field must have a value, every `multi_value_single_select` value must match a `values[i].label` (exact, case-insensitive match acceptable on the UI), and the resume file must exist locally. Failing this offline is free; failing it after fingerprint/captcha minting costs a session.

### Step 3 — Open a stealth browser session and navigate

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
browse open "https://job-boards.greenhouse.io/{board_token}/jobs/{job_id}" --remote
browse wait load --remote
# React widget renders ~1–3 s after `load`; the Apply form is below the fold.
browse wait timeout 2000 --remote
browse snapshot --remote --filter "/textbox|combobox|button: Attach|button: Submit/" --compact
```

`--verified --proxies` is the recommended default. The form page loads on bare sessions today, but the submit handler invokes reCAPTCHA Enterprise + a fingerprint snapshot — stealth + residential IP materially improves the captcha confidence score and avoids the `captcha_retried` slow path.

### Step 4 — Upload resume (and cover letter, if provided)

The snapshot's `group: Resume/CV*` block exposes a hidden file input as `input, file: Attach`. **Do not click the visible "Attach" button** — that opens a native file picker the headless browser can't drive. Upload directly to the file-input ref:

```bash
browse upload "@<resume_input_ref>" /local/path/to/resume.pdf --remote
# Wait a couple seconds for the S3 presigned upload to complete
browse wait timeout 3000 --remote
# Verify: snapshot should show the filename + a "Remove file" button
browse snapshot --remote --filter "/Resume\/CV|Remove file/" --compact
```

Greenhouse uploads files via S3 presigned URLs minted by `GET /uncacheable_attributes/presigned_fields?fields[]=resume&fields[]=cover_letter` (called automatically by the SPA in the background). Successful upload yields `{name, url}` keyed by field name in the application JSON. Accepted filetypes (from page text): `pdf, doc, docx, txt, rtf`. Maximum size is not advertised but ≤ 10 MB is safe.

If the user has no resume file but provided resume text, click the "Enter manually" button inside the Resume/CV group instead — it swaps the file-input UI for a textbox that targets the `resume_text` field. Same toggle exists for cover letters.

### Step 5 — Fill text fields and resolve comboboxes

**Standard text fields** (First Name, Last Name, Preferred Name, Email, Phone, LinkedIn URL, free-text questions):

```bash
browse fill "@<ref>" "<value>" --remote
```

Greenhouse uses `react-aria` for inputs — `browse fill` (which clears first) is more reliable than `type`. Email has a debounced HTTP validator (`email-address-validator.us.greenhouse.io`); allow ~1 s after fill before clicking the next field or you can race the validator.

**Single-select combobox** (e.g. "Are you legally authorized to work in the US?", EEOC questions, demographic questions):

```bash
# 1. Click the "Toggle flyout" button immediately adjacent to the combobox.
browse click "@<toggle_flyout_ref>" --remote
browse wait timeout 800 --remote
# 2. Snapshot the listbox that just opened and click the option whose StaticText
#    matches the schema's `values[i].label`.
browse snapshot --remote --filter "/option:/" --compact
browse click "@<option_ref>" --remote
```

`browse select` does **not** work on these — they're ARIA comboboxes, not native `<select>` elements. Don't waste a turn trying it.

**Location/City typeahead** (when `location_questions[]` is present):

```bash
browse click "@<location_combobox_ref>" --remote
browse type "San Francisco" --remote
# Wait for geocode-earth-proxy to return matches
browse wait timeout 1500 --remote
# Listbox now shows ranked options like "San Francisco, California, United States"
browse snapshot --remote --filter "/option:/" --compact
browse click "@<first_or_best_option_ref>" --remote
```

Clicking an option commits the display text AND fills the hidden `latitude`/`longitude` fields. If you don't click an option — e.g., you only type then tab away — `latitude` and `longitude` stay empty and the form fails validation with no visible error on those two hidden fields.

**Multi-select combobox** (e.g. "How did you hear about us?", "Active Security Clearance(s)"): same flyout-click → option-click pattern, repeated once per desired option. The flyout stays open after each pick.

**Acknowledgement checkboxes** (e.g. Twilio's "By clicking the Acknowledge button…", "Candidate AI Responsible Use Policy"): these are rendered as `multi_value_multi_select` with a single value `{label: "Acknowledge", value: <id>}`. Treat them like a single-option multi-select — click flyout, click the lone "Acknowledge" option.

### Step 6 — Fill EEOC / Demographic block (when applicable)

Whichever schema the API returns drives which DOM layout you'll see, but the **interaction pattern is identical** — every demographic question on the page is a single-select combobox with a "Toggle flyout" sibling.

- If the user wants to skip these: every demographic question has a `decline_to_answer: true` option (`demographic_questions` schema) or a "Decline To Self Identify" / "I don't wish to answer" value (`compliance` schema). These are still required fields in the UI — picking the decline option satisfies the requirement.
- These fields are voluntary by law (US OFCCP). Default to the user's stated preference; if not stated, default to declining rather than guessing.

### Step 7 — Pre-submit sanity check

Before clicking Submit:

1. `browse snapshot --filter "/error|invalid|required/i" --compact` to surface any inline validation messages that appeared during fill (they're usually under the offending field).
2. Verify every `required: true` field from the schema has a non-empty rendered value.
3. **Get explicit user confirmation.** This is a non-reversible action on the employer's ATS. The agent must surface a summary of the filled values (especially Yes/No answers to legal questions like sponsorship and work-authorization) and wait for an affirmative go-ahead before continuing to Step 8.

### Step 8 — Submit

```bash
browse snapshot --remote --filter "/button: Submit application/" --compact
browse click "@<submit_ref>" --remote
# Wait for the reCAPTCHA Enterprise assessment + POST round-trip. 5–15s is normal.
browse wait timeout 8000 --remote
browse get url --remote
```

On success the page URL changes from `/{board_token}/jobs/{job_id}` to either `/{board_token}/jobs/{job_id}?application_id=...` or a confirmation route, and the DOM swaps to a `confirmation` container with the company's success message and a "View more jobs" link. Extract the confirmation text + URL for the return value.

On failure, the form re-renders with field-level error messages and a banner driven by `application.errors.generic_failure`. Re-snapshot and emit which fields errored.

### Step 9 — Release the session

```bash
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Submission is irreversible. Require explicit user confirmation before Step 8.** Greenhouse does not surface an in-product "withdraw application" affordance to the candidate — withdrawal must go through the recruiter. Treat the submit click like a financial transaction; never auto-submit on a stale dossier or without a fresh user-go signal in the same session.
- **Submission cannot be replayed via direct API call.** The submit POST goes to a `submitPath` template baked into the SPA initial state (observed forms: `/embed/job_app?for=…&token=…` for embed, the page URL itself for the main board). The body shape is `{job_application: {...}, fingerprint, csrfToken, "g-recaptcha-enterprise-token", security_code?, captcha_retried?, request_token?}` and requires a valid reCAPTCHA Enterprise assessment minted client-side via `recaptchaClient.performAssessment()` plus a page-context fingerprint. **Don't waste time trying to curl-replay the submit** — every observed attempt without the live page context gets rejected at the captcha layer.
- **Both demographic schemas can appear; you must read both.** Treat `compliance[]` (classic EEOC) and `demographic_questions{}` (Inclusive Hiring) as mutually exclusive *per job* but jointly exhaustive *across the fleet*. Verified populations: Twilio uses `demographic_questions` only, SpaceX uses `compliance` only (4 eeoc blocks: intro + Disability + Veteran + Race/Gender), GitLab uses `compliance` only (4 eeoc blocks), Anthropic uses neither (it's a non-US-government-contractor flow). Branching solely on `compliance.length > 0` will miss Twilio-style demographics entirely.
- **`boards.greenhouse.io` always 301s with empty body to `job-boards.greenhouse.io`.** The `Content-Length: 0` legacy response carries no markup — you must follow `Location` before parsing. The `boards.greenhouse.io/embed/...` legacy embed URL also 301s.
- **`https://my.greenhouse.io/jobs/{job_id}` is a 404 page, not a candidate portal.** Don't link users there. The candidate portal (when enabled by the employer) is reached via the "Create account" button on the confirmation page after submission, and lives at a per-board path.
- **The hidden file input is on the snapshot as `input, file: Attach`** — sibling to the visible "Attach" button inside the `group: Resume/CV*`. `browse upload @<file_input_ref> <path>` works; `browse click @<attach_button_ref>` opens a native file picker the headless browser can't dismiss without `browse press Escape` and re-running the upload. Always target the input, never the button.
- **`browse select` does not work on Greenhouse comboboxes.** They are `react-aria` ARIA `combobox` + `listbox` widgets, not `<select>`. Use the click-flyout → click-option pattern. Wasted turn detection: if `browse select` returns `Error: not a select element` or similar, switch to the combobox pattern.
- **Location typeahead silently fails when not committed.** If you `fill` or `type` text into the Location combobox and tab away without clicking a listbox option, the visible field shows the text you typed but the hidden `latitude`/`longitude` stay empty. The form will reject the submit with a Location-required error and no visual cue near the lat/lon fields (they're `input_hidden`). Always wait for the geocode listbox and click an option.
- **Email gets a debounced async validator.** `email-address-validator.us.greenhouse.io` is called ~500 ms after the last keystroke. Don't immediately tab to the next field after `browse fill` on the Email input — the validator can blank the field if it loses focus mid-flight on slow proxies. Add `browse wait timeout 1000 --remote` after Email fills.
- **Phone is a country combobox + national-number textbox.** The `phone` field name in the API is the national part; the country code lives in a separate combobox. If you provide a phone in E.164 with `+` prefix, the React widget may strip the country code or leave it in the national-number box. Safer pattern: open the Country flyout, click the user's country option first, then fill the Phone textbox with the national number only.
- **`Enter manually` on Resume/CV is intentional, not a workaround.** Some companies disable file uploads on certain jobs (e.g., internal redeployments) — in that case the only Resume/CV affordance is the textbox produced by clicking Enter manually. If you don't see an `input, file:` ref in the Resume/CV group, switch to manual mode.
- **`questions[].fields[].name` for custom questions is `question_<int>` (or `question_<int>[]` for multi-select)**. The integer is the question's Greenhouse internal id and is **per-board, not stable across jobs** even if the labels are textually identical (e.g. SpaceX's "Are you legally authorized to work in the United States?" uses a different `question_<id>` than Twilio's). **Always re-fetch the schema for each job. Never cache `question_<id>` → label maps across jobs.**
- **Greenhouse's `quick_apply` endpoint is a referral-link flow, not a regular apply path.** A URL containing `?quick_apply=1` or routing through `/quick_apply` short-circuits most of the form (typically prefills from a `My Greenhouse` profile). Don't conflate with the standard apply skill; it's a different flow with different fields.
- **The `data_compliance.requires_consent: true` case adds a consent checkbox the SPA renders dynamically.** Most US jobs don't trigger it; EU-targeted postings do. When `requires_consent: true`, scan for an additional checkbox group near the bottom of the form before submitting.
- **Education subsection is repeatable.** When `education` ∈ `{education_required, education_optional}`, the form renders an "Add another" button below the first school/degree row. The user's dossier may need multiple entries; the schema doesn't constrain how many.
- **Stealth flags rationale (`--verified --proxies`).** The page itself rendered fine on bare sessions in iter-1, but the submit handler runs reCAPTCHA Enterprise client-side; a bare-Browserbase IP gets a lower confidence score and lands the submit in the `captcha_retried` slow path (which can also block on a visual challenge that the agent can't solve). Both flags should be on by default; if cost is a concern, dropping `--verified` is the safer downgrade than dropping `--proxies`.
- **No site-specific anti-bot wall observed on the form page itself during iter-1 testing** (4 boards across 3 hosting orgs, all loaded cleanly with `--verified --proxies`). Captcha enforcement is concentrated at submit time, not page-load time.
- **The public Job Board API has no rate-limit advertised, but be courteous.** ≤ 1 req/s sustained is safe; the same response is also CloudFront-cached, so bursts on the same job ID typically hit cache and don't count.

## Expected Output

Three terminal outcomes — the agent should return one of these shapes:

```json
// Application submitted successfully
{
  "success": true,
  "board_token": "twilio",
  "job_id": "7605743",
  "job_title": "Software Engineer",
  "company_name": "Twilio",
  "submitted_at": "2026-05-24T17:32:11Z",
  "confirmation_url": "https://job-boards.greenhouse.io/twilio/jobs/7605743?application_id=...",
  "confirmation_text": "Thanks for applying to Software Engineer at Twilio! We have received your application...",
  "filled_fields": {
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane.doe@example.com",
    "phone": "+1 415 555 0123",
    "resume_filename": "jane-doe-resume.pdf",
    "location": "San Francisco, California, United States",
    "question_63386697": "Yes",
    "question_63386698": "No",
    "...": "..."
  },
  "demographic_answers_provided": true,
  "demographic_schema": "demographic_questions"
}

// Form validation failed (required field missing, async validator rejected an answer, etc.)
{
  "success": false,
  "reason": "validation_failed",
  "errors": [
    {"field": "email", "message": "Please provide a valid email address."},
    {"field": "location", "message": "Location is required."}
  ],
  "board_token": "twilio",
  "job_id": "7605743"
}

// Captcha / submit rejected after fill completed
{
  "success": false,
  "reason": "submit_blocked",
  "detail": "reCAPTCHA Enterprise assessment failed or visual challenge surfaced; retry with --verified --proxies on a fresh session.",
  "board_token": "twilio",
  "job_id": "7605743"
}

// Job no longer accepting applications (deadline passed or req closed)
{
  "success": false,
  "reason": "job_closed",
  "detail": "The application_deadline in the schema is in the past, or the job-boards page returned a 'No longer accepting applications' banner.",
  "board_token": "twilio",
  "job_id": "7605743"
}

// User declined to confirm the submit step (Step 7 gate)
{
  "success": false,
  "reason": "user_declined_submit",
  "filled_fields": { "...": "..." },
  "board_token": "twilio",
  "job_id": "7605743"
}
```
