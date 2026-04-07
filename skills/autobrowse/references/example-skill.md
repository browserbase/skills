---
task: sf-311-request
graduated: 2026-04-07
iterations: 17
pass_rate: 3/3 (runs 021-023)
env: remote
---

# SF 311 Pothole Report — Browser Skill

## Purpose

Submit an anonymous pothole / street defect report to San Francisco's 311 system. Navigates the Verint form hosted at `sanfrancisco.form.us.empro.verintcloudservices.com`, enters location via ESRI map search, selects "Pothole or pavement defect" category, and captures the Service Request Number from the confirmation page.

## When to Use

Use this skill when you need to:
- Submit a pothole or street defect report to SF 311
- Navigate the SF 311 Verint form system for public works issues
- Demonstrate anonymous form submission on sfgov.org infrastructure

## Quick Start

```bash
# Run with isolated remote session
tsx scripts/evaluate.ts --task sf-311-request --env remote
```

Expected output:
```json
{
  "success": true,
  "confirmation_number": "101003821474",
  "category_selected": "Pothole or pavement defect",
  "location_entered": "INTERSECTION OF 7TH ST & CHARLES J BRENHAM PL SAN FRANCISCO, CA 94102",
  "submission_method": "anonymous",
  "error_reasoning": null
}
```

## Browse CLI Reference

All commands MUST use `--session sf311` to avoid contamination from the shared default Browserbase session:

```bash
browse --session sf311 stop
browse --session sf311 env local
browse --session sf311 env remote
browse --session sf311 open <url>
browse --session sf311 wait load
browse --session sf311 wait timeout <ms>
browse --session sf311 snapshot
browse --session sf311 click <ref>
browse --session sf311 click "//xpath"
browse --session sf311 type <text>
browse --session sf311 press Enter
browse --session sf311 press Tab
browse --session sf311 select "//select" <value>
browse --session sf311 fill "#css-id" <text> --no-press-enter
```

## Workflow

**Turn budget: exactly 30 turns. Follow precisely.**

### Startup (5 turns)

```bash
browse --session sf311 stop
browse --session sf311 env local        # REQUIRED: forces new Browserbase session
browse --session sf311 env remote       # restarted:true = clean session
browse --session sf311 open "https://sanfrancisco.form.us.empro.verintcloudservices.com/form/auto/pw_street_sidewalkdefect?Issue=street_defect&Nature_of_request=pavement_defect"
browse --session sf311 wait load
```

### Page 1 — Disclaimer (2 turns)

```bash
browse --session sf311 snapshot         # find Next button ref (~0-385 or 0-386)
browse --session sf311 click <Next ref> # click by ref, not XPath
```

### Page 2 — Location (11 turns)

```bash
browse --session sf311 click "//label[normalize-space(.)='Street']"
browse --session sf311 click "//input[@placeholder='Find address or place']"
browse --session sf311 type "Market St & 7th St, San Francisco, CA 94103"
browse --session sf311 wait timeout 2000
browse --session sf311 snapshot         # find autocomplete menuitem (~0-2510)
browse --session sf311 click <menuitem ref>
browse --session sf311 press Enter
browse --session sf311 wait timeout 3000
browse --session sf311 press Tab
browse --session sf311 snapshot         # verify Location field, find Next ref (~0-685)
browse --session sf311 click <Next ref from snapshot>
```

### Page 3 — Request Details (3 turns)

```bash
browse --session sf311 select "//select" "Pothole or pavement defect"
browse --session sf311 fill "#dform_widget_Request_description" "Large pothole approximately 12 inches wide near the crosswalk, causing hazard for cyclists" --no-press-enter
browse --session sf311 click 0-970      # stable ref, no snapshot needed
```

### Page 4 — Contact (4 turns)

```bash
browse --session sf311 snapshot         # find anonymous radio ref (~0-58, 0-141, or 0-142)
browse --session sf311 click <anonymous radio ref>
browse --session sf311 snapshot         # find Report Anonymously button (~0-1117)
browse --session sf311 click <Report Anonymously ref>
```

### Review + Submit + Confirm (4 turns)

```bash
browse --session sf311 snapshot         # review page — find Submit ref (~0-1496)
browse --session sf311 click <Submit ref>
browse --session sf311 wait load
browse --session sf311 snapshot         # confirmation page shows Service Request Number
```

**Turn 30: Output the final JSON immediately — NO MORE TOOL CALLS.**

## Site-Specific Gotchas

1. **Shared Browserbase session contamination**: The default session has tabs open from other demo tasks (Assessment Appeals, Business Registration, etc.) that redirect all navigations. Fix: always use `--session sf311`.

2. **Verint session opening extra tabs**: The sf311 Verint session also has prior Assessment Appeals state that causes it to open a new tab for that form when clicking Next. Fix: the isolated `sf311` session prevents this entirely.

3. **Dead session on reconnect**: After a session ends, `browse env remote` reconnects to the same dead Browserbase session (no pages). Fix: `env local` then `env remote` forces creating a fresh session.

4. **Location field is map-driven**: The Location textarea is populated by the ESRI geocoder, not by typing. Workflow: type in search box → wait for autocomplete → click suggestion → Enter → wait 3000ms → Tab → Location populates automatically.

5. **XPath Next button fails**: `//button[normalize-space(.)='Next']` XPath fails to advance pages on this Verint form. Always click Next by ref from snapshot.

6. **Page 3 textarea by CSS ID**: The Request Description textarea has stable `id="dform_widget_Request_description"`. Use `browse fill "#dform_widget_Request_description" <text> --no-press-enter` — faster and reliable.

7. **Anonymous radio ref varies**: The "No, I want to remain anonymous" radio ref changes between sessions (0-58, 0-59, 0-141, 0-142). Always snapshot page 4 first to get the current ref.

8. **Report Anonymously button**: Only appears after clicking the anonymous radio. Snapshot first to get ref (~0-1117 is common).

## Failure Recovery

- **"No Page found for awaitActivePage"**: Session has no pages. Run `env local` + `env remote` to force new session.
- **Page 2 Next doesn't advance** (stays on page 2): The Street radio may not have been recognized. Re-snapshot, get fresh Next ref, try again.
- **Location field empty after Enter+Tab**: Geocoding took too long. Repeat Enter → wait 3000 → Tab sequence.
- **Wrong page after startup** (Assessment Appeals, Accela): Using default session. Ensure all commands use `--session sf311`.

## Expected Output

```json
{
  "success": true,
  "confirmation_number": "101003821474",
  "category_selected": "Pothole or pavement defect",
  "location_entered": "INTERSECTION OF 7TH ST & CHARLES J BRENHAM PL SAN FRANCISCO, CA 94102",
  "submission_method": "anonymous",
  "gotchas": [
    "Use --session sf311 (named session) to avoid contaminated default Browserbase session",
    "env local + env remote forces a fresh Browserbase session",
    "Location field is map-driven: type in ESRI search box, click autocomplete, Enter → wait 3000ms → Tab",
    "XPath Next buttons fail — always snapshot first and use ref ID",
    "Page 3 description: use CSS selector #dform_widget_Request_description with fill --no-press-enter",
    "Page 3 Next ref 0-970 is stable — no snapshot needed before clicking"
  ],
  "error_reasoning": null
}
```
