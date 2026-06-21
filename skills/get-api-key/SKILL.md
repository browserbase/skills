---
name: get-api-key
description: Generic browser-automation skill that navigates an authenticated SaaS dashboard, creates or reveals an API key, and returns the secret. Reads the vendor's own docs first to learn the flow, then drives the UI via the `browse` CLI. Use when the user says "get an API key from <site>", "grab a token for <SaaS>", "create an API key on <dashboard>", or wants to pull a freshly-issued secret from any SaaS without doing it manually.
compatibility: "Requires the `browse` CLI (browse 0.7.1+). For remote-mode (cloud browser) flows, also requires `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` and the companion `cookie-sync` skill. Local-mode flows need Chrome launched with `--remote-debugging-port=9222`."
license: MIT
allowed-tools: Bash
---

# Get API Key — Generic SaaS Browser Skill

## Purpose

Drive an authenticated SaaS dashboard via the `browse` CLI to extract a working API key — created on the spot, or revealed if the dashboard supports re-showing existing ones. Designed to work on **any** SaaS dashboard by reading the vendor's own docs to learn the flow, then executing it.

## When to Use

- User asks for an API key / token / secret from a SaaS site they're already logged into.
- User wants to programmatically rotate keys.
- User wants to provision a key for a script and doesn't want to click through the UI.

Do NOT use this skill when:
- The user wants to sign up or log in (this skill assumes auth is already established).
- The user needs a service-account or org-level credential gated behind admin approval (out of scope — skill will fail gracefully).

## Prerequisites — Auth setup (do this FIRST, then call the workflow)

The skill assumes `browse status` reports `browserConnected: true` and the daemon's current page is the user's authenticated dashboard (NOT a sign-in page). Pick one of two setup paths:

### Option A — Local Chrome (simplest; uses user's tabs)

```bash
browse stop                                 # kill any prior daemon
browse open <site-root-url> --auto-connect  # attach to local Chrome with remote-debugging on
browse get url                              # confirm you're NOT on /sign-in
```

The user's local Chrome must already be logged into the target site and launched with `--remote-debugging-port=9222`. On Chrome 136+ the default profile blocks the debug port unless either `chrome://flags/#allow-remote-debugging-for-primary-user-profile` is enabled or Chrome is launched with an explicit `--user-data-dir`. Trade-off: subsequent `browse` commands hijack the user's tab — use Option B if they're working in Chrome.

### Option B — Remote (Browserbase cloud; leaves local Chrome alone)

Requires `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` env vars, plus the `cookie-sync` skill.

```bash
# 1. Sync cookies from local Chrome into a persistent Browserbase context
node ~/.claude/skills/cookie-sync/scripts/cookie-sync.mjs --persist --domains <site-domain>
# → outputs: "Session ID: <sid>" and "Context ID: <ctx>" — keep both

# 2. Stop any existing browse daemon, attach to the cloud session via CDP
browse stop
WS_URL="wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&sessionId=<sid>"
browse open <site-root-url> --cdp "$WS_URL"
browse get url                              # confirm authenticated
```

**If cookie-sync can't reach local Chrome** (Chrome 136+ debug-port mitigation, or no local Chrome at all): create a fresh Browserbase session via API, point the user at the live debugger URL, and have them log into the target site manually inside the cloud browser. The persistent context will retain the cookies.

```bash
# Create session + get live debugger URL
RESP=$(curl -s -X POST "https://api.browserbase.com/v1/sessions" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$BROWSERBASE_PROJECT_ID\",\"keepAlive\":true,\"browserSettings\":{\"context\":{\"id\":\"<ctx>\",\"persist\":true}}}")
SID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s "https://api.browserbase.com/v1/sessions/$SID/debug" \
  -H "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['debuggerFullscreenUrl'])"
# Send that URL to the user, wait for them to confirm login, then attach browse.
```

### ⚠️ Remote-mode caveat: 5-minute idle expiry

Browserbase sessions die after ~5 minutes of inactivity even with `keepAlive: true`. When this happens, the `browse` daemon **still reports `browserConnected: true`** but every command times out with `spawnSync browse ETIMEDOUT` or `No active page in session`. The persistent context (cookies) survives. Recovery: create a fresh session from the same context ID, reattach `browse` via `--cdp <new-ws-url>`, resume. To prevent it: send a `browse get url` ping every ~3 minutes during long flows.

## Browse CLI Reference (browse 0.7.1)

Once attached (either option), use these — **no env-switching needed**:

- `browse get url` — confirm where the browser is sitting (also doubles as a keepalive ping)
- `browse open <url>` — navigate (no flags needed; daemon stays attached)
- `browse snapshot` — accessibility tree; each element gets a `[X-Y]` ref. PRIMARY perception tool.
- `browse click [X-Y]` — click by ref from latest snapshot (include brackets)
- `browse fill <selector> <value>` — fill input AND press Enter (clears existing text — PREFERRED over `type`)
- `browse type <text>` — type into focused element (no clear; rarely needed)
- `browse select <ref> "<option>"` — pick from a native `<select>`. **Multi-word option values must be quoted.**
- `browse get text <selector>` — extract text content from an element ("body" for whole page)
- `browse get value <selector>` — extract input field value
- `browse screenshot --path <path>` — save screenshot. **The `--path` flag is REQUIRED** (without it, prints base64).
- `browse wait timeout <ms>` — fixed delay (use after clicks that trigger animations)
- `browse wait selector "<selector>"` — wait for an element to appear

