---
name: trust-scoutos-com-lookup-scout-trust-kuepc9
title: Scout Trust Center Lookup
description: >-
  Look up Scout's security, compliance, and privacy posture from
  trust.scoutos.com (Vanta-hosted Trust Center) for a given topic. Returns
  structured JSON with compliance badges, audit reports, policy documents,
  controls by category, subprocessors with regions, gated-access flags, and the
  canonical access-request workflow URL. Read-only — never submits access or NDA
  forms.
website: trust.scoutos.com
category: security-compliance
tags:
  - trust-center
  - vanta
  - soc2
  - compliance
  - subprocessors
  - read-only
  - scoutos
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      Vanta exposes a public GraphQL endpoint at
      https://trust.scoutos.com/graphql but every operation requires a
      signedQuery (signature + signedAt) baked into the JS bundle. Unsigned
      calls → 400 BAD_REQUEST; mutated queries → 401 UNAUTHORIZED. Direct API
      access is confirmed-blocked without forging signatures from the asset
      bundle (brittle, rotates with bundle hash). Drive the SPA instead.
verified: true
proxies: true
---
# Scout Trust Center Lookup

## Purpose

Given a security / compliance / privacy topic (e.g. `"SOC 2"`, `"GDPR"`, `"data residency"`, `"subprocessors"`, `"encryption at rest"`, `"incident response"`, `"data retention"`), return Scout's trust posture from `trust.scoutos.com`: certification badges, audit reports (with gated-access flags), policy documents, subprocessors (vendor name, purpose, region, URL), security control summaries by category, and the canonical access-request workflow URL. Returns structured JSON. **Read-only — never submits the access-request form, never accepts an NDA.**

## When to Use

- Vendor security review / due-diligence questionnaire automation against Scout.
- "Is Scout SOC 2 compliant?" / "Where is Scout's data hosted?" / "Does Scout use OpenAI as a subprocessor?" lookups.
- Pre-sales / procurement workflows that need to fetch Scout's policy doc catalog and flag which require NDA.
- Monitoring Scout's subprocessor list for changes (compare snapshot dates).

## Workflow

`trust.scoutos.com` is a **Vanta-hosted Trust Center** (Vanta SPA bundle served from `assets.vanta.com` via Cloudflare). All content is client-rendered after JS hydration. There is a public GraphQL endpoint at `https://trust.scoutos.com/graphql`, but every operation requires a Vanta-issued `signedQuery.signature` baked into the JS bundle — unsigned calls return `400 BAD_REQUEST {message:"Missing signature or signedAt"}` and mutated queries return `401 UNAUTHORIZED {message:"Invalid signature"}`. **Don't waste time trying to call GraphQL directly without driving the page** (verified iter-1). The robust path is: load the SPA in a real browser, wait for hydration, then extract the rendered DOM. A residential proxy and a bare session both succeed — anti-bot is light, but use `--verified --proxies` for resilience.

### 1. Session setup

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
```

A bare session (no `--proxies`, no `--verified`) also works in our testing; stealth flags are belt-and-suspenders. Cloudflare in front of the Vanta CDN does not enforce a JS challenge.

### 2. Resolve the topic to the right page(s)

The Trust Center has four canonical routes — all are SPA routes off `trust.scoutos.com`:

| Route | What it contains | Fetch when topic matches… |
|---|---|---|
| `/` | Overview: compliance badges (HIPAA, SOC 2, GDPR), first ~10 resources, first ~3 controls per category, first 4 subprocessors. Best single page for a "give me everything at a glance" query. | "overview", "summary", "compliance", "certifications" |
| `/resources` | Full list of 19 resources (policies, audit reports, BAAs). All Scout resources are **gated** — clicking "Request access" opens an NDA-style form. | "SOC 2 report", "penetration test", "policy", "BAA", "audit", "incident response", "data retention", "access control", "risk management" |
| `/controls` | Security controls grouped by 4 categories — `Infrastructure security` (18), `Organizational security` (9+), `Product security` (4), `Internal security procedures` (20). Each control has a name, description, and pass status. | "encryption at rest", "MFA", "access control", "background checks", "penetration testing", "vulnerability management", any specific control name |
| `/subprocessors` | 19 third-party vendors with name, purpose, location, URL, description. | "subprocessors", "data residency", "where is data hosted", "third-party vendors", "AWS / GCP / OpenAI / Anthropic usage" |

For broad/ambiguous topics fetch all four. For narrow topics (e.g. `"SOC 2"`) `/` + `/resources` is enough.

### 3. Drive the SPA and wait for hydration

For each route:

```bash
browse open "https://trust.scoutos.com/<route>" --remote --session "$BROWSE_SESSION"
sleep 3                       # wait for the GraphQL fetches + render
browse get markdown body --remote --session "$BROWSE_SESSION"
```

The 3-second sleep covers `fetchDataForTrustReport`, `fetchCustomizableControlsDataForExternalTrustCenter`, and `SubprocessorsSectionPaginated`. If the markdown response is missing the `## Resources` / `## Controls` / `## Subprocessors` heading, the page is still loading — sleep another 2 seconds and re-extract.

