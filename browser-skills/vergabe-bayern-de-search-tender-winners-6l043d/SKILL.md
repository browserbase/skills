---
name: vergabe-bayern-de-search-tender-winners-6l043d
title: Bavaria Tender Award-Winner Lookup
description: >-
  List recently awarded public-procurement contracts on the Bavarian procurement
  platform vergabe.bayern (ex-post notices) and the company that won each bid,
  with awarding authority, procedure type, place, date, and award-notice PDF.
website: vergabe.bayern.de
category: procurement
tags:
  - procurement
  - tenders
  - public-sector
  - germany
  - bavaria
  - read-only
source: 'browserbase: agent-runtime 2026-07-09'
updated: '2026-07-09'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      Validated fallback: a bare remote session at the InformationsFrame URL
      exposes each award's title, authority, winner, date and PDF directly in
      the a11y snapshot — no clicks needed. Slower and pays LLM cost vs. the
      single-GET fetch path, and the inner harness's 4096-token output cap
      truncates large lists.
  - method: hybrid
    rationale: >-
      Use the browser only to drive the search form (keyword / postcode / radius
      / per-authority filter), then fetch the resulting InformationsFrame HTML
      for bulk winner extraction.
verified: false
proxies: false
---
# Bavaria Tender Award-Winner Lookup (vergabe.bayern.de)

## Purpose

Return a list of recently **awarded** public-procurement contracts on the Bavarian procurement
platform *vergabe.bayern* — and, for each, the **company that won the bid**. The data comes from
the platform's "Vergabeinformationen (ex-post)" section (post-award / *ex-post* notices published
under § 20 Abs. 3 Nr. 3/4 VOB/A and § 30 Abs. 1 UVgO), which names the awarded company for each
completed procurement. For every award you get the notice number + subject, the awarding authority
(public client), the winning company, the procedure type, execution place, publication date, and a
link to the official award-notice PDF. **Read-only** — never logs in, submits an offer, or clicks a
bid button.

## When to Use

- Building a running list of companies that recently won public contracts in Bavaria ("who won lately").
- Monitoring award activity of a specific awarding authority (e.g. a given *Staatliches Bauamt*) or watching who wins a category of work (Rohbau, Blitzschutz, Gerüstbau, Straßenbau, PV, …).
- Competitive/market intelligence on public-sector construction & services awards.
- Any flow that needs the *winner* of a tender rather than the open (not-yet-awarded) tender itself. For still-open tenders, use the "Auftragsbekanntmachungen" section instead (see gotchas).

## Workflow

The public UI is a thin wrapper around RIB's *meinauftrag* portal. On www.vergabe.bayern.de the menu
path **Veröffentlichungen → "Vergabeinformationen (ex-post)"** simply embeds an iframe whose `src` is:

```
https://meinauftrag.rib.de/public/InformationsFrame?filter=604283
```

`filter=604283` scopes the frame to the Bavaria-wide ex-post (award) notices. This URL returns
**fully server-rendered HTML (~557 KB)** — no JavaScript execution, no login, no cookie, and no
anti-bot challenge. The fastest, cheapest, most reliable path is therefore a single HTTP GET and an
HTML parse; scripted browsing is only a fallback.

### Recommended: fetch + parse (1 request, no browser)

1. **Fetch the frame** (residential proxy NOT required — a bare fetch returns HTTP 200):
   ```bash
   browse cloud fetch "https://meinauftrag.rib.de/public/InformationsFrame?filter=604283"
   ```
2. **Parse each award block.** The page renders ~20 most-recent awards. Per block, extract:
   - **Notice title** — the `<strong>…</strong>` (notice number + subject), e.g. `26-050680 Fassadensanierung WDVS`.
   - **Awarding authority** — the muted line right under the title, e.g. `Staatliches Bauamt Augsburg`.
   - **Awarded company (winner)** — regex `Awarded Company</div>\s*<div>([^<]+)</div>` (label is English by default). This is the field the whole skill exists for.
   - **Procedure type** — `Tender Procedures` value, e.g. `Öffentliche Ausschreibung (VOB/A)` / `Beschränkte Ausschreibung (VOB/A)`.
   - **Project / execution place** — the `Project` and `Execution place` values.
   - **Award-notice PDF** (when present) — `href` matching `https://my.vergabe.bayern.de/remote/vergabeinformation.pdf.php?id=<N>`.
   - **Publication date** — the day/month tile on the right (results are sorted by *Publikationsdatum*, descending, so the top of the list is the most recent).
3. **Emit** the array of awards (see Expected Output). To take only "the latest N", just slice the top N — the list is already newest-first.

### Optional narrowing

- **By awarding authority**: each block has a "Show further assignments by …" link of the form
  `/public/InformationsFrame/publisher/<base64(authority-name)>/filter/604283`. Fetch that URL to get
  only that authority's awards. (The publisher segment is URL-safe Base64 of the authority display name.)
- **By keyword / location / radius**: the frame has a search form ("Search term(s)" + "Search for
  awards", and "Show more search options" → sort, *Where* postcode/city, *Area* km radius, and
  registry toggles). For a keyword search you can drive the form in the browser path below; for bulk
  extraction the unfiltered fetch + client-side filtering is simpler.

### Browser fallback

Validated in a **bare** Browserbase session (no `--verified`, no `--proxies`):

1. `browse open "https://meinauftrag.rib.de/public/InformationsFrame?filter=604283" --remote`
2. `browse wait load` then wait ~1 s.
3. `browse snapshot` — the accessibility tree already exposes, per list item, the title (`strong`),
   the authority, an `AWARDED COMPANY` static-text node, the publication date, and (when present) the
   `FORMS` PDF link. **The winner is in the collapsed summary — do not click each row.**
