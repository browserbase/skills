# ui-test — Agentic UI Testing Skill

AI-powered UI testing that catches what Playwright can't. Reads your codebase to generate an evolving test suite, runs tests in Browserbase cloud browsers, and autonomously updates as your app changes.

## Install

```bash
npx skills add browserbase/ui-test
```

## Quick Start

```bash
/ui-test generate --url https://my-app.vercel.app   # generate test suite from codebase
/ui-test run                                          # run the suite
/ui-test explore --url https://my-app.vercel.app      # exploratory testing (no suite needed)
```

## How It Works

1. **Reads your codebase** — routes, components, forms, modals, tables, docs
2. **Maps existing test coverage** — finds what Playwright/Jest already covers and what's missing
3. **Generates a test suite** — `.ui-tests/suite.yml` with tests that fill the gaps
4. **Runs tests via Browserbase** — `browse` CLI against cloud browsers with session recording
5. **Evolves autonomously** — diffs codebase on re-runs, proposes new/updated tests

## What It Tests

| Category | How | What Playwright Misses |
|----------|-----|----------------------|
| Accessibility | axe-core + keyboard nav | WCAG violations, focus rings, screen reader semantics |
| Visual Quality | Screenshot → Claude judges | Layout balance, typography, spacing, empty states |
| Responsive | Screenshots at 3 viewports | Mobile usability, touch targets, content overflow |
| Console Health | JS injection via `browse eval` | Hydration errors, failed requests, deprecation warnings |
| UX Heuristics | Snapshot + screenshots → Laws of UX + Nielsen's | Cognitive overload, Fitts's Law, system status |
| Error States | Navigate to empty/error states | Missing empty states, broken error recovery |
| Data Display | Inspect tables/dashboards | Column alignment, pagination, number formatting |
| Exploratory | Snapshot → decide → click → repeat | Bugs you didn't think to test for |

## Browser Execution

All tests use the `browse` CLI — lightweight, no Node.js dependency, connects to Browserbase cloud browsers natively. Claude is the AI layer: it reads snapshots, looks at screenshots, and judges against UX heuristics.

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

## Project Structure

```
ui-testing-skill/
├── SKILL.md                                    # Skill definition (lightweight entry point)
├── README.md
├── rules/
│   └── ux-heuristics.md                        # 6 evaluation frameworks (Laws of UX, Nielsen's,
│                                               #   error states, data display, visual design, a11y)
├── references/
│   ├── browser-recipes.md                      # Copy-paste browse CLI recipes for each check
│   ├── codebase-analysis.md                    # 8-step guide to generating test suites from code
│   └── exploratory-testing.md                  # Guide for agent-driven exploratory QA
├── examples/
│   └── browserbase-dashboard-suite.yml         # Example suite (BB dashboard)
└── .ui-tests/                                  # Generated per-project
    ├── suite.yml                               # Test definitions
    ├── coverage-map.md                         # Route × category coverage
    └── results/                                # Timestamped test results
```

## Philosophy

Traditional tests verify your **intentions**. This skill verifies your **blind spots**.

Every test is a fresh agentic run. Claude reads the page via `browse snapshot`, looks at it via `browse screenshot`, and judges it against UX heuristics — like a human QA tester with perfect knowledge of every design principle.

## Requirements

- `browse` CLI (`npm install -g @browserbasehq/browse-cli`)
- `BROWSERBASE_API_KEY` environment variable (for cloud sessions)
- A running web app (localhost or deployed URL)
