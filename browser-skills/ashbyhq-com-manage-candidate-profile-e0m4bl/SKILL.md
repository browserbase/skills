---
name: ashbyhq-com-manage-candidate-profile-e0m4bl
title: 'Ashby Candidate Profile — Search, Read & Update'
description: >-
  Search Ashby ATS for a candidate by email or name, read their full profile
  (contact info, applications, tags, custom fields, notes), add a note, and
  submit structured interview feedback against an application — via Ashby's
  documented REST API.
website: ashbyhq.com
category: ats
tags:
  - ats
  - recruiting
  - ashby
  - candidate
  - api-first
  - notes
  - feedback
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      app.ashbyhq.com has no email/password sign-in — only Google/Microsoft
      OAuth, SAML SSO, or magic-link. Browser automation requires a pre-warmed
      authenticated cookie jar and is brittle against UI changes. Use only as
      last resort when the API key is unobtainable.
verified: true
proxies: true
---
# Ashby Candidate Profile — Search, Read & Update

## Purpose

Operate on candidate records in an Ashby ATS tenant. Given a candidate identifier (email, name, or UUID), this skill:

- **Searches** for candidates by email and/or name.
- **Reads** the full candidate profile — contact info, social links, tags, current position/company/school, application ids, file handles (resume + attachments), custom fields, source, location, fraud status, and the list of existing notes.
- **Writes** new information — adds a note to the candidate (plain-text or HTML), and submits structured interview feedback against one of the candidate's applications.

The skill is **API-first**. Ashby publishes a complete, stable, documented REST API at `https://api.ashbyhq.com`, and writing to the candidate's notes / feedback streams via the API is the same operation a Recruiter performs in the UI — the entries appear in the activity timeline with the API-key's owning user as the author. The browser app at `app.ashbyhq.com` is reserved for read/write fallback only when the API key is unavailable, and even then it requires a logged-in SSO session (there is no email/password form to script against).

## When to Use

- Recruiting-ops bots that triage candidates by email/name and dump structured profile JSON for downstream LLM scoring.
- "Look up this candidate before my call" assistants that paste a one-page summary (current company, applications, last note, latest stage) into Slack.
- Auto-noting integrations: drop a note on the candidate after an external event (sourcing tool hand-off, interview scheduled in a third-party system, Zapier-style "candidate replied on LinkedIn").
- Interviewer copilots that submit a structured Score + RichText feedback against a specific `applicationId` after a debrief.
- **Not for**: hiring decisions, offer changes, stage transitions — those are separate Ashby endpoints (`application.changeStage`, `offer.*`) and should be packaged as their own skill.

## Workflow

### 1. Authenticate

Ashby uses HTTP Basic Auth with the **API key as the username and an empty password**. Every request must also send `Accept: application/json; version=1`. There is no OAuth dance, no refresh, no per-user token — one API key per integration, scoped by the permissions checked when it was created.

```bash
ASHBY_API_KEY="<from tenant admin>"
AUTH=(-u "${ASHBY_API_KEY}:" -H "Accept: application/json; version=1" -H "Content-Type: application/json")
BASE="https://api.ashbyhq.com"
```

The required permission for each call is encoded in the endpoint name's module: read calls (`candidate.search`, `candidate.info`, `candidate.list`, `candidate.listNotes`) need **`candidatesRead`**; write calls (`candidate.createNote`, `applicationFeedback.submit`) need **`candidatesWrite`**. Verify with `apiKey.info` once at session start — that one round-trip prevents surprise 403s later in the workflow.

```bash
curl "${AUTH[@]}" -X POST "$BASE/apiKey.info" -d '{}'
```

### 2. Find the candidate (search → resolve UUID)

When the caller has only an email or display name, hit `candidate.search`. Email and name parameters combine with **AND**, so pass `email` alone for the most reliable hit; pass both only if you need to disambiguate name collisions.

```bash
curl "${AUTH[@]}" -X POST "$BASE/candidate.search" \
  -d '{"email": "ada@example.com"}'
```

Response shape:

```json
{
  "success": true,
  "results": [
    {
      "id": "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      "name": "Ada Lovelace",
      "primaryEmailAddress": { "value": "ada@example.com", "type": "Work", "isPrimary": true },
      "applicationIds": ["b7c8...", "a1b2..."],
      "profileUrl": "https://app.ashbyhq.com/candidates/e9ed20fd-...",
      "..."
    }
  ]
}
```

