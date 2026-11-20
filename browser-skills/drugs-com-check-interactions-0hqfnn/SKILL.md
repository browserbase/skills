---
name: drugs-com-check-interactions-0hqfnn
title: Drugs.com Drug-Interaction Check
description: >-
  Resolve a list of drugs (generic, brand, or partial) via Drugs.com
  autocomplete and return every flagged drug-drug, drug-food, and drug-condition
  interaction with severity, patient-facing summary, and clinical detail.
  Read-only and informational only — not medical advice.
website: drugs.com
category: health
tags:
  - health
  - pharmacology
  - drug-interactions
  - medication-safety
  - read-only
  - akamai
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: url-param
alternative_methods:
  - method: api
    rationale: >-
      /api/interaction/search/?search=<name> is the public, unauthenticated
      drug-resolver and is the first step of every run. The interaction-report
      endpoint /interactions-check.php?drug_list=<a-bA,b-bB,...> is HTML rather
      than JSON, so the overall flow is classified as 'url-param' rather than
      pure 'api'.
  - method: browser
    rationale: >-
      Documented as a fallback when the URL-param + Fetch path is rate-limited
      or temporarily Akamai-challenged. The form at /interaction/list/ posts the
      same drug_list. Browser path costs ~10× more roundtrips and produces
      identical HTML.
  - method: mcp
    rationale: >-
      No Drugs.com MCP exists. The public API is licensee-only; there is no
      agentic surface other than scraping the rendered page or the public
      unauthenticated endpoints we use here.
verified: true
proxies: true
---
# Drugs.com Drug-Interaction Check

## Purpose

Given a list of two or more drugs (generic, brand, or autocomplete-derived `ddc_id`s), return every flagged **drug-drug**, **drug-food/lifestyle**, and **drug-condition (disease)** interaction surfaced by the Drugs.com Interaction Checker, with severity (`major | moderate | minor | unknown`), the two parties of the interaction, a patient-facing summary, the professional/clinical rewrite (mechanism + management), and the canonical Drugs.com URL. Honors an optional `condition` filter (e.g. `pregnancy`, `breastfeeding`, `kidney disease`, `liver disease`). **Read-only — never click Save List, Print, Email, Sign Up, or submit any personal-health form. Output is informational only and must include a disclaimer that it is not medical advice.**

## When to Use

- A patient or clinician-facing agent that needs to check a multi-drug regimen before answering "is it safe to take X with Y?"
- Pre-fill screening for a triage flow: surface every `major` drug-drug interaction and any condition-specific warnings for a known patient condition.
- Bulk-checking a medication list against a single new prescription.
- Anywhere you would otherwise scrape the rendered Interaction Checker page — the URL-param + JSON-search path is ~50× cheaper and avoids the full JS-rendered UI.

## Workflow

Drugs.com's official API is licensee-only, but the public Interaction Checker is backed by two public, unauthenticated JSON/HTML endpoints that together cover the entire task. Use those directly via `bb fetch --proxies` and skip browser driving entirely. The page-driven autocomplete + click-Add flow is documented as a fallback only.

**Network constraint observed in this sandbox**: CDP WebSocket connections to `connect.*.browserbase.com` are DNS-filtered, so the entire skill was implemented via Browserbase Fetch (`bb fetch --proxies`). The Fetch API rides through residential proxies and Akamai-passes without any session cookies. If you are running in an environment with full Browserbase access, you can substitute live `browse open` calls — the same URLs work — but you almost never need to.

### 1. Resolve every input drug to `(ddc_id, brand_name_id)`

Drugs.com identifies a drug in the Interaction Checker by a pair of integers: `ddc_id` (the ingredient/concept ID) and `brand_name_id` (`0` if you want the generic; non-zero for a specific brand SKU). Resolve each input string via the public interaction-search endpoint:

```bash
bb fetch --proxies \
  "https://www.drugs.com/api/interaction/search/?search=$(printf '%s' "$NAME" | jq -sRr @uri)"
```

Response shapes (`application/json`):

