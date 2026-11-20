---
name: edgeprop-my-find-agent-contact-details-hvhaqj
title: EdgeProp.my Find Agent Contact Details
description: >-
  Extract a Malaysian real-estate agent's display name, full mobile phone
  (E.164), and email from any EdgeProp.my agent profile or listing page by
  parsing the inlined Next.js __NEXT_DATA__ payload — bypasses the UI's masked
  phone and email-form gateway.
website: edgeprop.my
category: real-estate
tags:
  - real-estate
  - malaysia
  - agent
  - contact
  - edgeprop
  - scraping
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Browser session is required to clear Cloudflare's managed challenge —
      direct HTTP fetches return 403. Within the browser, extraction is a single
      XPath read of <script id="__NEXT_DATA__"> followed by JSON parse; no
      clicks are needed.
  - method: url-param
    rationale: >-
      No public REST/GraphQL endpoint observed during iteration. Both
      `/agent/{id}/{slug}` and `/listing/.../...` paths return the same JSON
      blob inlined in the page, gated by Cloudflare. There is no JSON-only URL
      variant.
verified: true
proxies: true
---
# EdgeProp.my Find Agent Contact Details

## Purpose

Given an EdgeProp.my agent profile URL (`/agent/{id}/{slug}`) or any listing URL (`/listing/sale/{id}/...` or `/listing/rent/{id}/...`), return the listing agent's full display name, full unmasked mobile phone number (E.164 normalized for Malaysia), and email address. Read-only — never submits the Send Enquiry form, never books or contacts the agent.

## When to Use

- Looking up the contact details of a specific listed real-estate agent on EdgeProp Malaysia.
- Building a contact card for any Malaysian property listing (sale or rental) — pulls the agent off the listing without the user needing to know the agent's own URL.
- Bulk enrichment of agents discovered via `/agents` directory pages or via Browserbase Search results pointing at `edgeprop.my/agent/...`.
- Anywhere you'd otherwise scrape the rendered UI and chase the "Show Number" click-to-reveal — the JSON payload embedded in the page exposes the full phone *and* email upfront, so the click is wasted work.

## Workflow

EdgeProp.my is a Next.js application sitting behind Cloudflare's managed-challenge bot protection. The page UI masks the agent's phone as `01X XXX XXXX` and only offers an enquiry-form gateway for email — **but the `<script id="__NEXT_DATA__">` payload that Next.js inlines on every server-rendered page contains the agent's raw, unmasked phone and email in plaintext**. Fetch the page once with a real Chromium that can pass the Cloudflare challenge, parse `__NEXT_DATA__`, done. No clicks, no enquiry form, no waiting on XHR reveals.

Cloudflare blocks plain `curl` / `wget` / non-residential HTTP with a 403 + JS challenge — confirmed during iteration. You **must** use Browserbase remote + `--verified` (residential captcha-solver flag) + `--proxies` (residential proxies) and let the page sit for ~10–15s after first navigation for the CF challenge to clear. After that the page is unchanged from a normal browser session.

1. **Start a stealth Browserbase session** with both `--verified` and `--proxies`:
   ```bash
   sid=$(browse cloud sessions create --keep-alive --proxies --verified \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   ```

2. **Navigate to the target URL** — either an agent profile (`/agent/{id}/{slug}`) or any listing (`/listing/sale/...`, `/listing/rent/...`, `/rental/...`). Wait ~12–15 seconds for Cloudflare's managed challenge to auto-clear. The title flips from `"Just a moment..."` to the real page title once cleared.
   ```bash
   browse open "https://www.edgeprop.my/agent/103203/eleen-ooi" --remote
   browse wait timeout 15000 --remote
   browse get title --remote   # confirm: not "Just a moment..."
   ```

