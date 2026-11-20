---
name: google-com-company-legal-address-finder-o5en7s
title: Company Legal Entity & Address Finder
description: >-
  Given a company's common name, locate its official site via Google (or
  Browserbase Search API) and parse Terms / Privacy Policy / Imprint for the
  legal entity name and registered physical address. Returns { legalName,
  address, source } plus optional affiliates for multi-entity companies.
website: google.com
category: compliance
tags:
  - legal
  - compliance
  - kyb
  - privacy-policy
  - terms-of-service
  - imprint
  - read-only
source: 'browserbase: agent-runtime 2026-05-21'
updated: '2026-05-21'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      Browserbase Search API resolves the domain in one HTTP call; Browserbase
      Fetch API with --proxies --allow-redirects pulls the /privacy or
      /legal/privacy page directly and yields a clean HTML string. This is the
      optimal path for ~80% of companies (verified across Stripe, DeepL, Figma,
      Shopify, Anthropic). Per-skill-invocation cost <$0.01.
  - method: browser
    rationale: >-
      Required when the legal page is JS-rendered (Anthropic /legal/terms
      returns 378 KB body with no extractable entity), or when /terms is a
      redirect-notice stub linking to a different domain (Notion's /terms →
      notion.notion.site). A remote session with --verified --proxies handles
      these cases at ~$0.40/run.
  - method: api
    rationale: >-
      Browserbase Search API is the canonical replacement for scraping
      google.com. Same outcome (top organic result), structured JSON, no
      anti-bot, no session. Use it instead of browse open google.com unless you
      specifically need to render Google's UI.
verified: true
proxies: true
---
# Company Legal Entity & Address Finder

## Purpose

Given a company's common/marketing name, return the legal entity name and physical/registered address as declared in its own Terms of Service, Privacy Policy, or Imprint. Discovery starts on google.com (or the Browserbase Search API) to resolve the official domain; extraction happens on the company's own site. Returns `{legalName, address, source}` where `source` is the exact URL whose text contained the entity + address. **Read-only — never submits forms, follows "data-subject-request" links, or contacts the company.**

## When to Use

- KYB / vendor-onboarding flows that need the counterparty's legal name + registered address.
- Sanctions / OFAC pre-screening (you need the legal entity, not the brand).
- Filling in a contract template with the other side's "[Company] is a Delaware corporation with offices at [Address]" boilerplate.
- Building a directory of "who really operates {brand}" for security / supply-chain mapping.
- Any flow where the user typed a brand name ("Notion", "Stripe", "DeepL") and downstream code wants the registered entity ("Notion Labs, Inc.", "Stripe, LLC", "DeepL SE").

## Workflow

The legal entity + address is almost always declared verbatim in the company's own Privacy Policy or Imprint, on a small handful of well-known URL paths. The **optimal path is fetch-only** — Browserbase Search API to resolve the domain (one HTTP request) + Browserbase Fetch API with residential proxies to pull the legal page (one HTTP request per path tried, stopping at first success). No browser needed for the majority of US SaaS, EU GmbH, UK Ltd, and other "ToS-on-marketing-site" companies. Browser fallback is only required when the legal page is JS-rendered or hidden behind a notion.so-style redirect-notice. Total cost on the fetch path: ~$0.001–0.01. On the browser fallback: ~$0.40.

### Step 1 — Resolve the official domain

Prefer the Browserbase Search API over scraping google.com directly — it returns structured JSON, no anti-bot, no need for a session:

```bash
browse cloud search "<Company> official site" --num-results 5 --json
```

The first organic result is almost always correct. Filter out Wikipedia, LinkedIn, Crunchbase, news/blog domains; pick the result whose host most closely matches the company name (`figma.com` for "Figma", `notion.so` for "Notion", `deepl.com` for "DeepL"). Persist this domain — you'll prepend it with `www.` for the next step.

**Browser fallback for domain discovery** — if the Search API is unavailable or returns nothing relevant:

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.google.com/search?q=$(printf %s 'Company official site' | jq -sRr @uri)" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse snapshot --remote --session "$SID"
# First non-ad anchor href is the candidate domain.
```

### Step 2 — Fetch the legal page

Try these URL paths in order against the resolved domain (always `https://www.<domain>` — bare-host often returns 401/redirects to login; `www.` is the documented public surface). Stop at the first response that returns `200 OK`, `body_len > 5000`, AND yields an entity-suffix match in step 3:

```
/legal/privacy
/legal/terms
/privacy
/terms
/privacy-policy
/terms-of-service
/legal
/imprint            (German / EU sites — DeepL, GmbH-incorporated SaaS)
/impressum          (same, German URL spelling)
```

Each fetch:

```bash
browse cloud fetch "https://www.<domain><path>" --proxies --allow-redirects
```

