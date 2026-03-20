# Browserbase CLI Reference

## Table of Contents

- [Setup](#setup)
- [Authentication and flags](#authentication-and-flags)
- [Functions](#functions)
- [Platform APIs](#platform-apis)
- [Fetch API](#fetch-api)
- [Search API](#search-api)
- [Browse passthrough](#browse-passthrough)
- [Skills](#skills)
- [Troubleshooting](#troubleshooting)

## Setup

Install the CLI if needed:

```bash
npm install -g @browserbasehq/cli
```

Check the available surface with:

```bash
bb --help
bb functions --help
bb sessions --help
```

## Authentication and flags

All authenticated commands require an API key:

```bash
export BROWSERBASE_API_KEY="your_api_key"
```

Only `bb functions dev` and `bb functions publish` require a project ID:

```bash
export BROWSERBASE_PROJECT_ID="your_project_id"
```

### Platform API commands

These command groups share a common flag shape:

- `bb projects`
- `bb sessions`
- `bb contexts`
- `bb extensions`
- `bb fetch`
- `bb search`

Common flags:

- `--api-key <apiKey>`
- `--base-url <baseUrl>`

### Functions commands

`bb functions ...` is slightly different:

- uses `--api-url <apiUrl>`, not `--base-url`
- `bb functions dev` and `bb functions publish` also support `--project-id`
- `bb functions invoke` does not expose `--project-id`

## Functions

### Initialize a project

```bash
bb functions init my-function
bb functions init my-function --package-manager npm
```

### Run local development

```bash
bb functions dev index.ts
bb functions dev index.ts --port 14113 --host 127.0.0.1 --verbose
```

### Publish

```bash
bb functions publish index.ts
bb functions publish index.ts --dry-run
```

Use `--dry-run` when you want to inspect what would be packaged without uploading.

### Invoke

```bash
bb functions invoke <function_id> --params '{"url":"https://example.com"}'
bb functions invoke <function_id> --no-wait
bb functions invoke --check-status <invocation_id>
```

## Platform APIs

### Projects

```bash
bb projects list
bb projects get <project_id>
bb projects usage <project_id>
```

### Sessions

```bash
bb sessions list
bb sessions list --q "user_metadata['userId']:'123'"
bb sessions get <session_id>
bb sessions create --body '{"projectId":"proj_123"}'
bb sessions update <session_id> --status REQUEST_RELEASE
bb sessions debug <session_id>
bb sessions logs <session_id>
bb sessions recording <session_id>
bb sessions downloads get <session_id> --output session-artifacts.zip
bb sessions uploads create <session_id> ./file.txt
```

When both `--status` and `--body` are present on `bb sessions update`, the CLI merges them.

### Contexts

```bash
bb contexts create --body '{"region":"us-west-2"}'
bb contexts get <context_id>
bb contexts update <context_id>
bb contexts delete <context_id>
```

### Extensions

```bash
bb extensions upload ./my-extension.zip
bb extensions get <extension_id>
bb extensions delete <extension_id>
```

## Fetch API

Use `bb fetch` when the user wants Browserbase Fetch specifically or wants the request to stay inside the CLI workflow.

```bash
bb fetch https://example.com
bb fetch https://example.com --allow-redirects
bb fetch https://self-signed.example.com --allow-insecure-ssl
bb fetch https://example.com --proxies --output page.html
```

Prefer the `browser` skill when the target page requires JavaScript execution or page interaction.

## Search API

Use `bb search` to find web pages by query without opening a browser session.

```bash
bb search "browser automation"
bb search "web scraping best practices" --num-results 5
bb search "AI agents" --output results.json
```

Returns structured results with titles, URLs, and optional metadata (author, published date). Use `--num-results` to control how many results are returned (1-25, default 10).

Prefer the `fetch` skill to retrieve page content after finding URLs via search. Prefer the `browser` skill when you need to interact with pages.

## Browse passthrough

`bb browse ...` forwards arguments to the standalone `browse` binary (`@browserbasehq/browse-cli`). The examples below are `browse-cli` subcommands — they are not native `bb` commands:

```bash
bb browse status
bb browse open https://example.com
```

If `browse` is not installed, the CLI will prompt you to install it:

```bash
npm install -g @browserbasehq/browse-cli
```

For most interactive browsing tasks, prefer the dedicated `browser` skill instead of routing through `bb browse`.

## Skills

Install Browserbase agent skills for Claude Code directly from the CLI:

```bash
bb skills install
```

This runs the skill installer non-interactively via npx.

## Troubleshooting

- Missing API key: set `BROWSERBASE_API_KEY` or pass `--api-key`
- Missing project ID on `bb functions dev` or `bb functions publish`: set `BROWSERBASE_PROJECT_ID` or pass `--project-id`
- Wrong base URL flag: use `--api-url` for `bb functions ...`, `--base-url` for the other API commands
- Invalid JSON input: wrap `--body` and `--params` payloads in single quotes so the shell preserves the JSON string
- Browse passthrough missing: install `@browserbasehq/browse-cli` or use the `browser` skill directly