3. **Extract the `__NEXT_DATA__` JSON** from the page — Next.js inlines it as a `<script id="__NEXT_DATA__" type="application/json">…</script>` element. Parse it as JSON.
   ```bash
   browse get html "//script[@id='__NEXT_DATA__']" --remote > nextdata.html
   # The .html field of the returned JSON envelope is the literal stringified JSON payload.
   ```

4. **Read the agent object** — **field names differ between the two page types**:

   **Agent profile page** (`/agent/{id}/{slug}`) — at `props.pageProps.data.agent`:
   | JSON path | Meaning |
   |---|---|
   | `bizname_t` | Display name, e.g. `"Eleen Ooi"` |
   | `contact_s` | Raw phone, no formatting, e.g. `"0122829900"` |
   | `mail_s` | Email, e.g. `"eleenestates@outlook.com"` |
   | `org_name_s` | Agency slug, e.g. `"cbdproperties"` (lowercase, no spaces) |
   | `agent_position_s` | Position/title text, e.g. `"Real Estate..."` |
   | `uid_i` | Numeric agent id matching the URL `{id}` |

   **Listing page** (`/listing/{sale|rent}/{id}/...`) — at `props.pageProps.JSONdata.result.agent`:
   | JSON path | Meaning |
   |---|---|
   | `agent_bizname` | Display name as shown on listing card, e.g. `"DANIEL KHO"` (often UPPERCASE on listings) |
   | `agent_name` | **Legal name** from BOVAEP registry, e.g. `"KHO CHEE YONG"` — frequently different from `agent_bizname`. Report `agent_bizname` as the public-facing answer unless caller specifically wants the legal name. |
   | `agent_ph` | Raw phone, e.g. `"0162690803"` |
   | `email` | Email, e.g. `"danielkho24@gmail.com"` |
   | `agency` (a.k.a. `agent_com`) | Full agency name, e.g. `"IQI REALTY SDN. BHD."` |
   | `agent_id` | BOVAEP/PEA registration, e.g. `"REN 16300"` or `"PEA 3651"` |
   | `uid` | Numeric agent id — use to construct the canonical `/agent/{uid}/{slug}` URL |

5. **Normalize the phone** to E.164. Malaysian mobile numbers start with `01` (e.g. `012…`, `016…`, `017…`, `018…`, `019…`, `011…`, `013…`, `014…`, `015…`). Strip any non-digit characters, drop the leading `0`, prepend `+60`. Examples: `0122829900` → `+60122829900`; `016-269 0803` → `+60162690803`. Keep the original raw string as `phone_raw` so the caller can verify.

6. **Output** the JSON envelope from the Expected Output schema below. If the field genuinely isn't in `__NEXT_DATA__` (rare — observed only when the agent record is suspended/archived), fall back to the Browser fallback below.

### Browser fallback (rare — only when `__NEXT_DATA__` is missing or stripped)

Older PRO-tier accounts or archived listings occasionally render with `__NEXT_DATA__` absent or with the contact fields blanked. In that case revert to the on-page click-to-reveal flow — it's reliable, just slower:

1. On the **agent profile page**, the phone is shown as a button labeled `01X XXX XXXX` (last 4 digits masked) next to a green `WHATSAPP` button. Click the masked-phone button to reveal the full number:
   ```bash
   browse click "//button[.//span[contains(text(),'XXXX')]]" --remote
   browse wait timeout 2000 --remote
   browse get text "//*[contains(text(),'01') and not(contains(text(),'XXXX'))]" --remote
   ```
   The masked-phone button text updates in place from `012 282 XXXX` → `012 282 9900`. The `WHATSAPP` button next to it triggers a `window.open(wa.me/<phone>)` that gets popup-blocked in headless sessions — don't rely on it for extraction.
