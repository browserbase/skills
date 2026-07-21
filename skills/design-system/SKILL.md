---
name: design-system
license: MIT
compatibility: "Requires the browse CLI (`npm install -g browse`) and a Browserbase account (BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID)."
allowed-tools: Bash, Read, Write
description: Agent-driven design-system snapshot of any website — colors, typography, tokens, components with screenshots, full HTML — using the browse CLI on a Browserbase cloud browser. Use when the user wants to "snapshot" a site's design system, pull brand colors/fonts from a URL, or import an existing site's look into a design canvas. Triggers on "snapshot <url>", "extract the design system from <url>", "pull the brand styles of <site>".
---

# Design System Snapshot (agent-driven)

You (the agent) explore the site and decide what matters. Deterministic code exists
only as a *measurement probe* you can invoke — it measures, it never decides.
Navigation, overlay dismissal, component selection, logo choice, and semantic naming
are your judgment calls, made by looking at screenshots and the page.

## Primitives (browse CLI)

```bash
browse open <url> --remote        # Browserbase cloud session (--local for dev)
browse screenshot -p <path>       # look at the page (add --full-page or --clip x,y,w,h)
browse snapshot                   # a11y tree with refs for clicking
browse click <ref|selector>       # interact
browse eval '<js expression>'     # ground truth from the live page
browse wait --timeout <ms>        # settle
browse stop                       # end session
```

## Workflow

1. **Open and look.** `browse open <url> --remote`, wait for load, screenshot, Read it.
   Everything downstream depends on you actually looking at the page.

2. **Clear the way.** Cookie walls, newsletter modals, region pickers — find the
   dismiss/accept control (`browse snapshot`, then `browse click`) and confirm with
   another screenshot. Don't capture anything while an overlay is up.

3. **Trigger lazy content.** Scroll through the full page, then back to top:
   ```bash
   browse eval '(async () => { const s = innerHeight, m = document.documentElement.scrollHeight; for (let y = 0; y < m; y += s) { scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); } scrollTo(0, 0); return m; })()'
   ```

4. **Measure.** Two deterministic probes:
   ```bash
   browse eval "$(cat scripts/harvest-styles.js)"      # colors, type scale, buttons, @font-face, tokens, logo candidates
   browse eval "$(cat scripts/harvest-structure.js)"   # breakpoints, grid/containers, hover/focus states, motion, icons, contrast
   ```
   Re-run the structure probe at tablet and mobile widths to capture the responsive
   system: `browse viewport 768 900`, wait ~1s, probe; same at `390`. Restore the
   desktop viewport after. Hex values in your output must come from probes (or your
   own `browse eval`) — never from reading pixels off a screenshot.

   **Theming across sub-pages** (pillar/section/category colors): visit each key
   sub-page and frequency-rank its non-neutral computed colors, excluding the
   universal brand colors — the per-section accent is what remains. Verify sub-page
   URLs load real pages (check `document.title`), not 404s.

5. **Explore — your judgment.** What the probe can't know:
   - Open the nav menu / a dropdown and capture its style if it looks distinctive.
   - If the site has a dark/light toggle, consider capturing both.
   - If fonts or colors resolve through aliases (e.g. `bodyFont`), map them to real
     families via the `fontFaces` inventory.
   - Pick the real logo from `logoCandidates` by looking, not by selector order.
   - A pricing or product page often has richer components (cards, tables, forms)
     than the homepage — grab one if it earns its place.

6. **Capture components.** Decide which sections a designer would want on a canvas
   (header, hero, feature sections, cards, footer — whatever this site actually has).
   For each: get its rect via `browse eval`, then
   `browse screenshot --clip x,y,w,h -p <outdir>/components/NN-<name>.png`,
   and store its outerHTML (via eval) in `components/components.json`.
   Also: `browse screenshot --full-page -p <outdir>/page-full.png`.

7. **Save the page.** `browse eval 'document.documentElement.outerHTML'` → `page.html`.

