# Browser Automation CLI Reference

Technical reference for the `browse` CLI tool.

## Architecture

The browse CLI is a **daemon-based** command-line tool:

- **Daemon process**: A background process manages the browser instance. Auto-starts on the first command (e.g., `browse open`), persists across commands, and stops with `browse stop`.
- **Local mode** (default): Launches a local Chrome/Chromium instance.
- **Remote mode** (Browserbase): Connects to a Browserbase cloud browser session when `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are set.
- **Accessibility-first**: Use `browse snapshot` to get the page's accessibility tree with element refs, then interact using those refs.

## Command Reference

### Navigation

#### `open <url>`

Navigate to a URL. Alias: `goto`. Auto-starts the daemon if not running.

```bash
browse open https://example.com
```

#### `reload`

Reload the current page.

```bash
browse reload
```

#### `back` / `forward`

Navigate browser history.

```bash
browse back
browse forward
```

---

### Page State

#### `snapshot`

Get the accessibility tree with interactive element refs. This is the primary way to understand page structure.

```bash
browse snapshot
```

Returns a text representation of the page with refs like `@0-5` that can be passed to `click`.

#### `screenshot [path]`

Take a visual screenshot. Slower than snapshot and uses vision tokens.

```bash
browse screenshot                        # auto-generated path
browse screenshot ./capture.png          # custom path
```

#### `get <property> [selector]`

Get page properties. Available properties: `url`, `title`, `text`, `html`, `value`, `box`.

```bash
browse get url                           # current URL
browse get title                         # page title
browse get text "body"                   # all visible text (selector required)
browse get text ".product-info"          # text within a CSS selector
browse get html "#main"                  # HTML of an element
browse get value "#email-input"          # value of a form field
browse get box "#header"                 # bounding box of an element
```

**Note**: `get text` requires a CSS selector argument — use `"body"` for full page text. `get html` may error on some browse-cli versions (v0.1.4); use `get text` or `snapshot` as alternatives.

---

### Interaction

#### `click <ref>`

Click an element by its ref from `browse snapshot` output.

```bash
browse click @0-5                        # click element with ref 0-5
```

#### `click_xy <x> <y>`

Click at exact viewport coordinates.

```bash
browse click_xy 500 300
```

#### `type <text>`

Type text into the currently focused element.

```bash
browse type "Hello, world!"
```

#### `fill <selector> <value>`

Fill an input element matching a CSS selector and press Enter.

```bash
browse fill "#search" "OpenClaw documentation"
browse fill "input[name=email]" "user@example.com"
```

#### `select <selector> <values...>`

Select option(s) from a dropdown.

```bash
browse select "#country" "United States"
browse select "#tags" "javascript" "typescript"    # multi-select
```

#### `press <key>`

Press a keyboard key or key combination.

```bash
browse press Enter
browse press Tab
browse press Escape
browse press Cmd+A                       # select all (Mac)
browse press Ctrl+C                      # copy (Linux/Windows)
```

#### `scroll <x> <y> <deltaX> <deltaY>`

Scroll at a given position by a given amount.

```bash
browse scroll 500 300 0 -300             # scroll up at (500, 300)
browse scroll 500 300 0 500              # scroll down
```

#### `wait <type> [arg]`

Wait for a condition.

```bash
browse wait load                         # wait for page load
browse wait "selector" ".results"        # wait for element to appear
browse wait timeout 3000                 # wait 3 seconds
```

---

### Session Management

#### `start`

Start the browser daemon manually. Usually not needed — the daemon auto-starts on first command.

```bash
browse start
```

#### `stop`

Stop the browser daemon and close the browser.

```bash
browse stop
```

#### `status`

Check whether the daemon is running, its connection details, and current mode.

```bash
browse status
```

#### `mode [local|remote]`

Show or switch the daemon's execution mode. Without arguments, prints the current mode. With an argument, stops the running daemon and restarts in the specified mode. The switch is sticky — subsequent commands stay in the chosen mode until you switch again or run `browse stop`.

```bash
browse mode                              # print current mode
browse mode local                        # switch to local Chrome
browse mode remote                       # switch to Browserbase (requires API keys)
```

#### `pages`

List all open tabs.

```bash
browse pages
```

#### `tab_switch <index>`

Switch to a tab by its index (from `browse pages`).

```bash
browse tab_switch 1
```

#### `tab_close [index]`

Close a tab. Closes current tab if no index given.

```bash
browse tab_close          # close current tab
browse tab_close 2        # close tab at index 2
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSERBASE_API_KEY` | For remote mode | API key from https://browserbase.com/settings |
| `BROWSERBASE_PROJECT_ID` | For remote mode | Project ID from Browserbase dashboard |

When both are set, the CLI uses Browserbase remote sessions. Otherwise, it falls back to local Chrome.

The Browserbase OpenClaw plugin automatically bridges credentials from `~/.openclaw/openclaw.json` into these environment variables on startup.

### Setting credentials

```bash
# Via OpenClaw plugin (recommended)
openclaw browserbase setup

# Via environment variables (manual)
export BROWSERBASE_API_KEY="bb_live_..."
export BROWSERBASE_PROJECT_ID="proj_..."
```

---

## Error Messages

**"No active page"**
- The daemon is running but has no page open.
- Fix: Run `browse open <url>`. If the issue persists, run `browse stop` and retry. For zombie daemons: `pkill -f "browse.*daemon"`.

**"Chrome not found"** / **"Could not find local Chrome installation"**
- Chrome/Chromium is not installed or not in a standard location.
- Fix: Install Chrome, or use Browserbase remote mode (no local browser needed).

**"Daemon not running"**
- No daemon process is active. Most commands auto-start the daemon, but `snapshot`, `click`, etc. require an active session.
- Fix: Run `browse open <url>` to start a session.

**Element ref not found (e.g., "@0-5")**
- The ref from a previous snapshot is no longer valid (page changed).
- Fix: Run `browse snapshot` again to get fresh refs.

**Timeout errors**
- The page took too long to load or an element didn't appear.
- Fix: Try `browse wait load` before interacting, or increase wait time.

---

## Typical Workflow

```
1. browse open <url>           → navigate to the page
2. browse snapshot             → read accessibility tree, get element refs
3. browse click/type/fill      → interact using refs from step 2
4. browse snapshot             → verify action worked
5. repeat 3-4 as needed
6. browse stop                 → clean up
```

---

## Local vs Remote Mode

| Feature | Local | Remote (Browserbase) |
|---------|-------|----------------------|
| Speed | Faster | Slightly slower |
| Setup | Local Chrome required | API key required |
| Anti-bot stealth | No | Yes |
| CAPTCHA solving | No | Yes (reCAPTCHA, hCaptcha) |
| Residential proxies | No | Yes (201 countries) |
| Session persistence | No | Yes |
| Best for | Dev, simple pages | Protected sites, production scraping |