`candidate.search` is capped at **100 results** and is not paginated — if you anticipate >100 matches (e.g., a common name across a large org) switch to `candidate.list` with `cursor` + `syncToken` pagination and post-filter locally.

If you already have the candidate UUID (e.g., from a webhook payload, an earlier search, or a `profileUrl` like `https://app.ashbyhq.com/candidates/<uuid>`), skip search and go straight to `candidate.info`.

### 3. Read full profile + existing notes

```bash
CID="e9ed20fd-d45f-4aad-8a00-a19bfba0083e"

# Full profile (includes applicationIds, fileHandles, customFields, tags, source, location)
curl "${AUTH[@]}" -X POST "$BASE/candidate.info" -d "{\"id\":\"$CID\"}"

# All notes (paginated; default + max limit = 100)
curl "${AUTH[@]}" -X POST "$BASE/candidate.listNotes" -d "{\"candidateId\":\"$CID\"}"
```

`candidate.info.results.profileUrl` is the deep-link a human recruiter would paste into Slack. `applicationIds[]` is the foreign key for any downstream write against a specific application (e.g., feedback). To resolve those into job-titled applications, fan out one `application.info` per id — they are returned as bare UUIDs.

To get a resume's actual download URL: take `resumeFileHandle.handle` (or any element from `fileHandles[]`) and call `file.info` with it; the response carries a short-lived signed URL.

### 4. Add a note

```bash
curl "${AUTH[@]}" -X POST "$BASE/candidate.createNote" \
  -d '{
    "candidateId": "'"$CID"'",
    "note": "Spoke 2026-05-19. Strong interest in IC role. Will resurface for Q3 pipeline.",
    "sendNotifications": false,
    "isPrivate": false
  }'
```

The `note` field can be a plain string (default `text/plain`) or an object `{ "type": "text/html", "value": "<b>bold</b> text" }`. HTML is silently filtered to a small allow-list: `<b> <i> <u> <a> <ul> <ol> <li> <code> <pre>` — anything else is stripped server-side before the note is saved.

`sendNotifications: true` notifies users subscribed to the candidate; default is `false`. `isPrivate: true` requires the API key to additionally carry the "Allow access to non-offer private fields" permission, or the call will 403.

### 5. Submit structured feedback (against an application, not a candidate)

Feedback is keyed on the **application** (`applicationId`), not the candidate, and must reference a **feedback form definition**. Resolve the form once at integration setup:

```bash
# Discover the form definition you want (typically the default Interview form)
curl "${AUTH[@]}" -X POST "$BASE/feedbackFormDefinition.list" -d '{}'
# -> pick one and remember its id
```

Then submit:

```bash
APP_ID="b7c8d9e0-..."  # one element of candidate.info.results.applicationIds
FORM_ID="<from feedbackFormDefinition.list>"

curl "${AUTH[@]}" -X POST "$BASE/applicationFeedback.submit" \
  -d '{
    "feedbackForm": {
      "formDefinitionId": "'"$FORM_ID"'",
      "fieldSubmissions": [
        { "path": "_systemfield_overallRecommendation", "value": { "score": 3 } },
        { "path": "_systemfield_summary",               "value": { "type": "PlainText", "value": "Solid systems thinking. Recommend onsite." } }
      ]
    },
    "applicationId": "'"$APP_ID"'"
  }'
```

Each form field has a typed value contract — see the type matrix in **Site-Specific Gotchas** below; submitting the wrong shape returns `success: false, errorInfo.code: "invalid_field_value"`. If `userId` is omitted, the feedback is credited to the API-key's owning user.

### Browser fallback

Use the API. If you absolutely cannot get an API key, the only browser path is:

1. Have a human authenticate `app.ashbyhq.com` interactively via Google SSO, Microsoft SSO, magic link, or SAML — there is no email/password form, so a headless agent cannot self-onboard.
2. Once a logged-in session cookie is captured, navigate to `https://app.ashbyhq.com/candidates/<candidateUuid>`. The right-hand sidebar exposes "Notes" and "Feedback" panels.
3. Notes: focus the rich-text composer, type, and click "Add Note". Feedback: open a specific application card, choose "Submit Feedback", fill the form, click "Submit".

This is fragile (DOM not stable across releases, no anti-bot tolerance built in, MFA on most tenants), and is not recommended. The API path is strictly better in every observable dimension: lower latency, structured input/output, idempotent, surfaces the same activity entries the UI would have written.