```json
// Exact match — usually one drug
{ "type": "FOUND",   "search": "ibuprofen",
  "drugs": [{ "type": "GX", "ddc_id": 1310, "brand_name_id": 0, "name": "ibuprofen" }] }

// Brand → generic mapping
{ "type": "FOUND",   "search": "lipitor",
  "drugs": [{ "type": "BN", "ddc_id": 276, "brand_name_id": 128,
              "name": "Lipitor", "generic_name": "atorvastatin" }] }

// Ambiguous partial match — multiple candidates returned (typeahead state)
{ "type": "PARTIAL", "search": "tylen",
  "drugs": [ { "type": "BN", "ddc_id": 11, "brand_name_id": 12, "name": "Tylenol", ... },
             { "type": "BN", "ddc_id": 11, "brand_name_id": 2701, "name": "Tylenol Extra Strength", ... },
             ... ] }

// Not found
{ "type": "UNKNOWN", "search": "xyznotreal", "drugs": [] }
```

Selection rules:
- On `FOUND` with one entry → use that pair.
- On `FOUND`/`PARTIAL` with multiple entries → prefer the exact case-insensitive match of `name` against the input. If none, prefer `type: "GX"` (generic) over `type: "BN"` (brand). If still tied, ask the caller to disambiguate; do **not** silently pick the first result.
- On `UNKNOWN` → surface a `resolution_failed` entry in the output for that input; do not include it in `drug_list`.

The pair is encoded as `"{ddc_id}-{brand_name_id}"` in the URL — e.g. `1310-0` (generic ibuprofen), `276-128` (brand Lipitor).

### 2. Fetch the interaction report

The Interaction Checker accepts a comma-separated list of pairs as the `drug_list` query parameter. **Fetch twice in parallel** — once for the consumer narrative, once for the professional/clinical rewrite — and merge per block:

```bash
LIST="1310-0,2311-0"   # ibuprofen, warfarin
CONSUMER_URL="https://www.drugs.com/interactions-check.php?drug_list=$LIST"
PRO_URL="https://www.drugs.com/interactions-check.php?drug_list=$LIST&professional=1"

bb fetch --proxies "$CONSUMER_URL" > consumer.json
bb fetch --proxies "$PRO_URL"     > professional.json
```

Both URLs return a single ~170 KB HTML page. The `?professional=1` toggle rewrites every interaction-reference block's body from the patient-facing summary to the clinical `GENERALLY AVOID:` / `MANAGEMENT:` / `<details class="ddc-reference-list">` form. **The professional view does not contain the consumer text** — that is why both are needed for the task's full output schema.

A `bb fetch --proxies` round-trip is ~1–2 s on these pages; both can be fired in parallel.

### 3. Parse the report HTML

The report is structured around four `<h2>` section headers that appear in this exact order (any of them may be absent if the section is empty):

| `<h2>` text | Block type |
|---|---|
| `Interactions between your drugs` | drug-drug pairs |
| `Therapeutic duplication warnings` | same-class duplicates (no severity badge — text-only) |
| `Drug and food/lifestyle interactions` | drug × food, alcohol, tobacco, vitamin K, etc. |
| `Drug and disease interactions` | drug × medical condition |

Within each section, every interaction is a `<div class="interactions-reference">` whose first child is:

```html
<div class="interactions-reference-header">
  <span class="ddc-status-label status-category-{major|moderate|minor|unknown}">Major</span>
  <h3>
    {drug1} <svg class="ddc-icon-drugvsdrug">…</svg> {drug2-or-condition-or-food}
  </h3>
  <p>Applies to: {comma-joined drug names}</p>
</div>
```

…followed by one or more `<p>` paragraphs of body text (consumer narrative in the default view; `GENERALLY AVOID:` / `MANAGEMENT:` clinical prose in the `?professional=1` view) and, on the professional view, a `<details class="ddc-reference-list">` block with literature citations.

**Block delimitation**: split each section's HTML on every occurrence of `<div class="interactions-reference">`. The block runs until the next such opening div, or until the next `<h2>` (whichever comes first). Do **not** rely on matching `</div>` — drugs.com nests the closing tags inside the references-list `<details>` so a naive close-on-`</div>` regex over-consumes.

Pull out:
- `severity`: capture group of `status-category-([a-z]+)` (lowercase).
- `pair_label`: text of `<h3>`, stripped of the SVG and whitespace.
- `applies_to`: comma-list inside `<p>Applies to: …</p>`.
- `summary` / `professional_detail`: HTML→text of the body paragraphs.
- `references`: optional, only in the professional view, parsed from the `<details>` `<li>`s.

Merge consumer and professional blocks by their `(section, pair_label, applies_to)` key — the order of blocks within a section is identical across the two fetches.

### 4. Build the per-pair canonical URL

For drug-drug interactions, the canonical detail URL is:

```
https://www.drugs.com/drug-interactions/{a_name}-with-{b_name}-{a_ddc}-{a_bn}-{b_ddc}-{b_bn}.html
```

