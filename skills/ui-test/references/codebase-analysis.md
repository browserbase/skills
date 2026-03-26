# Codebase Analysis — How to Generate a Test Suite

This reference guides the agent through reading a frontend codebase and generating a UI test suite that covers what existing tests miss.

## Step 1: Discover the App Structure

**Detect framework:**
```
Read package.json → look for next, react, vue, svelte, angular, remix, astro in dependencies
Glob: next.config.*, vite.config.*, nuxt.config.*, remix.config.*, angular.json
```

**Discover all user-facing routes:**
```
# Next.js App Router
Glob: src/app/**/page.{tsx,jsx,ts,js}
Glob: app/**/page.{tsx,jsx,ts,js}
# Each page.tsx = a route. Directory path = URL path.
# e.g., src/app/orgs/[slug]/settings/page.tsx → /orgs/:slug/settings

# Next.js Pages Router
Glob: src/pages/**/*.{tsx,jsx,ts,js}

# React Router
Grep: "Route" or "createBrowserRouter" in src/ → read the router config

# Vue Router
Grep: "path:" in src/router/ → read router/index.ts

# Static / Astro
Glob: src/pages/**/*.{astro,html}
```

**Build a route map** — for each route record:
- URL pattern (e.g., `/orgs/:slug/:projectId/sessions`)
- Dynamic segments (`:slug`, `[id]`)
- Page component file path
- Whether it requires authentication

## Step 2: Understand What the App Does

**Read documentation:**
```
Read: CLAUDE.md, README.md, AGENTS.md at project root
Glob: docs/**/*.md, PRD*.md, spec*.md, PLAN*.md, REQUIREMENTS*.md
```

These tell you the app's PURPOSE — what problems it solves, who uses it, what the key workflows are. Critical for generating test intents that match real user behavior.

**Read the data model:**
```
Glob: src/models/**/*.{ts,js}, src/schema/**/*.{ts,js}, prisma/schema.prisma
Glob: src/types/**/*.{ts,js}, src/interfaces/**/*.{ts,js}
Glob: src/app/api/**/route.{ts,js}
```

**Detect feature flags:**
```
Grep: "featureFlag" or "launchDarkly" or "posthog.isFeatureEnabled" in src/
```

## Step 3: Map Interactive Components

**Forms (highest test value):**
```
Grep: "<form" or "onSubmit" or "handleSubmit" in src/
Grep: "useForm" or "react-hook-form" or "formik" or "zod" in src/components/
Grep: "<input" or "<select" or "<textarea" in src/components/
```

**Navigation:**
```
Grep: "<nav" or "sidebar" or "navbar" or "Breadcrumb" in src/components/
Grep: "<Link" or "useRouter" or "useNavigate" in src/components/
```

**Modals & dialogs:**
```
Grep: "Dialog" or "Modal" or "Sheet" or "Drawer" or "AlertDialog" in src/components/
```

**Tables & data displays:**
```
Grep: "<table" or "DataTable" or "columns" or "useTable" in src/components/
Grep: "pagination" or "pageSize" or "sortBy" or "filter" in src/
```

**Destructive actions:**
```
Grep: "delete" or "remove" or "destroy" or "revoke" or "regenerate" in src/components/
```

**Copy/clipboard:**
```
Grep: "copy" or "clipboard" or "navigator.clipboard" in src/components/
```

**Toasts/notifications:**
```
Grep: "toast" or "Sonner" or "notification" or "alert" in src/components/
```

## Step 4: Analyze Existing Test Coverage

**Find all existing tests:**
```
Glob: **/*.test.{ts,tsx,js,jsx}
Glob: **/*.spec.{ts,tsx,js,jsx}
Glob: tests/**/*.{ts,tsx,js,jsx}
Glob: e2e/**/*.{ts,tsx,js,jsx}
Glob: cypress/**/*.{ts,tsx,js,jsx}
```