### 4. Paginate the Controls page

`/controls` shows only the **first 10 controls of each category**. Pagination buttons have `aria-label="Next page"` (no visible text) and `aria-label="Previous page"`. There is one pair per paginated section. To capture all controls:

```bash
# Click each "Next page" button in order to advance each section past its first 10.
browse eval "(()=>{const btns=[...document.querySelectorAll('button[aria-label=\"Next page\"]')];btns.forEach(b=>b.click());return btns.length;})()" --remote --session "$BROWSE_SESSION"
sleep 2
browse get markdown body --remote --session "$BROWSE_SESSION"
```

Section pagination labels (`"1 to 10 of 18 results"`, `"11 to 18 of 18 results"`) tell you when you're done. `Product security` (4 controls) is never paginated. `Organizational security` doesn't show a "Next" button when its second page is empty.

### 5. Extract structured fields

Parse the rendered markdown. The DOM patterns observed in iter-1:

- **Compliance badges** (Overview page, `## Compliance` section): plain-text labels `HIPAA`, `SOC 2`, `GDPR`. The SOC 2 badge is an image at `https://assets.vanta.com/static/soc2_badge.273e2b64.webp`. Other certifications appear as text-only without badge images.
- **Resources** (`/resources` page, table rows under `## Resources`): each row contains the resource name + a category label (`Compliance Documentation`, `Business Association Agreement`, `Casco Security Remediation Verification Report`). All Scout resources include a `Request access` button — meaning **all are gated; no public direct-download links exist**. A `fa-lock` icon class on the Overview page (`/`) link list confirms gated status.
- **Controls** (`/controls` page, tables under each `### <category>` heading): each row is `Control name + Description (concatenated, no separator in markdown rendering) | <pass-icon-or-blank>`. The pass icon is `fa-circle-check alpaca-fa-solid`; a **blank Status cell** means the control is NOT passing (e.g. `Remote access MFA enforced` was observed blank on 2026-05-19 — likely an SLA window or in-remediation control). Capture both passing and non-passing controls; don't filter by status.
- **Subprocessors** (`/subprocessors` page, list under `## Subprocessors`): each entry is `<Name>•<Purpose>` followed by `<Location>` and a `<Description>` paragraph and a vendor URL. Some entries have a logo at `/logos/<domain>`. The bottom of the page repeats every subprocessor in plain-text form (`All subprocessors` block) — this is the cleanest extraction target because it has one record per vendor with consistent field order: `name`, `description`, `purpose`, `location`, `url`.

### 6. Build the access-request URL

The canonical access-request workflow URLs (read-only — your skill **never POSTs** the form):

| Purpose | URL |
|---|---|
| Open the request-access modal (full or limited access) | `https://trust.scoutos.com/?requestAccessOpen=true` |
| Open the modal pre-selecting a specific resource | `https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=<resourceId>` |
| "Reclaim access" (existing-access magic-link flow) | Triggered from the same modal via `Already have access? Reclaim access`. Email-magic-link; no direct URL. |

Resource IDs are 24-char hex Mongo-style ObjectIds (e.g. `693c75bc32717159586b7c97` for the SOC 2 Type 2 Report). On the **Overview page** (`/`), each resource list item is an `<a href="/?requestAccessOpen=true&requestedResources=<id>">` — extract IDs from those `href`s. On `/resources`, each resource is a `<button>` (no href) whose ID lives in component state; to extract those, parse the Overview page or intercept the `fetchDataForTrustReport` GraphQL response (see Gotchas).

