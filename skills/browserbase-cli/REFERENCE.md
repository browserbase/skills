# Browserbase CLI Reference

## Table of Contents

- [Setup](#setup)
- [Authentication and flags](#authentication-and-flags)
- [Functions](#functions)
- [Platform APIs](#platform-apis)
- [Fetch API](#fetch-api)
- [Search API](#search-api)
- [Templates](#templates)
- [Local & remote browser driving](#local--remote-browser-driving)
- [Skills](#skills)
- [Troubleshooting](#troubleshooting)

## Setup

Install the CLI if needed:

```bash
npm install -g browse
```

Check the available surface with:

```bash
browse --help
browse functions --help
browse cloud sessions --help
```

## Authentication and flags

All authenticated commands require an API key:

```bash
export BROWSERBASE_API_KEY="your_api_key"
```

### Platform API commands

These command groups share a common flag shape:

- `browse cloud projects`
- `browse cloud sessions`
- `browse cloud contexts`
- `browse cloud extensions`
- `browse cloud fetch`
- `browse cloud search`

Common flags:

- `--api-key <apiKey>`
- `--base-url <baseUrl>`

### Functions commands

`browse functions ...` is slightly different:

- uses `--base-url <baseUrl>` for API base URL overrides
- reads the API key and project from environment variables by default

## Functions

### Initialize a project

```bash
browse functions init my-function
browse functions init my-function --package-manager npm
```

### Run local development

```bash
browse functions dev index.ts
browse functions dev index.ts --port 14113 --host 127.0.0.1 --verbose
```

### Publish

```bash
browse functions publish index.ts
browse functions publish index.ts --dry-run
```

Use `--dry-run` when you want to inspect what would be packaged without uploading.

### Invoke

```bash
browse functions invoke <function_id> --params '{"url":"https://example.com"}'
browse functions invoke <function_id> --no-wait
browse functions invoke --check-status <invocation_id>
```

## Platform APIs

### Projects

```bash
browse cloud projects list
browse cloud projects get <project_id>
browse cloud projects usage <project_id>
```

### Sessions

```bash
browse cloud sessions list
browse cloud sessions list --q "user_metadata['userId']:'123'"
browse cloud sessions get <session_id>
browse cloud sessions create --proxies --verified
browse cloud sessions create --region us-east-1 --timeout 300
browse cloud sessions create --solve-captchas --context-id ctx_abc --persist
browse cloud sessions create --body '{"proxies":[{"type":"browserbase","geolocation":{"country":"US"}}]}'
echo '{"proxies":true}' | browse cloud sessions create --stdin
browse cloud sessions update <session_id> --status REQUEST_RELEASE
browse cloud sessions debug <session_id>
browse cloud sessions logs <session_id>
browse cloud sessions downloads get <session_id> --output session-artifacts.zip
browse cloud sessions uploads create <session_id> ./file.txt
```

#### `sessions create` flags

Use flags for common options instead of building `--body` JSON manually:

| Flag | Description |
|------|-------------|
| `--proxies` | Enable Browserbase proxy |
| `--verified` | Enable Browserbase Verified browser mode |
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

When both `--status` and `--body` are present on `browse cloud sessions update`, the CLI merges them.

### Contexts

```bash
browse cloud contexts create --body '{"region":"us-west-2"}'
browse cloud contexts get <context_id>
browse cloud contexts delete <context_id>
```

`browse cloud contexts update <context_id>` refreshes context upload URLs, but context uploads through this API are deprecated and may return a deprecation error. Avoid it unless Browserbase support has asked you to use that path.

### Extensions

```bash
browse cloud extensions upload ./my-extension.zip
browse cloud extensions get <extension_id>
browse cloud extensions delete <extension_id>
```

## Fetch API

Use `browse cloud fetch` when the user wants Browserbase Fetch specifically or wants the request to stay inside the CLI workflow.

```bash
browse cloud fetch https://example.com
browse cloud fetch https://example.com --allow-redirects
browse cloud fetch https://self-signed.example.com --allow-insecure-ssl
browse cloud fetch https://example.com --proxies --output page.html
```

Prefer the `browser` skill when the target page requires JavaScript execution or page interaction.

## Search API

Use `browse cloud search` to find web pages by query without opening a browser session.

```bash
browse cloud search "browser automation"
browse cloud search "web scraping best practices" --num-results 5
browse cloud search "AI agents" --output results.json
```

Returns structured results with titles, URLs, and optional metadata (author, published date). Use `--num-results` to control how many results are returned (1-25, default 10).

Prefer the `fetch` skill to retrieve page content after finding URLs via search. Prefer the `browser` skill when you need to interact with pages.

## Templates

Browse and scaffold starter templates from the Browserbase templates repository.

### List templates

```bash
browse templates list
browse templates list --tag Python --source Browserbase
browse templates list --tag TypeScript --source Browserbase
```

### Clone a template

```bash
browse templates clone form-filling --language typescript
browse templates clone amazon-product-scraping --language python ./my-scraper
```

Arguments:
- `<slug>` (required) — template name from `browse templates list`
- `[path]` (optional) — destination directory, defaults to the template slug

Options:
- `--language <language>` — `python` or `typescript`

## Local & remote browser driving

Top-level `browse` commands drive local and remote browsers directly: `browse open`, `browse get`, `browse click`, `browse fill`, `browse press`, `browse screenshot`, and `browse cdp`.

```bash
browse open https://example.com                            # default mode from env
browse open https://example.com --local --headless         # explicit local + headless
browse open https://example.com --auto-connect             # attach to existing debuggable Chrome
browse open https://example.com --remote                   # create a new Browserbase remote session
browse open https://example.com --remote --session research # use a named browse daemon session
browse open https://example.com --cdp "$CONNECT_URL"       # attach to a pre-created CDP endpoint
browse get markdown body                                   # extract the current page as markdown
browse status                                              # show the active session
```

For most interactive browsing tasks, prefer the dedicated `browser` skill instead of routing through the CLI directly.

## Skills

Install Browserbase agent skills for Claude Code directly from the CLI:

```bash
browse skills install
```

This runs the skill installer non-interactively via npx.

## Troubleshooting

- Missing API key: set `BROWSERBASE_API_KEY` or pass `--api-key`
- Wrong base URL flag: use `--base-url` for both `browse functions ...` and `browse cloud ...`
- Invalid JSON input: wrap `--body` and `--params` payloads in single quotes so the shell preserves the JSON string
- Command not found: re-run `npm install -g browse` and verify with `which browse`
