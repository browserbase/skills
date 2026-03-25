---
name: ui-test
description: AI-powered UI testing that catches what Playwright can't — visual quality, accessibility, UX heuristics, responsive design, and exploratory bug finding. Reads the codebase to generate an evolving test suite, runs tests via Browserbase cloud browsers using the browse CLI.
license: MIT
metadata:
  author: browserbase
  version: "0.1.0"
allowed-tools: Bash, Read, Write, Glob, Grep, Agent
---

# UI Test — Agentic UI Testing Skill

Generate and run intelligent UI tests against any web application. Reads your codebase to understand what your app does, finds what your existing tests miss, and fills the gaps with agentic browser testing via Browserbase.

## Commands

```
/ui-test generate --url https://my-app.vercel.app     # Create test suite from codebase
/ui-test generate --url http://localhost:3000 --update  # Update existing suite after code changes
/ui-test run                                            # Run full suite
/ui-test run --category accessibility                   # Run specific category
/ui-test explore --url https://my-app.vercel.app        # Exploratory testing (no suite needed)
```

## Browser Execution

All tests run via the `browse` CLI against Browserbase cloud browsers. Every session is recorded with a replay link.

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

### Core Pattern: snapshot → act → verify

```bash
browse open "https://example.com"     # navigate
browse snapshot                        # get accessibility tree with element refs
browse click @0-5                      # click element by ref
browse screenshot /tmp/result.png      # capture result
```

### Quick Reference

| Task | Command |
|------|---------|
| Navigate | `browse open <url>` |
| Accessibility tree | `browse snapshot` |
| Screenshot | `browse screenshot /tmp/shot.png [--full-page]` |
| Click element | `browse click <ref>` (ref from snapshot, e.g. `@0-5`) |
| Fill form field | `browse fill "input[name=email]" "user@test.com"` |
| Type text | `browse type "some text"` |
| Press key | `browse press Tab`, `browse press Enter`, `browse press Escape` |
| Set viewport | `browse viewport 375 812` |
| Scroll | `browse scroll 0 0 0 500` (scroll down 500px) |
| Run JavaScript | `browse eval "document.title"` |
| Get page text | `browse get text` |
| Get page URL | `browse get url` |
| Wait for load | `browse wait load` |
| Wait for element | `browse wait selector ".loaded"` |
| Stop browser | `browse stop` |

### Deterministic Check Recipes

See [references/browser-recipes.md](references/browser-recipes.md) for copy-paste recipes:
- Inject axe-core and run WCAG accessibility audit
- Measure performance metrics (LCP, FCP, load time)
- Check for broken images
- Capture console errors
- Keyboard navigation (Tab through all elements)
- Responsive screenshot sweep (mobile/tablet/desktop)

## Activity-Based Reference Guide

Consult these references based on what you're doing:

| Activity | Reference |
|----------|-----------|
| **Generating test suite from codebase** | [references/codebase-analysis.md](references/codebase-analysis.md) |
| **Running accessibility tests** | [references/browser-recipes.md](references/browser-recipes.md) + [rules/ux-heuristics.md](rules/ux-heuristics.md) §6 |
| **Evaluating visual quality** | [rules/ux-heuristics.md](rules/ux-heuristics.md) §5 (Visual Design) |
| **Running responsive tests** | [references/browser-recipes.md](references/browser-recipes.md) §Responsive |
| **Checking console health** | [references/browser-recipes.md](references/browser-recipes.md) §Console |
| **Applying UX heuristics** | [rules/ux-heuristics.md](rules/ux-heuristics.md) §1 (Laws of UX) + §2 (Nielsen's) |
| **Testing error states & edge cases** | [rules/ux-heuristics.md](rules/ux-heuristics.md) §3 (Error States) |
| **Evaluating data displays (tables, charts)** | [rules/ux-heuristics.md](rules/ux-heuristics.md) §4 (Data Display) |
| **Exploratory testing** | [references/exploratory-testing.md](references/exploratory-testing.md) |
| **Updating an existing suite** | [references/codebase-analysis.md](references/codebase-analysis.md) §8 (Autonomous Updates) |

## Test Categories

| Category | How | What Playwright Misses |
|----------|-----|----------------------|
| Accessibility | axe-core via `browse eval` + keyboard nav via `browse press Tab` | WCAG violations, focus rings, screen reader semantics |
| Visual Quality | `browse screenshot` → Read tool → evaluate against heuristics | Layout balance, typography, spacing, empty states |
| Responsive | `browse viewport` at 375/768/1440 + screenshots | Mobile usability, touch targets, content overflow |
| Console Health | `browse eval` to capture errors | Hydration errors, failed requests, deprecation warnings |
| UX Heuristics | `browse snapshot` + screenshots → evaluate against Laws of UX + Nielsen's | Cognitive overload, Fitts's Law, system status |
| Error States | Navigate to empty/error states via `browse` | Missing empty states, broken error recovery, form edge cases |
| Data Display | `browse snapshot` on tables/dashboards → evaluate | Column alignment, pagination, number formatting, empty tables |
| Exploratory | `browse snapshot` → decide → `browse click` → repeat | Bugs you didn't think to test for |

## Test Suite Format

Tests are stored in `.ui-tests/suite.yml`:

```yaml
version: 1
base_url: https://my-app.vercel.app
generated_from: ./src
generated_at: 2026-03-24T12:00:00Z

tests:
  - name: Settings page — keyboard accessibility
    category: accessibility
    priority: high
    target: /settings
    auth_required: true
    intent: >
      Tab through all interactive elements on the settings page.
      Verify focus rings are visible, tab order is logical,
      and axe-core reports zero critical violations.
    pass_criteria:
      - "All elements reachable via Tab"
      - "Zero critical axe-core violations"
      - "Focus rings visible on all interactive elements"
```

## Output Format

Results saved to `.ui-tests/results/TIMESTAMP/`:

```
.ui-tests/
  suite.yml              # Test definitions
  coverage-map.md        # Route × category coverage
  results/
    2026-03-24T16-30-00/
      summary.md         # Human-readable results
      screenshots/       # Evidence screenshots
```

Each result includes: pass/fail/warning status, screenshots, Browserbase session replay link, findings with severity, and suggested fixes.

## Configuration

Optional `.ui-tests/config.yml`:

```yaml
auth:
  context_id: "03c8b7b4-..."   # Browserbase persistent context (pre-authenticated)

viewports:
  mobile: { width: 375, height: 812 }
  tablet: { width: 768, height: 1024 }
  desktop: { width: 1440, height: 900 }
```

## Philosophy

Traditional tests verify your **intentions** — "does the button I built work?"
This skill verifies your **blind spots** — "what did I forget to check?"

Every test is a fresh agentic run. No cached scripts, no brittle selectors. Claude reads the page via `browse snapshot`, looks at it via `browse screenshot`, and judges it against UX heuristics — like a human QA tester with perfect knowledge of every design principle.
