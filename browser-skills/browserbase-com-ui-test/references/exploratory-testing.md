# Exploratory Testing

Exploratory testing is agent-driven: you navigate the app freely using `browse` commands, making decisions about what to click, what to try, and what looks wrong — like a human QA tester.

## How It Works

Unlike test suite execution (structured tests against specific routes), exploratory testing is open-ended. The agent uses `browse snapshot` to understand the page, makes a judgment call on what to do next, acts, and observes the result.

## Workflow

```
1. browse open "TARGET_URL"
2. browse snapshot          → understand what's on the page
3. browse screenshot        → see what it looks like (Read the screenshot)
4. Decide: what looks wrong? What should I try?
5. browse click/fill/press  → interact
6. browse snapshot          → observe result
7. Repeat 4-6, navigating through the app freely
```

## What to Look For

### First Impressions (30 seconds)
- Is the purpose of this page immediately clear?
- Is there a clear visual hierarchy?
- Does anything look broken, misaligned, or out of place?
- Are there any console errors? (`browse eval "JSON.stringify(window.__logs || [])"`)

### Navigation Test
- Can you reach every major section from the current page?
- Does the back button work?
- Are breadcrumbs accurate?
- Are there any dead ends (pages with no way to navigate away)?
- Does the logo link to the homepage?

### Form Stress Test
- Try submitting empty forms
- Enter extremely long text (200+ characters)
- Enter special characters: `<script>alert('xss')</script>`, `"quotes"`, `emoji 🎉`
- Double-click submit buttons rapidly
- Tab through all fields — is the order logical?
- What happens when validation fails? Is the error helpful?

### State Persistence
- Fill a form halfway, navigate away, come back — is data preserved?
- Create an item, refresh the page — does it still exist?
- Apply filters, refresh — are filters preserved?
- Open a modal, press Escape — does it close cleanly?

### Edge Cases
- What does the page look like with no data (empty state)?
- What happens when you navigate to a URL that doesn't exist (404)?
- What happens with an expired session / no auth?
- Resize the viewport to mobile — does it still work?

### Performance Perception
- Does the page feel fast or sluggish?
- Are there loading indicators for slow operations?
- Does content pop in or load smoothly?

## Exploratory Testing Report Format

For each finding:
```
FINDING: [brief description]
SEVERITY: critical / high / medium / low
ROUTE: /path/where/found
EVIDENCE: [screenshot path or snapshot excerpt]
RECOMMENDATION: [specific fix suggestion]
```

Example:
```
FINDING: Settings page — "Regenerate API Key" button has no confirmation dialog
SEVERITY: high
ROUTE: /orgs/:slug/:projectId/settings/general
EVIDENCE: Clicked "Regenerate" and the key changed immediately with no warning
RECOMMENDATION: Add a confirmation dialog: "This will invalidate your existing key. Are you sure?"
```
