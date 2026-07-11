# Agent Design Patterns: System Prompts & Result Schemas

Field-tested patterns for writing agents that return reliable, structured results. Every pattern below maps to real fields on `POST /agents` (`systemPrompt`, `resultSchema`) and `POST /agents/runs` (`variables`, `browserSettings`).

## The anatomy of a good system prompt

Structure every system prompt in four blocks:

```text
1. ROLE + SCOPE     "You are an X agent. Given A and B, return C as structured JSON."
2. INPUTS           List every %variable% with type, format, and default.
3. PROCEDURE        Numbered steps: where to go, what to apply, what to extract,
                    what to skip, how to handle blockers.
4. GUARDRAILS       Read-only rules, honesty rules ("null over invented data"),
                    and what to do when the task cannot be completed.
```

### Example skeleton

```text
You are an <domain> search agent. Search <site> for <thing> matching the query
with the requested filters applied, then return structured JSON per result.

Inputs (variables):
- %query% — the search query (required)
- %price_max% — maximum price in USD (optional)
- %max_pages% — result pages to scan (default 1, max 3)

Procedure:
1. Go to <site> and search %query%. If a CAPTCHA or interstitial appears,
   resolve it and retry.
2. Apply filters via the UI AND/OR URL parameters — prefer URL params when
   reliable: <list the site's known params>.
3. Scan up to %max_pages% pages. For EVERY organic result extract: <fields>.
4. Skip sponsored placements. Deduplicate by <stable id>.
5. Record which filters you actually managed to apply in appliedFilters.
   If a filter option does not exist, note it as null and continue.

Never invent <ids/prices/times> — use null when a field is not on the page.
```

## Pattern: echo applied state back (`appliedFilters`)

Agents sometimes fail to apply a filter but extract data anyway. Force honesty by requiring an `appliedFilters` object in the schema that echoes what was *actually* applied (not what was requested). This turns silent filter failures into visible, diffable data — compare `appliedFilters` to the run's variables to detect drift automatically.

## Pattern: outcome enums for availability checks

For "is X available?" tasks (reservations, tee times, day passes, stock), a bare slot list is ambiguous — empty could mean sold out, not found, or blocked. Enumerate every distinct failure mode as a schema-level enum so the agent must pick one:

```json
"outcome": {
  "type": "string",
  "enum": ["available", "sold-out", "not-found", "ambiguous-name",
           "not-bookable-online", "outside-publish-window", "extraction-blocked"]
}
```

In the prompt, define each outcome precisely ("'sold-out' means the date is open for booking but every slot is taken; 'outside-publish-window' means the date has not been released yet"). Pair with a `candidates` array so `ambiguous-name` returns the options instead of a guess. Verified in production: an agent asked for a restaurant that wasn't on the platform correctly returned `venue-not-found` with two near-miss candidates instead of hallucinating slots.

## Pattern: null over invented data

End every prompt with a line like: *"Never invent IDs, prices, or times — use null when a field is not present on the page."* Make nullable schema fields explicitly nullable (`"type": ["number", "null"]`) so validation doesn't push the agent to fabricate. An honest partial result beats a complete-looking fake one.

## Pattern: capture load-bearing tokens

When the output feeds a downstream booking/purchase step, name the token explicitly and say where to find it: *"capture the config_id token — this is load-bearing for downstream booking; read it from the slot button's attributes or the API response visible in page state."* If the token can't be extracted, require a note rather than a guess.

## Pattern: read-only guardrails

For research agents that walk checkout/booking flows, state exactly how far to go:

```text
Read-only: NEVER place an order, submit payment, book, hold, or create an account.
You may add an item to the cart and proceed ONLY far enough in checkout to reveal
delivery options and fees, entering the destination but never payment details.
```

Agents follow this well, but say it twice — once in role/scope, once at the exact step where the temptation occurs.

## Pattern: prefer deep-links and embedded data over UI walking

- **URL parameters beat click sequences**: most sites encode filters in the URL (e.g. `?covers=2&dateTime=2026-07-18T19:00`, price/sort params, slugged filter paths). Name the known params in the prompt.
- **Server-rendered JSON beats DOM scraping**: many SPAs embed the full result payload in a script tag (`__NEXT_DATA__`, deferred-state blobs). Telling the agent to parse that blob yields more fields, exact IDs, and immunity to layout changes. Verified in production on a major listings site: the agent found the SSR blob and returned exact listing IDs, coordinates, and total counts.
- **Canonical URL formats**: specify them (`https://site.com/dp/<ID>`) so output URLs are stable and deduplicable.

## Pattern: variables for anything per-run or sensitive

Anything that changes between runs — queries, dates, party sizes, credentials, confirmation codes — belongs in `variables`, not hardcoded in the prompt. Sensitive values passed as variables never sit inline in the task text and are not persisted.

**Known pitfall (observed in production): date/time drift.** Agents sometimes substitute *today's* date instead of the `%date%` variable. Mitigations:
- Repeat the variable in the task: `"Check availability on %date% (this exact date, not today)"`.
- Echo the inputs back in the schema (a required `date` field) so drift is detectable.
- Validate the echoed field against the variable after the run; retry on mismatch.

## Pattern: one abstract agent, many targets

To cover hundreds of portals/sites, write ONE agent whose prompt describes the goal abstractly ("Portals differ in layout. Do not rely on fixed labels; find the billing area by its meaning.") and pass the portal URL + credentials per run. Each run gets its own browser session, so fan-out is parallel up to the account's concurrency limit.

## Pattern: schema design for scale

- Keep schemas as flat as practical; scalar fields are quick to read and diff.
- For prices, capture display + numeric + currency: `{"display": "$1,395 - $2,210", "value": 1395, "currency": "USD"}` — display preserves ranges, numeric enables math.
- Include a free-text `notes` or `summary` field so the agent has a sanctioned place for caveats instead of polluting typed fields.
- Mark truly-required fields `required`; leave the rest optional/nullable.
- `additionalProperties: false` keeps output tight and catches schema drift.

## Anti-bot & session controls

| Symptom | Fix |
|---|---|
| Thin/blocked results on protected sites (PerimeterX, DataDome, Akamai) | `"browserSettings": {"proxies": true, "verified": true}` on the run |
| Site needs login state across runs | `"browserSettings": {"context": {"id": "...", "persist": true}}` |
| Geo-dependent content (metro redirects, region pricing) | proxies + instruct the agent to detect and correct the redirect |

Name known challenges in the prompt: *"This site is protected by PerimeterX — if a 'Robot or human?' press-and-hold challenge appears, solve it and continue."*

## Iterating on quality

1. First runs are exploratory — expect wandering; judge the *output*, then optimize the *path*.
2. Use the dashboard **Optimize** tool on a run (starter prompts: "Make this faster", "What went wrong", "Alternative approaches", "Write a script"). It proposes a `systemPrompt` diff you can edit, apply, and re-run.
3. Watch `completionRate` / `failRate` / `timeoutRate` / `averageDuration` on the Agent page over time, not single-run impressions.
4. Common first-run findings, in practice: filters requested but not applied (visible via `appliedFilters`), thin extraction on anti-bot sites (add proxies/verified), and variable drift (add echo-back validation).
5. When a run reveals the underlying data endpoint (an API the page calls), consider replaying it with the Fetch API for cheap high-frequency polling, and keep the Agent for pages that only render in a browser.
