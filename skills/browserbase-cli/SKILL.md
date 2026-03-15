---
name: browserbase-cli
description: Use the Browserbase CLI (`bb`) for Browserbase Functions and platform API workflows. Use when the user asks to run `bb`, deploy or invoke functions, manage sessions, projects, contexts, or extensions, fetch a page through the Browserbase Fetch API, or open the Browserbase dashboard from the command line. Prefer the Browser skill for interactive browsing; use `bb browse` only when the user explicitly wants the Browserbase CLI path.
compatibility: "Requires the Browserbase CLI (`npm install -g @browserbasehq/cli`). API commands require `BROWSERBASE_API_KEY`; many also require `BROWSERBASE_PROJECT_ID`. `bb browse` additionally requires `npm install -g @browserbasehq/browse-cli`."
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

For authenticated commands, prefer environment variables:

```bash
export BROWSERBASE_API_KEY="your_api_key"
export BROWSERBASE_PROJECT_ID="your_project_id"
```

## When to use this skill

Use this skill when the user wants to:

- run Browserbase commands through `bb`
- scaffold, develop, publish, or invoke Browserbase Functions
- inspect or manage Browserbase sessions, projects, contexts, or extensions
- fetch a page through Browserbase without opening a browser session
- open the Browserbase dashboard from the terminal

## When not to use this skill

- For interactive browsing, page inspection, screenshots, clicking, typing, or login flows, prefer the `browser` skill.
- For simple HTTP content retrieval where the user does not care about using the CLI specifically, the dedicated `fetch` skill is often a better fit.
- Use `bb browse ...` only when the user explicitly wants the CLI wrapper or is already working in a `bb`-centric workflow.

## Command selection

- `bb functions` for local dev, packaging, publishing, and invocation
- `bb sessions`, `bb projects`, `bb contexts`, `bb extensions` for Browserbase platform resources
- `bb fetch <url>` for Fetch API requests
- `bb dashboard` to open Browserbase Overview locally
- `bb browse ...` to forward to the standalone `browse` binary

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
bb projects list --json
bb sessions get <session_id> --json
bb sessions downloads get <session_id> --output session-artifacts.zip
bb contexts create --body '{"region":"us-west-2"}' --json
bb extensions upload ./my-extension.zip --json
```

### Fetch API

```bash
bb fetch https://example.com --json
bb fetch https://example.com --allow-redirects --output page.html
```

### Dashboard

```bash
bb dashboard
```

## Best practices

1. Prefer `bb --help` and subgroup `--help` before guessing flags.
2. Use dash-case flags exactly as shown in CLI help.
3. Prefer `--json` when the result may need follow-up parsing.
4. Use environment variables for auth unless the user explicitly wants one-off overrides.
5. Pass structured request bodies with JSON strings in `--body` or `--params`.
6. Remember that `bb functions ...` uses `--api-url`, while platform API commands use `--base-url`.
7. If `bb browse` fails because `browse` is missing, either install `@browserbasehq/browse-cli` or switch to the `browser` skill.

## Troubleshooting

- Missing API key: set `BROWSERBASE_API_KEY` or pass `--api-key`
- Missing project ID on project-scoped commands: set `BROWSERBASE_PROJECT_ID` or pass `--project-id`
- Unknown flag: rerun the relevant command with `--help` and use the exact dash-case form
- `bb browse` install error: run `npm install -g @browserbasehq/browse-cli`

For command-by-command reference and more examples, see [REFERENCE.md](REFERENCE.md).
