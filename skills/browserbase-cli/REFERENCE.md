# Browserbase CLI Reference

## Table of Contents

- [Setup](#setup)
- [Authentication and flags](#authentication-and-flags)
- [Functions](#functions)
- [Platform APIs](#platform-apis)
- [Fetch API](#fetch-api)
- [Search API](#search-api)
- [Templates](#templates)
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
bb sessions create --proxies --advanced-stealth
bb sessions create --region us-east-1 --timeout 300
bb sessions create --solve-captchas --context-id ctx_abc --persist
bb sessions create --body '{"proxies":[{"type":"browserbase","geolocation":{"country":"US"}}]}'
echo '{"proxies":true}' | bb sessions create --stdin
bb sessions update <session_id> --status REQUEST_RELEASE
bb sessions debug <session_id>
bb sessions logs <session_id>
bb sessions recording <session_id>
bb sessions downloads get <session_id> --output session-artifacts.zip
bb sessions uploads create <session_id> ./file.txt
```

#### `sessions create` flags

Use flags for common options instead of building `--body` JSON manually:

| Flag | Description |
|------|-------------|
| `--proxies` | Enable Browserbase proxy |
| `--advanced-stealth` | Enable advanced stealth mode |
| `--solve-captchas` / `--no-solve-captchas` | Toggle automatic CAPTCHA solving |
| `--block-ads` | Enable ad blocking |
| `--region <region>` | Session region (`us-west-2`, `us-east-1`, `eu-central-1`, `ap-southeast-1`) |
| `--keep-alive` | Keep session alive after disconnection |
| `--timeout <seconds>` | Session timeout in seconds |
| `--context-id <id>` | Browserbase context ID for persistent state |
| `--persist` | Persist context changes after session ends |
| `--record-session` / `--no-record-session` | Toggle session recording |
| `--log-session` / `--no-log-session` | Toggle session logging |
| `--viewport <WxH>` | Browser viewport dimensions (e.g. `1920x1080`) |
| `--extension-id <id>` | Chrome extension ID to load |
| `--body <body>` | Full JSON request body (merged with flags) |
| `--stdin` | Read JSON request body from stdin |

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

## Templates

Browse and scaffold starter templates from the Browserbase templates repository.

### List templates

```bash
bb templates list
bb templates list --language python
bb templates list --language typescript
```

### Clone a template

```bash
bb templates clone form-filling --language typescript
bb templates clone amazon-product-scraping --language python ./my-scraper
```

Arguments:
- `<slug>` (required) — template name from `bb templates list`
- `[path]` (optional) — destination directory, defaults to the template slug

Options:
- `--language <language>` — `python` or `typescript`

## Browse passthrough

`bb browse ...` forwards arguments to the standalone `browse` binary (`@browserbasehq/browse-cli`). The examples below are `browse-cli` subcommands — they are not native `bb` commands:

```bash
bb browse env
bb browse env local
bb browse env local --auto-connect
bb browse env remote
bb browse status
bb browse open https://example.com
```

`bb browse` mirrors the standalone `browse` binary exactly. For local work, `bb browse env local` starts a clean isolated browser by default. Use `bb browse env local --auto-connect` only when you need the agent to reuse an existing local Chrome session, cookies, or login state.

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
