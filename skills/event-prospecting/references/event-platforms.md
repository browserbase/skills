# Event-Prospecting — Platform Reference

## Contents
- [Detection Priority](#detection-priority) — order recon.mjs probes
- [Next.js / `__NEXT_DATA__`](#nextjs--__next_data__) — Stripe Sessions class
- [Sessionize](#sessionize) — public JSON API
- [Lu.ma](#luma) — JSON-LD Event block
- [Eventbrite](#eventbrite) — JSON-LD Event block
- [Custom / Markdown Fallback](#custom--markdown-fallback) — last resort
- [Adding a New Platform](#adding-a-new-platform) — contributor guide

---

## Detection Priority

`recon.mjs` probes the event URL once via `browse goto` + `browse eval`, then chooses the first matching platform from this list:

1. **Next.js / `__NEXT_DATA__`** — `document.getElementById('__NEXT_DATA__')` returns a `<script>` tag.
2. **Sessionize** — `<meta name="generator">` content matches `/sessionize/i`.
3. **Lu.ma** — `location.hostname` matches `/lu\.ma/`.
4. **Eventbrite** — `<meta property="og:site_name">` matches `/eventbrite/i`.
5. **JSON-LD Event** — at least one `<script type="application/ld+json">` block has `@type === 'Event'`.
6. **Custom / markdown fallback** — none of the above; the extractor uses `browse get markdown` and parses speaker blocks heuristically.

The order matters: Next.js sites often *also* embed JSON-LD, so probing `__NEXT_DATA__` first gives us the structured data path before falling back to JSON-LD heuristics.

---

## Next.js / `__NEXT_DATA__`

**Detection signature**

```js
!!document.getElementById('__NEXT_DATA__')
```

This script tag is emitted by every `getServerSideProps` / `getStaticProps` Next.js page. Its `textContent` is a JSON blob containing every prop hydrated into the React tree at build/request time — including the speaker list for an event microsite.

**Extraction strategy** — `next-data-eval`

`recon.mjs` walks the parsed JSON looking for arrays whose elements are objects with both a `name`-ish key AND a `linkedin` substring somewhere. It records the JSON path of every such array (e.g. `.props.pageProps.featuredSpeakers.speakers.items`) into `recon.nextDataPaths`. The Phase B extractor then runs ONE `browse eval` to harvest those arrays and union them into a single people list.

**Sample output shape** (Stripe Sessions 2026)

```json
{
  "platform": "next-data",
  "strategy": "next-data-eval",
  "nextDataPaths": [
    ".props.pageProps.featuredSpeakers.speakers.items",
    ".props.pageProps.moreSpeakers.speakers.items"
  ]
}
```

A typical speaker object inside one of those arrays:

```json
{
  "name": "Patrick Collison",
  "title": "CEO and Co-founder",
  "companyName": "Stripe",
  "linkedInProfile": "https://www.linkedin.com/in/patrickcollison/",
  "bio": "..."
}
```

**Known gotchas**

- The walker also matches `talks[N].speakers` arrays (a denormalized re-listing of the same speakers per session). `recon.mjs` filters those out via regex so we don't double-count.
- Some Next sites lazy-load speakers AFTER hydration. The 2.5s `browse wait timeout` is usually enough; if a site fails extraction, bump the wait to 5s before declaring it a different platform.
- Field names vary across sites (`companyName` vs `company` vs `org`, `linkedInProfile` vs `linkedinUrl`). The Phase B extractor normalizes via fallback chains.

---

## Sessionize

**Detection signature**

```html
<meta name="generator" content="Sessionize.com">
```

**Extraction strategy** — `sessionize-api` *(stub in v0.1; full implementation in a future phase)*

Sessionize exposes a public read-only JSON API at `https://sessionize.com/api/v2/{event_id}/view/Speakers`. The event ID is in the page URL or embedded JS. v0.1 of `recon.mjs` only sets `strategy: "sessionize-api"` and emits the URL — no API discovery yet.

**Sample output shape**

```json
{
  "platform": "sessionize",
  "strategy": "sessionize-api"
}
```

**Known gotchas**

- Some Sessionize-hosted pages bury the event ID behind a custom domain. We may need to scan the page for `sessionize.com/api/v2/...` URLs and pull the ID from there.
- The Sessionize API returns a flat speaker list — much cleaner than scraping Next.js, when it works.

---

## Lu.ma

**Detection signature**

```js
/lu\.ma/.test(location.hostname)
```

Lu.ma always serves on `lu.ma` (or rarely a custom CNAME); the hostname check is decisive.

**Extraction strategy** — `json-ld` *(stub in v0.1)*

Lu.ma embeds an `Event` JSON-LD block with attendee/speaker info, but the volume of structured data is event-dependent. v0.1 sets `strategy: "json-ld"` and defers actual extraction to Phase B+. The fallback markdown extractor handles Lu.ma pages reasonably well in the meantime.

**Sample output shape**

```json
{
  "platform": "luma",
  "strategy": "json-ld"
}
```

**Known gotchas**

- Lu.ma often gates the full attendee list behind a login. Public-facing pages usually only show "featured" speakers, not the full list.
- Some Lu.ma events are private; `recon.mjs` should NOT crash if `__NEXT_DATA__` isn't present and JSON-LD is empty — it falls through to the markdown strategy.

---

## Eventbrite

**Detection signature**

```html
<meta property="og:site_name" content="Eventbrite">
```

**Extraction strategy** — `json-ld` *(stub in v0.1)*

Eventbrite emits standard `Event` JSON-LD on every public event page. Speakers are usually only in the prose body, not the structured data — Eventbrite is more of an RSVP platform than a speaker-directory platform. We may need to combine JSON-LD parsing with markdown extraction of the description body.

**Sample output shape**

```json
{
  "platform": "eventbrite",
  "strategy": "json-ld"
}
```

**Known gotchas**

- Eventbrite event pages are heavy — `bb fetch` may return >1MB and trigger the size guard. Use `browse get markdown` instead.
- Most Eventbrite events do NOT publish a speaker list at all. This platform is low-yield for prospecting.

---

## Custom / Markdown Fallback

**Detection signature**

None of the above match. `recon.mjs` sets `platform: "custom"` and `strategy: "markdown"`.

**Extraction strategy** — `markdown`

The Phase B extractor calls `browse get markdown`, splits the output on heading boundaries (`####`, `###`, `##`), and treats each block as a candidate speaker:
- Line 1: name (must start with capital letter)
- Line 2: title/role
- Line 3: company
- Anywhere in the block: `linkedin.com/in/{handle}`

This is a best-effort fallback. Coverage is typically 60-80% of the actual speaker list; field accuracy is lower than the structured paths.

**Sample output shape**

```json
{
  "platform": "custom",
  "strategy": "markdown"
}
```

**Known gotchas**

- Many static event sites use cards (not headings) for speakers. The heading-split heuristic misses those entirely.
- "Section title" lines (`## Speakers`, `## Schedule`) get parsed as candidate speakers and need to be filtered downstream by checking for the LinkedIn pattern.
- If markdown extraction yields zero people, the pipeline should surface a "platform unsupported" error rather than emit an empty `people.jsonl`.

---

## Adding a New Platform

1. **Add a detection branch** in `recon.mjs` `probe()` after the existing ones. Pick a cheap signal (a meta tag, hostname, or a specific script tag) that's distinctive.
2. **Pick a strategy name** — kebab-case verb-phrase like `sessionize-api` or `json-ld-events`.
3. **Add an extractor branch** in `extract_event.mjs` that handles the new strategy.
4. **Add a section to this file** with: detection signature, extraction strategy, sample output shape, known gotchas.
5. **Drop a fixture** under `scripts/__fixtures__/{platform}-snapshot.json` capturing the expected `recon.json` shape so future refactors don't silently break extraction.

Keep the detection branches small. If a platform needs more than ~20 lines of detection logic, factor it out into `scripts/detectors/{platform}.mjs` and import.