## Site-Specific Gotchas

- **Errors come back as `HTTP 200 + success: false`.** This is the single most important Ashby footgun. Standard 4xx codes are reserved for auth (401 missing key, 403 wrong/disabled key or missing permission). Everything else — bad UUID, malformed body, validation failure, business-rule rejection — returns `200 OK` with `{ "success": false, "errorInfo": { "code": "...", "message": "...", "requestId": "..." } }`. **Never branch on `response.ok` or status code alone**; always parse the body and branch on `body.success`. Log `errorInfo.requestId` for any failure — Ashby support requires it.
- **API key permissions are module-scoped, not endpoint-scoped.** Read access to one `candidate.*` endpoint implies read access to all of them; same for write. But a key with `candidatesRead` cannot call `candidate.createNote` — it will 403 with `missing_endpoint_permission`. Call `apiKey.info` once at startup and verify the permission set matches the operations you plan to perform, rather than discovering 30 calls in.
- **`Accept: application/json; version=1` is required, not optional.** Omit it and the API responds with a generic 406-ish error. Version pinning prevents silent breaking changes when Ashby ships v2.
- **HTML notes are aggressively filtered.** `candidate.createNote` with `type: "text/html"` accepts only `<b> <i> <u> <a> <ul> <ol> <li> <code> <pre>`. Tables, headers, images, divs, spans, classes, styles, scripts — all stripped silently before storage. Don't try to render a complex template; either flatten to plain text or stick to the supported tags.
- **`isPrivate: true` needs a separately-granted permission.** Even with `candidatesWrite`, a private note requires "Allow access to non-offer private fields?" on the API key. Without it, the call fails — and because of the 200-with-success-false convention, you must check `body.success` to catch this. Default `isPrivate: false` is the safe path.
- **Feedback submits against `applicationId`, not `candidateId`.** A candidate can have multiple applications (different jobs). `applicationFeedback.submit` requires the right `applicationId` from `candidate.info.results.applicationIds[]`. Pick the one tied to the job/interview the feedback is about — there is no "candidate-level" feedback channel.
- **Feedback field paths are not in the response shape — they live on the form definition.** Each `feedbackFormDefinition` returns `sections[].fields[].field.path` (e.g., `_systemfield_overallRecommendation`, `_systemfield_summary`, or custom `<uuid>` paths). You must fetch the definition first and map your inputs onto those exact paths, with the correctly-shaped value object (see typed-value matrix below). Submitting an unknown path returns `success: false` with `unknown_field` in `errorInfo`.
- **Feedback field-value types are not interchangeable.** The field's `type` on the form definition dictates the shape of the submitted value: `Boolean`/`Number`/`String`/`LongText`/`Email`/`Phone`/`Url`/`Date (YYYY-MM-DD)` are bare scalars; `Score` is `{score: 1-4}`; `Currency` is `{value, currencyCode}`; `CompensationRange` is `{type:"compensation-range", minValue, maxValue, currencyCode, interval}`; `NumberRange` is `{type:"number-range", minValue, maxValue}`; `RichText` is `{type:"PlainText", value}` (Ashby explicitly does not accept rich-text documents via the API, only plain text in this wrapper); `MultiValueSelect` is `string[]` of option values; `ValueSelect` is a single option `value` string; `UUID` is the raw uuid string or `{value: "<uuid>"}`. Mismatch → `success: false, errorInfo.code ~= "invalid_field_value"`.
- **`candidate.search` is hard-capped at 100 results and not paginated.** Use it for "I have an email or a near-exact name". Anything bulk — name-substring scans, daily-sync extraction, > 100 expected matches — must switch to `candidate.list` with the cursor/syncToken pagination contract.
- **`candidate.list` pagination is opaque-cursor + sync-token.** First call sends `{}` or `{createdAfter: <ms-epoch>}`; response carries `nextCursor` and `moreDataAvailable`. Pass `nextCursor` on the next call. When `moreDataAvailable: false`, persist the returned `syncToken` and pass it on your next polling cycle to fetch only deltas. Limit caps at 100 per page (default 100). Don't try to grep around the cursor; treat it as a black box.
- **`candidate.search` ignores extra parameters silently.** Sending `company`, `phone`, `tagId`, etc. doesn't error — they're just dropped. The only filters are `email` and `name`.
- **Resume / file URLs are not in `candidate.info`.** You get `fileHandles[].handle` and `resumeFileHandle.handle` — call `file.info` with the handle to mint a short-lived signed URL. Don't try to construct a download URL from the handle directly.
- **`profileUrl` returned in candidate responses is the only canonical deep-link** to the Ashby UI. Format: `https://app.ashbyhq.com/candidates/<uuid>`. Use it for human-facing summaries; never try to scrape it.
- **Rate limits live in `X-RateLimit-*` response headers; standard limit is 100 req/min per key.** `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset` (unix epoch) are returned on every response. On burst workloads, throttle to remaining/window or you'll get 429s. The 429 still comes back as a real HTTP status — that one is not wrapped in `success: false`.
- **Webhooks beat polling for change events.** If you're building "react when a candidate progresses", subscribe via `webhook.create` to `candidateStageChange`, `candidateHire`, `candidateMerge`, `applicationUpdate`, etc., instead of polling `candidate.list` with `syncToken`. Same data, far lower cost.
- **The `app.ashbyhq.com` SPA has no public email/password form.** Sign-in routes only to Google OAuth, Microsoft OAuth, SAML SSO, or a magic link emailed to the user. Browser-driving without a pre-warmed cookie jar is not possible. Captured 2026-05-19 at `https://app.ashbyhq.com/signin` — no `<input type="password">` anywhere on the page.
- **Don't curl `developers.ashbyhq.com/openapi.json` expecting an OpenAPI spec — there isn't a public one.** The reference site is a ReadMe.com-rendered manual. Trust the documented endpoint shapes; trust the live `errorInfo` codes for everything else.

