# Browser Observability — Examples

Five end-to-end debug scenarios. Each one shows: setup, running the capture, and the queries you'd run on the resulting tree.

The recipes below use raw `jq` on the bisected files so you can see exactly what's there. Most everyday drill-down can also be done through `scripts/query.mjs <run-id> <command>` — see SKILL.md.

## Example 1: A form submit failed — find the request and see the page state

**User says**: "The signup form submit isn't working. I clicked Submit and nothing happened."

```bash
# Launch debuggable Chrome and start the observer.
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-o11y about:blank &
node scripts/start-capture.mjs 9222 form-bug

# Reproduce the bug.
browse env local 9222
browse open https://example.com/signup
browse fill 'input[name=email]' 'user@example.com'
browse fill 'input[name=password]' 'hunter2'
browse click @0-7   # Submit button ref from `browse snapshot`

node scripts/stop-capture.mjs form-bug
node scripts/bisect-cdp.mjs form-bug
```

Then the agent inspects:

```bash
cd .o11y/form-bug

# Did the POST go out?
jq -c 'select(.params.request.method == "POST")
       | {url: .params.request.url, body: .params.request.postData}' \
  cdp/network/requests.jsonl

# Did it 4xx/5xx?
jq -c 'select(.params.response.status >= 400)
       | {status: .params.response.status, url: .params.response.url}' \
  cdp/network/responses.jsonl

# Any console error around that time?
jq -c 'select(.params.type == "error")' cdp/console/logs.jsonl

# Was a JS exception thrown when you clicked?
jq -c '.params.exceptionDetails
       | {text, url, line: .lineNumber}' cdp/console/exceptions.jsonl

# Open the DOM dump captured right after the click
ls dom/ | tail -3
```

If the POST is missing entirely, the click handler is broken — open `dom/<latest>.html` and look at the button. If the POST returned 4xx, look at the body in `network/responses.jsonl`. If an exception fired, the stack frame in `console/exceptions.jsonl` points at the file and line.

## Example 2: Audit every 4xx/5xx and every third-party request in a run

**User says**: "Are we leaking any data to third parties on this page? Show me every cross-origin request."

```bash
node scripts/start-capture.mjs 9222 audit
browse env local 9222
browse open https://your-site.example
# ...interact with the page...
node scripts/stop-capture.mjs audit
node scripts/bisect-cdp.mjs audit
```

Queries:

```bash
cd .o11y/audit

# Top hosts and counts
jq -r '.params.request.url' cdp/network/requests.jsonl \
  | awk -F/ '{print $3}' | sort | uniq -c | sort -rn

# Everything not on your-site.example
jq -r 'select(.params.request.url | test("your-site\\.example") | not)
       | .params.request.url' cdp/network/requests.jsonl | sort -u

# All non-2xx responses with their initiator
jq -c 'select(.params.response.status >= 400 and .params.response.status < 600)
       | {status: .params.response.status,
          url: .params.response.url,
          mime: .params.response.mimeType}' cdp/network/responses.jsonl
```

## Example 3: Find where the page got stuck

**User says**: "The page hangs after I click Continue. It just sits there."

```bash
node scripts/start-capture.mjs 9222 hang
browse env local 9222
browse open https://example.com/checkout
browse click @0-12   # Continue button
sleep 30             # let the hang play out
node scripts/stop-capture.mjs hang
node scripts/bisect-cdp.mjs hang
```

Queries:

```bash
cd .o11y/hang

# Last navigation that completed
jq -r '.params.frame.url' cdp/page/navigations.jsonl | tail

# Pending requests: requestWillBeSent without a corresponding loadingFinished/Failed
jq -s '
  ([.[0][].params.requestId] - [.[1][].params.requestId] - [.[2][].params.requestId]) as $pending |
  .[0] | map(select(.params.requestId | IN($pending[]))) | map(.params.request.url)
' cdp/network/requests.jsonl cdp/network/finished.jsonl cdp/network/failed.jsonl

# Any JS dialog blocking?
cat cdp/page/dialogs.jsonl

# Look at the last screenshot to see what the user is staring at
ls screenshots/ | tail -1
```

The pending-requests query is the smoking gun: if a fetch never finishes, the page is waiting on it.

## Example 4: Reproduce a JS exception from production and locate the source

**User says**: "Production logs say `TypeError: Cannot read properties of undefined (reading 'foo')` on `/dashboard`. I can't reproduce locally."