**DO NOT use these (they don't exist in 0.7.1 or break the session):**
- `browse env local` / `browse env remote` — not a command. Env is determined by how the daemon was attached.
- `browse stop` mid-task — kills the daemon's attachment to your authenticated session.

## Workflow

### Phase 0 — Read the vendor's docs first

Every dev-tool company publishes "how to create an API key" docs. Reading them first is consistently the fastest path because the docs encode the exact nav path, required prerequisites (billing, org selection, scopes), and form fields. Skip this phase only when the site is so simple that nav is obvious from the dashboard root.

**Recipe (browse-driven; no WebSearch/WebFetch needed):**

1. Try a canonical docs URL guess first — cheaper than search. Common patterns:
   - `https://docs.<host>/...`
   - `https://<host>/docs/...`
   - `https://developers.<host>/...`
   - `https://help.<host>/...`
   Example: for `github.com`, `https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens` is the canonical URL.
2. If guessing fails or you're unsure: search via browse.
   ```
   browse open "https://www.google.com/search?q=<site>+create+api+key+docs"
   browse snapshot
   # Click the first result on the vendor's own docs domain (docs.<host>, <host>/docs, etc.)
   ```
3. `browse get text body` and **extract only the numbered step list** under the closest "Creating a..." / "Getting started" / "API keys" heading. DO NOT read the whole docs page — that wastes tokens.
4. Record the docs URL — include it as `doc_url_used` in the final JSON output.
5. Proceed to Phase 1 with the extracted steps as your concrete navigation plan.

**Budget:** ≤ 5 turns for Phase 0. If docs can't be found in 5 turns, fall back to the generic playbook (Phase 2 URL probing) without docs.

**Important — trust the live UI over docs when they disagree.** Docs go stale; vendors redesign nav; some steps describe an account context the current user doesn't have (e.g. "click Organization → Settings" when they only have a personal account). Docs give a roadmap, not selectors. When the live snapshot doesn't match the docs, snapshot and pick the closest equivalent.

### Phase 1 — Verify auth

Phase 0 left the browser on the vendor's docs/search pages, so **navigate back to the dashboard before checking auth** — otherwise the host check below sees the docs URL and falsely reports "not authenticated".

```
browse open <site-root-url>   # return to the target dashboard (skip only if Phase 0 was skipped and you never left it)
browse get url
```
- URL contains the dashboard host AND NOT `/sign-in`, `/login`, `/auth` → proceed.
- Otherwise → return `{"success": false, "error_reasoning": "not authenticated"}`. Do NOT try to log in.

### Phase 2 — Find the API keys page

If Phase 0 surfaced a direct URL, use it. Otherwise, try these common patterns:
- `https://<host>/api-keys`
- `https://<host>/settings/api-keys`
- `https://<host>/settings/keys`
- `https://<host>/settings/api`
- `https://<host>/settings/tokens`
- `https://<host>/settings/developers`
- `https://<host>/account/tokens`
- `https://<host>/account/api-keys`
- `https://<host>/dashboard/api-keys`
- `https://<host>/developers`

After each `browse open`, `browse snapshot` and check the page title / heading. If it's a 404 or the dashboard root, try the next URL.

If none work, snapshot the dashboard and click sidebar/nav items in this order: "API Keys", "API", "Developers", "Settings", "Account", "Integrations", "Tokens". Some dashboards (especially team/org-scoped products) use deeply-nested or generated routes like `/orgs/<id>/<proj>/settings/general` that are not guessable — let the nav tell you.

### Phase 3 — Reveal or create

Snapshot the API keys page. Two paths:

**Reveal path** (some products show existing keys with a re-reveal button):
- If you see a masked key (`sk_•••abc123`) with a "Show" / "Reveal" / eye-icon button → click it → snapshot → extract the now-visible secret. Done.

**Create path** (most modern SaaS hide keys forever after creation):
- Click the create-button. Its label varies — **match by role/position, not exact text**. Common labels: "Create", "Create new...", "New", "Generate", "Add", "+".
- A form appears (modal OR inline at top of page). Fill required fields:
  - **Name**: `autobrowse-<short-timestamp>` (e.g. `autobrowse-4721`)
  - **Scope/permissions**: pick the most permissive **safe** default. Watch out for two failure modes:
    - Default may be over-privileged (rare, but possible) — pick read-only when offered.
    - Default may be under-privileged or team-only when user wanted account-level — explicitly pick the right scope.
  - **Expiration**: pick whatever's pre-selected, OR a short expiration if the form requires a choice and the task is for test/throwaway use.
- Submit. Confirm-button label varies too — same rule: match by role/position, not text.

### Phase 4 — Capture the secret

The secret is shown ONCE in a modal/banner/inline result. Capture immediately:

1. **Screenshot first as a safety net**: `browse screenshot --path <trace_dir>/screenshots/secret-shown.png`
2. **Snapshot the page.** The secret almost always appears inline in the accessibility tree as plain text — read it directly from the snapshot rather than chasing selectors. Most secrets have a recognizable provider-specific prefix (e.g. `sk-`, `pk_`, `gh*_`, etc.) — use the prefix to find the right token in the tree.
3. If the snapshot text is truncated, try `browse get value <input-selector>` (for input fields) or `browse get text <code-selector>` (for `<code>` blocks).

### Phase 5 — Return JSON

```json
{
  "success": true,
  "site": "<hostname>",
  "api_key": "<full-secret>",
  "key_action": "created" | "revealed" | "found_in_plaintext",
  "key_name": "autobrowse-...",
  "doc_url_used": "<docs URL from Phase 0, or null if skipped>",
  "error_reasoning": null
}
```

**Never fabricate a key.** If you can't extract it, return `success: false` with the concrete reason from the page (`"billing required"`, `"workspace selection failed"`, `"create button disabled"`, `"sudo password required"`, etc.).

## Generic UX patterns observed across SaaS

Cross-cutting heuristics that hold across many dashboards:

- **Confirm-button labels vary widely**: "Create", "Add", "Generate", "Save", "New", "+". Always match by role/position in the form, not the exact string.
- **Scope/permission pickers are often custom comboboxes** (Radix, Headless UI, etc.) — NOT native `<select>` elements, even when they look like dropdowns. Keyboard nav (ArrowDown/Enter) is unreliable because the picker's filter input intercepts keys. **Always: click the trigger → snapshot → click the option ref directly.**
- **Expiration/date pickers can be deceptive**: a placeholder like "Select Date" often hides a native `<select>` with a fixed set of options ("7 days", "30 days", "No Expiration"). Try `browse select` before assuming a date picker.
- **The newly created secret is almost always plain text in the accessibility tree** — no need for `browse get value` / `get text` calls. Use prefix matching to find it in the snapshot.
- **Create forms may be inline (top of page) OR modal** — both patterns are common. Snapshot to see which.
- **Default scopes often don't match what the user actually wants** — a team-scoped product may default to the user's team when account-level was intended. Always explicitly verify scope.
- **Org/workspace URL prefixes are unguessable**: some products route everything through `/orgs/<id>/<proj>/...` or `/team/<slug>/...`. The dashboard root's sidebar links reveal the real path — let the snapshot guide you instead of guessing.
- **`console.<vendor>.com` ↔ `platform.<vendor>.com` ↔ `app.<vendor>.com`**: vendors occasionally redirect between brand variants. Don't hardcode the host; trust whatever the live URL becomes after `browse open`.

## Failure Recovery

- **Redirected to `/sign-in` immediately**: cookies missing. Return `not authenticated`. If running remote, the Browserbase session may have expired — see the remote-mode caveat above.
- **`browse status` says connected but every command times out** (remote only): the Browserbase session timed out silently. Create a fresh session from the same context ID and re-attach via `browse open <url> --cdp <new-ws-url>`.
- **Click does nothing**: modals/dropdowns animate. `browse wait timeout 500` then snapshot again.
- **Snapshot refs invalidated**: any DOM-changing action invalidates refs. Always re-snapshot before the next click.
- **"Create" leads to billing/upgrade prompt**: return `success: false` with `error_reasoning: "billing required to create API key"`.
- **Combobox won't open with keyboard**: it's a custom widget. Always click the trigger button, snapshot, click the option ref.
- **`browse select` errors with "Unexpected argument"**: the option value has spaces. Quote it: `browse select [X-Y] "No Expiration"`.
- **Docs page describes a step that doesn't match the live UI**: trust the live UI. Skip the docs step and snapshot to find the closest equivalent.
- **Sudo password / re-auth prompt** (GitHub, GitLab, some enterprise tools): return `success: false` with `error_reasoning: "sudo password required"`. Do not attempt to type a password.
- **Org/workspace picker required and unclear which to pick**: pick the user's personal account / default workspace. If both are absent, return `success: false` with `error_reasoning: "workspace selection failed"`.

## Expected Output Schema

```json
{
  "success": true | false,
  "site": "<hostname>",
  "api_key": "<full secret>" | null,
  "key_action": "created" | "revealed" | "found_in_plaintext" | null,
  "key_name": "<name given to the key>" | null,
  "doc_url_used": "<docs URL from Phase 0>" | null,
  "error_reasoning": null | "<concrete reason from page>"
}
```

## Notes for the caller

- **The created key is a real, live secret.** It will be visible in any trace files written during the run (`./autobrowse/traces/<task>/run-*/` if invoked via autobrowse) and in the agent's conversation history. Rotate it after use if exposure matters.
- For unfamiliar sites, the first attempt should run with **at most 2 iterations** of trial-and-error. If the playbook plus docs fails twice, the site likely has a non-standard auth/scope flow — escalate to the user before iterating further.
- This skill avoids hardcoding any site-specific selectors, URLs, or UI labels. All site-specific knowledge comes from Phase 0 docs-reading, which is fresh every run.
