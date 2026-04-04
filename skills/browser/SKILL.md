---
name: browser
description: Automate web browser interactions using natural language via CLI commands. Use when the user asks to browse websites, navigate web pages, extract data from websites, take screenshots, fill forms, click buttons, or interact with web applications. Supports remote Browserbase sessions with automatic CAPTCHA solving, anti-bot stealth mode, and residential proxies — ideal for scraping protected websites, bypassing bot detection, and interacting with JavaScript-heavy pages.
compatibility: "Requires the browse CLI (`npm install -g @browserbasehq/browse-cli`). Remote Browserbase sessions need `BROWSERBASE_API_KEY`. Local mode uses Chrome/Chromium on your machine."
license: MIT
allowed-tools: Bash Read Write Edit Glob
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

## Step 1 — BEFORE doing anything else: Setup + Memory Check

Run this as your VERY FIRST action for any browsing task. Do NOT run `browse open` before this:

```bash
which browse || npm install -g @browserbasehq/browse-cli
mkdir -p ${CLAUDE_SKILL_DIR}/memory
echo "=== SITE MEMORY ==="
cat ${CLAUDE_SKILL_DIR}/memory/MEMORY_FILE.md 2>/dev/null || echo "NO MEMORY — will need to snapshot after opening"
```

Replace MEMORY_FILE with the domain, using dashes for dots/colons/slashes (e.g., `news-ycombinator-com`, `github-com`, `localhost-3000`).

**If site memory exists**: You have selectors from previous visits. After `browse open`, use them IMMEDIATELY for selector-based commands. If you need to click, run `browse snapshot` first to get refs. Example:

```bash
# Memory says story titles use ".titleline > a" — use it directly:
browse open https://news.ycombinator.com
browse get text ".titleline > a"           # ← use cached selector, NO snapshot
```

Run `browse snapshot` when you need click refs or if a cached selector fails (returns an error). Trust the memory.

**If no memory exists**: After `browse open`, use `browse snapshot` to discover the page.

## Step 2 — Browse

### Environment Selection (Local vs Remote)

The CLI supports explicit per-session environment overrides. If you do nothing, the next session defaults to Browserbase when `BROWSERBASE_API_KEY` is set and to local otherwise.

#### Local mode
- `browse env local` starts a clean isolated local browser
- `browse env local --auto-connect` reuses an already-running debuggable Chrome and falls back to isolated if nothing is available
- `browse env local <port|url>` attaches to a specific CDP target
- Best for: development, localhost, trusted sites, and reproducible runs

#### Remote mode (Browserbase)
- `browse env remote` switches the current session to Browserbase
- Without a local override, Browserbase is also the default when `BROWSERBASE_API_KEY` is set
- Provides: anti-bot stealth, automatic CAPTCHA solving, residential proxies, session persistence
- **Use remote mode when:** the target site has bot detection, CAPTCHAs, IP rate limiting, Cloudflare protection, or requires geo-specific access
- Get credentials at https://browserbase.com/settings

#### When to choose which
- **Repeatable local testing / clean state**: `browse env local`
- **Reuse your local login/cookies**: `browse env local --auto-connect`
- **Simple browsing** (docs, wikis, public APIs): local mode is fine
- **Protected sites** (login walls, CAPTCHAs, anti-scraping): use remote mode
- **If local mode fails** with bot detection or access denied: switch to remote mode

### Commands

All commands work identically in both modes. The daemon auto-starts on first command.

#### Navigation
```bash
browse open <url>                        # Go to URL (aliases: goto)
browse open <url> --context-id <id>      # Load Browserbase context (remote only)
browse open <url> --context-id <id> --persist  # Load context + save changes back
browse reload                            # Reload current page
browse back                              # Go back in history
browse forward                           # Go forward in history
```

#### Page state (prefer snapshot over screenshot)
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