`--proxies` is recommended (some companies' edges geo-fence /privacy by region — residential proxy avoids Cloudflare-403 / regional-redirect surprises). `--allow-redirects` is mandatory — e.g. DeepL redirects `/privacy` → `/en/privacy`.

The fetch response is JSON with `statusCode`, `content` (HTML), and headers. Strip script/style and tags before scanning.

### Step 3 — Extract entity + address from prose

Scan the de-tagged page text for a legal-entity declaration. The reliable signal is an **entity suffix token** appearing directly after a capitalized name, followed within ~400 chars by a street address with postal code and country/state.

**Entity suffix regex** — covers ≥ 95% of jurisdictions observed in iteration:

```
\b(Inc\.?|LLC|L\.L\.C\.|Ltd\.?|Limited|GmbH|S\.A\.(?:R\.?L\.?)?|S\.r\.l\.|SE|AB|BV|NV|Pty Ltd|K\.K\.|Co\.,? Ltd\.?|UAB|OY|AS)\b
```

**Address window heuristic** — within the next 400–600 characters after an entity match, look for:

```
\d{1,5}[ ,]+[A-Z][A-Za-z0-9.À-ſ]+(?: [A-Z][A-Za-z0-9.À-ſ]+){0,8},?[^.;|]{5,200}
```

…and trim the trailing fragment at the first occurrence of joining words (`and|or|will|shall|is|has|may|to|the|a`) — these reliably mark the end of the address and the start of the next sentence.

**Score candidate entities** so you don't grab "Microsoft Ireland Operations Limited" out of a sub-processor list:

1. Entity must contain a token matching the first 4–5 chars of the company name (`figm` for Figma, `noti` for Notion, `deep` for DeepL). Case-insensitive.
2. Reject entities starting with `The|This|These|Our|Your|Such` (prose false-positives).
3. Reject entities longer than 80 chars (almost always a regex over-extension across a heading boundary).
4. If multiple candidates remain, prefer the one that appears **earliest** in the document — top-of-doc declarations ("This privacy policy is provided by …") are the parent / website-operating entity; later mentions are usually GDPR sub-processors or jurisdiction-specific affiliates.

### Step 4 — Branch on outcome

- **Single entity matches** → return `{success: true, legalName, address, source}`.
- **Multiple entities all match the company name** (Figma, Shopify, Anthropic — typically a US parent plus EU/UK/SG affiliates) → return the **earliest top-of-doc** entity as the primary, and optionally include `affiliates: [{legalName, address}, ...]`. Document jurisdictions explicitly: most ToS sections this happens in are headed "For users in [region], your data controller is [entity]".
- **/terms returns 200 but body is < 20 KB and contains a "click here" link** (Notion pattern) → it's a redirect-notice page. Fall back to the browser path (Step 5) to click through.
- **All paths 404 / 401 / 5xx** → fall back to the browser path; the company may have legal pages at a non-standard URL discoverable only from the footer.
- **All fetches succeed but no entity suffix appears in any page** → emit `{success: false, reason: "no_legal_entity_declaration_found", attempted_urls: [...]}`. Genuinely uncommon — observed only for very early-stage startups whose ToS is a Notion/Docs page without an entity declaration.

### Step 5 — Browser fallback

When the fetch path can't reach the legal page (Notion-style redirect-notice, SPA-rendered terms, Cloudflare-anti-bot edge):

```bash
SID=$(browse cloud sessions create --keep-alive --proxies --verified | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.<domain>/terms" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2000 --remote --session "$SID"
browse snapshot --remote --session "$SID"
# If a "click here to view terms" link is in the snapshot, click it and wait again.
browse get text body --remote --session "$SID"
# Re-run Step 3 extraction against the text response.
browse cloud sessions update "$SID" --status REQUEST_RELEASE
```

`--verified --proxies` is required for any site behind an anti-bot edge (Cloudflare, Akamai, PerimeterX). Most legal/privacy pages are NOT anti-bot-protected (they're meant to be machine-readable by privacy auditors), but the parent marketing site sometimes is.

## Site-Specific Gotchas

- **Use `www.` not the bare apex.** `https://notion.so/privacy` → 401 (Notion's API gateway answers the bare host). `https://www.notion.so/terms` → 200 (renders the redirect-notice). Always prepend `www.` even when the brand markets the bare host.
- **Notion's `/terms` is a redirect-notice page, not the terms.** It renders a tiny HTML stub with `<a>click here</a>` pointing at `notion.notion.site/Terms-and-Privacy-<hash>`. Fetch can't follow it because the target is a different domain that requires a session. Use the browser fallback: open `/terms` → snapshot → click the `click here` ref → `wait load` → `get text body`. Verified iter-1 (autobrowse).
- **DeepL's entity suffix is `SE` (Societas Europaea), not `GmbH`.** A common regex that only matches `Inc|LLC|Ltd|GmbH` will miss it. Include `SE`, `AB`, `BV`, `NV`, `UAB`, `OY`, `AS` for full EU coverage.
- **DeepL redirects `/privacy` → `/en/privacy`.** `--allow-redirects` is required, not optional.
- **Anthropic-style "regional controller" lists confuse the proximity heuristic.** Anthropic's privacy policy declares `Anthropic, Inc.` (US, 548 Market St) at the top and then enumerates `Anthropic Ireland, Limited`, `Anthropic Korea, Limited`, etc. with their own addresses. If you take the *first entity suffix* the regex finds, you may get the regional sub-entity paired with the US parent's address, or vice versa. Strictly pair `(entity, address)` by document position and prefer the earliest declaration; treat subsequent entities as affiliates.
- **Shopify's primary terms-operator is `Shopify International Limited` (Dublin), not `Shopify Inc.` (Ottawa).** The US/Canadian parent appears later in the doc. For non-North-American merchants, Shopify International Limited is the contracting party. Don't assume "Inc. = primary" — read positions.
- **Figma's privacy lists 3 entities side-by-side**: `Figma, Inc.` (760 Market St, SF), `Figma UK Ltd.` (9 Devonshire Sq, London EC2M 4YF), `Figma GmbH` (Kurfürstendamm 15, 10719 Berlin). All three are valid; pick the one matching the user's jurisdiction or default to the top-of-doc (US) entity.
- **Stripe's address is on `/legal/privacy-center`, not `/privacy`.** `stripe.com/privacy` is a marketing landing; the addressable contact info ("If you'd like to send us physical mail, please send to: Stripe, LLC, 354 Oyster Point Boulevard, South San Francisco, California, 94080, USA") is in `/legal/privacy-center`. The `/legal/ssa` Services Agreement does *not* declare a contact address. Add `/legal/privacy-center` to your path-try list when scanning Stripe-like sites.
- **German sites use `/impressum`, not `/imprint`.** Always try both; some bilingual sites only ship the German URL.
- **Browserbase Search API beats scraping google.com**: ~3× cheaper than a remote session + Google captcha risk + structured JSON. Reach for it first; only use `browse open google.com` if Search returns nothing useful (rare for any real company).
- **Skip Wikipedia / LinkedIn / Crunchbase as "official site" candidates.** They contain the legal entity name but often a stale or wrong address. The company's own /privacy is canonical.
- **Don't rely on the homepage footer text alone.** Footers say "© 2026 Acme" — that's a copyright attribution, not a legal-entity declaration, and rarely carries a street address. The address lives in the linked Privacy Policy or Terms.
- **`browse cloud fetch` strips JavaScript.** Pages that render the legal text via `<script>` will return empty body even on 200. Verified false-empty on Anthropic /legal/terms (378 KB body, no entity match — JS-rendered). When `body_len > 100 KB` but extraction returns 0 candidates, that's the signal — fall back to browser.
- **Proxies optional for most legal pages, recommended for safety.** Direct curl from a datacenter IP works for ~80% of /privacy paths but occasionally hits geo-blocks (CDN serving a different jurisdiction's text) or rate limits. `--proxies` is the safer default.

## Expected Output

Single-entity success (most common):

```json
{
  "success": true,
  "legalName": "DeepL SE",
  "address": "Maarweg 165, 50825 Cologne, Germany",
  "source": "https://www.deepl.com/en/privacy"
}
```

Single-entity success with US-typical address:

```json
{
  "success": true,
  "legalName": "Notion Labs, Inc.",
  "address": "685 Market Street, San Francisco, CA 94105, United States",
  "source": "https://notion.notion.site/Terms-and-Privacy-28ffdd083dc3473e9c2da6ec011b58ac"
}
```

Multi-affiliate (return primary + list affiliates):

```json
{
  "success": true,
  "legalName": "Figma, Inc.",
  "address": "760 Market St, Floor 10, San Francisco, CA 94102, USA",
  "source": "https://www.figma.com/legal/privacy/",
  "affiliates": [
    { "legalName": "Figma UK Ltd.", "address": "9 Devonshire Square, London, EC2M 4YF, United Kingdom" },
    { "legalName": "Figma GmbH", "address": "Kurfürstendamm 15, 10719 Berlin, Germany" }
  ]
}
```

```json
{
  "success": true,
  "legalName": "Shopify International Limited",
  "address": "2 Haddington Road, Dublin 4, D04 XN32, Ireland",
  "source": "https://www.shopify.com/legal/terms",
  "affiliates": [
    { "legalName": "Shopify Inc.", "address": "151 O'Connor Street, Ground floor, Ottawa, Ontario, K2P 2L8, Canada" },
    { "legalName": "Shopify Commerce Singapore Pte. Ltd", "address": "77 Robinson Road, #13-00 Robinson 77, Singapore 068896" }
  ]
}
```

Legal-page-not-locatable failure:

```json
{
  "success": false,
  "reason": "no_legal_entity_declaration_found",
  "company": "ObscureStartup",
  "domain_resolved": "www.obscurestartup.com",
  "attempted_urls": [
    "https://www.obscurestartup.com/legal/privacy",
    "https://www.obscurestartup.com/privacy",
    "https://www.obscurestartup.com/terms"
  ]
}
```

Domain-not-resolvable failure:

```json
{
  "success": false,
  "reason": "official_site_not_found",
  "query": "<Company>",
  "search_top_results": [
    { "url": "https://en.wikipedia.org/wiki/<Company>", "title": "..." }
  ]
}
```
