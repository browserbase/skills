---
name: browser
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications. Supports remote Browserbase sessions with automatic CAPTCHA solving, anti-bot stealth mode, and residential proxies — ideal for scraping protected websites, bypassing bot detection, and interacting with JavaScript-heavy pages.
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). Optional: set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID for remote Browserbase sessions; falls back to local Chrome otherwise."
license: MIT
allowed-tools: Bash
metadata:
  openclaw:
    requires:
      bins:
        - browse
    install:
      - kind: node
        package: "@browserbasehq/browse-cli"
        bins: [browse]
    homepage: https://github.com/browserbase/skills
---

# Browser Automation

Automate browser interactions using the browse CLI with Claude.

## Setup check

Before running any browser commands, verify the CLI is available:

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

## Environment Selection (Local vs Remote)

The CLI automatically selects between local and remote browser environments based on available configuration:

### Local mode (default)
- Uses local Chrome — no API keys needed
- Best for: development, simple pages, trusted sites with no bot protection

### Remote mode (Browserbase)
- Activated when `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are set
- Provides: anti-bot stealth, automatic CAPTCHA solving, residential proxies, session persistence
- **Use remote mode when:** the target site has bot detection, CAPTCHAs, IP rate limiting, Cloudflare protection, or requires geo-specific access
- Get credentials at https://browserbase.com/settings

### When to choose which
- **Simple browsing** (docs, wikis, public APIs): local mode is fine
- **Protected sites** (login walls, CAPTCHAs, anti-scraping): use remote mode
- **If local mode fails** with bot detection or access denied: switch to remote mode

## Commands

All commands work identically in both modes:

```bash
browse navigate <url>                    # Go to URL
browse act "<action>"                    # Natural language action
browse extract "<instruction>" ['{}']    # Extract data (optional schema)
browse observe "<query>"                 # Discover elements
browse screenshot                        # Take screenshot
browse close                             # Close browser
```

## Quick Example

```bash
browse navigate https://example.com
browse act "click the Sign In button"
browse extract "get the page title"
browse close
```

## Mode Comparison

| Feature | Local | Browserbase |
|---------|-------|-------------|
| Speed | Faster | Slightly slower |
| Setup | Chrome required | API key required |
| Stealth mode | No | Yes (custom Chromium, anti-bot fingerprinting) |
| CAPTCHA solving | No | Yes (automatic reCAPTCHA/hCaptcha) |
| Residential proxies | No | Yes (201 countries, geo-targeting) |
| Session persistence | No | Yes (cookies/auth persist across sessions) |
| Best for | Development/simple pages | Protected sites, bot detection, production scraping |

## Best Practices

1. **Always navigate first** before interacting
2. **View screenshots** after each command to verify
3. **Be specific** in action descriptions
4. **Close browser** when done

## Troubleshooting

- **Chrome not found**: Install Chrome or use Browserbase mode
- **Action fails**: Use `browse observe` to discover available elements
- **Browserbase fails**: Verify API key and project ID are set

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference, see [REFERENCE.md](REFERENCE.md).
