# Browser Automation CLI Reference

Technical reference for the `browse` CLI tool.

## Table of Contents

- [Architecture](#architecture)
- [Command Reference](#command-reference)
  - [Navigation](#navigation)
  - [Page State](#page-state)
  - [Interaction](#interaction)
  - [Session Management](#session-management)
  - [JavaScript Evaluation](#javascript-evaluation)
  - [Viewport](#viewport)
  - [Network Capture](#network-capture)
- [Configuration](#configuration)
  - [Global Flags](#global-flags)
  - [Environment Variables](#environment-variables)
- [Error Messages](#error-messages)

## Architecture

The browse CLI is a **daemon-based** command-line tool:

- **Daemon process**: A background process manages the browser instance. Auto-starts on the first command (e.g., `browse open`), persists across commands, and stops with `browse stop`.
- **Local mode**: `browse open <url> --local` launches a clean isolated local browser. It is the default when `BROWSERBASE_API_KEY` is unset. Use `browse open <url> --auto-connect` to attach to an existing debuggable Chrome, or `browse open <url> --cdp <port|url>` to attach to a specific CDP target.
- **Remote mode** (Browserbase): Connects to a Browserbase cloud browser session when `BROWSERBASE_API_KEY` is set.
- **Accessibility-first**: Use `browse snapshot` to get the page's accessibility tree with element refs, then interact using those refs.

## Command Reference

### Navigation

#### `open <url>`

Navigate to a URL. Auto-starts the daemon if not running.

```bash
browse open https://example.com
browse open https://example.com --wait networkidle   # wait for all network requests to finish (useful for SPAs)
browse open https://example.com --wait domcontentloaded
```

The `--wait` flag controls when navigation is considered complete. Values: `load` (default), `domcontentloaded`, `networkidle`. Use `networkidle` for JavaScript-heavy pages that fetch data after initial load.

##### Context persistence (remote mode only)

Create a Browserbase session with `browse cloud sessions create --context-id <id>`, then attach to its CDP endpoint with `browse open <url> --cdp <connectUrl>`. Add `--persist` to the cloud session if state changes should save back to the context.

```bash
SESSION_JSON="$(browse cloud sessions create --context-id ctx_abc123 --persist --keep-alive)"
SESSION_ID="$(echo "$SESSION_JSON" | jq -r .id)"
CONNECT_URL="$(echo "$SESSION_JSON" | jq -r .connectUrl)"

browse open https://example.com --cdp "$CONNECT_URL"
# ...interact with the page...
browse stop
browse cloud sessions update "$SESSION_ID" --status REQUEST_RELEASE
```

- `--context-id <id>` — Browserbase context ID to load when creating the cloud session.
- `--persist` — Save cookies/storage changes back to the context when the Browserbase session is released. Requires `--context-id`.
- `--keep-alive` — Keep the Browserbase session alive while the local browse daemon attaches and detaches.
- After `browse open ... --cdp "$CONNECT_URL"`, follow-up commands in that session do not repeat `--cdp`; the daemon remembers the attached target.

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
browse snapshot --compact                # tree only, no ref maps
```

Returns a text representation of the page with refs like `@0-5` that can be passed to `click`. Use `--compact` for shorter output when you only need the tree.

#### `screenshot [path]`

Take a visual screenshot. Slower than snapshot and uses vision tokens.

```bash
browse screenshot                        # print base64 JSON
browse screenshot --path ./capture.png   # custom path
browse screenshot --full-page            # capture entire scrollable page
```

#### `get <property> [selector]`

Get page properties. Available properties: `url`, `title`, `text`, `html`, `markdown`, `value`, `box`, `visible`, `checked`.

```bash
browse get url                           # current URL
browse get title                         # page title
browse get text "body"                   # all visible text (selector required)
browse get text ".product-info"          # text within a CSS selector
browse get html "#main"                  # inner HTML of an element
browse get markdown                      # full page body as markdown
browse get markdown ".article"           # specific element as markdown
browse get value "#email-input"          # value of a form field
browse get box "#header"                 # bounding box (centroid coordinates)
browse get visible ".modal"              # check if element is visible
browse get checked "#agree"              # check if checkbox/radio is checked
```

**Note**: `get text` and `get html` require a selector argument — use `"body"` for full page content. `get markdown` defaults to body when no selector is given.

**Tip**: Prefer `get markdown` over `get text` or `get html` when you need readable page content for analysis — it preserves links, headings, and structure without HTML noise.

#### `refs`

Show the cached ref map from the last `browse snapshot`. Useful for looking up element refs without re-running a full snapshot.

```bash
browse refs
```

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

#### `hover <x> <y>`

Hover at viewport coordinates.

```bash
browse hover 500 300
```

#### `type <text>`

Type text into the currently focused element.

```bash
browse type "Hello, world!"
browse type "slow typing" --delay 100    # 100ms between keystrokes
browse type "human-like" --mistakes      # simulate human typing with typos
```

#### `fill <selector> <value>`

Fill an input element matching a CSS selector. Add `--press-enter` when Enter is needed.

```bash
browse fill "#search" "browser automation"
browse fill "input[name=email]" "user@example.com"
browse fill "#search" "query" --press-enter   # fill and press Enter
```

#### `select <selector> <values...>`

Select option(s) from a dropdown.

```bash
browse select "#country" "United States"
browse select "#tags" "javascript" "typescript"    # multi-select
```

#### `upload <selector> <files...>`

Upload file(s) to an `<input type="file">` element. Works with both local and remote Browserbase sessions (remote uses base64 injection). Supports ref-based selectors from snapshot.

```bash
browse upload "#fileUpload" ./document.pdf          # single file
browse upload @0-5 ./photo.png                      # using ref from snapshot
browse upload "#files" ./a.png ./b.png              # multiple files
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

#### `mouse scroll <x> <y> <deltaX> <deltaY>`

Scroll at a given position by a given amount.

```bash
browse mouse scroll 500 300 0 -300       # scroll up at (500, 300)
browse mouse scroll 500 300 0 500        # scroll down
```

#### `mouse drag <fromX> <fromY> <toX> <toY>`

Drag from one viewport coordinate to another.

```bash
browse mouse drag 80 80 310 100                # drag with default 10 steps
browse mouse drag 80 80 310 100 --steps 20     # more intermediate steps
browse mouse drag 80 80 310 100 --delay 50     # 50ms between steps
browse mouse drag 80 80 310 100 --button right # use right mouse button
browse mouse drag 80 80 310 100 --return-xpath # return source/target XPaths
```

#### `highlight <selector>`

Highlight an element on the page for visual debugging.

```bash
browse highlight "#submit-btn"           # highlight for 2 seconds (default)
browse highlight ".nav" -d 5000          # highlight for 5 seconds
```

#### `is <check> <selector>`

Check element state. Available checks: `visible`, `checked`.

```bash
browse is visible ".modal"               # returns { visible: true/false }
browse is checked "#agree"               # returns { checked: true/false }
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
browse stop --force                      # force kill if daemon is unresponsive
```

#### `status`

Check whether the daemon is running, its connection details, and current environment.

```bash
browse status
```

#### Starting sessions with a mode flag

Choose the browser target on the command that starts the session:

```bash
browse open https://example.com --local
browse open https://example.com --local --headed
browse open https://example.com --auto-connect
browse open https://example.com --cdp 9222
browse open https://example.com --cdp ws://localhost:9222/devtools/browser/...
browse open https://example.com --remote
```

- `browse status` shows the resolved mode and active target once the daemon is running.
- `browse stop` closes the current daemon session; the next `browse open` chooses mode from its flags or environment.

#### `tab new [url]`

Create a new tab, optionally navigating to a URL.

```bash
browse tab new                           # open blank tab
browse tab new https://example.com       # open tab with URL
```

#### `tab list`

List all open tabs.

```bash
browse tab list
```

#### `tab switch <index-or-target-id>`

Switch to a tab by its index or target ID (from `browse tab list`).

```bash
browse tab switch 1
```

#### `tab close [index-or-target-id]`

Close a tab. Closes current tab if no index given. The CLI refuses to close the last remaining tab.

```bash
browse tab close          # close current tab
browse tab close 2        # close tab at index 2
```

---

### JavaScript Evaluation

#### `eval <expression>`

Evaluate JavaScript in the page context.

```bash
browse eval "document.title"
browse eval "document.querySelectorAll('a').length"
```

---

### Viewport

#### `viewport <width> <height>`

Set the browser viewport size.

```bash
browse viewport 1920 1080
```

---

### Network Capture

Capture network requests to the filesystem for inspection.

#### `network on`

Enable network request capture. Creates a temp directory where requests and responses are saved as JSON files.

```bash
browse network on
```

#### `network off`

Disable network capture.

```bash
browse network off
```

#### `network path`

Show the capture directory path.

```bash
browse network path
```

#### `network clear`

Clear all captured requests.

```bash
browse network clear
```

---

### CDP Event Tailing

#### `cdp <url|port>`

Attach to any Chrome DevTools Protocol target and stream events as NDJSON (one JSON object per line). This command bypasses the daemon entirely — it opens a direct WebSocket connection and runs until interrupted.

```bash
browse cdp 9222                          # bare port — auto-discovers via /json/version
browse cdp ws://127.0.0.1:9222/devtools/browser/...  # full WebSocket URL
browse cdp wss://connect.browserbase.com/debug/...    # remote Browserbase debug URL
```

**Options:**

| Flag | Description |
|------|-------------|
| `--domain <domains...>` | CDP domains to enable (repeatable). Default: Network, Console, Runtime, Log, Page |
| `--pretty` | Human-readable output instead of JSON. Auto-enabled for TTY |

**Default domains:** Network, Console, Runtime, Log, Page. To capture only specific domains:

```bash
browse cdp 9222 --domain Network                     # network events only
browse cdp 9222 --domain Network --domain Console    # network + console
```

**Piping and filtering:**

```bash
browse cdp 9222 > events.jsonl                       # save to file
browse cdp 9222 | jq '.method'                       # extract method names
browse cdp 9222 | jq 'select(.method == "Network.requestWillBeSent") | .params.request.url'
```

**Pretty output** shows compact one-line summaries:

```
[Target.attachedToTarget] [page] https://example.com
[Network.requestWillBeSent] GET https://example.com/api/data
[Network.responseReceived] 200 https://example.com/api/data
[Runtime.consoleAPICalled] [log] Hello world
[Page.frameNavigated] https://example.com/about
```

**With Browserbase sessions:** Use `bb sessions debug <session-id>` to get the `wsUrl`, then pass it to `browse cdp`:

```bash
# Get the debug WebSocket URL
bb sessions debug <session-id>
# Copy the wsUrl field and pass it to browse cdp
browse cdp wss://connect.browserbase.com/debug/<session-id>/devtools/browser/...
```

---

## Configuration

### Common Flags

#### `--session <name>`

Run commands against a named session, enabling multiple concurrent browsers.

```bash
browse open https://a.com --session work
browse open https://b.com --session personal
```

Context flags such as `--context-id` and `--persist` live on `browse cloud sessions create`; attach to the resulting `connectUrl` with `browse open ... --cdp <connectUrl>`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BROWSE_SESSION` | No | Default session name (alternative to `--session`) |
| `BROWSERBASE_API_KEY` | For remote mode | API key from https://browserbase.com/settings; makes Browserbase the default desired mode when no override is set |
| `BROWSERBASE_PROJECT_ID` | No | Passed through to Browserbase when set |

Without an override, setting `BROWSERBASE_API_KEY` makes Browserbase the default desired mode. Otherwise the default desired mode is local. Use `--local`, `--remote`, `--auto-connect`, or `--cdp <port|url>` on `browse open` when you need an explicit target.

### Setting credentials

```bash
export BROWSERBASE_API_KEY="bb_live_..."
```

Get these values from https://browserbase.com/settings.

---

## Error Messages

**"No active page"**
- The daemon is running but has no page open.
- Fix: Run `browse open <url>`. If the issue persists, run `browse stop` and retry. For zombie daemons: `pkill -f "browse.*daemon"`.

**"Chrome not found"** / **"Could not find local Chrome installation"**
- Chrome/Chromium is not installed or not in a standard location.
- Fix: Install Chrome, use `browse open <url> --auto-connect` if you already have a debuggable Chrome running, or switch to remote with `browse open <url> --remote` (no local browser needed).

**"Daemon not running"**
- No daemon process is active. Most commands auto-start the daemon, but `snapshot`, `click`, etc. require an active session.
- Fix: Run `browse open <url>` to start a session.

**Element ref not found (e.g., "@0-5")**
- The ref from a previous snapshot is no longer valid (page changed).
- Fix: Run `browse snapshot` again to get fresh refs.

**Timeout errors**
- The page took too long to load or an element didn't appear.
- Fix: Try `browse wait load` before interacting, or increase wait time.