### 7. Return JSON matching the topic

Filter / rank the extracted data by the input topic. See Expected Output below for example shapes. Always include `topic`, `matches` (the topic-specific subset), `canonical_urls` (the routes you fetched), and `access_request_url`. Set `gated_access` true on every Scout resource (they all require an access request as of 2026-05-19) unless the resource URL begins with a host outside `trust.scoutos.com` (e.g. the Privacy Policy at `https://www.scoutos.com/legal/privacy-policy` is public).

### 8. Release the session

```bash
browse cloud sessions update "$BROWSE_SESSION" --status REQUEST_RELEASE
```

## Site-Specific Gotchas

- **Vanta GraphQL is signed-only.** `POST https://trust.scoutos.com/graphql?operation=<name>` returns 400 without an `extensions.signedQuery` block, and 401 if the (query, signedAt, signature) triplet doesn't match what Vanta's signer issued. Signatures are baked into the JS bundle at `https://assets.vanta.com/static/index-trust-report.<hash>.js`. They appear NOT to have a hard TTL (a signature signed at 03:56 UTC was still accepted 14h later), but they rotate when the bundle version (`<html data-version="...">`) changes. **Confirmed dead-end for direct API access** — do not attempt to forge or replay; just drive the page.
- **`fetchDataForTrustReport` only fires on initial mount.** SPA route changes (`/` → `/resources` → `/controls`) do NOT re-fetch it; the resource catalog comes from a cached client-side store. If you need the raw GraphQL response, intercept `window.fetch` **before** the first navigation:

   ```bash
   browse open "about:blank" --remote --session "$BROWSE_SESSION"
   browse eval "(()=>{window.__c=[];const o=window.fetch.bind(window);window.fetch=async(u,i)=>{const r=await o(u,i);if((typeof u==='string'?u:u.url).includes('/graphql')){try{const c=r.clone();window.__c.push({url:u,body:i&&i.body,resp:await c.text()});}catch(e){}}return r;};return'h';})()" --remote --session "$BROWSE_SESSION"
   browse open "https://trust.scoutos.com/" --remote --session "$BROWSE_SESSION"
   ```

  Even this is brittle — a hard `browse open` may reset the JS context. Markdown-extraction is more reliable.
- **Controls pagination is per-section, not per-page.** Don't assume one global "Next" — `/controls` has up to 4 paginators (one per category) all with the same `aria-label="Next page"`. Click them all to harvest every control. `Infrastructure security` paginates to "11 to 18 of 18"; `Internal security procedures` paginates to "11 to 20 of 20"; `Organizational security` has 9 controls and only one page; `Product security` has 4 controls and no pagination.
- **Blank Status cell ≠ failing control.** A control with no `fa-circle-check` icon may be passing in a different status (`disabled`, `not-applicable`, `in-progress`), passing offline, or simply rendering-quirked. Don't infer "non-compliant" from a blank cell — surface the raw status as `passing | other` in your JSON and let the caller decide. (Observed blanks on 2026-05-19: `Remote access MFA enforced`, `Anti-malware technology utilized`, `Password policy enforced`, `MDM system utilized`.)
- **All Scout resources are gated.** As of 2026-05-19, **every** resource on `trust.scoutos.com` (SOC 2 Type 2 Report, 14 policies, 4 BAAs, 2025 Penetration Test) requires an access request. No public-download URLs exist. The only public document is the Privacy Policy at `https://www.scoutos.com/legal/privacy-policy` — set `gated_access: false` only for that.
- **`fa-lock alpaca-fa-regular` is the gated marker** on Overview-page resource links. It renders as visible text (icon names leak into the markdown) — easy to grep for `fa-lock`.
- **Subprocessors page renders each vendor twice** (paginated table at top, then a full "All subprocessors" block at the bottom). Use the bottom block for extraction — it has consistent field order with no truncation. Paginated table caps at 10 per page; the bottom block lists all 19.
- **Subprocessor location strings are free-form text, not ISO codes.** Observed values: `USA`, `USA / Global`, `EU`. For data-residency lookups, normalize: anything containing `USA` → US; anything containing `EU` → EU; anything containing `Global` → multi-region. Only `Turbopuffer` was EU-only in our snapshot.
- **The `slugId` is in the HTML head** (`<head data-slugid="o79kvtsko6grw3xlu7hk6v">`) and the trust-report ID (`691cdf6d305c1790984fa04c`) is returned in every GraphQL response under `trust.trustReportBySlugId.id`. Cache these per-domain.
- **HIPAA, GDPR are text-only badges; SOC 2 has an image.** The Overview `## Compliance` block lists certifications as plain text; only SOC 2 has an associated image (`https://assets.vanta.com/static/soc2_badge.273e2b64.webp`). Don't look for image URLs for HIPAA / GDPR — they don't exist.
- **No audit-report dates exposed publicly.** The SOC 2 Type 2 Report and 2025 Penetration Test resources show only names + categories. Effective-date / report-period fields are gated behind the NDA. If your topic requires a date (e.g. "when was the latest SOC 2 audit?"), surface `audit_date: null, gated: true` and the access-request URL.
- **`Updated N minutes ago` on `/controls`** is Vanta's continuous-monitoring heartbeat, not the SOC 2 audit date. Don't conflate. (Observed: `Updated 13 minutes ago` ... `Updated 14 minutes ago` across iter-1 calls.)
- **Don't click the `Request access` button or submit the form** — that creates an actual NDA request to Scout's security team. Read-only means: extract resource names + IDs, surface the URL, never POST.
- **`linkedTrustCenters` operation exists but returned empty** for Scout — implies no parent/child trust-center hierarchy. If a future Scout subsidiary appears, check that operation.
- **Vanta `slugId` URL trick**: `/doc?s=<slug>` resolves to a logo/asset CDN object via Vanta's `assets.vanta.com` backend. The Scout logo at `https://trust.scoutos.com/doc?s=yas9uxs8vtjg77rzd140h` is one such URL — it's public-readable. Don't confuse asset slug IDs with resource IDs (asset slugs are alphanumeric-lowercase; resource IDs are 24-char hex).