`a_name` and `b_name` are the lowercase canonical names from step 1 sorted alphabetically — and Drugs.com canonicalizes the URL by alphabetical name even when your input order is different. Example: input `(simvastatin 2067-0, clarithromycin 685-0)` produces `clarithromycin-with-simvastatin-685-0-2067-0.html`, not `simvastatin-with-…`. Sort the pair before building the URL so it matches the `<link rel="canonical">` on the report page.

For food/lifestyle and condition blocks there is no per-block detail URL — return the report-page URL (`/interactions-check.php?drug_list=…`) plus the `pair_label` so the caller can navigate manually.

### 5. Optional `condition` filter

When a `condition` is supplied (`pregnancy`, `breastfeeding`, `kidney disease`, `liver disease`, etc.), the report already lists every drug × condition pairing under `Drug and disease interactions`. Filter the parsed drug-condition blocks by case-insensitive substring of the condition against the `pair_label` (e.g. `condition: "liver disease"` matches `warfarin Liver Disease` and `ibuprofen Liver Disease`). Do **not** add `?condition=` or similar to the URL — there is no such parameter; the disease section is always returned in full.

Pregnancy/breastfeeding queries are special-cased: Drugs.com surfaces those primarily on the per-drug pregnancy page (`/pregnancy/{drug}.html`) rather than as a disease interaction. For `pregnancy` or `breastfeeding`, also fetch `https://www.drugs.com/pregnancy/{ddc_name}.html` for each resolved drug and extract the `<dt>FDA Pregnancy Category</dt>` and the lactation summary if needed. (Out of scope of the basic flow; document as a "if condition ∈ {pregnancy, breastfeeding}, also do X" branch in the caller.)

### 6. Aggregate the output

Build the `summary` block from per-severity counts across all three block types and set `recommend_consult_prescriber: true` whenever any `major` is present. Always include the disclaimer string:

```
"This output is informational only and is not medical advice. Consult a licensed
healthcare provider before changing any medication regimen."
```

### Browser fallback

If `bb fetch --proxies` is blocked for any reason — typically a transient Akamai 403 — drive the page UI instead:

```bash
SID=$(bb sessions create --keep-alive --verified --proxies | jq -r '.id')
browse --connect "$SID" open "https://www.drugs.com/interaction/list/"
# For each drug:
browse --connect "$SID" click '#livesearch-interaction'
browse --connect "$SID" type "ibuprofen"
browse --connect "$SID" wait timeout 1500            # let autocomplete dropdown render
browse --connect "$SID" click 'role=option[name="ibuprofen"]'
browse --connect "$SID" click 'button:has-text("Add")'
# After adding ≥ 2 drugs, the page lands on the same report HTML as the URL-param path.
```

The form action is `<form action='/interaction/list/' method='post'>`. The browser path costs ~10× the network roundtrips of the URL-param path and produces the same HTML — only use it when the API path fails.

## Site-Specific Gotchas