#### Interaction
```bash
browse click <ref>                       # Click element by ref from snapshot (e.g., @0-5)
browse type <text>                       # Type text into focused element
browse fill <selector> <value>           # Fill input and press Enter
browse select <selector> <values...>     # Select dropdown option(s)
browse press <key>                       # Press key (Enter, Tab, Escape, Cmd+A, etc.)
browse drag <fromX> <fromY> <toX> <toY>  # Drag from one point to another
browse scroll <x> <y> <deltaX> <deltaY> # Scroll at coordinates
browse highlight <selector>              # Highlight element on page
browse is visible <selector>             # Check if element is visible
browse is checked <selector>             # Check if element is checked
browse wait <type> [arg]                 # Wait for: load, selector, timeout
```

#### Session management
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

## Step 3 — AFTER completing the task: Save Site Memory

You MUST do this after every browsing task. Do NOT skip it.

Use the Write tool to create or update `${CLAUDE_SKILL_DIR}/memory/<domain>.md`:

```markdown
# <domain>

Last updated: <YYYY-MM-DD>

## <page-path> — <short description>

### Elements
- **<Element Name>**: `<selector>` — <what it does>

### Patterns
- <Multi-step flow that works>

### Notes
- <Gotchas, async loading, timing>
```

Rules for memory files:
- Record **stable selectors** for selector-based commands (`get`, `fill`, `is`, `highlight`): `input[name="email"]`, `[data-testid="..."]`, `button[type="submit"]` — NOT just snapshot refs like `@0-5`
- Use **URL patterns**: `/users/:id` not `/users/123` when pages share structure
- Note **async behavior**: "table loads after ~2s", "button disabled until form valid"
- Be **generous**: record all interactive elements, not just the ones you used
- If a cached selector failed, **update it** with the working one you found

## Typical Workflow (all 3 steps)

If the environment matters, set it first with `browse env local`, `browse env local --auto-connect`, or `browse env remote`.

1. **Read site memory** (MANDATORY): `cat ${CLAUDE_SKILL_DIR}/memory/<domain>.md`
2. `browse open <url>` — navigate to the page
3. If memory had selectors, use them directly for selector-based commands. If you need to click (or have no memory): `browse snapshot`
4. Interact: `browse click` (ref from snapshot) / `browse type` / `browse fill`
5. `browse snapshot` to confirm (if needed)
6. Repeat 3-5
7. **Write site memory** (MANDATORY): update `${CLAUDE_SKILL_DIR}/memory/<domain>.md`
8. `browse stop` — close browser when done

## Quick Example

```bash
# STEP 1: Setup + memory check
which browse || npm install -g @browserbasehq/browse-cli
mkdir -p ${CLAUDE_SKILL_DIR}/memory
cat ${CLAUDE_SKILL_DIR}/memory/example-com.md 2>/dev/null || echo "NO MEMORY"

# STEP 2: Browse
browse open https://example.com
browse snapshot                          # only if no memory, or cached selectors failed
browse click @0-5
browse get title

# STEP 3: Save memory (use Write tool)
# Write ${CLAUDE_SKILL_DIR}/memory/example-com.md with elements + patterns

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

1. **ALWAYS read site memory before browsing** — this is not optional
2. **ALWAYS write site memory after browsing** — this is not optional
3. **Choose the local strategy deliberately**: `browse env local` for clean state, `--auto-connect` for existing credentials, `remote` for protected sites
4. **Use `browse snapshot`** when no memory exists, when cached selectors fail, or when you need refs for `browse click`
5. **Only screenshot when visual context is needed** (layout checks, images, debugging)
6. **Use refs from snapshot** to click/interact — e.g., `browse click @0-5`
7. **`browse stop`** when done to clean up the browser session and clear the env override

## Troubleshooting

- **"No active page"**: Run `browse stop`, then check `browse status`. If it still says running, kill the zombie daemon with `pkill -f "browse.*daemon"`, then retry `browse open`
- **Chrome not found**: Install Chrome, use `browse env local --auto-connect` if you already have a debuggable Chrome running, or switch to `browse env remote`
- **Action fails**: Run `browse snapshot` to see available elements and their refs
- **Browserbase fails**: Verify API key is set
- **Cached selector fails**: Take a fresh `browse snapshot`, find the updated selector, update the memory file

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