2. **Email cannot be revealed via UI** — the `SEND ENQUIRY` button opens a contact form that asks for the *visitor's* email + message; the agent's email never appears in the rendered UI. If `mail_s` / `email` is absent from `__NEXT_DATA__` *and* the click-reveal flow is your only path, set `email: null` and `email_form_only: true`.
3. On **listing pages**, the on-card phone affordances (`WHATSAPP`, `MOBILE CALL`) under "OTHER WAYS TO ENQUIRE" do **not** flip the UI to show a number — they each fire a `window.open` that's popup-blocked. From a listing page, the reliable click-reveal path is to navigate to the agent's profile (the contact card has an `/agent/{uid}/{slug}` anchor on the agent's name) and reveal there. Many listing descriptions also contain the agent's phone written into the body text by the agent themselves — that's a noisy source, prefer `__NEXT_DATA__`.

## Site-Specific Gotchas

- **Cloudflare managed challenge is mandatory.** `browse cloud fetch` (no browser) and any plain HTTP client return a 403 with `cf-mitigated: challenge` and the JS-only `"Just a moment..."` interstitial. Only a real Chromium with `--verified --proxies` clears it. First navigation needs **10–15s** of post-load wait — calling `browse get title` immediately will return `"Just a moment..."`.
- **`__NEXT_DATA__` is the goldmine — and the UI lies about what's hidden.** The HTML rendered into the visible DOM masks phones as `01X XXX XXXX` and offers no email at all. The exact same page's `<script id="__NEXT_DATA__">` block contains both fields in plaintext (`contact_s` + `mail_s` on agent pages, `agent_ph` + `email` on listing pages). Do not waste turns clicking reveal buttons unless `__NEXT_DATA__` is unexpectedly absent.
- **Field names differ between agent profile and listing pages.** Agent profile uses Solr-style suffixed keys (`contact_s`, `mail_s`, `bizname_t`, `org_name_s`); listing pages use a `agent` sub-object with descriptive keys (`agent_ph`, `email`, `agent_bizname`, `agency`). Both are documented in step 4 above. Don't assume one schema — check the URL path first.
- **Two name fields on listings: `agent_name` ≠ `agent_bizname`.** `agent_name` is the legal name registered with BOVAEP (Malaysian Board of Valuers, Appraisers, Estate Agents and Property Managers), e.g. `"KHO CHEE YONG"`. `agent_bizname` is the public-facing display name, e.g. `"DANIEL KHO"`. The site UI exclusively shows `agent_bizname` — report that as `name` unless the caller specifically asks for the registered legal name.
- **Listing-page `agent_bizname` is often UPPERCASE** (`"DANIEL KHO"`) while agent-profile `bizname_t` is Title Case (`"Daniel Kho"`). Normalize to Title Case in the output if you care about presentation consistency.
- **License-number format is non-uniform.** `REN 16300` = Registered Estate Negotiator. `PEA 3651` = Probationary Estate Agent. `E (…)` / `VE (…)` exist for fully-registered Estate Agents and Valuers. Surface the raw string; don't try to canonicalize.
- **Phone format quirks.** `contact_s` / `agent_ph` are returned without dashes (`"0162690803"`). Some agent records have the phone *also* embedded in listing-description body text in stylized Unicode (e.g. `𝟎𝟏𝟔𝟐𝟔𝟗𝟎𝟖𝟎𝟑`) — that's noisy, ignore it. Trust `agent_ph` / `contact_s`. Malaysian mobile prefixes observed: `010`-`019`. To E.164, strip leading `0`, prepend `+60`.
- **The "SEND ENQUIRY" button opens a contact form, not a mailto.** The form fields are *the visitor's* full name, email and mobile — the agent's email is never exposed via this UI affordance. Do not submit this form during scraping (it would send a real lead to the agent).
- **`WHATSAPP` buttons rely on `window.open(...)` and get popup-blocked** in headless Browserbase sessions. They never produce an inspectable `wa.me/<phone>` href in the DOM. Don't try to harvest the phone via WhatsApp click.
- **Don't trust `data.org_name_s` as the human-readable agency.** It's a slug (`"iqirealty"`, `"cbdproperties"`). The listing-page `agent.agency` / `agent.agent_com` field is the proper display name (`"IQI REALTY SDN. BHD."`, `"CBD PROPERTIES SDN. BHD."`).
- **Agent profile URLs are case-insensitive in the slug.** `/agent/101419/daniel-kho`, `/agent/101419/DANIEL%20KHO`, and `/agent/101419` all resolve to the same page. The numeric `{uid}` is the only stable identifier.
- **`robots.txt` is generous** — `/agent/...` and `/listing/...` are not in the Disallow list (only `/admin/`, `/search/`, `/user/...` are). `Crawl-delay: 10` is advisory; keep request rate sane.
- **Cookies / sign-in are not required.** All the data above is present in the unauthenticated page payload. Don't burn turns trying to log in.
- **Email is sometimes missing from `__NEXT_DATA__`** when the agent has set their profile to hide email (free-tier accounts more often than PRO-tier). When `mail_s` / `agent.email` is `""` or absent, report `email: null` with `email_form_only: true` — don't fabricate one from the listing description.
- **Iteration cost note**: per-iteration cost is dominated by the Browserbase session minutes (the `--verified` solver adds a few seconds to first-load). Budget ~15–30s per agent if reusing a session, or ~30–45s if creating a fresh session each time. Reuse sessions when bulk-extracting.

## Expected Output

```json
{
  "success": true,
  "name": "Eleen Ooi",
  "name_legal": null,
  "phone": "+60122829900",
  "phone_raw": "0122829900",
  "email": "eleenestates@outlook.com",
  "agency": "CBD PROPERTIES SDN. BHD.",
  "license": "PEA 3651",
  "agent_id": 103203,
  "agent_profile_url": "https://www.edgeprop.my/agent/103203/eleen-ooi",
  "source_url": "https://www.edgeprop.my/agent/103203/eleen-ooi",
  "extraction_method": "next_data",
  "email_form_only": false,
  "error_reasoning": null
}
```

Listing-page example (agent has a different legal vs. business name):

```json
{
  "success": true,
  "name": "Daniel Kho",
  "name_legal": "KHO CHEE YONG",
  "phone": "+60162690803",
  "phone_raw": "0162690803",
  "email": "danielkho24@gmail.com",
  "agency": "IQI REALTY SDN. BHD.",
  "license": "REN 16300",
  "agent_id": 101419,
  "agent_profile_url": "https://www.edgeprop.my/agent/101419/daniel-kho",
  "source_url": "https://www.edgeprop.my/listing/sale/3726402/pandan-ria-apartment-for-sale-by-daniel-kho",
  "extraction_method": "next_data",
  "email_form_only": false,
  "error_reasoning": null
}
```

Email-hidden outcome (free-tier agent or hidden-email setting):

```json
{
  "success": true,
  "name": "<agent display name>",
  "name_legal": null,
  "phone": "+60XXXXXXXXX",
  "phone_raw": "0XXXXXXXXX",
  "email": null,
  "agency": "<agency name>",
  "license": "<REN ####|PEA ####|E (#####)>",
  "agent_id": 999999,
  "agent_profile_url": "https://www.edgeprop.my/agent/999999/<slug>",
  "source_url": "<input url>",
  "extraction_method": "next_data",
  "email_form_only": true,
  "error_reasoning": "Email not present in __NEXT_DATA__ (mail_s empty). Agent's contact form is the only public email path."
}
```

Cloudflare-block / unreachable outcome:

```json
{
  "success": false,
  "name": null,
  "name_legal": null,
  "phone": null,
  "phone_raw": null,
  "email": null,
  "agency": null,
  "license": null,
  "agent_id": null,
  "agent_profile_url": null,
  "source_url": "<input url>",
  "extraction_method": null,
  "email_form_only": false,
  "error_reasoning": "Cloudflare managed challenge did not clear within 30s. Retry with a fresh session using --verified --proxies, or wait and retry from a different residential IP."
}
```
