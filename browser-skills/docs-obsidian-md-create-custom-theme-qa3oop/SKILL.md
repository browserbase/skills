---
name: docs-obsidian-md-create-custom-theme-qa3oop
title: Create a Custom Obsidian Theme
description: >-
  Extract the complete, ordered instructions from the Obsidian Developer
  Documentation for building a custom Obsidian app theme — required files,
  manifest fields, CSS-variable styling, embedding assets, GitHub release
  automation, and community submission.
website: docs.obsidian.md
category: developer-docs
tags:
  - obsidian
  - themes
  - css
  - documentation
  - developer
  - tutorial
source: 'browserbase: agent-runtime 2026-07-01'
updated: '2026-07-01'
recommended_method: fetch
alternative_methods:
  - method: browser
    rationale: >-
      docs.obsidian.md is an Obsidian Publish SPA. Driving it in a browser works
      (each doc page renders after ~2-3s of JS hydration) but is far heavier
      than fetching the raw markdown directly, and `browse get text body`
      returns only the pre-hydration shell if you snapshot too early.
verified: false
proxies: false
---
# Create a Custom Obsidian Theme

## Purpose

Return the complete, ordered, authoritative procedure for building a custom **Obsidian app theme**, sourced from the Obsidian Developer Documentation (`docs.obsidian.md`): the required files, the `manifest.json` schema, how styling is done through built-in CSS variables (light/dark/`:root`), how to embed assets offline, how to automate GitHub releases, and how to submit to the community directory. Read-only — this skill only reads documentation; it never edits a vault, submits a theme, or drives the Obsidian app itself.

`docs.obsidian.md` is an **Obsidian Publish** site (a JS-rendered SPA). Its page content is served as **raw markdown** from a public, unauthenticated Publish access API, so the fastest and most reliable path is to `fetch` the markdown directly rather than render the SPA in a browser.

## When to Use

- A user asks "how do I create / build / make a theme for Obsidian?" and wants a step-by-step answer.
- An agent needs the canonical `manifest.json` fields for a theme, or the exact CSS-variable override pattern (`body` vs `.theme-light`/`.theme-dark` vs `:root`).
- Bootstrapping or scaffolding an Obsidian theme repo, wiring up the GitHub Actions release workflow, or preparing a community-directory submission.
- Any time you'd otherwise scrape the rendered docs pages — the markdown API is faster, cheaper, and structurally cleaner.

## Workflow

The site is a thin Obsidian Publish SPA. Every doc page is fetchable as raw markdown from the Publish access API — **no auth, no cookies, no anti-bot, no residential proxy required** (verified with a bare `browse cloud fetch`, HTTP 200). Lead with the fetch path.

**Site UID (stable):** `caa27d6312fe5c26ebc657cc609543be`
**Raw-markdown endpoint:** `https://publish-01.obsidian.md/access/<UID>/<PATH>.md`

### 1. (Optional) Discover the page tree

The full navigation tree + ordering lives in the site options blob:

```
GET https://publish-01.obsidian.md/options/caa27d6312fe5c26ebc657cc609543be
```

Its `navigationOrdering[]` array lists explicitly-ordered pages; unordered pages fall back to alphabetical. The app-theme pages live under `Themes/App themes/` (distinct from `Themes/Obsidian Publish themes/`, which is a different topic).

### 2. Fetch the theme docs as markdown

Spaces in the path are **URL-encoded as `%20`** (the access API rejects raw spaces with `400 url must match format "uri"`). Fetch these pages:

| Page | Path (append `.md`, URL-encode spaces) |
|---|---|
| Build a theme (main tutorial) | `Themes/App themes/Build a theme` |
| Theme guidelines | `Themes/App themes/Theme guidelines` |
| Embed fonts and images in your theme | `Themes/App themes/Embed fonts and images in your theme` |
| Release your theme with GitHub Actions | `Themes/App themes/Release your theme with GitHub Actions` |
| Submit your theme | `Themes/App themes/Submit your theme` |
| Manifest schema | `Reference/Manifest` |
| About styling | `Reference/CSS variables/About styling` |
| CSS variables (400+ vars) | `Reference/CSS variables/CSS variables` |