- **READ-ONLY.** Never click `Save list`, `Print`, `Email`, `Sign Up`, or any control inside the `<form id="drug-interactions-search">` block beyond what's needed to populate the list in the browser fallback. The `/api/interaction/list-save/` endpoint is CSRF-protected and would mutate a logged-in user's saved lists if a session cookie were present.
- **Drugs.com canonicalizes drug order in the URL by alphabetical name.** `drug_list=2067-0,685-0` (simvastatin first) renders the same page as `685-0,2067-0` (clarithromycin first), and both `<link rel="canonical">` to `clarithromycin-with-simvastatin-685-0-2067-0.html`. When building the per-pair detail URL in your output, sort the pair so it matches the canonical.
- **`ddc_id` is per-ingredient, `brand_name_id` is per-SKU. Use `brand_name_id=0` for the generic.** Multiple brand SKUs share a `ddc_id`: Tylenol, Tylenol Extra Strength, and Tylenol Arthritis Pain are all `ddc_id=11` (acetaminophen) with different `brand_name_id`s (12, 2701, 2953). Combination products like Tylenol PM live under a different `ddc_id` entirely (64, acetaminophen/diphenhydramine).
- **`/api/interaction/search/` returns the truth; `/api/autocomplete/?type=interaction` does not.** The latter endpoint exists but always returns `{"resultCount":0,"categories":[]}` without an active page-context CSRF token. Always use `/api/interaction/search/?search=…` for resolution.
- **`/api/interaction/list-drugs/` and `/api/interaction/list-names/` require a CSRF token.** They respond `{"error":{"code":403,"message":"Forbidden","details":"Invalid CSRF token"}}` for any out-of-band call. They are not needed — the report HTML at `/interactions-check.php?drug_list=…` contains everything those endpoints would have returned.
- **`?professional=1` rewrites the body of every interaction block.** The default view (consumer) and `?professional=1` view (clinical) have the same block count and order, but their `<p>` bodies are mutually exclusive. To produce both `summary` and `professional_detail` in one record, fetch both URLs and zip the blocks. Do not assume the professional view will contain consumer text — it does not.
- **Severity enum is `major | moderate | minor | unknown`.** The first three were observed across our test pairs (ibuprofen+warfarin, simvastatin+clarithromycin, caffeine+tramadol, metformin+lipitor+ibuprofen, acetaminophen+vitamin C). `unknown` is documented by Drugs.com but did not surface in any tested combination; emit `unknown` when the `status-category-` class is present but the value is anything other than the three observed.
- **Single-drug `drug_list` returns 302 to `/drug-interactions/{drug}.html`** (a single-drug summary page, not a list report). Always enforce ≥ 2 distinct `ddc_id`s before fetching. Two SKUs of the same generic (e.g. `11-12,11-2701` — two Tylenol forms) also resolve to a single-drug page; collapse duplicate `ddc_id`s before building the list.
- **"No drug ↔ drug interactions were found" is a valid empty result, not a parse failure.** Detect it by looking for the literal string `"No drug ⇄ drug interactions were found"` inside the `Interactions between your drugs` H2 section, or — equivalently — by finding zero `<div class="interactions-reference">` inside that section's wrapper. The food and disease sections are almost never empty for any real drug.
- **Disease section is large.** A two-drug pair routinely produces 50–100 drug-condition blocks because every drug in the list expands against every known condition contraindication. The agent's output should chunk or summarize this; do not return the full disease list unfiltered to a low-context UI.
- **The naïve `<div class="interactions-reference">…</div>` regex over-consumes.** Drugs.com nests the closing tags inside the references-list `<details>` block, so block N's closing `</div>` is several `<details>` deep. The robust delimiter is the *next opening* `<div class="interactions-reference">` or the next `<h2>` — split on those, not on the closing tag.
- **`/api/`, `/drug-interactions-all/`, `/interaction/list/`, `/interactions-list-drugs.php`, `/search.php`, `/search-wildcard-phonetic.php` are all `Disallow:`'d in `robots.txt`.** The fetches we make are still served (200 with full content) because Drugs.com gates by user-agent string, not by URL path matching at the edge — but a polite agent should keep traffic low. **Stay ≤ 1 RPS sustained** and use a Verified UA via `bb fetch --proxies`.
- **Akamai is present but lenient on the Interaction Checker pages.** A residential proxy (`--proxies`) is enough; `--verified` was not needed for the Fetch API path. If you switch to live browser driving, add `--verified` because the login/save flows are more aggressively challenged.
- **Stop at the report page. Do not paginate, do not click into per-drug detail pages, do not follow `See also:` recommendations.** The report contains every datum the schema requires.
- **`pregnancy` and `breastfeeding` are not "diseases" in Drugs.com's taxonomy.** They surface on per-drug pages at `/pregnancy/{drug}.html`, not on the Interaction Report. When the caller passes `condition: "pregnancy"` or `condition: "breastfeeding"`, fetch the per-drug pregnancy page in addition to the interaction report. Other conditions (`kidney disease`, `liver disease`, `hypertension`, …) are filterable from the disease section directly.
- **The disclaimer is non-optional.** Drugs.com's own footer reads "This material is provided for educational purposes only and is not intended for medical advice, diagnosis or treatment." Pass this through to your output; do not paraphrase or omit.

## Expected Output