```bash
# Use Browserbase remote so the run uses the same Chromium build / stealth as prod.
export BROWSERBASE_API_KEY=...
SESSION=$(bb sessions create --keep-alive --timeout 600)
SID=$(echo "$SESSION" | jq -r .id)
URL=$(echo "$SESSION" | jq -r .connectUrl)

browse --connect "$SID" open https://app.example.com/dashboard
node scripts/start-capture.mjs "$URL" prod-repro

# Drive whatever flow is suspected.
browse --connect "$SID" click @0-5
browse --connect "$SID" type 'search query'
browse --connect "$SID" press Enter
sleep 5

node scripts/stop-capture.mjs prod-repro
node scripts/bisect-cdp.mjs prod-repro
bb sessions update "$SID" --status REQUEST_RELEASE
```

Queries:

```bash
cd .o11y/prod-repro

# Any matching exceptions?
jq -c '.params.exceptionDetails | select(.text | test("Cannot read properties of undefined"))
       | {text, url, line: .lineNumber, col: .columnNumber, stack: .stackTrace.callFrames[0:5]}' \
  cdp/console/exceptions.jsonl

# Get the Runtime.exceptionThrown timestamp and find the screenshot/dom right before it
EVT_MS=$(jq -r 'select(.params.exceptionDetails.text | test("Cannot read"))
                | .params.timestamp' cdp/console/exceptions.jsonl | head -1)
EVT_ISO=$(date -u -r $((${EVT_MS%.*}/1000)) +%Y%m%dT%H%M%SZ)
ls screenshots/ | sort | awk -v t="$EVT_ISO" '$0 < t { keep=$0 } END { print keep }'

# What network requests were in flight when it threw?
jq -c --argjson t "$EVT_MS" '
  select(.params.timestamp <= $t/1000 and .params.timestamp > ($t/1000 - 5))
  | {ts: .params.timestamp, url: .params.request.url}
' cdp/network/requests.jsonl
```

The stack frame points at the prod JS file + line; the screenshot shows what the user was looking at; the network query shows what XHRs were in flight in the 5 seconds before the throw.

## Example 5: Attach observability to a Browserbase session that is already running

**User says**: "Our staging worker is running a Browserbase session right now and the customer says it's stuck. Can you attach without killing it?"

```bash
export BROWSERBASE_API_KEY=...

# Find running sessions (no --status flag, so filter client-side).
bb sessions list | jq -r '.[] | select(.status == "RUNNING") | "\(.id)\t\(.region)\t\(.startedAt)"'

# Attach the observer to the session you care about.
SID=<session-id-from-above>
node scripts/bb-capture.mjs "$SID" stuck-debug 2

# Open the live debugger URL in your browser to watch interactively.
open "$(jq -r '.browserbase.debugger_url' .o11y/stuck-debug/manifest.json)"

# Let it record for a minute or two while the worker does whatever it does.
sleep 120

# Stop the observer and pull artifacts. NO --release: the worker still owns this session.
node scripts/stop-capture.mjs stuck-debug
node scripts/bisect-cdp.mjs stuck-debug
node scripts/bb-finalize.mjs stuck-debug
```

Then look for the smoking gun:

```bash
cd .o11y/stuck-debug

# Pending requests that never finished — the most common cause of "stuck"
jq -s '
  ([.[0][].params.requestId] - [.[1][].params.requestId] - [.[2][].params.requestId]) as $pending |
  .[0] | map(select(.params.requestId | IN($pending[])))
       | map({age_s: (now - .params.timestamp), url: .params.request.url})
' cdp/network/requests.jsonl cdp/network/finished.jsonl cdp/network/failed.jsonl

# Last DOMContentLoaded / load on the top frame — when did the page actually settle?
jq -c 'select(.params.frameId == .params.loaderId or .params.frameId != null)
       | select(.params.name == "DOMContentLoaded" or .params.name == "load")
       | {name: .params.name, ts: .params.timestamp}' cdp/page/lifecycle.jsonl | tail

# How much has Browserbase billed in proxy bytes so far?
jq '.proxyBytes' browserbase/session.json
```

**Key idea**: `bb-capture.mjs <session-id>` (no `--new`) only adds an observer; it never sends action commands. The production worker keeps running. `bb-finalize.mjs` *without* `--release` leaves the session alive when you're done.
