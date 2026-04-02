# ui-test — Agentic UI Testing Skill

Adversarial UI testing that catches what Playwright can't. Analyzes git diffs to test only what changed, or explores the full app to find bugs. Runs in a real browser via the `browse` CLI.

## Install

```bash
npx skills add browserbase/ui-test
```

## Quick Start

```
"Test the UI changes in my PR"         → diff-driven (Workflow A)
"Explore my app and find bugs"         → exploratory (Workflow B)
"QA the staging site in parallel"      → parallel Browserbase sessions (Workflow C)
```

## How It Works

1. **Analyzes the diff** (or explores the app) to decide what to test
2. **Opens a real browser** — a clean local browser for localhost by default, Browserbase for deployed sites
3. **Tries to break things** — adversarial inputs, rapid clicks, keyboard-only, empty states, XSS
4. **Runs deterministic checks** — axe-core, console errors, broken images, form labels
5. **Reports structured results** — `STEP_PASS|id|evidence` or `STEP_FAIL|id|expected → actual`
6. **Generates an HTML report** — standalone file with embedded screenshots, shareable with reviewers

## What It Tests

| Category | How | What Playwright Misses |
|----------|-----|----------------------|
| Accessibility | axe-core + keyboard nav | WCAG violations, focus rings, screen reader semantics |
| Visual Quality | Screenshot + Claude judgment | Layout balance, typography, spacing, empty states |
| Responsive | Viewport sweep (375px, 768px, 1440px) | Mobile overflow, touch targets, content reflow |
| Console Health | `browse eval` injection | Hydration errors, failed requests, runtime exceptions |
| Error States | Navigate to empty/error states | Missing empty states, broken error recovery |
| Adversarial | XSS, empty submit, rapid click, long input | Edge cases developers don't write tests for |
| Exploratory | Navigate freely, try to break things | Bugs you didn't think to test for |

## Browser Execution

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

- **Localhost** → `browse env local` (clean isolated local browser, no API key needed)
- **Need local login/cookies** → `browse env local --auto-connect`
- **Deployed sites** → `browse env remote` (uses Browserbase cloud browsers)
- **Parallel** → `BROWSE_SESSION=<name>` for independent concurrent sessions

## Project Structure

```
ui-test/
├── SKILL.md                              # Skill definition — workflows, assertion protocol, budget
├── EXAMPLES.md                           # 9 worked examples with exact commands
├── README.md
└── references/
    ├── adversarial-patterns.md           # Adversarial test patterns (forms, modals, nav, keyboard)
    ├── browser-recipes.md                # Copy-paste browse CLI recipes for deterministic checks
    ├── design-consistency.md             # Design consistency checking methodology
    ├── design-system.example.md          # Example design system template (copy to design-system.md)
    ├── exploratory-testing.md            # Guide for agent-driven exploratory QA
    ├── parallel-testing.md              # Parallel testing with named Browserbase sessions
    ├── report-template.html              # HTML report template with embedded screenshots
    └── ux-heuristics.md                  # 6 evaluation frameworks (Laws of UX, Nielsen's, etc.)
```

## Philosophy

Traditional tests verify **intentions**. This skill finds **blind spots**.

No YAML files, no generated test suites, no artifacts. The agent reads the diff (or explores the app), opens a browser, tries to break things, and reports what it found. Like a human QA tester with perfect knowledge of every design principle.

## Requirements

- `browse` CLI (`npm install -g @browserbasehq/browse-cli`)
- For remote testing: `BROWSERBASE_API_KEY` environment variable
- A running web app (localhost or deployed URL)
