---
name: browserbase-com-find-templates-lyrzye
title: Browserbase Find Templates
description: >-
  List Browserbase's starter templates (TypeScript / Python / Go) and the
  canonical clone command for each, sourced from the official bb CLI's templates
  subcommand which reads github.com/browserbase/templates@dev.
website: browserbase.com
category: developer-tools
tags:
  - browserbase
  - templates
  - cli
  - starter-projects
  - developer-tools
source: 'browserbase: agent-runtime 2026-05-18'
updated: '2026-05-18'
recommended_method: cli
alternative_methods:
  - method: api
    rationale: >-
      GitHub Contents API on github.com/browserbase/templates@dev returns the
      same canonical slug list and additionally surfaces Go templates that the
      CLI hides. Use as a cross-validation path or when the bb CLI cannot be
      installed.
  - method: browser
    rationale: >-
      https://www.browserbase.com/templates is the public marketing page over
      the same repo. Fully JS-rendered (Next.js hydration); the static prerender
      HTML contains zero template slugs, so a real browser is required — `bb
      fetch` returns only the shell. ~6x more turns than the CLI path with no
      additional information.
verified: false
proxies: false
---
# Browserbase Find Templates

## Purpose

Discover and list the starter templates Browserbase publishes for bootstrapping browser-automation projects — return each template's slug, supported language(s) (TypeScript / Python / Go), and the canonical clone command. Read-only enumeration; no scaffolding occurs unless the caller subsequently invokes `bb templates clone`.

## When to Use

- Answering "what Browserbase templates exist for {use case}?" (e.g. form-filling, scraping, MFA, captchas, proxies, gemini/cua agents).
- Bootstrap-time discovery: a developer asks for a starter project before writing any code.
- Cross-language coverage check: does template X exist in both Python and TypeScript? (Most do; a handful are TS-only.)
- Periodic catalog refresh — the repo's default branch (`dev`) is updated weekly; pulling `bb templates list` is the cheapest way to detect new additions.

## Workflow

Browserbase exposes a first-party CLI (`@browserbasehq/cli`, binary `bb`) whose `templates` subcommand reads the canonical catalog directly from `github.com/browserbase/templates` (default branch `dev`). The CLI is the recommended path — output is structured, no JS rendering, no anti-bot surface, and `BROWSERBASE_API_KEY` is **not** required for `templates list`/`clone` (the CLI hits GitHub, not the Browserbase platform API, for this subcommand). The public website `https://www.browserbase.com/templates` is a JS-rendered marketing surface over the same repo; treat it as a fallback only when the CLI is unavailable.

### 1. Install the CLI (one-time, ~25 packages)

```bash
npm install -g @browserbasehq/cli
# Binary is `bb`. The system-prompt-mentioned `browse` is a separate, optional
# package (`@browserbasehq/browse-cli`) used for driving browser sessions —
# NOT required for the templates subcommand.
```

### 2. List all templates

```bash
bb templates list
```

Output (sectioned by language, alphabetical slugs):

```
typescript (40 templates):
  agent-with-human-in-loop
  amazon-global-price-comparison
  ...
  website-link-tester

python (36 templates):
  amazon-global-price-comparison
  ...
  website-link-tester

Scaffold a template with: bb templates clone <slug> --language <language>
```

### 3. Filter by language

```bash
bb templates list --language typescript    # 40 templates as of 2026-05-18
bb templates list --language python        # 36 templates as of 2026-05-18
```

The `--language` flag accepts exactly `typescript` or `python`. Go templates exist in the repo (`go/hackernews`) but the CLI does **not** expose them — see Site-Specific Gotchas.

### 4. (Optional) Scaffold a chosen template

Once a slug is identified, the user can clone it:

```bash
bb templates clone <slug> [--language <python|typescript>] [<destination-path>]
# Defaults: destination = ./<slug>, language = first available match
# Examples:
bb templates clone form-filling --language typescript
bb templates clone amazon-product-scraping --language python ./my-scraper
```

`clone` writes a ready-to-run project directory; the skill itself stops at listing.

### 5. Cross-validate against the source repo (optional integrity check)

The catalog source of truth is `https://github.com/browserbase/templates` on branch `dev`. To programmatically verify the list (e.g. detect templates added since the locally-installed CLI version was published):

```bash
curl -fsS "https://api.github.com/repos/browserbase/templates/contents/typescript?ref=dev" \
  | jq -r '.[] | select(.type=="dir") | .name'
curl -fsS "https://api.github.com/repos/browserbase/templates/contents/python?ref=dev" \
  | jq -r '.[] | select(.type=="dir") | .name'
curl -fsS "https://api.github.com/repos/browserbase/templates/contents/go?ref=dev" \
  | jq -r '.[] | select(.type=="dir") | .name'
```

GitHub's unauthenticated API permits 60 req/hour — sufficient for daily catalog sync.

### Browser fallback

If the CLI cannot be installed (sandbox restrictions, npm offline, etc.):

1. Open `https://www.browserbase.com/templates` in a Browserbase remote session. A bare session is sufficient — Browserbase's own marketing site is not anti-bot-gated and a residential proxy / advanced stealth is not required.
2. The page is fully client-side rendered (Next.js); `bb fetch` returns the prerender HTML shell (~150 KB) but **no template slugs** are present in the static HTML — they are hydrated from a runtime JSON payload. You must drive a real browser, not `fetch`.
3. Wait for the templates grid to mount, then capture `browse get markdown body` and split per-card to extract template title, description, and `View on GitHub` href. Each card's GitHub link decodes the language: paths under `/typescript/<slug>` vs `/python/<slug>` vs `/go/<slug>`.
4. As a no-JS alternative: list the GitHub repo directly (Step 5 above) — that requires only `curl`/`fetch` and returns the canonical slug list without rendering.