## Expected Output

Return one JSON object per query. Fields below; examples by topic follow.

```jsonc
{
  "topic": "<the input topic, verbatim>",
  "domain": "trust.scoutos.com",
  "fetched_at": "<ISO-8601 UTC>",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [
    { "name": "SOC 2", "type": "Type 2", "badge_image": "https://assets.vanta.com/static/soc2_badge.273e2b64.webp" },
    { "name": "HIPAA", "type": null, "badge_image": null },
    { "name": "GDPR", "type": null, "badge_image": null }
  ],
  "matches": {
    "audit_reports": [ /* see per-topic examples below */ ],
    "policy_documents": [],
    "controls": [],
    "subprocessors": []
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": [
    "https://trust.scoutos.com/",
    "https://trust.scoutos.com/resources",
    "https://trust.scoutos.com/controls",
    "https://trust.scoutos.com/subprocessors"
  ],
  "notes": []
}
```

### Example — topic: `"SOC 2"`

```json
{
  "topic": "SOC 2",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [
    { "name": "SOC 2", "type": "Type 2", "badge_image": "https://assets.vanta.com/static/soc2_badge.273e2b64.webp" }
  ],
  "matches": {
    "audit_reports": [
      {
        "name": "Scout SOC 2 Type 2 Report",
        "category": "Compliance Documentation",
        "resource_id": "693c75bc32717159586b7c97",
        "public_download_url": null,
        "gated_access": true,
        "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=693c75bc32717159586b7c97",
        "audit_date": null,
        "auditor": null
      }
    ],
    "policy_documents": [],
    "controls": [
      { "category": "Internal security procedures", "name": "SOC 2 - System Description", "description": "Complete a description of your system for Section III of the audit report", "status": "passing" }
    ],
    "subprocessors": []
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/", "https://trust.scoutos.com/resources"],
  "notes": ["Scout is SOC 2 Type 2 certified. The audit report itself is gated; request via the access_request_url."]
}
```

### Example — topic: `"subprocessors"`

