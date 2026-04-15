---
name: browserbase-cli
description: Use the Browserbase CLI (`bb`) for Browserbase Functions and platform API workflows. Use when the user asks to run `bb`, deploy or invoke functions, manage sessions, projects, contexts, or extensions, fetch a page through the Browserbase Fetch API, search the web through the Browserbase Search API, or scaffold starter templates. Prefer the Browser skill for interactive browsing; use `bb browse` only when the user explicitly wants the Browserbase CLI path.
compatibility: "Requires the Browserbase CLI (`npm install -g @browserbasehq/cli`). API commands require `BROWSERBASE_API_KEY`. `BROWSERBASE_PROJECT_ID` is only needed for `bb functions dev` and `bb functions publish`. `bb browse` additionally requires `npm install -g @browserbasehq/browse-cli`."
license: MIT
allowed-tools: Bash
---

# Browserbase CLI

Use the official `bb` CLI for Browserbase platform operations, Functions workflows, and Fetch API calls.

## Setup check

Before using the CLI, verify it is installed:

```bash
which bb || npm install -g @browserbasehq/cli
bb --help
```

For authenticated commands, set the API key:

```bash
export BROWSERBASE_API_KEY="your_api_key"
```

If using `bb functions dev` or `bb functions publish`, also set:

```bash
export BROWSERBASE_PROJECT_ID="your_project_id"
```

## When to use this skill

Use this skill when the user wants to:

- run Browserbase commands through `bb`
- scaffold, develop, publish, or invoke Browserbase Functions
- inspect or manage Browserbase sessions, projects, contexts, or extensions
- retrieve files downloaded during a remote browser session (`bb sessions downloads get`)
- fetch a page through Browserbase without opening a browser session
- search the web through Browserbase without opening a browser session
- browse or scaffold starter templates with `bb templates`

## When not to use this skill

- For interactive browsing, page inspection, screenshots, clicking, typing, or login flows, prefer the `browser` skill.
- For simple HTTP content retrieval where the user does not care about using the CLI specifically, the dedicated `fetch` skill is often a better fit.
- Use `bb browse ...` only when the user explicitly wants the CLI wrapper or is already working in a `bb`-centric workflow.

## Command selection

- `bb functions` for local dev, packaging, publishing, and invocation
- `bb sessions`, `bb projects`, `bb contexts`, `bb extensions` for Browserbase platform resources
- `bb fetch <url>` for Fetch API requests
- `bb search "<query>"` for Search API requests
- `bb templates` to browse and scaffold starter templates
- `bb browse ...` to forward to the standalone `browse` binary (requires `@browserbasehq/browse-cli`)
- `bb skills install` to install Browserbase agent skills for Claude Code

For `bb browse`, the standalone `browse` CLI behavior is the source of truth: `bb browse env local` uses a clean isolated local browser by default, and `bb browse env local --auto-connect` opts into reusing an existing local Chrome session.

## Common workflows

### Functions

```bash
bb functions init my-function
cd my-function
bb functions dev index.ts
bb functions publish index.ts
bb functions invoke <function_id> --params '{"url":"https://example.com"}'
```

Use `bb functions invoke --check-status <invocation_id>` to poll an existing invocation instead of creating a new one.

### Platform APIs

```bash
bb projects list
bb sessions create --proxies --advanced-stealth --region us-east-1
bb sessions create --solve-captchas --context-id ctx_abc --persist
bb sessions get <session_id>
bb sessions downloads get <session_id> --wait 20 --output session-artifacts.zip
bb contexts create --body '{"region":"us-west-2"}'
bb extensions upload ./my-extension.zip
```

### Fetch API

```bash
bb fetch https://example.com
bb fetch https://example.com --allow-redirects --output page.html
```

### Search API

```bash
bb search "browser automation"
bb search "web scraping" --num-results 5
bb search "AI agents" --output results.json
```

### Templates

```bash
bb templates list
bb templates list --language python
bb templates clone form-filling --language typescript
bb templates clone amazon-product-scraping --language python ./my-scraper
```

## Best practices

1. Prefer `bb --help` and subgroup `--help` before guessing flags.
2. Use dash-case flags exactly as shown in CLI help.
3. Use `--output <file>` on `bb fetch` and `bb search` to save results to a file.
4. Use environment variables for auth unless the user explicitly wants one-off overrides.
5. Pass structured request bodies with JSON strings in `--body` or `--params`.
6. Remember that `bb functions ...` uses `--api-url`, while platform API commands use `--base-url`.
7. If `bb browse` fails because `browse` is missing, either install `@browserbasehq/browse-cli` or switch to the `browser` skill.

## Troubleshooting

- Missing API key: set `BROWSERBASE_API_KEY` or pass `--api-key`
- Missing project ID on `bb functions dev` or `bb functions publish`: set `BROWSERBASE_PROJECT_ID` or pass `--project-id`
- Unknown flag: rerun the relevant command with `--help` and use the exact dash-case form
- `bb browse` install error: run `npm install -g @browserbasehq/browse-cli`

For command-by-command reference and more examples, see [REFERENCE.md](REFERENCE.md).
