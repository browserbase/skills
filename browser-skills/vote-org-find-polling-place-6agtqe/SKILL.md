---
name: vote-org-find-polling-place-6agtqe
title: Vote.org Find Polling Place
description: >-
  Given a US street address, route to the assigned polling place + drop-box /
  early-voting alternatives via Vote.org's state-directory page-data.json
  (recommended) or the polling-place-locator HTML directory (fallback).
  Read-only; never registers or starts a check-in flow.
website: vote.org
category: civic
tags:
  - voting
  - elections
  - civic
  - polling-place
  - directory
  - address-lookup
source: 'browserbase: agent-runtime 2026-05-16'
updated: '2026-05-16'
recommended_method: api
alternative_methods:
  - method: browser
    rationale: >-
      Open https://www.vote.org/polling-place-locator/, locate the state's row,
      click through to the official state locator. Produces the same routing as
      the API path but pays Gatsby hydration cost; useful only when an agent
      needs to drive the UI end-to-end.
  - method: url-param
    rationale: >-
      After classifying the state, navigate directly to that state's
      state_url_polling_locator (Class A) and submit the address form. Skips
      Vote.org entirely once the directory has been consulted.
verified: true
proxies: true
---
# Vote.org Find Polling Place

## Purpose

Given a US street address, return the assigned polling place(s) for the next election with name, full address, hours, and any drop-box / early-voting alternatives. Read-only — never submits a registration or starts a check-in flow.

**Critical honesty up front:** `https://www.vote.org/polling-place-locator/` is **not** an interactive address-based lookup tool. It is a directory page that lists each state's *official* polling-place locator URL (the state's Secretary-of-State or county-elections tool). There is no national, address-only Vote.org polling-place endpoint. The address-to-polling-place mapping is owned by each state, and Vote.org's role is to route the voter to the correct state tool.

This skill therefore works in two passes: (1) use Vote.org's machine-readable directory (the Gatsby `page-data.json`) to map the input address's state to its official locator URL and the state's drop-box / early-voting / absentee URLs; (2) follow through to that state tool with the address. Pass 1 alone is sufficient when the caller only needs to know *which state tool to use*; pass 2 is what produces the actual polling place + hours.

## When to Use

- A voter has typed an address into an agent and asks "where do I vote?"
- A scheduling / GOTV agent needs to surface the polling place address + hours for a known voter.
- Any flow that needs to surface drop-box, early-voting, or absentee alternatives next to the polling-place answer — Vote.org's directory bundles all four URLs per state in one fetch.
- Cross-state agents that need a single canonical map of state-by-state locator URLs that Vote.org keeps up to date.

## Workflow

The recommended path is **API-first**: fetch Vote.org's `page-data.json` once to get the canonical state → locator-URL map, then drive the state's official tool. The browser path through `vote.org/polling-place-locator/` is strictly worse — the HTML page is a Gatsby SPA that, after hydration, renders the exact same table that you can get from `page-data.json` in one HTTP round-trip with no JS.

### 1. Fetch the canonical state directory (one HTTP request, no auth, no anti-bot)

```
GET https://www.vote.org/page-data/polling-place-locator/page-data.json
```

The response is `application/json`. Drill into `result.pageContext.states` — an array of 51 entries (50 states + DC). Each entry has these polling-place-relevant fields:

| Field | What it is |
|---|---|
| `name`, `abbr`, `slug` | "Wisconsin", "WI", "wisconsin" |
| `state_url_polling_locator` | **Primary** — the state's official address-based polling-place tool URL |
| `state_url_early_voting_info` | Early-voting info / locator (38/51 states populate this; null for the rest) |
| `state_url_absentee_info` | Absentee/mail-ballot info — also typically lists drop boxes |
| `state_url_ballot_tracker` | Ballot-tracker tool |
| `verify_url` | Registration-verification tool (often the same URL as `state_url_polling_locator`) |
| `early_voting_begins`, `early_voting_ends` | Human-readable HTML text describing the early-voting window |
| `absentee_request_instructions`, `absentee_ballot_instructions`, `absentee_rules`, `absentee_warnings` | HTML blobs with drop-box / mail-ballot specifics |

All fields are HTML-fragment strings — strip tags with a simple regex (`/<[^>]+>/g`) before emitting.

### 2. Parse the state from the input address

Use the standard USPS two-letter state code parsed from the address (`"Madison, WI 53703"` → `"WI"`). Look up the matching `states[i]` by `abbr`. If the address is missing a state component, fail with `reason: "address_missing_state"` and the original address echoed back — don't guess.