```json
{
  "topic": "subprocessors",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [
    { "name": "SOC 2", "type": "Type 2", "badge_image": "https://assets.vanta.com/static/soc2_badge.273e2b64.webp" },
    { "name": "HIPAA", "type": null, "badge_image": null },
    { "name": "GDPR", "type": null, "badge_image": null }
  ],
  "matches": {
    "audit_reports": [],
    "policy_documents": [
      { "name": "Scout Third-Party Policy", "category": "Compliance Documentation", "gated_access": true, "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=693c7744c07fcad517caadb5" }
    ],
    "controls": [],
    "subprocessors": [
      { "name": "Anthropic",             "purpose": "AI",                       "location": "USA",          "url": "https://www.anthropic.com/",    "description": "Claude LLMs" },
      { "name": "BetterStack",           "purpose": "Monitoring",               "location": "USA",          "url": "https://betterstack.com/",      "description": "Incident management and observability" },
      { "name": "Checkly",               "purpose": "Monitoring",               "location": "USA",          "url": "https://www.checklyhq.com/",    "description": "" },
      { "name": "Clerk",                 "purpose": "Authentication",           "location": "USA",          "url": "https://Clerk.com",             "description": "User auth and session management" },
      { "name": "Datadog",               "purpose": "Observability",            "location": "USA",          "url": "datadoghq.com",                 "description": "Monitor infrastructure" },
      { "name": "Fireflies",             "purpose": "Meeting notes",            "location": "USA",          "url": "https://fireflies.ai/",         "description": "Transcription and summaries" },
      { "name": "Gemini",                "purpose": "AI",                       "location": "USA",          "url": "https://gemini.google.com/",    "description": "Gemini LLMs" },
      { "name": "GitHub",                "purpose": "Source control",           "location": "USA",          "url": "github.com",                    "description": "Host and review code" },
      { "name": "Google Cloud Platform", "purpose": "Cloud provider",           "location": "USA / Global", "url": "cloud.google.com",              "description": "Run Scout services" },
      { "name": "Hex",                   "purpose": "Data notebooks",           "location": "USA",          "url": "https://hex.tech",              "description": "Analytics" },
      { "name": "Hightouch",             "purpose": null,                       "location": "USA",          "url": "https://hightouch.com/",        "description": "Marketing and personalization" },
      { "name": "Linear",                "purpose": "Issue tracking",           "location": "USA",          "url": "linear.app",                    "description": "Track product and engineering work" },
      { "name": "Neon",                  "purpose": null,                       "location": "USA",          "url": "https://neon.com/",             "description": "Database" },
      { "name": "OpenAI",                "purpose": "AI",                       "location": "USA",          "url": "https://openai.com/",           "description": "LLM" },
      { "name": "Statsig",               "purpose": "Feature flags",            "location": "USA",          "url": "statsig.com",                   "description": "Experimentation and rollouts" },
      { "name": "Temporal",              "purpose": null,                       "location": "USA",          "url": "https://temporal.io/",          "description": "Durable execution platform" },
      { "name": "Turbopuffer",           "purpose": null,                       "location": "EU",           "url": "https://turbopuffer.com/",      "description": "Database" },
      { "name": "Upstash",               "purpose": "Serverless data platform", "location": "USA",          "url": "https://upstash.com/",          "description": "Serverless key-value store" },
      { "name": "Vercel",                "purpose": "Hosting",                  "location": "USA",          "url": "vercel.com",                    "description": "Deploy Scout Web Apps" }
    ]
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/subprocessors"],
  "notes": ["19 subprocessors total. 18 US-based, 1 EU-based (Turbopuffer). GCP listed as USA/Global."]
}
```

### Example — topic: `"data residency"`

```json
{
  "topic": "data residency",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [{ "name": "GDPR", "type": null, "badge_image": null }],
  "matches": {
    "audit_reports": [],
    "policy_documents": [
      { "name": "Scout Data Management Policy", "category": "Compliance Documentation", "gated_access": true, "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true" }
    ],
    "controls": [],
    "subprocessors": [
      { "name": "Google Cloud Platform", "purpose": "Cloud provider", "location": "USA / Global", "url": "cloud.google.com" },
      { "name": "Turbopuffer",           "purpose": "Database",       "location": "EU",           "url": "https://turbopuffer.com/" },
      { "name": "Neon",                  "purpose": "Database",       "location": "USA",          "url": "https://neon.com/" }
    ]
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/subprocessors", "https://trust.scoutos.com/resources"],
  "notes": [
    "Scout's primary cloud is GCP (USA/Global). Database subprocessors: Neon (USA), Turbopuffer (EU).",
    "Detailed data-residency commitments are in the gated Data Management Policy."
  ]
}
```

