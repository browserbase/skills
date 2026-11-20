---
name: atlys-com-apply-thailand-visa-dwl0xi
title: Apply for Thailand Visa (TDAC) on Atlys
description: >-
  Start a Thailand TDAC/visa application on Atlys and extract product terms,
  full price breakdown, processing time, required documents, and the application
  form structure. Read-only — stops before payment.
website: atlys.com
category: travel
tags:
  - travel
  - visa
  - thailand
  - tdac
  - atlys
  - read-only
source: 'browserbase: agent-runtime 2026-06-19'
updated: '2026-06-19'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Not viable — bare HTTP fetches of any atlys.com path return a Cloudflare
      308 challenge page, and the page is a client-rendered React SPA, so there
      is no content to scrape without a real browser.
  - method: api
    rationale: >-
      No public API. The application backend is auth-gated (account/email) and
      sits behind the SPA; the only stable shortcut is the in-site
      /apply-visa?destination=TH deep-link, which is still a browser navigation.
verified: false
proxies: false
---
# Apply for a Thailand Visa (TDAC) on Atlys

## Purpose

Start a Thailand entry application on Atlys (`atlys.com`) and extract everything a traveler needs before committing: the product Atlys sells for Thailand (the **TDAC — Thailand Digital Arrival Card** for visa-exempt nationalities), its stay/validity/entry terms, the full price breakdown, processing time, the required documents, and the structure of the application form. The skill drives the flow up to the **application form entry** and stops there. It is **read-only**: it never fills personal data, uploads a passport, or reaches checkout/payment. For most nationalities Atlys treats "Thailand visa" as the mandatory TDAC (Thailand is visa-exempt for short tourist stays); a true sticker/eVisa only appears for nationalities that require one.

## When to Use

- "How do I apply for a Thailand visa / TDAC on Atlys, and what does it cost?"
- "What documents and details does Atlys need for the Thailand TDAC?"
- "How long does Atlys take to process a Thailand TDAC, and what's the total fee?"
- A travel-planning agent gathering Thailand entry requirements and Atlys pricing before a human decides whether to pay.
- Pre-filling a checklist of the fields the traveler will need (passport, flight numbers, hotel) before they sit down to apply.

## Workflow

The recommended method is **browser automation**. Atlys has no public API for this, and bare HTTP fetches of any `atlys.com` path return a Cloudflare **308 challenge page** instead of content (the site is a client-rendered React SPA). A full browser session, however, passes Cloudflare cleanly — in testing a plain remote session reached the page without residential proxies or stealth verification.

### 1. Open the Thailand visa page

```bash
browse open "https://www.atlys.com/apply-thailand-visa" --remote
browse wait load
browse wait timeout 3000
```

`/apply-thailand-visa` 308-redirects, then client-redirects by **IP geolocation** to a locale page such as `https://www.atlys.com/en-US/visa/thailand-visa`. Confirm with `browse get url`. To force a specific nationality/locale, navigate directly to the locale-prefixed URL instead (e.g. `https://www.atlys.com/en-IN/visa/thailand-visa`, `/en-GB/`, `/en-PH/`).

### 2. Read the visa terms and pricing

```bash
browse get text body
```

`get text body` reliably contains all content (and an embedded i18n JSON bundle). Pull from it:

- **TDAC Information** block → `Type: TDAC`, `Length of Stay: 30 days`, `Validity: 90 days`, `Entry: Single`.
- **Pricing card** (next to the "Start Application" button) → `Pay Now` (Government Fees), `Pay on approval` (Processing Fee), and `Total Amount`. For a US passport this reads **$1 + $60 = $61 USD**. Prices and the product vary by nationality.
- **Processing time** → "Guaranteed in 20 minutes" / "TDAC in 1 hour" on the hero, guaranteed before the travel date.

### 3. Advance to the application form (read-only)

```bash
browse snapshot                      # find refs (large tree — see gotchas)
browse click [<ref of "After <date>">]      # the "When do you plan to travel?" option
browse snapshot
browse click [<ref of "Check Required Documents" or "Start Application">]
browse wait load
browse wait timeout 6000             # the apply page shows a loading animation first
browse get url
browse snapshot
```

The URL becomes `https://www.atlys.com/{locale}/apply-visa?destination=TH&action_source=visa_breakdown&departure=<date>&arrival=<date>&purpose=atlys_black&step=passport&auth=guest` and the **TDAC application form** renders (heading "THAILAND TDAC — guaranteed in 20 minutes"). Record its sections/fields:

