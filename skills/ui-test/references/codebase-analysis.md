# Codebase Hints — Quick Reference

Lightweight hints for understanding a frontend codebase before testing. Not a rigid pipeline — use what's useful, skip what's not.

## Detect the framework

```bash
cat package.json | grep -E '"(next|react|vue|nuxt|svelte|@sveltejs|angular|vite|remix|astro)"'
```

## Find routes

| Framework | Where to look |
|-----------|---------------|
| Next.js App Router | `app/**/page.{tsx,jsx}` |
| Next.js Pages Router | `pages/**/*.{tsx,jsx}` |
| React Router | Grep for `createBrowserRouter` or `<Route` |
| Vue/Nuxt | `pages/**/*.vue` |
| SvelteKit | `src/routes/**/+page.svelte` |

## Find interactive elements

These are high-value test targets:

```bash
# Forms
grep -r "onSubmit\|handleSubmit\|useForm\|<form" src/ --include="*.tsx" --include="*.jsx" -l

# Modals / dialogs
grep -r "Dialog\|Modal\|Sheet\|Drawer\|AlertDialog" src/components/ -l

# Destructive actions
grep -r "delete\|remove\|destroy\|revoke" src/components/ -l
```

## Check for existing tests

```bash
find . -name "*.test.*" -o -name "*.spec.*" | head -20
ls playwright.config.* jest.config.* vitest.config.* cypress.config.* 2>/dev/null
```

If the project already has Playwright/Cypress tests, focus on what they don't cover: accessibility, visual quality, responsive design, adversarial inputs, empty states.