The browser path costs ~6× more turns and surfaces no information the CLI doesn't already expose. Use only when the CLI is genuinely unavailable.

## Site-Specific Gotchas

- **CLI binary is `bb`, not `browse`.** The npm package `@browserbasehq/cli` installs a single binary called `bb`. A separate package `@browserbasehq/browse-cli` installs `browse` for browser-driving verbs. The `templates` subcommand lives on `bb`, not `browse`.
- **`templates list` does NOT require `BROWSERBASE_API_KEY`.** Unlike `bb fetch`, `bb search`, and `bb sessions ...`, the templates subcommand reads from GitHub, not the Browserbase platform API. It works offline-of-Browserbase as long as `api.github.com` is reachable. (Other `bb` subcommands DO require the env var and will exit with `"Missing Browserbase API key"` otherwise.)
- **Go templates exist in the repo but the CLI hides them.** `bb templates list` only enumerates `typescript/` and `python/`. The repo also contains `go/hackernews` (and may grow). The `--language` flag's accepted values are hardcoded to `python | typescript`; Go templates are reachable only by cloning the repo directly: `git clone --depth 1 -b dev https://github.com/browserbase/templates.git`.
- **Default branch is `dev`, not `main`.** Direct GitHub API calls must pass `?ref=dev` or the response will reflect a stale `main` snapshot. (The repo also marks `main` as `vanta_production_main` for compliance reasons — `dev` is where templates are actually pushed.)
- **Counts drift weekly.** As of 2026-05-18: 40 TypeScript + 36 Python + 1 Go template. The repo was last pushed 2026-05-15 and is under active development (17 open issues, 12 forks). Do not hard-code counts in downstream consumers — re-run `bb templates list` per discovery cycle.
- **`https://www.browserbase.com/templates` returns 200 + ~150 KB of HTML shell, but the template grid is hydrated at runtime.** `bb fetch <url>` (the Browserbase Fetch API, an HTTP-only path) returns the shell with no template slugs in it. The slugs are only visible after JS execution. Don't waste turns on `fetch`-based scraping of the marketing page — use the CLI or the GitHub API.
- **Template slugs do NOT always exist in both languages.** Cross-language coverage as of 2026-05-18: TypeScript has `agent-with-human-in-loop`, `browser-agent-demo`, `dynamic-form-filling`, `gemini-3-flash`, `microsoft-cua`, `puppeteer` that have no Python counterpart. Python has `cartesia-form-filling`, `cerebras-docs-checker` that have no TypeScript counterpart. The remaining ~35 slugs exist in both. If a user asks for "the X template in Python" and it's TS-only, surface the asymmetry explicitly rather than failing the clone.
- **CLI's `--language` flag is required for `clone` only if the slug exists in multiple languages.** For single-language slugs, the CLI auto-selects. For dual-language slugs, omitting `--language` causes an interactive prompt — pass it explicitly in non-interactive contexts.
- **No category/tag metadata in the CLI output.** Slugs are surfaced as flat alphabetical lists. To classify templates by topic (e.g. "all MFA templates" → `manual-mfa-with-contexts`, `mfa-handling`, `playwright-mfa-handling`) you must pattern-match the slug itself or fetch each template's README from GitHub.

## Expected Output

A canonical structured listing — flatten the CLI's two-section output into a single array, key by slug, attach the languages it supports.

```json
{
  "source": "bb templates list",
  "cli_version": "0.5.7",
  "repo": "github.com/browserbase/templates",
  "branch": "dev",
  "counts": { "typescript": 40, "python": 36, "go": 1, "unique_slugs": 43 },
  "templates": [
    {
      "slug": "form-filling",
      "languages": ["typescript", "python"],
      "clone_commands": [
        "bb templates clone form-filling --language typescript",
        "bb templates clone form-filling --language python"
      ],
      "github_url": "https://github.com/browserbase/templates/tree/dev/typescript/form-filling"
    },
    {
      "slug": "microsoft-cua",
      "languages": ["typescript"],
      "clone_commands": [
        "bb templates clone microsoft-cua --language typescript"
      ],
      "github_url": "https://github.com/browserbase/templates/tree/dev/typescript/microsoft-cua"
    },
    {
      "slug": "cartesia-form-filling",
      "languages": ["python"],
      "clone_commands": [
        "bb templates clone cartesia-form-filling --language python"
      ],
      "github_url": "https://github.com/browserbase/templates/tree/dev/python/cartesia-form-filling"
    },
    {
      "slug": "hackernews",
      "languages": ["go"],
      "clone_commands": [
        "git clone --depth 1 -b dev https://github.com/browserbase/templates.git && cp -r templates/go/hackernews ./hackernews"
      ],
      "github_url": "https://github.com/browserbase/templates/tree/dev/go/hackernews",
      "note": "Not surfaced by `bb templates list`; CLI clone unsupported as of v0.5.7."
    }
  ]
}
```

When the caller only asks "what templates are there?" (no schema specified), a degenerate form is acceptable:

```json
{
  "typescript": ["agent-with-human-in-loop", "amazon-global-price-comparison", "..."],
  "python":     ["amazon-global-price-comparison", "amazon-product-scraping", "..."],
  "go":         ["hackernews"]
}
```