### 3. Follow through to the state tool

This is the part Vote.org doesn't standardize — each state's tool has its own form schema, anti-bot posture, and result shape. The state tools cluster into four classes (observed on 2026-05-16 by GET'ing each `state_url_polling_locator`):

**A. Pure-address form (best case).** The form takes `street_address + city + zip` only — no name or DOB. Examples confirmed: **WI** (`myvote.wi.gov` — exposes both an address-only path and a name+DOB path; use the `search-address`/`search-unit`/`search-city`/`search-zip` block), **NC** (`vt.ncsbe.gov/PPLkup/` — fields `StreetAddress`, `City`, `State`, `Zip`). POST the form, parse the rendered result page for the polling-place name, address, and hours.

**B. Voter-file lookup (name + DOB + address required).** The form requires `first_name + last_name + DOB + address` because it matches against the state voter roll, not against a precinct map. Examples: AL (`myinfo.alabamavotes.gov/voterview`), KS (`myvoteinfo.voteks.org/VoterView`), DE (`ivote.de.gov/VoterView`). If the caller only supplied an address, this skill cannot complete via vote.org's directory — emit `reason: "state_requires_pii"` with the state's tool URL so the caller can decide whether to gather more info.

**C. Landing/info page (no form on the URL itself).** A handful of states link to an informational page that lists county-by-county lookups instead of a centralized form: HI (`elections.hawaii.gov/resources/county-election-divisions/` — all-mail election with Voter Service Centers, not traditional polling places), CA (`sos.ca.gov/elections/polling-place/`), MD (`elections.maryland.gov/voting/where.html`). Surface the URL to the caller; don't attempt to scrape — there's no single form.

**D. Vote-by-mail-only state (drop-box locator instead of polling-place locator).** OR is the canonical example: `state_url_polling_locator` for OR is literally `https://sos.oregon.gov/voting/Pages/drop-box-locator.aspx`. There is no "polling place" — return the drop-box locator URL and the per-state `early_voting_begins` text. Same posture for WA and (effectively) HI and CO.

For class A states, the browser path is straightforward — open the URL, fill the address fields, submit, scrape the result. For class B/C/D, the honest output is "here's the state's tool and what it expects" rather than a hallucinated polling place.

### Browser fallback

Use only when an agent has been explicitly asked to drive the UI end-to-end (e.g., for headed user demo). Open `https://www.vote.org/polling-place-locator/`, scroll to the state's row, click the `<state> polling place locator` link, follow through to the state tool. This produces the same routing as the API path but pays a Gatsby-hydration cost (~2s) plus one extra DOM navigation. A residential proxy is not required for the vote.org page itself (it's behind Cloudflare with `Cache-Control: max-age=8640000` — heavily cached, no anti-bot). Verified + proxy *may* be required for individual state tools (AZ returned **HTTP 403** on a direct `browse cloud fetch` of `my.arizona.vote/WhereToVote.aspx?s=address` in iter-1, suggesting per-IP gating).

## Site-Specific Gotchas

