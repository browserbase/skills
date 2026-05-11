---
name: browser
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications. Supports remote Browserbase sessions with automatic CAPTCHA solving, anti-bot stealth mode, and residential proxies — ideal for scraping protected websites, bypassing bot detection, and interacting with JavaScript-heavy pages.
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). Remote Browserbase sessions need `BROWSERBASE_API_KEY`. Local mode uses Chrome/Chromium on your machine."
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

The CLI supports explicit per-session environment overrides. If you do nothing, the next session defaults to Browserbase when `BROWSERBASE_API_KEY` is set and to local otherwise.

### Local mode
- `browse env local` starts a clean isolated local browser
- `browse env local --auto-connect` reuses an already-running debuggable Chrome and falls back to isolated if nothing is available
- `browse env local <port|url>` attaches to a specific CDP target
- Best for: development, localhost, trusted sites, and reproducible runs

### Remote mode (Browserbase)
- `browse env remote` switches the current session to Browserbase
- Without a local override, Browserbase is also the default when `BROWSERBASE_API_KEY` is set
- Provides: anti-bot stealth, automatic CAPTCHA solving, residential proxies, session persistence
- **Use remote mode when:** the target site has bot detection, CAPTCHAs, IP rate limiting, Cloudflare protection, or requires geo-specific access
- Get credentials at https://browserbase.com/settings

### When to choose which
- **Repeatable local testing / clean state**: `browse env local`
- **Reuse your local login/cookies**: `browse env local --auto-connect`
- **Simple browsing** (docs, wikis, public APIs): local mode is fine
- **Protected sites** (login walls, CAPTCHAs, anti-scraping): use remote mode
- **If local mode fails** with bot detection or access denied: switch to remote mode

## Commands

All commands work identically in both modes. The daemon auto-starts on first command.

### Navigation
```bash
browse open <url>                        # Go to URL (aliases: goto)
browse open <url> --context-id <id>      # Load Browserbase context (remote only)
browse open <url> --context-id <id> --persist  # Load context + save changes back
browse reload                            # Reload current page
browse back                              # Go back in history
browse forward                           # Go forward in history
```

### Page state (prefer snapshot over screenshot)
```bash
browse snapshot                          # Get accessibility tree with element refs (fast, structured)
browse screenshot [path]                 # Take visual screenshot (slow, uses vision tokens)
browse get url                           # Get current URL
browse get title                         # Get page title
browse get text <selector>               # Get text content (use "body" for all text)
browse get html <selector>               # Get HTML content of element
browse get value <selector>              # Get form field value
```

Use `browse snapshot` as your default for understanding page state — it returns the accessibility tree with element refs you can use to interact. Only use `browse screenshot` when you need visual context (layout, images, debugging).

### Interaction
```bash
browse click <ref>                       # Click element by ref from snapshot (e.g., @0-5)
browse type <text>                       # Type text into focused element
browse fill <selector> <value>           # Fill input and press Enter
browse select <selector> <values...>     # Select dropdown option(s)
browse upload <selector> <files...>      # Upload file(s) to <input type="file">
browse press <key>                       # Press key (Enter, Tab, Escape, Cmd+A, etc.)
browse drag <fromX> <fromY> <toX> <toY>  # Drag from one point to another
browse scroll <x> <y> <deltaX> <deltaY> # Scroll at coordinates
browse highlight <selector>              # Highlight element on page
browse is visible <selector>             # Check if element is visible
browse is checked <selector>             # Check if element is checked
browse wait <type> [arg]                 # Wait for: load, selector, timeout
```

### Session management
```bash
browse stop                              # Stop the browser daemon (also clears env override)
browse status                            # Check daemon status (includes env)
browse env                               # Show current environment (local or remote)
browse env local                         # Use clean isolated local browser
browse env local --auto-connect          # Reuse existing Chrome, fallback to isolated
browse env local <port|url>              # Attach to a specific CDP target
browse env remote                        # Switch to Browserbase (requires API keys)
browse pages                             # List all open tabs
browse tab_switch <index>                # Switch to tab by index
browse tab_close [index]                 # Close tab
```

### Typical workflow
If the environment matters, set it first with `browse env local`, `browse env local --auto-connect`, or `browse env remote`.

1. `browse open <url>` — navigate to the page
2. `browse snapshot` — read the accessibility tree to understand page structure and get element refs
3. `browse click <ref>` / `browse type <text>` / `browse fill <selector> <value>` — interact using refs from snapshot
4. `browse snapshot` — confirm the action worked
5. Repeat 3-4 as needed
6. `browse stop` — close the browser when done

## Quick Example

```bash
browse open https://example.com
browse snapshot                          # see page structure + element refs
browse click @0-5                        # click element with ref 0-5
browse get title
browse stop
```

## Mode Comparison

| Feature | Local | Browserbase |
|---------|-------|-------------|
| Speed | Faster | Slightly slower |
| Setup | Chrome required | API key required |
| Reuse existing local cookies | With `browse env local --auto-connect` | N/A |
| Stealth mode | No | Yes (custom Chromium, anti-bot fingerprinting) |
| CAPTCHA solving | No | Yes (automatic reCAPTCHA/hCaptcha) |
| Residential proxies | No | Yes (201 countries, geo-targeting) |
| Session persistence | No | Yes (cookies/auth persist via contexts) |
| Best for | Development/simple pages | Protected sites, bot detection, production scraping |

## Best Practices

1. **Choose the local strategy deliberately**: use `browse env local` for clean state, `browse env local --auto-connect` for existing local credentials, and `browse env remote` for protected sites
2. **Always `browse open` first** before interacting
3. **Use `browse snapshot`** to check page state — it's fast and gives you element refs
4. **Only screenshot when visual context is needed** (layout checks, images, debugging)
5. **Use refs from snapshot** to click/interact — e.g., `browse click @0-5`
6. **`browse stop`** when done to clean up the browser session and clear the env override

## Troubleshooting

- **"No active page"**: Run `browse stop`, then check `browse status`. If it still says running, kill the zombie daemon with `pkill -f "browse.*daemon"`, then retry `browse open`
- **Chrome not found**: Install Chrome, use `browse env local --auto-connect` if you already have a debuggable Chrome running, or switch to `browse env remote`
- **Action fails**: Run `browse snapshot` to see available elements and their refs
- **Browserbase fails**: Verify API key is set

## Switching to Remote Mode

Switch to remote when you detect: CAPTCHAs (reCAPTCHA, hCaptcha, Turnstile), bot detection pages ("Checking your browser..."), HTTP 403/429, empty pages on sites that should have content, or the user asks for it.

Don't switch for simple sites (docs, wikis, public APIs, localhost).

```bash
browse env local             # clean isolated local browser
browse env local --auto-connect  # reuse existing Chrome state
browse env remote            # switch to Browserbase
```

Overrides are scoped per session and stay in effect until you switch again or run `browse stop`. After `browse stop`, the next start falls back to env-var-based auto detection. Use `browse status` to inspect the resolved local strategy while the daemon is running.

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For API reference, see [REFERENCE.md](REFERENCE.md).
