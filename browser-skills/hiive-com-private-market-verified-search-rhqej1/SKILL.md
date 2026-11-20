---
name: hiive-com-private-market-verified-search-rhqej1
title: Hiive Private-Market Verified Search & Diligence
description: >-
  Compliance-first, read-only diligence on hiive.com: enumerate credible
  exposure paths for a private-market target (direct Hiive Markets brokerage and
  Hiive {Issuer} SPVs), cross-verify against FINRA BrokerCheck, SEC EDGAR Form
  D, SEC IAPD, SIPC, and state/provincial regulators, score on a 100-point
  rubric, tier 1-3 or Avoid, emit ranked candidate table plus before-wiring
  checklist. Never advises, contacts, submits forms, bids, lists, wires,
  bypasses access controls, or calls any option safe.
website: hiive.com
category: finance
tags:
  - private-markets
  - secondaries
  - diligence
  - compliance
  - broker-dealer
  - read-only
  - regulated
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      All Hiive marketing surfaces are deterministic URLs (`/securities`,
      `/securities/{slug}-stock`, `/disclosures`, `/form-crs`, `/hiive-funds`,
      `/reg-bi`, `/relationship-disclosure`). Public Hiive data is pullable over
      HTTP with no auth or stealth — no browser scripting required for the Hiive
      side.
  - method: api
    rationale: >-
      Primary regulator data is pullable via stable HTTP endpoints: FINRA
      BrokerCheck firm summary HTML + PDF + CRS PDF, EDGAR
      `cgi-bin/browse-edgar` + EDGAR full-text
      `efts.sec.gov/LATEST/search-index`. IAPD is an Angular SPA — its
      underlying `/api/Search/firm?query=` JSON endpoint is the reliable path;
      the rendered HTML is not.
  - method: browser
    rationale: >-
      Only required for the IAPD investment-adviser search (SPA-rendered) — open
      in a remote session, wait, snapshot. All other steps run on `browse cloud
      fetch --proxies` or direct HTTPS. Do NOT browse `app.hiive.com` —
      accreditation-gated; out of scope.
verified: true
proxies: true
---
# Hiive Private-Market Verified Search & Diligence

## Purpose

Given a target (a private/pre-IPO company name, a specific Hiive-affiliated SPV/fund, or a free-text "exposure to X" brief), produce a **read-only, compliance-first diligence package**: enumerate every credible *candidate* exposure path available on or through `hiive.com`, cross-verify each against official primary regulators (FINRA BrokerCheck, SEC EDGAR Form D, SEC IAPD/Form ADV, SIPC, state securities regulators), capture entity / docs / fee / custody facts with URLs and access dates, score on a fixed 100-point rubric, assign a 3-tier rating (or Avoid), and emit a ranked candidate table plus a before-wiring checklist. Read-only. Never contacts, advises, signs up, submits forms, places bids, lists shares, wires funds, accepts any document at face value, or bypasses access controls.

## When to Use