- **`/polling-place-locator/` is a directory, not an interactive tool.** The page does not accept an address. Anyone iterating against a "vote.org address-input form" is iterating against a hallucination. The `<form>` on `verify.vote.org` (embedded by `/am-i-registered-to-vote/`) is the registration-status tool, not a polling-place lookup, and it requires `first_name + last_name + date_of_birth_month/day/year + street_address + apartment + city + state_abbr + zip_5 + email + phone_number + agreed_to_terms` — far more PII than a polling-place lookup needs.
- **The canonical machine-readable source is `https://www.vote.org/page-data/polling-place-locator/page-data.json`.** It is a Gatsby build-time artifact, no auth, no rate limit, served via Cloudflare with `Age: ~1.9M seconds` cache headers. Stable enough to cache locally for 24h. If it ever 404s, fall back to scraping the rendered `<table class="states-chart">` on the HTML page — the same per-state `state_url_polling_locator` is rendered as an `<a href="...">` in each row.
- **State tools require radically different PII.** Some take just an address (NC, WI's address path), some require name+DOB+address (AL, KS, DE, KY), some require name+DOB+address+last-4-SSN. The schema is **not** documented on vote.org — you have to fetch each tool's HTML to see the form fields. The class-A vs class-B distinction must be re-validated periodically (states sometimes tighten requirements).
- **`state_url_polling_locator` is sometimes a drop-box locator, not a polling-place locator.** OR is the canonical example. Don't assume the URL leads to a polling-place form — the state's primary voting mode dictates what the URL is. Always surface `state_url_early_voting_info` and `state_url_absentee_info` alongside the polling-place URL for caller transparency.
- **Some state locators are server-side anti-bot gated.** AZ (`my.arizona.vote/WhereToVote.aspx?s=address`) returned HTTP 403 to `browse cloud fetch` in iter-1; the page is reachable in a real browser. If the caller actually needs to drive an AZ lookup, switch to a Verified + residential-proxy Browserbase session for that state's URL.
- **vote.org's HTML page is Gatsby — hydration delay matters for browser path only.** The static HTML returned by GET is the un-hydrated shell; the rendered state-table only appears after `app-*.js` runs. Don't snapshot before `domcontentloaded + ~1s`. The `page-data.json` API has none of this latency.
- **`verify.vote.org` (Rails) and `vote.org/polling-place-locator/` (Gatsby) are different products.** Don't conflate them. The Rails verify tool returns registration status (with polling place if the state populates it in the response), but it's a *full* voter-file query, not an address-only lookup.
- **`vip.vote.org` is a partner admin portal.** Found in the tools.vote.org page link map but requires partner login. Not useful for direct polling-place lookup.
- **Don't waste time looking for a JSON API on `tools.vote.org`.** That subdomain is a Squarespace-hosted marketing site for partner integrations — no functional endpoints. Confirmed iter-1.
- **No live browser session was available from the agent-runtime sandbox during this build** (the sandbox's DNS whitelist allows `api.browserbase.com` but blocks `connect.usw2.browserbase.com`, so the Browserbase WebSocket connect endpoint is unreachable). All evidence here is from `browse cloud fetch` (the Browserbase Fetch API) plus parsing returned HTML/JSON. The skill is fully exercisable with a normal browser; this is a build-environment limitation, not a runtime limitation for end users.

## Expected Output

Five distinct outcome shapes depending on which class of state the address falls into:

```json
// Class A — state has a pure-address polling-place form, polling place returned.
{
  "success": true,
  "input_address": "123 Main St, Madison, WI 53703",
  "state": "WI",
  "polling_places": [
    {
      "name": "Madison Municipal Building",
      "address": "215 Martin Luther King Jr Blvd, Madison, WI 53703",
      "hours": "Election Day: 7:00 AM – 8:00 PM",
      "type": "election_day"
    }
  ],
  "alternatives": {
    "early_voting_url": "https://myvote.wi.gov/en-us/Vote-Absentee-In-Person",
    "absentee_url": "https://myvote.wi.gov/en-us/VoteAbsentee",
    "drop_boxes": []
  },
  "source_tool": "https://myvote.wi.gov/en-us/Find-My-Polling-Place"
}

// Class B — state's tool requires PII beyond an address.
{
  "success": false,
  "reason": "state_requires_pii",
  "state": "AL",
  "state_tool_url": "https://myinfo.alabamavotes.gov/voterview",
  "required_fields": ["first_name", "last_name", "date_of_birth", "address"],
  "alternatives": {
    "early_voting_text": "Alabama does not have early voting.",
    "absentee_url": "https://www.sos.alabama.gov/alabama-votes/voter/absentee-voting"
  }
}

// Class C — state links to an info page, no centralized form.
{
  "success": false,
  "reason": "no_centralized_form",
  "state": "CA",
  "state_tool_url": "https://www.sos.ca.gov/elections/polling-place/",
  "note": "California routes voters to county-specific tools. Follow the link and locate the county's lookup."
}

// Class D — vote-by-mail-only state, drop-box returned instead of polling place.
{
  "success": true,
  "input_address": "456 SW Pine, Portland, OR 97204",
  "state": "OR",
  "polling_places": [],
  "alternatives": {
    "drop_box_locator_url": "https://sos.oregon.gov/voting/Pages/drop-box-locator.aspx",
    "absentee_url": "https://sos.oregon.gov/voting/Pages/voteinor.aspx",
    "voting_mode": "all_mail_ballot"
  },
  "note": "Oregon is a vote-by-mail state — no traditional polling places. Return the drop-box locator URL."
}

// Address missing state component.
{
  "success": false,
  "reason": "address_missing_state",
  "input_address": "123 Main St"
}
```

The per-state directory map (drives every branch above) is a stable 51-element array under `result.pageContext.states[]` at the `page-data.json` URL. Cache it for up to 24h; refresh on cache-miss or on a different election cycle.