8. **Synthesize `design-system.json`.** Three strictly-separated tiers:
   - `measured` — probe output verbatim: styles, structure (breakpoints,
     per-viewport layout, states, motion, iconography, contrast), component
     samples, sub-page theming.
   - `proposedTokens` / `proposedComponents` — your semantic interpretation under
     a `_status: INFERRED` banner.
   - `notProvided` — name what a real design system would add that isn't on the
     page (formal a11y requirements, motion principles, component APIs). Never
     fabricate these.

   Normalization rules for the proposal tier:
   - **Evidence is machine-linked**: every token/contract carries `evidenceRefs` —
     JSON paths into `measured` (e.g. `componentSamples.interactives[2]`) — not prose.
   - **Type tokens are semantic roles**, not raw combos: `headline.lead/.card/.compact`,
     `title.section`, `body.standfirst`, `label.kicker`, `label.badge`, `metadata` —
     mapped from structural context (run `scripts/harvest-components.js`).
   - **Classify buttons by role before naming one "primary"**: an element with a
     `Move/Next/Previous` aria-label and no text is a carousel control, not a CTA.
     The real CTA usually has text, a distinct background, and appears in the header.
   - **Grid**: if you measure both a many-track named-line grid and a simpler one,
     report the former as the implementation grid and the latter as the recommended
     abstraction — never silently pick one.
   - **Breakpoints**: name them small/medium/large/wide/maximum, and note that base
     styles apply below the first breakpoint (mobile-first) — don't call a
     breakpoint "mobile".
   - **Radii**: classify every measured value (pill/circle/media) or list it under
     `rejected` with a reason — no silent drops.

## Output contract

```
snapshots/<hostname>/
  design-system.json      # measurements + your semantic interpretation
  page.html               # full rendered DOM
  page-full.png           # full-page screenshot
  components/
    components.json       # per-component: name, rect, outerHTML, screenshot
    NN-<name>.png         # one crop per component
```

## Quality bar

- Every hex value traceable to a computed style, not vision.
- No overlay in any captured screenshot.
- Every major visible section captured as a component.
- Note in `design-system.json` anything you skipped or couldn't verify
  (`"notes"` field) — silent gaps read as coverage.

## Gotchas

- Env: needs `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` exported before
  `browse open --remote` will work.
- `browse eval` returns the expression's value; async IIFEs are awaited.
- `--clip` is in **page coordinates**, but off-screen content renders blank —
  scroll the section into view first (`scrollTo(0, y-200)`, wait ~800ms), then
  clip at the section's page-y. A tiny/uniform PNG (<10KB for a big region) means
  you captured blank — look at every capture, never trust file creation alone.
- Sections taller than the viewport, or with scroll-reveal animations, come out
  half-dark: enlarge the viewport first (`browse viewport 1280 2600`) so the whole
  section fits, pre-scroll the page to fire the reveal animations, and pass
  `--animations disabled` when clipping.
- `-p` screenshot paths resolve relative to the daemon's cwd, not your shell's —
  always pass absolute paths.
- Sessions expire when idle. If commands time out, `browse stop -s <name>` and
  reopen; re-derive section rects on the fresh page (layouts shift between loads).
- Some sites legitimately have zero CSS variables (next/font aliasing) — the
  `fontFaces` inventory is the source of truth there.
- CSS-in-JS sites (emotion etc.) hide `:hover`/`:focus` rules from the CSSOM walk
  (nested rules); the structure probe falls back to parsing raw `<style>` text.
  If a probe section comes back empty on a site that visibly has that behavior,
  distrust the probe before concluding the site lacks it.
- Consent iframes (e.g. Sourcepoint on news sites) render in a child frame and
  don't appear in `browse snapshot`. Find the iframe rect via eval, zoom into its
  corner with a small `--clip` screenshot to locate the exact button, then
  `browse mouse click x y`. Verify dismissal by checking the iframe is gone.
