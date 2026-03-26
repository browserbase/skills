---
name: cookie-sync
description: Sync cookies from local Chrome to a Browserbase persistent context so the browse CLI can access authenticated sites. Use when the user wants to browse as themselves, sync cookies, or log into sites via Browserbase.
compatibility: "Requires the Browserbase CLI (`npm install -g @browserbasehq/cli`). Requires `BROWSERBASE_API_KEY`. Requires Chrome (or Chromium, Brave, Edge) with remote debugging enabled. Requires Node.js 22+ or Bun."
license: MIT
allowed-tools: Bash
---

# Cookie Sync — Local Chrome → Browserbase Context

Exports cookies from your local Chrome and saves them into a Browserbase **persistent context** using the `bb sync` command. After syncing, use the `browse` CLI to open authenticated sessions with that context.

Supports **domain filtering** (only sync cookies you need) and **context reuse** (refresh cookies without creating a new context).

## Prerequisites

- Chrome (or Chromium, Brave, Edge) with remote debugging enabled
- If your browser build exposes `chrome://flags/#allow-remote-debugging`, enable it and restart the browser
- Otherwise, launch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222`
- At least one tab open in Chrome
- Browserbase CLI installed: `npm install -g @browserbasehq/cli`
- Environment variable: `BROWSERBASE_API_KEY`

## Setup check

```bash
which bb || npm install -g @browserbasehq/cli
bb sync --help
```

## Usage

### Basic — sync all cookies

```bash
bb sync
```

Creates a persistent context with all your Chrome cookies. Outputs JSON with the context ID.

### Filter by domain — only sync specific sites

```bash
bb sync --domains google.com,github.com
```

Matches the domain and all subdomains (e.g. `google.com` matches `accounts.google.com`, `mail.google.com`, etc.)

### Refresh cookies in an existing context

```bash
bb sync --context-id ctx_abc123
```

Re-injects fresh cookies into a previously created context. Use this when cookies have expired.

### Advanced stealth mode

```bash
bb sync --stealth
```

Enables Browserbase's advanced stealth mode to reduce bot detection. Recommended for sites like Google that fingerprint browsers.

### Residential proxy with geolocation

```bash
bb sync --proxy "San Francisco,CA,US"
```

Routes through a residential proxy in the specified location. Format: `"City,ST,Country"` (state is 2-letter code). Helps match your local IP's geolocation so auth cookies aren't rejected.

### Combine flags

```bash
bb sync --domains github.com,google.com --stealth --proxy "San Francisco,CA,US"
```

## Browsing Authenticated Sites

After syncing, use the `browse` CLI with the context ID:

```bash
browse open https://mail.google.com --context-id <ctx-id> --persist
```

The `--persist` flag saves any new cookies or state changes back to the context, keeping the session fresh for next time.

**Full workflow example:**

```bash
# Step 1: Sync cookies for Twitter
bb sync --domains x.com,twitter.com
# Output includes: "contextId": "ctx_abc123"

# Step 2: Browse authenticated Twitter
browse open https://x.com/messages --context-id ctx_abc123 --persist
browse snapshot
browse screenshot
browse stop
```

## Reusing Contexts for Scheduled Jobs

Contexts persist across sessions, making them ideal for scheduled/recurring tasks:

1. **Once (laptop open):** Run `bb sync` → get a context ID
2. **Scheduled jobs:** Use `browse open <url> --context-id <ctx-id> --persist` — no local Chrome needed
3. **Re-sync as needed:** When cookies expire, run `bb sync --context-id <ctx-id>` to refresh

## Troubleshooting

- **"No DevToolsActivePort found"** → Enable `chrome://flags/#allow-remote-debugging` if your browser build exposes it, or launch with `--remote-debugging-port=9222` and set `CDP_URL=ws://127.0.0.1:9222`
- **"Chrome debugging port is not reachable"** → Chrome may have restarted since debugging was enabled. Restart Chrome or re-enable the flag.
- **"No page target found"** → Open at least one tab in Chrome
- **Cookies expired in context** → Re-run `bb sync --context-id <id>` to refresh
- **Auth rejected by site** → Try adding `--stealth` and/or `--proxy` with a location near you
- **"Missing Browserbase API key"** → Set `BROWSERBASE_API_KEY` or pass `--api-key`
