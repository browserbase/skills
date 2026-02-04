---
name: browser
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications.
allowed-tools: Bash
---

# Browser Automation

Automate browser interactions using Stagehand CLI with Claude.

## First: Ask User Which Mode

**Before any browser commands, ask the user:**

> "Do you want to use **Local Chrome** (faster, requires Chrome installed) or **Browserbase** (cloud browser with stealth/proxy features)?"

Based on their answer:
- **Local**: Proceed with commands (no env vars needed, uses local Chrome)
- **Browserbase**: User must set env vars first:
  ```bash
  export BROWSERBASE_API_KEY="your-api-key"
  export BROWSERBASE_PROJECT_ID="your-project-id"
  ```
  Get credentials from: https://browserbase.com/settings

## Setup (First Time Only)

Check `setup.json` in this directory. If `setupComplete: false`:

```bash
npm install    # Install dependencies
npm link       # Create global 'browser' command
export ANTHROPIC_API_KEY="your-key"  # Required for AI actions
```

## Commands

All commands work identically in both modes:

```bash
browser navigate <url>                    # Go to URL
browser act "<action>"                    # Natural language action
browser extract "<instruction>" ['{}']    # Extract data (optional schema)
browser observe "<query>"                 # Discover elements
browser screenshot                        # Take screenshot
browser close                             # Close browser
```

## Quick Example

```bash
browser navigate https://example.com
browser act "click the Sign In button"
browser extract "get the page title"
browser close
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
- **Action fails**: Use `browser observe` to discover available elements
- **Browserbase fails**: Verify API key and project ID are set

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference, see [REFERENCE.md](REFERENCE.md).
