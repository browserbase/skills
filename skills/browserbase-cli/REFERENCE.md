# Browserbase CLI Reference

## Table of Contents

- [Setup](#setup)
- [Authentication and flags](#authentication-and-flags)
- [Functions](#functions)
- [Platform APIs](#platform-apis)
- [Fetch API](#fetch-api)
- [Dashboard and browse passthrough](#dashboard-and-browse-passthrough)
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

Common flags:

- `--api-key <apiKey>`
- `--project-id <projectId>`
- `--base-url <baseUrl>`
- `--json`
- `--verbose`

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
bb projects list --json
bb projects get <project_id> --json
bb projects usage <project_id> --json
```

### Sessions

```bash
bb sessions list --json
bb sessions list --q 'userId:123'
bb sessions get <session_id> --json
bb sessions create --body '{"projectId":"proj_123"}' --json
bb sessions update <session_id> --status REQUEST_RELEASE --json
bb sessions debug <session_id> --json
bb sessions logs <session_id> --json
bb sessions recording <session_id> --json
bb sessions downloads get <session_id> --output session-artifacts.zip
bb sessions uploads create <session_id> ./file.txt --json
```

When both `--status` and `--body` are present on `bb sessions update`, the CLI merges them.

### Contexts

```bash
bb contexts create --body '{"region":"us-west-2"}' --json
bb contexts get <context_id> --json
bb contexts update <context_id> --json
bb contexts delete <context_id> --json
```

### Extensions

```bash
bb extensions upload ./my-extension.zip --json
bb extensions get <extension_id> --json
bb extensions delete <extension_id> --json
```

## Fetch API

Use `bb fetch` when the user wants Browserbase Fetch specifically or wants the request to stay inside the CLI workflow.

```bash
bb fetch https://example.com --json
bb fetch https://example.com --allow-redirects --json
bb fetch https://self-signed.example.com --allow-insecure-ssl --json
bb fetch https://example.com --proxies --output page.html
```

Prefer the `browser` skill when the target page requires JavaScript execution or page interaction.

## Dashboard and browse passthrough

### Dashboard

```bash
bb dashboard
```

This opens Browserbase Overview in the user's local browser.

### Browse passthrough

```bash
bb browse status
bb browse open https://example.com
```

`bb browse ...` forwards arguments to the standalone `browse` binary. If `browse` is not installed, install it with:

```bash
npm install -g @browserbasehq/browse-cli
```

For most interactive browsing tasks, prefer the dedicated `browser` skill instead of routing through `bb browse`.

## Troubleshooting

- Missing API key: set `BROWSERBASE_API_KEY` or pass `--api-key`
- Missing project ID on `bb functions dev` or `bb functions publish`: set `BROWSERBASE_PROJECT_ID` or pass `--project-id`
- Wrong base URL flag: use `--api-url` for `bb functions ...`, `--base-url` for the other API commands
- Invalid JSON input: wrap `--body` and `--params` payloads in single quotes so the shell preserves the JSON string
- Browse passthrough missing: install `@browserbasehq/browse-cli` or use the `browser` skill directly