### Example — topic: `"encryption at rest"`

```json
{
  "topic": "encryption at rest",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [],
  "matches": {
    "audit_reports": [],
    "policy_documents": [
      { "name": "Scout Information Security Policy", "category": "Compliance Documentation", "gated_access": true, "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=693c7744468a3f6b539600d6" }
    ],
    "controls": [
      { "category": "Infrastructure security", "name": "Encryption key access restricted", "description": "The company restricts privileged access to encryption keys to authorized users with a business need.", "status": "passing" },
      { "category": "Product security",        "name": "Data transmission encrypted",     "description": "The company uses secure data transmission protocols to encrypt confidential and sensitive data when transmitted over public networks.", "status": "passing" }
    ],
    "subprocessors": []
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/controls", "https://trust.scoutos.com/resources"],
  "notes": [
    "Overview page summary states: 'We encrypt your data in-transit and at-rest using advanced cryptographic algorithms.'",
    "Specific algorithms / KMS provider are not disclosed publicly — gated behind the Information Security Policy."
  ]
}
```

### Example — topic: `"incident response"`

```json
{
  "topic": "incident response",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [],
  "matches": {
    "audit_reports": [],
    "policy_documents": [
      { "name": "Scout Breach Notification Policy",                       "category": "Compliance Documentation", "gated_access": true, "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=693c77445645c92316f98721" },
      { "name": "Scout Business Continuity - Backup & Recovery Policy",  "category": "Compliance Documentation", "gated_access": true, "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true&requestedResources=693c774428a705ac5e22b109" }
    ],
    "controls": [],
    "subprocessors": [
      { "name": "BetterStack", "purpose": "Monitoring", "location": "USA", "url": "https://betterstack.com/", "description": "Incident management and observability" }
    ]
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/resources", "https://trust.scoutos.com/subprocessors"],
  "notes": [
    "Incident-response contact: security@scoutos.com (published on Overview page).",
    "Detailed IR procedures are in the gated Breach Notification Policy."
  ]
}
```

### Example — topic: `"penetration test"`

```json
{
  "topic": "penetration test",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [],
  "matches": {
    "audit_reports": [
      {
        "name": "2025 - Penetration Test",
        "category": "Casco Security Remediation Verification Report",
        "auditor": "Casco Security",
        "year": 2025,
        "resource_id": null,
        "public_download_url": null,
        "gated_access": true,
        "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true"
      }
    ],
    "policy_documents": [],
    "controls": [
      { "category": "Product security", "name": "Penetration testing performed", "description": "The company's penetration testing is performed at least annually. A remediation plan is developed and changes are implemented to remediate vulnerabilities in accordance with SLAs.", "status": "passing" }
    ],
    "subprocessors": []
  },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/resources", "https://trust.scoutos.com/controls"],
  "notes": ["Scout's 2025 pentest was performed by Casco Security. The full report is gated."]
}
```

### Outcome shape: topic not found

If the topic genuinely matches nothing on the Trust Center (e.g. `"FedRAMP"`, `"ISO 27001"`), return:

```json
{
  "topic": "FedRAMP",
  "domain": "trust.scoutos.com",
  "fetched_at": "2026-05-19T18:10:00Z",
  "trust_report_id": "691cdf6d305c1790984fa04c",
  "compliance_badges": [
    { "name": "SOC 2", "type": "Type 2", "badge_image": "https://assets.vanta.com/static/soc2_badge.273e2b64.webp" },
    { "name": "HIPAA", "type": null, "badge_image": null },
    { "name": "GDPR", "type": null, "badge_image": null }
  ],
  "matches": { "audit_reports": [], "policy_documents": [], "controls": [], "subprocessors": [] },
  "access_request_url": "https://trust.scoutos.com/?requestAccessOpen=true",
  "canonical_urls": ["https://trust.scoutos.com/", "https://trust.scoutos.com/resources", "https://trust.scoutos.com/controls", "https://trust.scoutos.com/subprocessors"],
  "notes": ["No matching certification, policy, control, or subprocessor for 'FedRAMP' on trust.scoutos.com. Scout's published certifications are SOC 2 Type 2, HIPAA, and GDPR only."]
}
```