4. Read the winners straight from the snapshot. Only if you also need `Tender Procedures` /
   `Execution place` / `Client data` per row, expand a row (far-right ▼ caret) or, better, fall back
   to the fetch+parse path which already contains those fields.

## Site-Specific Gotchas

- **Ex-post = awarded; Auftragsbekanntmachungen = still open.** "Vergabeinformationen (ex-post)"
  (`InformationsFrame?filter=604283`) is the ONLY section that names a winner. The
  "Auftragsbekanntmachungen" section lists *open* tenders (no winner yet). If the ask is "who won",
  always use the ex-post frame; do not confuse it with the tender-notice list.
- **The real data lives on `meinauftrag.rib.de`, not on `vergabe.bayern.de`.** The `.bayern.de` page
  is just site chrome + an iframe. Fetching the `.bayern.de` HTML alone yields a cookie banner and an
  empty shell — you must go to the `InformationsFrame` URL to get the awards.
- **No anti-bot, no auth, no proxy needed.** Pre-run probe reported no anti-bot; a bare
  `browse cloud fetch` (no `--proxies`) and a bare remote browser session both returned HTTP 200 with
  the full 557 KB payload. Do not waste a residential-proxy/`--verified` session on this.
- **Labels default to English on the fetch/API surface.** The `InformationsFrame` returns
  `Awarded Company`, `Tender Procedures`, `Execution place`, `Client data` (English) even though the
  public site chrome is German. Parse against the English labels; the German equivalent would be
  `Auftragnehmer` / `Vergabeverfahren` if a locale flip ever occurs.
- **~20 awards per load, newest first.** The frame renders roughly the 20 most-recent awards sorted
  by *Publikationsdatum* descending. That is usually plenty for "lately". There is no obvious
  offset/page param on the public frame; narrow by publisher (Base64 publisher path) or by the search
  form (postcode/radius/keyword) to reach older or more specific awards.
- **`filter=604283` is the Bavaria-wide client set.** The "Show more search options" panel also lets
  you toggle *other* registries (Vergabeplattform Berlin/Stuttgart/Wuppertal/Hannover, GMSH, RIB
  eVergabe) — leaving the default gives all Bavarian public clients (Staatliche Bauämter, Landratsämter,
  Städte/Gemeinden, Zweckverbände, etc.).
- **The "•••" menu ≠ the detail expander.** The three-dots control opens "Show further assignments by
  <authority>" (a per-publisher filter). The far-right grey ▼ caret expands the per-notice detail
  block. Neither is needed to read the winner (it is already in the summary).
- **Award PDFs.** Detail PDFs are `https://my.vergabe.bayern.de/remote/vergabeinformation.pdf.php?id=<N>`
  (form "341 Information über eine Beauftragung"). Only some list items surface the PDF link in the
  summary; the rest expose it inside the expanded detail block.
- **Some "companies" are sole traders / place-tagged strings.** Awarded-company values are free text as
  entered by the authority — you'll see clean GmbHs (`STRABAG AG`, `Heinrich Schmid GmbH & Co. KG`),
  bare person names (`Stefan Kraus`), and name+postcode blobs (`STL-Bau, 95466 Weidenberg`). Treat the
  field as an opaque display string; don't assume a legal-form suffix.
- **Inner-agent output cap (browser path only).** The autobrowse harness caps model output at 4096
  tokens; emitting all 20 awards as full objects truncates the JSON. On the browser path, cap at ~10
  awards or emit compact rows — or just use the fetch path, which has no such limit.

## Expected Output

```json
{
  "success": true,
  "source_url": "https://meinauftrag.rib.de/public/InformationsFrame?filter=604283",
  "scope": "Bavaria-wide ex-post (awarded) procurement notices, newest first",
  "count": 20,
  "awards": [
    {
      "notice_title": "26-051933 L2293 Strassenbauarbeiten",
      "awarding_authority": "Staatliches Bauamt Schweinfurt",
      "awarded_company": "Bauunternehmung Glöckle",
      "procedure_type": "Öffentliche Ausschreibung (VOB/A)",
      "project": "B62SBLSC014400 L 2292 ERN Hohn - Steinach",
      "execution_place": "97708 Hohn",
      "publication_date": "2026-07-09",
      "detail_pdf": "https://my.vergabe.bayern.de/remote/vergabeinformation.pdf.php?id=41638"
    },
    {
      "notice_title": "26-050680 Fassadensanierung WDVS",
      "awarding_authority": "Staatliches Bauamt Augsburg",
      "awarded_company": "Heinrich Schmid GmbH & Co. KG",
      "procedure_type": "Beschränkte Ausschreibung (VOB/A)",
      "project": null,
      "execution_place": "86150 Augsburg",
      "publication_date": "2026-07-09",
      "detail_pdf": null
    },
    {
      "notice_title": "26-051691 Brueckenbauarbeiten",
      "awarding_authority": "Staatliches Bauamt Traunstein",
      "awarded_company": "STRABAG AG",
      "procedure_type": null,
      "project": null,
      "execution_place": null,
      "publication_date": "2026-07-09",
      "detail_pdf": null
    }
  ],
  "error_reasoning": null
}
```

Failure shape (blocked, empty list, or no award notices found):

```json
{
  "success": false,
  "source_url": "https://meinauftrag.rib.de/public/InformationsFrame?filter=604283",
  "count": 0,
  "awards": [],
  "error_reasoning": "InformationsFrame returned no award blocks (unexpected — page normally lists ~20)."
}
```