- **Personal Information** — First/Last Name (as per passport), Date of Birth, Gender, Marital Status, Passport Number, Passport Valid Till, Passport place of issue, Nationality, Occupation.
- **Arrival Flight Details** — Direct/Multi-Stop, Flight Number, Arrival Date.
- **Return Flight Details** — Direct/Multi-Stop, Flight Number, Departure Date.
- **Hotel Details** — Hotel Name, Location in Thailand (province).
- **Contact Details** — Email.

### 4. Stop and emit

**STOP here.** Do not type into any field, do not click "Submit application", do not "Add Travelers", do not proceed to checkout. Read the field labels and emit the JSON in *Expected Output*.

### Deep-link shortcut (optional)

`https://www.atlys.com/{locale}/apply-visa?destination=TH&step=passport&auth=guest` cold-navigates straight to the application form. It works, but without the full `departure`/`arrival`/`purpose`/`action_source` query params it often shows a perpetual loading animation ("Knocking on embassy doors…", "Smoothing the journey ahead"). If it spins, fall back to the landing-page CTA flow in step 3.

## Site-Specific Gotchas

- **READ-ONLY.** The form's terminal action is "Submit application" / "Proceed to checkout". Never submit, never pay, never upload a passport image.
- **Bare HTTP fetch is Cloudflare-blocked.** Any `curl`/`fetch` of an `atlys.com` URL returns a `308 Permanent Redirect` Cloudflare challenge page, not content. A full remote browser session passes — in testing **no residential proxy and no stealth verification were required**. If a session ever does get challenged, retry with `--proxies` (the homepage anti-bot probe flagged Cloudflare and `likelyNeedsProxies`).
- **The accessibility tree is huge (10k+ nodes).** A full `browse snapshot` can exceed naive command-output buffers. Prefer `browse get text body` for *content* and only `browse snapshot` when you need a clickable ref. Re-snapshot after every navigation — refs invalidate.
- **Geo-driven locale + pricing.** `/apply-thailand-visa` redirects to a locale page based on the session's IP, and nationality determines the product and price. Force a nationality via the locale URL prefix (`/en-US/`, `/en-IN/`, `/en-GB/`, `/en-PH/` …) or the in-page nationality selector (a flag button that opens a "Search for a country" textbox + full country list).
- **It's a TDAC, not a sticker visa, for visa-exempt nationalities.** Thailand allows visa-free short tourist stays (~60 days for US/many others), but the **TDAC arrival card is mandatory** (since May 1, 2025). Atlys's "Thailand visa" product for these nationalities is the TDAC. Nationalities that genuinely need a visa will see a different product/price.
- **Price is split into two charges.** "Pay Now" is a small government fee (≈$1) and "Pay on approval" is the Atlys processing fee (≈$60), totaling ≈$61 for a US passport. Report both legs, not just the total.
- **The apply page loads behind an animation.** After clicking the CTA, the `/apply-visa` route renders a multi-second loading sequence before the form appears — wait ~6s (`browse wait timeout 6000`) before snapshotting.
- **`browse snapshot` output is verbose but functional** here; clicking the travel-date option button *before* the CTA is what actually navigates to the form (the CTA alone, with no date chosen, stays on the landing page).
- No login wall blocks *reaching* the form — the entry uses `auth=guest`. Account creation/email is only requested deeper in the flow (and is past the read-only stop point).

## Expected Output

```json
{
  "success": true,
  "provider": "atlys.com",
  "destination": "Thailand",
  "product": "TDAC (Thailand Digital Arrival Card)",
  "nationality_detected": "United States",
  "visa_details": {
    "type": "TDAC",
    "length_of_stay_days": 30,
    "validity_days": 90,
    "entry": "Single"
  },
  "pricing": {
    "pay_now": "$1 (Government Fees)",
    "pay_on_approval": "$60 (Processing Fee)",
    "total": "$61",
    "currency": "USD"
  },
  "processing_time": "Guaranteed ~20 minutes; delivered before travel date",
  "required_documents": [
    "Passport (front page upload — OCR auto-fill)",
    "Arrival flight number",
    "Hotel name and city in Thailand",
    "Email (contact)"
  ],
  "application_form_sections": [
    "Personal Information",
    "Arrival Flight Details",
    "Return Flight Details",
    "Hotel Details",
    "Contact Details"
  ],
  "application_entry_url": "https://www.atlys.com/en-US/apply-visa?destination=TH&step=passport&auth=guest",
  "stopped_at": "application form entry (pre-payment, read-only)",
  "error_reasoning": null
}
```

Failure / blocked shape:

```json
{
  "success": false,
  "provider": "atlys.com",
  "destination": "Thailand",
  "stopped_at": "blocked before application form",
  "error_reasoning": "Cloudflare challenge / page did not render the apply widget after retries"
}
```
