---
name: browser
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications.
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). Optional: set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID for remote Browserbase sessions; falls back to local Chrome otherwise."
license: MIT
allowed-tools: Bash
---

# Browser Automation

Automate browser interactions using the browse CLI with Claude.

## Setup check

Before running any browser commands, verify the CLI is available:

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

## Environment Selection (Local vs Remote)

The skill automatically selects between local and remote browser environments:
- **If Browserbase API keys exist** (`BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`): Uses remote Browserbase environment
- **If no Browserbase API keys**: Falls back to local Chrome browser
- **No user prompting**: The selection happens automatically based on available configuration

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
| Stealth mode | No | Yes |
| Proxy/CAPTCHA | No | Yes |
| Best for | Development | Production/scraping |

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