**Read test config:**
```
Glob: playwright.config.*, jest.config.*, vitest.config.*, cypress.config.*
```

**For each test file, extract:**
- What route/page does it test?
- What user flows does it cover? (sign-in, CRUD, navigation)
- What assertions does it make? (DOM presence? URL? Visual?)
- What it does NOT cover (most existing tests are functional only)

**Build a coverage gap map:**

| Route | Existing Tests | What They Cover | Gaps (skill fills) |
|-------|---------------|-----------------|-------------------|
| `/sign-in` | sign-in.test.ts | Form submission, redirect | Accessibility, visual, responsive |
| `/dashboard` | routing.test.ts | Admin can access | Visual, empty states, loading, responsive |
| `/settings` | settings.test.ts | Copy key, regenerate | Accessibility, responsive, visual |
| `/sessions` | (none) | (nothing) | Full coverage needed |

**Prioritize routes with ZERO existing coverage.**

## Step 5: Visit the Live App

Before generating tests, see what's actually rendered:

```bash
browse open "BASE_URL/route"
browse wait load
browse snapshot        # what's on the page?
browse screenshot /tmp/route-name.png --full-page   # what does it look like?
```

Do this for each discovered route. This reveals:
- Dead routes (exist in code but 404 in browser)
- Feature-flagged pages (code exists but not rendered)
- Actual content vs what component names suggest

## Step 6: Generate the Test Suite

**Which categories to generate per route:**

| Route has... | Generate |
|-------------|----------|
| No existing tests | All categories |
| Only functional tests | Accessibility, visual, responsive, console, UX heuristics, error states |
| Forms | + Form validation, keyboard nav, error states, required fields |
| Tables | + Responsive (tables on mobile), empty states, pagination, data formatting |
| Modals | + Focus trapping, escape-to-close, keyboard |
| Destructive actions | + Confirmation dialogs |
| Auth-gated content | + Test both authenticated and unauthenticated states |

**Test case quality — every test MUST include:**
- `name` — descriptive, includes the page and aspect tested
- `category` — accessibility, visual, responsive, console, ux-heuristics, error-states, data-display, exploratory
- `priority` — critical, high, medium, low
- `target` — URL path
- `auth_required` — boolean
- `intent` — 2-5 sentences describing what to check and what passes/fails
- `pass_criteria` — explicit list

**GOOD intent:**
```yaml
intent: >
  Tab through all interactive elements on the settings page.
  Verify the API key copy button has an aria-label, the show/hide
  toggle announces its state change, and all elements have visible
  focus rings. Run axe-core for WCAG AA violations.
```

**BAD intent:**
```yaml
intent: Make sure the settings page works.
```

## Step 7: Save the Suite

Write to `.ui-tests/suite.yml` and `.ui-tests/coverage-map.md`:

```markdown
# Test Coverage Map
Generated: 2026-03-24
Total routes: 15 | Existing tests: 19 (functional) | Generated tests: 42

| Route | Existing | Generated | Categories |
|-------|----------|-----------|------------|
| /sign-in | 2 | +3 | 5/7 |
| /sessions | 0 | +6 | 7/7 |
```

## Step 8: Autonomous Suite Updates

When invoked with `--update`:

1. **Diff the codebase:**
   ```
   Read .ui-tests/suite.yml → get generated_at timestamp
   git diff --name-only --since="TIMESTAMP" -- src/
   ```

2. **Classify changes:**
   - New `page.tsx` → generate tests for new route
   - Component modified → check if test intents need updating
   - Route deleted → remove obsolete tests
   - New form/modal/table → generate targeted tests

3. **Propose updates:**
   ```
   NEW (2): "Checkout — accessibility", "Checkout — responsive"
   UPDATED (1): "Settings — form validation" (new field added)
   DEPRECATED (0): none
   Accept? [y/n]
   ```

4. After approval, update suite and bump `generated_at`.