- Investor / family-office / RIA wants a verified shortlist of ways to get secondary exposure to a specific pre-IPO name (e.g. "Anthropic", "SpaceX", "xAI") via Hiive — direct purchase through Hiive Markets vs. one of the Hiive `{Company}` series SPVs vs. neither.
- Compliance / counsel pre-screen of a counterparty before the user signs an NDA, master subscription, or transfers funds.
- An LP or fiduciary needs a regulator-anchored snapshot of Hiive Markets Limited itself (CRD #316580, SEC #8-70806) — registration status, disclosures, principals, jurisdictions, custody/escrow disclosures, related funds — refreshed with today's date.
- Triage of an inbound "Hiive opportunity" pitch: confirm the offering and the entity offering it are the ones actually registered, and that all required disclosure documents are accounted for or explicitly flagged missing.

This skill never replaces legal or tax counsel. Its output is evidence + scoring to **prepare** a counsel review, not substitute for one.

## Workflow

The optimal path is **hybrid**: pull all available *public* Hiive surfaces over HTTP (no login required), in parallel cross-reference primary regulators (FINRA BrokerCheck, SEC EDGAR, IAPD). The `app.hiive.com` order book / bids / sub-docs / LPA are gated behind accredited-investor onboarding — **do not attempt to bypass them**; flag them as `docs_missing` and let counsel pull them through a properly-onboarded account. The marketing site at `www.hiive.com` is fully crawlable without auth and provides everything you need for tier-1 verification.

### 1. Parse the request → derive the candidate universe

Map the user's `[TARGET]` to one of three shapes and assemble a candidate list. Always include "Hiive Markets Limited (direct)" as a candidate when the target is a company name that has a `/securities/{slug}-stock` page; SPVs are *additional* candidates only.

| If `[TARGET]` is… | Candidate set |
|---|---|
| A company name (e.g., "Anthropic") | (a) Direct shares through Hiive Markets Limited; (b) every `Hiive {Company} Series N` SPV filed on EDGAR; (c) any non-Hiive SPV the user mentions for comparison |
| A specific SPV/fund (e.g., "Hiive Anthropic Series VII") | That SPV plus any other Hiive series for the same underlying company (sibling series often share OM/PPM templates) |
| Free-text exposure brief | Enumerate Hiive's listed `/securities/{slug}-stock` matches + every Hiive SPV with the same underlying issuer on EDGAR |

Constraint: **never** call any candidate "safe", "recommended", "endorsed", or "guaranteed". Output language is "verifies", "discloses", "filed", "missing".

### 2. Pull Hiive public-marketing surfaces (no auth)

`browse cloud fetch` works with `--proxies` on every page below; no `--verified` stealth needed because `hiive.com` is Cloudflare-fronted but not aggressively bot-walled on the marketing tree.

Endpoints worth pulling for any candidate:

- `https://www.hiive.com/` — homepage; confirms current registration footer text + BrokerCheck link.
- `https://www.hiive.com/disclosures` — long-form: "Risks of Unregistered Securities", "Limits of Hiive's Services" (Hiive does **not** provide investment, legal, tax, or accounting advice), "Transactions on the Hiive Platform" (all listings/bids are *non-binding* indications of interest; the platform does NOT auto-match orders), "Hiive Agreements" (share transfer + escrow agreements are required separately).
- `https://www.hiive.com/form-crs` — Form CRS landing page. The canonical PDF lives on FINRA: `https://files.brokercheck.finra.org/crs_316580.pdf`. Pull both.
- `https://www.hiive.com/reg-bi` — Regulation Best Interest disclosure.
- `https://www.hiive.com/relationship-disclosure` — Canadian EMD disclosure.
- `https://www.hiive.com/exhibit_a_hiive_markets_limited_business_continuity_planning.pdf` — BCP.
- `https://www.hiive.com/hiive-funds` — fund product page. Discloses: "No management fees or carried interest. Transaction and administrative fees only", "audited annually", "SOC-2 compliant systems", "advised by an investment advisor". Note: the named investment advisor is **not Hiive Markets** itself (Hiive Markets is B-D only) — record this gap and resolve via EDGAR (see step 3.c).
- `https://www.hiive.com/funds-investors` and `https://www.hiive.com/seller` and `https://www.hiive.com/issuer` — investor/seller/issuer micro-sites.
- `https://www.hiive.com/securities` — paginated index, `/securities/page/1` … `/securities/page/212` (≈3,000+ pre-IPO companies as of 2026-05). Each entry links to `/securities/{slug}-stock`.
- `https://www.hiive.com/securities/{slug}-stock` — per-company page. **Public data**: Hiive Price (PPS), all-time return %, count of live orders, last round details (date, round name, capital raised, industry tags), text description, FAQs. **Gated**: highest bid, lowest ask, last transaction, market activity widget, advanced charting.
- `https://www.hiive.com/hiive50` — equal-weight index of the 50 most liquid securities (per Hiive's own definition).
- `https://www.hiive.com/disclosures/hiive50-disclaimers` — index methodology caveats.

Persist for each candidate: `domain`, `hiive_security_url`, `hiive_price_pps`, `hiive_all_time_return`, `live_orders_count`, `last_round_date`, `last_round_name`, `last_round_capital`, `description`, `access_date_utc`.

### 3. Cross-verify against primary regulators

Run all of these in parallel — they are independent.

**3.a — FINRA BrokerCheck (the broker-dealer):**

- Firm summary HTML: `https://brokercheck.finra.org/firm/summary/316580`
- Firm detailed PDF: `https://files.brokercheck.finra.org/firm/firm_316580.pdf`
- Firm CRS PDF: `https://files.brokercheck.finra.org/crs_316580.pdf`
- Each principal — fetch `https://brokercheck.finra.org/individual/summary/{CRD}` for each direct owner / executive officer listed on the firm summary (e.g. CEO 5578426, FINOP 7737862, CCO 4225106 as of 2026-05-20; re-read on each run because the list mutates).

Confirm and record: `crd_number`, `sec_number`, `firm_legal_name`, `firm_type` ("Corporation"), `sro` ("FINRA"), `sec_registration_status`, `sec_registration_date`, `disclosure_count` (current public count), `licensed_jurisdictions` (count + list), `main_address`, `phone`, `direct_owners` (each with name + CRD + role), `bc_url`, `access_date_utc`.

> **Red flag if**: any disclosure count > 0 (read the detailed report for nature, severity, currency, resolution); firm shows as **PR** (Previously Registered); any principal has open disclosures; the firm's licensed jurisdiction set excludes the user's stated jurisdiction.

**3.b — SEC EDGAR (the SPVs / Form D filings):**

- Company search: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=hiive&type=D&dateb=&owner=include&count=40` — current count is ~39 Hiive-named filers covering Anthropic, Apptronik, Cerebras, Chime, Coreweave, Firefly, Glean, Groq, Lightmatter, Liquid Death, Perplexity, PsiQuantum, SambaNova, SandboxAQ, ScaleAI, SpaceX, Varda, xAI (re-pull each run; new series filings appear). The naming convention is `Hiive {Issuer} Series {Roman or arabic} a Series of Hiive {Issuer} LLC` (Delaware), with two exceptions in NY: `Hiive Series I, a Series of Hiive Access, LLC` and `Hiive SpaceX Opp Fund, LLC`.
- Per-CIK filings index: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=000{CIK}&type=D&dateb=&owner=include&count=40` — confirm Form D filing date and accession number.
- Per-filing primary doc: `https://www.sec.gov/Archives/edgar/data/{CIK_no_leading_zeros}/000{CIK}{YY}000001/0002{CIK_short}-{YY}-000001-index.htm` (the format is rendered in the index HTML — extract the link, don't hand-construct).
- For full-text searches use the search-index endpoint: `https://efts.sec.gov/LATEST/search-index?q=%22Hiive%22&forms=D` (or `forms=ADV`).

Record per SPV candidate: `legal_entity`, `cik`, `state_of_inc`, `business_address`, `mailing_address`, `latest_form_d_date`, `latest_form_d_accession`, `file_number`, `formd_url`, `access_date_utc`.

> **Notes / cautions**:
> - The mailing address on most Delaware series is a corporate-services agent (e.g., `2093 Philadelphia Pike, Claymont DE 19703`). Treat as a registered-agent address, not an operational HQ.
> - Form D is a **notice of exempt offering** — it confirms an offering was made and discloses ranges (offering size, sales, minimums, related persons). It does **not** substitute for the offering memorandum / PPM / subscription docs / LLC operating agreement, none of which are public. Always mark the OM, sub-docs, and operating agreement as `docs_missing` until counsel pulls them through a verified user account.
> - Each series is a **discrete legal entity** (a series LLC under the parent `Hiive {Issuer} LLC`). The Form D filed by Series VII applies only to Series VII — do not transitively apply the disclosures of Series I to a later series.

**3.c — SEC IAPD / Form ADV (the investment adviser to the funds):**

Hiive Markets Limited is a broker-dealer **only**, not an SEC-registered investment adviser. Form ADV full-text search for "Hiive" via `https://efts.sec.gov/LATEST/search-index?q=%22Hiive%22&forms=ADV` returns **zero hits** as of 2026-05-20. The Hiive Funds marketing page asserts "advised by an investment advisor" but does not name that adviser on the public site. **Document this as a finding**, and treat the named-but-unidentified adviser as a `docs_missing` item until counsel resolves it through the subscription documents.

If the user can name the adviser (e.g., from a PPM cover page), then re-run a targeted IAPD search at `https://adviserinfo.sec.gov/firm/summary/{CRD}` (the SPA loads `/api/Search/firm?query={name}` under the hood — but the IAPD search page itself is JS-rendered, so prefer fetching the firm summary URL directly once you have the CRD).

**3.d — SIPC:**

The Hiive Markets footer asserts SIPC membership, and BrokerCheck corroborates B-D status, but **SIPC coverage does not protect against losses on private/unregistered securities themselves** — only against the broker's failure as a custodian of fully-paid customer securities. Record `sipc_member: true` (per public footer) and link `https://www.sipc.org/`, but **always** include in the risk-flag column: "SIPC does not insure against decline in value of private securities or counterparty default in a secondary transfer."

**3.e — State securities regulators / Canadian provinces:**

US: Hiive Markets Limited is licensed in 53 US states and territories as of 2026-05-20 (verify against BrokerCheck `Licenses` block — re-pull each run). If the user's jurisdiction is missing from the list, flag it.

Canada: registered as Exempt Market Dealer (EMD) in Ontario, BC, Alberta, Saskatchewan, Manitoba, Nova Scotia (per footer + `/relationship-disclosure`). Other provinces/territories are explicitly **not** served; flag if the user is in Quebec, New Brunswick, PEI, Newfoundland, Yukon, NWT, or Nunavut. The CSA National Registration Search (`https://info.securities-administrators.ca/nrsmobile/nrssearch.aspx`) is the authoritative Canadian source.

**3.f — Litigation & adverse media (lightweight pass, optional):**

Use `browse cloud search` queries scoped to the candidate legal entity name + ("complaint" OR "settlement" OR "enforcement" OR "FINRA action" OR "cease and desist" OR "lawsuit"). Treat all returned articles as **leads**, not as verified facts; counsel must confirm against PACER, court dockets, FINRA arbitration awards, or SEC litigation releases. If nothing material surfaces, record `adverse_media: none_observed` (never `none_exists`).

### 4. Score & tier each candidate

Scoring rubric (max 100):

| Component | Max | What earns full credit |
|---|---|---|
| Regulatory verification | 25 | Active FINRA + SEC registration confirmed today, all stated jurisdictions match user's, zero open disclosures on firm and named principals, BrokerCheck PDF + CRS PDF both pulled and dated |
| Docs / structure transparency | 20 | PPM/OM, sub-docs, LLC/LPA, Form D, fee schedule, conflicts of interest disclosure, allocation methodology all pulled or explicitly enumerated; gaps named, not glossed |
| Custody / admin | 15 | Independent escrow agent + qualified custodian + named fund administrator + named auditor all disclosed in primary docs (not just the marketing page) |
| Track record | 15 | ≥ 2 years of audited financials, multi-vintage funds closed, named principals with ≥ 5 years registered B-D / IA history and no disclosure events |
| Fee fairness | 10 | All-in cost (transaction + admin + carry + management + transfer + legal pass-through) ≤ user's `[LIMIT]`; fee schedule itemized in the sub-docs, not just "approximately X%" on marketing |
| Exit / transfer | 10 | Stated lock-up, ROFR/issuer-consent mechanics, secondary-of-secondary policy, expected liquidity window, K-1 / 1099-DIV / T-slip timing all in writing |
| Risk flags (deductive) | 5 | Start at 5; subtract for: pressure tactics, refused docs, share-class ambiguity, hidden costs, no independent admin, personal-bank wire instructions, guaranteed-return language, material legal/regulatory history, principals lacking BrokerCheck records |

Tier assignment:

- **Tier 1 — institution-grade / verifiable**: ≥ 80, no Avoid criteria triggered.
- **Tier 2 — credible but needs legal/tax review or has a limited record**: 55–79.
- **Tier 3 — incomplete or weak process**: 30–54.
- **Avoid**: < 30, OR any of: unregistered/unverified entity, principals with open material disclosures, refused-document patterns, brokerage activity outside registered jurisdictions, personal-bank wire instructions, guaranteed-return language, evidence of unclear share ownership / undisclosed mark-up.

Tier 1 still requires counsel review before wiring. Never describe Tier 1 as "safe".

### 5. Output ranked table + before-wiring checklist

Emit the table sorted by `score` descending, then `tier` ascending. End with the standard before-wiring checklist (see Expected Output). Cite the official source URL and access timestamp for every numeric or registration claim; mark every gap explicitly as `docs_missing`.

### 6. Read-only & safety guardrails (mandatory)

Across every iteration, the agent **must not**:

- Click `Sign up`, `Sign in`, `Get started`, `Buy Shares`, `Sell Shares`, `Bid`, `List`, `Place an offer`, `Request demo`, or any `app.hiive.com/signup`/`/login` CTA.
- Submit any form (contact, demo request, newsletter, KYC, accreditation).
- Provide accreditation attestations, SSN/SIN/EIN, banking, or any PII to either the Hiive marketing site or `app.hiive.com`.
- Attempt to register or authenticate to `app.hiive.com` to read bids/asks/transactions.
- Initiate wire instructions, ACH, or any payment.
- Translate any Hiive marketing language ("market price", "Hiive50") as a recommendation or a fair-market value. Hiive itself disclaims this in `/disclosures` — "Hiive does not advise on or evaluate the merits of a particular transaction".
- Describe any candidate as "safe", "endorsed", "recommended by Hiive", "approved by FINRA", or "SIPC-insured against loss".
- Skip the before-wiring checklist in the final output even if every candidate scores Tier 1.

## Site-Specific Gotchas

- **Hiive is broker-dealer-only at the parent level; the funds' adviser is unnamed on the public site.** `Hiive Markets Limited` is FINRA-registered B-D (CRD #316580). EDGAR ADV full-text search for "Hiive" returns zero hits — so the "investment advisor" that the `/hiive-funds` page references is not a Hiive-branded RIA. Treat the adviser's identity as `docs_missing` until you see it on the SPV's sub-docs cover page; then re-verify at IAPD.
- **All listings/bids on Hiive are *non-binding indications of interest* — the platform does NOT auto-match.** Per `/disclosures`: a transaction only happens when a counterparty responds *and* both sides execute additional share-transfer + escrow agreements. So even a "matched" bid is no commitment; never tell a user a price is "available" without that explicit caveat.
- **`/securities/{slug}-stock` shows a *Hiive Price* — this is not the market price, the fair-market value, or a binding offer.** Hiive describes it as a weighted average of matches/bids/listings with multiple exclusion rules; sample sizes may be tiny; transaction-type/share-type self-reported. The bid/ask/last-transaction fields on the public page are **redacted** behind a sign-up paywall (shown as `$-.--`). Do not impute the last-traded price from any visible value on the page.
- **Form D is necessary but not sufficient.** A filed Form D confirms an exempt offering exists; it does not contain the PPM, the LLC operating agreement, the fee schedule, the K-1 expectations, or the audit-relationship details. Always mark PPM/OM, sub-docs, operating agreement/LPA, fee schedule, conflicts disclosure, allocation methodology, and escrow/custody process as `docs_missing` until pulled through an account.
- **Each Hiive `{Issuer} Series N` is a discrete Delaware series LLC with its own CIK.** Do not collapse multiple series for the same underlying issuer into a single row in the ranked table — they have different offering economics, different filing dates, and potentially different reference price marks. Each is a separate candidate.
- **The mailing address on most Hiive series LLCs is a Delaware registered-agent address (`2093 Philadelphia Pike, Claymont DE 19703`).** This is normal for Delaware corporate filings and is not by itself a red flag, but is also not "where the fund operates from". The operational HQ for the broker-dealer is `700 - 980 Howe St, Vancouver BC V6Z 0C8`.
- **SIPC ≠ loss insurance.** Hiive Markets is a SIPC member, but SIPC protects against the broker's failure as a custodian of fully-paid securities — it does NOT insure against the decline in value of any unregistered security or the failure of an issuer/SPV to deliver. Always state this caveat explicitly when listing SIPC membership.
- **Canadian coverage is limited to six provinces.** Ontario, BC, Alberta, Saskatchewan, Manitoba, Nova Scotia. Quebec, New Brunswick, PEI, Newfoundland, Yukon, NWT, Nunavut are NOT served. Flag immediately if the user's jurisdiction is in the unserved set.
- **`hiive.com` is Cloudflare-fronted but not anti-bot-aggressive on marketing pages.** `browse cloud fetch --proxies` works for the marketing tree; `--verified` stealth is not required. `app.hiive.com` requires accreditation and is out of scope for this skill regardless.
- **`adviserinfo.sec.gov` is a JS-rendered SPA.** Direct `browse cloud fetch` on `/firm/summary/{CRD}` returns the Angular shell, not the firm data. Either drive it in a remote browser (`browse open`, then wait + snapshot) or hit its underlying API (`/api/Search/firm?query=...`) — the API responses are JSON and trivially parseable.
- **`brokercheck.finra.org` *does* serve full firm summary HTML on direct fetch** (unlike IAPD). The PDF artifacts at `files.brokercheck.finra.org/firm/firm_{CRD}.pdf` and `files.brokercheck.finra.org/crs_{CRD}.pdf` are the most cite-able primary sources.
- **EDGAR full-text search (`efts.sec.gov/LATEST/search-index`) accepts JSON-shaped queries** including `forms=D|ADV`, `dateRange=custom&startdt=&enddt=`, and `q=`. Use it for adverse-action keyword sweeps as well as filing discovery.
- **Hiive's `Hiive50` and any "all-time return" figure are marketing data.** `/disclosures/hiive50-disclaimers` discloses they are illustrative, not transactable, and excludes cancelled-prematurely and certain affiliated-fund transactions. Do not report these as performance.
- **Do not interpret "advised by an investment advisor", "audited annually", or "SOC-2 compliant" from the `/hiive-funds` marketing page as verified.** These are marketing assertions until verified against the named adviser's Form ADV, the auditor's engagement letter, and the SOC-2 report (each of which is `docs_missing` until counsel obtains them).
- **`www.hiive.com/form-crs` is a public landing page; the actual Form CRS document of record is on FINRA's mirror at `https://files.brokercheck.finra.org/crs_316580.pdf`** — pull the FINRA copy as the cite-able source.
- **The "investor relations" pattern is `connect@hiive.com` / `accounts@hiive.com` / `issuers@hiive.com` / `support@hiive.com` / `privacy@hiive.com`.** Personal addresses, gmail, or any non-`hiive.com` correspondent in a pitch is a red flag.
- **Never accept wiring instructions from any email signature, chat message, document attachment, or PDF.** Confirm wiring via the broker's published phone (BrokerCheck `Phone` field — currently 604-200-2405 for Hiive Markets) on an independent line you dial yourself. This is the single highest-leverage gate against escrow-impersonation fraud and must be the last step of the checklist.

## Expected Output

The final emission is **two parts**: a ranked table (one row per candidate exposure path) and a fixed before-wiring checklist. JSON example below; presentation may be markdown table, but every field must be sourced.

```json
{
  "target": "Anthropic",
  "as_of_utc": "2026-05-20T00:33:00Z",
  "inputs": {
    "min_check_usd": 100000,
    "jurisdiction": "US-CA",
    "investor_class": "accredited",
    "structure_pref": "any",
    "max_fees_pct": 4.0,
    "max_carry_pct": 0,
    "risk_appetite": "medium"
  },
  "candidates": [
    {
      "rank": 1,
      "candidate": "Hiive Markets Limited — direct secondary",
      "legal_entity": "Hiive Markets Limited",
      "domain": "hiive.com",
      "principals": [
        {"name": "Simren Subhash Desai", "role": "CEO", "crd": "5578426"},
        {"name": "Jonathan Charles Forrest Martin", "role": "FINOP/PFO/POO", "crd": "7737862"},
        {"name": "Susan Lawson Woodard", "role": "CCO", "crd": "4225106"}
      ],
      "type": "broker-dealer",
      "target_security": "Anthropic common/preferred (share class TBD on sub-docs)",
      "exposure": "direct",
      "minimum_usd": "docs_missing",
      "fees": "Marketing: 'fixed and competitive' — fee schedule docs_missing until sub-docs",
      "carry_pct": 0,
      "transfer_rights": {
        "rofr": "issuer_dependent",
        "lockups": "issuer_dependent",
        "issuer_consent": "typically_required"
      },
      "exit": "Hiive secondary, future primary round, IPO, or M&A — no guaranteed liquidity",
      "custody_admin": "Hiive marketing references escrow + share-transfer agreements per transaction; named escrow agent docs_missing",
      "counsel_auditor": "docs_missing",
      "docs_found": [
        "https://brokercheck.finra.org/firm/summary/316580",
        "https://files.brokercheck.finra.org/firm/firm_316580.pdf",
        "https://files.brokercheck.finra.org/crs_316580.pdf",
        "https://www.hiive.com/disclosures",
        "https://www.hiive.com/reg-bi",
        "https://www.hiive.com/relationship-disclosure"
      ],
      "docs_missing": [
        "transaction-level escrow agreement (named agent + flow)",
        "share-class-specific transfer restrictions for Anthropic stock",
        "executed share-transfer agreement template",
        "K-1/1099 expectations for the chosen structure",
        "issuer ROFR mechanics for Anthropic"
      ],
      "regulatory_verification": {
        "finra_crd": "316580",
        "sec_number": "8-70806",
        "sec_registration_status": "Approved 2022-04-22",
        "open_disclosures": 0,
        "us_state_count": 53,
        "ca_emd_provinces": ["ON","BC","AB","SK","MB","NS"],
        "sipc_member": true,
        "iapd_adv": "not_registered_as_IA",
        "access_date_utc": "2026-05-20T00:31:00Z"
      },
      "risks": [
        "Unregistered private security — illiquid, no guarantee of future liquidity event",
        "SIPC membership does NOT insure value or counterparty default",
        "Hiive does not provide investment, legal, or tax advice"
      ],
      "score": 78,
      "tier": 2,
      "next_questions": [
        "Confirm Anthropic-specific transfer restrictions and ROFR with Anthropic legal",
        "Pull the executed share-transfer + escrow agreement templates from Hiive",
        "Confirm K-1 / 1099-DIV / T-slip workflow for the chosen structure",
        "Confirm fee schedule in writing (USD, % of trade value, minimum)"
      ]
    },
    {
      "rank": 2,
      "candidate": "Hiive Anthropic Series VII (Delaware series LLC)",
      "legal_entity": "Hiive Anthropic Series VII a Series of Hiive Anthropic LLC",
      "domain": "hiive.com",
      "type": "SPV (series LLC)",
      "target_security": "Anthropic common/preferred via SPV interest",
      "exposure": "SPV",
      "cik": "0002065512",
      "latest_form_d_date": "2025-04-25",
      "latest_form_d_accession": "0002065512-25-000001",
      "formd_url": "https://www.sec.gov/Archives/edgar/data/2065512/000206551225000001/0002065512-25-000001-index.htm",
      "state_of_inc": "DE",
      "registered_agent_address": "2093 Philadelphia Pike, 5885, Claymont DE 19703",
      "fees": "Marketing: 'No management fees or carried interest. Transaction and administrative fees only.' — quantitative schedule docs_missing",
      "custody_admin": "Marketing references annual audit + SOC-2 + named investment advisor — adviser identity docs_missing (no Hiive entry in EDGAR ADV search)",
      "docs_found": [
        "Form D — see formd_url",
        "https://www.hiive.com/hiive-funds"
      ],
      "docs_missing": [
        "PPM / Offering Memorandum",
        "Subscription Agreement",
        "LLC Operating Agreement (series-level + master)",
        "Fee schedule (itemized, dollar + bps)",
        "Investment Adviser identity + ADV link",
        "Auditor identity + engagement letter",
        "SOC-2 report",
        "Allocation methodology / pro-rata mechanics for over-subscription",
        "Conflicts-of-interest disclosure",
        "K-1 timing and tax expectations"
      ],
      "regulatory_verification": {
        "edgar_cik": "0002065512",
        "form_d_filed": true,
        "form_d_date": "2025-04-25",
        "iapd_adv_for_named_adviser": "unknown_until_adviser_named",
        "access_date_utc": "2026-05-20T00:32:33Z"
      },
      "risks": [
        "Each series is a discrete legal entity — sibling series' terms do not transitively apply",
        "Mailing address is a Delaware registered-agent (Claymont, DE) — operational HQ is Vancouver BC",
        "Named adviser/auditor not on public marketing site"
      ],
      "score": 62,
      "tier": 2,
      "next_questions": [
        "Identify and IAPD-verify the named investment advisor",
        "Pull the PPM, sub-docs, and operating agreement for Series VII specifically",
        "Confirm itemized fee table (transaction fee, admin fee, transfer fee, legal pass-through)",
        "Confirm the issuer (Anthropic) has consented to the transfer underlying Series VII"
      ]
    }
  ],
  "before_wiring_checklist": [
    "Counsel has reviewed the PPM/OM, sub-docs, and operating agreement (or executed share-transfer + escrow agreements for direct).",
    "Tax counsel or CPA has confirmed K-1 / 1099-DIV / 1042-S / T-slip / cross-border implications for your structure.",
    "BrokerCheck (firm + each named principal) and SEC IAPD (if any IA is involved) re-pulled within the last 48 hours; zero new disclosures.",
    "Registration in the buyer's jurisdiction is current (US state or Canadian province per CSA NRS).",
    "Wiring instructions confirmed by independently-dialed phone call to the broker-dealer's BrokerCheck-listed number (currently 604-200-2405 for Hiive Markets Limited) — not via email, chat, document, or pasted link.",
    "Issuer ROFR / transfer-approval mechanics are confirmed in writing with the underlying issuer or its counsel.",
    "Total exposure (direct + SPV + any synthetic) reconciled against your concentration limits.",
    "All-in fees (transaction + admin + legal pass-through + carry + management) quantified in dollars and within your stated max.",
    "K-1 / tax-reporting timing (issuance month, state nexus, UBTI/UBIT for tax-exempt LPs, withholding for non-US LPs) acknowledged in writing.",
    "Liquidity / exit expectations acknowledged in writing — no expectation of secondary-of-secondary, no expectation of IPO, no guaranteed redemption."
  ],
  "global_caveats": [
    "No candidate is 'safe'. This output is evidence + scoring to inform a counsel review, not a substitute.",
    "Hiive does not provide investment, legal, tax, or accounting advice (per hiive.com/disclosures).",
    "Hiive's 'Hiive Price', Hiive50 index, and any all-time return figures are illustrative — not transactable, not FMV, not performance.",
    "SIPC membership of the broker-dealer does not insure against decline in value of unregistered securities or counterparty default.",
    "All bids and listings on Hiive are non-binding indications of interest; the platform does not auto-match.",
    "Form D filings confirm an exempt offering exists but do NOT contain PPM / sub-docs / operating agreement / fee schedule — those remain `docs_missing` until pulled through a verified account by counsel."
  ]
}
```

Two distinct outcome shapes worth noting:

```json
// Tier-1 candidate (institution-grade verifiable; still needs counsel)
{ "rank": 1, "tier": 1, "score": 88, "risks": [...], "docs_missing": [], ... }

// "Avoid" candidate (any material red-flag triggered)
{ "rank": 99, "tier": "Avoid", "score": 21,
  "risks": [
    "Personal-bank wiring instructions in pitch email",
    "Refused to share LLC operating agreement",
    "Principal not found on BrokerCheck"
  ],
  "docs_missing": [...], ... }
```

Assumption flagged (since `[TARGET]` is a template variable in the request and no concrete target was named at runtime): this skill is intended to be invoked with a concrete `[TARGET]` value (company name, SPV, or exposure brief) plus the bracketed input parameters; the workflow above is the same regardless of which target is supplied. When invoked without a target, the agent's first action is to inform the caller that a target is required, then halt — it must not invent one.