## Expected Output

The skill produces one envelope per invocation. Three shapes by outcome:

**1. Successful search + read (no writes)**

```json
{
  "success": true,
  "operation": "read",
  "candidate": {
    "id": "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
    "name": "Ada Lovelace",
    "primaryEmail": "ada@example.com",
    "primaryPhone": "+1-555-0142",
    "position": "Senior Staff Engineer",
    "company": "Babbage Engines Inc.",
    "school": "University of London",
    "tags": [{ "id": "...", "title": "Top Candidate" }],
    "socialLinks": [{ "type": "LinkedIn", "url": "https://linkedin.com/in/ada" }],
    "applicationIds": ["b7c8d9e0-...", "a1b2c3d4-..."],
    "resumeHandle": "fh_aB1cD2eF3...",
    "customFields": [{ "id": "...", "title": "Years of Experience", "value": 12 }],
    "source": { "title": "Referral - Engineering" },
    "location": { "locationSummary": "London, UK" },
    "fraudStatus": "PassedFraudCheck",
    "profileUrl": "https://app.ashbyhq.com/candidates/e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
    "notes": [
      {
        "id": "n_001",
        "createdAt": "2026-05-12T14:33:21.000Z",
        "isPrivate": false,
        "content": "Initial outreach — replied within 4h.",
        "author": { "id": "u_001", "firstName": "Joey", "lastName": "Joe", "email": "joey@acme.com" }
      }
    ]
  }
}
```

**2. Successful write (note added)**

```json
{
  "success": true,
  "operation": "createNote",
  "candidateId": "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
  "note": {
    "id": "n_002",
    "createdAt": "2026-05-19T17:04:55.123Z",
    "isPrivate": false,
    "content": "Spoke 2026-05-19. Strong interest in IC role. Will resurface for Q3 pipeline.",
    "author": { "id": "u_001", "firstName": "Joey", "lastName": "Joe", "email": "joey@acme.com" }
  }
}
```

**3. Successful write (feedback submitted)**

```json
{
  "success": true,
  "operation": "submitFeedback",
  "applicationId": "b7c8d9e0-...",
  "submittedFormInstanceId": "sfi_001",
  "submittedValues": {
    "_systemfield_overallRecommendation": { "score": 3 },
    "_systemfield_summary": { "type": "PlainText", "value": "Solid systems thinking. Recommend onsite." }
  }
}
```

**4. Failure (no candidate match)**

```json
{
  "success": false,
  "reason": "candidate_not_found",
  "query": { "email": "nope@example.com" }
}
```

**5. Failure (Ashby API rejected — note the `success: false` body even when HTTP is 200)**

```json
{
  "success": false,
  "reason": "api_error",
  "httpStatus": 200,
  "errorInfo": {
    "code": "missing_endpoint_permission",
    "message": "The supplied API key does not have permission to access this endpoint",
    "requestId": "01JSJ8FEK5ZN4XQBZP7DBKK7ZC"
  }
}
```