```bash
UID=caa27d6312fe5c26ebc657cc609543be
browse cloud fetch "https://publish-01.obsidian.md/access/$UID/Themes/App%20themes/Build%20a%20theme.md"
# The JSON envelope's `content` field is the raw markdown. A non-existent
# page returns HTTP 200 with body "## Not Found\n\nFile X.md does not exist."
```

### 3. Synthesize the theme-creation procedure

The authoritative flow the docs describe:

1. **Download the sample theme** into your vault's themes folder: `cd <vault>/.obsidian/themes` then `git clone https://github.com/obsidianmd/obsidian-sample-theme.git "Sample Theme"`. (The repo is a GitHub *template*, so you can also "Use this template" to create your own.)
2. **Enable it** in Obsidian: **Settings → Appearance → Themes → Sample Theme**.
3. **Edit `manifest.json`** — set `name` to your theme's human-friendly display name, then rename the theme directory under `themes/` to **exactly match** `name`. Restart Obsidian after any `manifest.json` change.
4. **Style via CSS variables in `theme.css`** — Obsidian exposes 400+ CSS variables. Override:
   - theme-agnostic values (fonts, sizes) under `body { --font-text-theme: Georgia, serif; }`
   - color-scheme colors under `.theme-dark { --background-primary: #18004F; }` and `.theme-light { --background-primary: #ECE4FF; }`
   - variables that must reach every child element (often plugin/input vars) under `:root { --input-hover-border-color: red; }` — use sparingly.
   `theme.css` changes hot-reload without restarting Obsidian (unlike `manifest.json`).
5. **Discover which variable styles an element** via DevTools (`Ctrl/Cmd+Shift+I`): **Sources → top → obsidian.md → app.css** (scroll to top for the full variable list; search `"  --prefix"` with two leading spaces to find *definitions*), or use the element picker and read the **Styles** panel (e.g. `background-color: var(--ribbon-background)`).
6. **Keep assets local** — community themes may not load remote content. Embed fonts/images as base64 **data URLs**: `url("data:<MIME>;base64,<DATA>")`.
7. **Automate releases with GitHub Actions** — add `.github/workflows/release.yml` triggered on tag push, running `gh release create "$tag" --generate-notes --draft manifest.json theme.css`. Then `git tag -a x.y.z -m "x.y.z" && git push origin x.y.z`, and publish the resulting draft release.
8. **Submit to the community directory** — ensure the repo root has `README.md`, `LICENSE`, a screenshot (~512×288 px), and `manifest.json`; create a GitHub release whose tag matches `manifest.json`'s `version`; then at [community.obsidian.md](https://community.obsidian.md) sign in, link GitHub, **Themes → New theme**, enter the repo URL, agree to the Developer policies, and **Submit**.

### 4. `manifest.json` fields (theme)

From `Reference/Manifest`. A theme manifest uses only the **shared** properties (the `description`/`id`/`isDesktopOnly` fields are **plugin-only** and do not apply to themes):

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name; must exactly match the theme's directory name. Cannot be changed after submission. Basic-Latin only, no emoji/special chars (hyphen/`+`/parens allowed). |
| `version` | yes | Semantic Versioning, strictly `x.y.z`. The release tag must equal this. |
| `author` | yes | Author name. |
| `minAppVersion` | yes | Minimum supported Obsidian version. |
| `authorUrl` | no | Author website. |
| `fundingUrl` | no | String or object of funding links. |

### Browser fallback

If the markdown API is ever unreachable, drive the rendered SPA:

```bash
browse open "https://docs.obsidian.md/Themes/App+themes/Build+a+theme" --remote
browse wait load --remote
browse wait timeout 3000 --remote   # SPA hydrates ~2-3s AFTER load fires
browse get markdown body --remote   # prefer markdown/text AFTER the wait
```

Note the rendered-URL form uses **`+` for spaces** (e.g. `/Themes/App+themes/Build+a+theme`), unlike the `%20` of the raw access API. A bare (non-proxied) session renders these pages fine; the autobrowse validation run used `--proxies` and also succeeded.

## Site-Specific Gotchas