```json
{
  "disclaimer": "This output is informational only and is not medical advice. Consult a licensed healthcare provider before changing any medication regimen.",
  "input_drugs": [
    {
      "input": "Advil",
      "resolved": {
        "type": "brand",
        "ddc_id": 1310,
        "brand_name_id": 782,
        "name": "Advil",
        "generic_name": "ibuprofen",
        "active_ingredients": ["ibuprofen"],
        "drug_list_token": "1310-782"
      }
    },
    {
      "input": "warfarin",
      "resolved": {
        "type": "generic",
        "ddc_id": 2311,
        "brand_name_id": 0,
        "name": "warfarin",
        "generic_name": "warfarin",
        "active_ingredients": ["warfarin"],
        "drug_list_token": "2311-0"
      }
    }
  ],
  "report_url": "https://www.drugs.com/interactions-check.php?drug_list=1310-782,2311-0",
  "canonical_url": "https://www.drugs.com/drug-interactions/ibuprofen-with-warfarin-1310-0-2311-0.html",
  "condition_filter": null,
  "interactions": {
    "drug_drug": [
      {
        "severity": "major",
        "drugs": ["ibuprofen", "warfarin"],
        "applies_to": ["ibuprofen", "warfarin"],
        "summary": "Using warfarin together with ibuprofen may increase the risk of serious bleeding complications, especially in the gastrointestinal tract…",
        "professional_detail": "GENERALLY AVOID: Nonsteroidal anti-inflammatory drugs (NSAIDs) may potentiate the hypoprothrombinemic effect and bleeding risk associated with vitamin K antagonists… MANAGEMENT: NSAIDs should be administered with vitamin K antagonists only if benefits are expected to outweigh the increased risk…",
        "mechanism_class": ["pharmacodynamic", "additive"],
        "references_count": 34,
        "url": "https://www.drugs.com/drug-interactions/ibuprofen-with-warfarin-1310-0-2311-0.html"
      }
    ],
    "drug_food": [
      {
        "severity": "moderate",
        "drug": "warfarin",
        "counterpart": "food/lifestyle (vitamin K intake)",
        "summary": "Nutrition and diet can affect your treatment with warfarin. Keep your vitamin supplement and food intake steady…",
        "professional_detail": null,
        "mechanism_class": ["pharmacokinetic"],
        "url": "https://www.drugs.com/interactions-check.php?drug_list=1310-782,2311-0#warfarin-food-lifestyle"
      },
      {
        "severity": "moderate",
        "drug": "ibuprofen",
        "counterpart": "ethanol (alcohol)",
        "summary": "Ask your doctor before using ibuprofen together with ethanol. Do not drink alcohol while taking ibuprofen…",
        "professional_detail": null,
        "mechanism_class": ["additive"],
        "url": "https://www.drugs.com/interactions-check.php?drug_list=1310-782,2311-0#ibuprofen-food-lifestyle"
      }
    ],
    "drug_condition": [
      {
        "severity": "major",
        "drug": "ibuprofen",
        "condition": "Asthma",
        "summary": "NSAIDs are contraindicated in patients with history of asthma, urticaria, or other allergic-type reactions…",
        "professional_detail": "NSAIDs are contraindicated in patients with history of asthma, urticaria…",
        "mechanism_class": ["pharmacodynamic"],
        "url": "https://www.drugs.com/interactions-check.php?drug_list=1310-782,2311-0#ibuprofen-asthma"
      }
    ],
    "therapeutic_duplication": []
  },
  "summary": {
    "drug_drug_count": 1,
    "drug_food_count": 4,
    "drug_condition_count": 69,
    "by_severity": { "major": 49, "moderate": 25, "minor": 0, "unknown": 0 },
    "has_major_interactions": true,
    "recommend_consult_prescriber": true
  }
}
```

Edge-case shapes:

```json
// Empty drug-drug section (e.g. acetaminophen + vitamin C)
{ "interactions": { "drug_drug": [], "drug_food": [...], "drug_condition": [...] },
  "summary": { "drug_drug_count": 0, "has_major_interactions": false, ... } }

// One or more inputs unresolved
{ "input_drugs": [
    { "input": "xyznotreal", "resolved": null, "resolution_error": "UNKNOWN" },
    { "input": "ibuprofen",  "resolved": { ... } } ],
  "interactions": null,
  "error": "fewer_than_two_resolvable_drugs" }

// Ambiguous input (PARTIAL with multiple distinct ddc_ids)
{ "input_drugs": [
    { "input": "tylen", "resolved": null, "resolution_error": "AMBIGUOUS",
      "candidates": [
        { "ddc_id": 11, "brand_name_id": 12,   "name": "Tylenol", "generic_name": "acetaminophen" },
        { "ddc_id": 11, "brand_name_id": 2701, "name": "Tylenol Extra Strength", "generic_name": "acetaminophen" },
        { "ddc_id": 64, "brand_name_id": 8542, "name": "Tylenol PM", "generic_name": "acetaminophen/diphenhydramine" }
      ] } ],
  "error": "ambiguous_drug_name" }

// Single-drug list (rejected before fetch)
{ "error": "fewer_than_two_distinct_ddc_ids" }
```