- **It's an Obsidian Publish SPA, not static HTML.** A plain fetch of `https://docs.obsidian.md/<page>` returns a ~2.7 KB JS shell, not the article. The real content is the `content` field of `https://publish-01.obsidian.md/access/<UID>/<PATH>.md`.
- **Two different URL encodings.** The raw access API needs **`%20`** for spaces and returns `400 url must match format "uri"` on raw spaces. The rendered `docs.obsidian.md` URLs use **`+`** for spaces. Don't mix them.
- **404s masquerade as 200.** A missing markdown page returns HTTP 200 with body `## Not Found\n\nFile <path>.md does not exist.` — check the body, not just the status. This is how the wrong path guesses (`Themes/Build a theme.md`) were ruled out; the real tree is `Themes/App themes/...`.
- **`navigationOrdering` is partial.** The options blob only lists explicitly-ordered pages (e.g. it omits several `Themes/App themes/` pages that clearly exist). Don't treat it as the complete file list — probe expected paths directly or read the rendered sidebar.
- **`browse get text body` too early returns the preload shell.** During the browser run, snapshotting before hydration yielded only the inline `(function(){let t=localStorage.getItem('site-theme')...})` bootstrap script instead of article text. Always `wait load` + `wait timeout ~3000` before extracting on the browser path.
- **No auth / no proxy needed for the markdown API.** Cloudflare fronts the site (the pre-run probe flagged `likelyNeedsProxies: true` for the homepage), but the Publish access + options endpoints returned 200 on a bare `browse cloud fetch`. `verified`/`proxies` are not required for the recommended fetch path.
- **`manifest.json` changes require an Obsidian restart; `theme.css` changes hot-reload.** Renaming the theme requires the directory name to exactly equal `manifest.json`'s `name`.
- **App themes ≠ Publish themes.** `Themes/App themes/` (this skill) covers the desktop/mobile app; `Themes/Obsidian Publish themes/` is a separate topic for styling published sites — don't conflate them.
- **Submission has two coupled requirements.** The community directory reads `manifest.json` at the default branch HEAD, but installs pull `manifest.json` + `theme.css` from the **GitHub release** whose tag matches the manifest `version`. Both the committed manifest and a matching-tag release must exist.

## Expected Output

```json
{
  "success": true,
  "source": "docs.obsidian.md (Obsidian Developer Documentation)",
  "sample_repo": "https://github.com/obsidianmd/obsidian-sample-theme",
  "required_files": ["manifest.json", "theme.css"],
  "manifest_required_fields": ["name", "version", "author", "minAppVersion"],
  "manifest_optional_fields": ["authorUrl", "fundingUrl"],
  "styling_method": "Override built-in CSS variables in theme.css: `body` for theme-agnostic values (fonts/sizes), `.theme-light`/`.theme-dark` for color-scheme colors, `:root` sparingly for variables that must reach every child element.",
  "steps": [
    "Clone obsidian-sample-theme into <vault>/.obsidian/themes",
    "Enable it via Settings > Appearance > Themes",
    "Set manifest.json `name`, rename the theme dir to match, restart Obsidian",
    "Override CSS variables in theme.css (body / .theme-light / .theme-dark / :root)",
    "Find element variables via DevTools Sources > app.css or the element picker",
    "Embed fonts/images as base64 data URLs (no remote assets)",
    "Add .github/workflows/release.yml and tag a release with GitHub Actions",
    "Submit at community.obsidian.md (README, LICENSE, screenshot, manifest, matching release)"
  ],
  "css_variables_reference": "https://docs.obsidian.md/Reference/CSS+variables/CSS+variables",
  "release_workflow": {
    "method": "GitHub Actions (.github/workflows/release.yml) triggered on tag push",
    "assets_uploaded": ["manifest.json", "theme.css"],
    "version_format": "Semantic Versioning x.y.z; release tag must equal manifest.json version"
  },
  "submit_url": "https://community.obsidian.md",
  "theme_guidelines": [
    "Override CSS variables instead of targeting specific classes",
    "Use low-specificity selectors so Obsidian updates don't break the theme",
    "Keep all assets local (base64 data URLs); no remote network calls",
    "Avoid !important so users can still override with snippets"
  ],
  "error_reasoning": null
}
```

Failure shape (e.g. docs restructured / page not found):

```json
{
  "success": false,
  "error_reasoning": "Fetched Themes/App themes/Build a theme.md returned '## Not Found' — the docs tree may have been reorganized; re-derive paths from the /options/<UID> navigationOrdering blob."
}
```
