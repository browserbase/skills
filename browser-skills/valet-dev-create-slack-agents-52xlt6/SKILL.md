---
name: valet-dev-create-slack-agents-52xlt6
title: Create Slack AI Agents on Valet
description: >-
  Find and create AI agents that work with your team in Slack — research,
  follow-up, sync, and reporting — using the valet CLI driven by the published
  valet.dev/SKILL.md, across Sales, Venture, Finance, Product, Compliance,
  Procurement, Engineering, and Nonprofit domains.
website: valet.dev
category: ai-agents
tags:
  - valet
  - slack
  - ai-agents
  - cli
  - automation
  - skilled-agents
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: cli
alternative_methods:
  - method: browser
    rationale: >-
      For the prebuilt agents in the valet.dev gallery (Sales, Venture, Finance,
      Product, etc.), the fastest path is the browser: open valet.dev, filter by
      team, and click 'Add to Slack' to run the OAuth install. Custom agents
      still require the CLI.
  - method: fetch
    rationale: >-
      valet.dev exposes an agent-skills discovery index at
      /.well-known/agent-skills/index.json (Cloudflare agent-skills RFC v0.2.0)
      pointing at the canonical SKILL.md with a sha256. Fetch it to bootstrap,
      but actually doing the work still requires the CLI.
verified: false
proxies: false
---
# Create Slack AI Agents on Valet

## Purpose

Find and create AI agents that live in your team's Slack workspace — agents that do research, follow-up, sync, and reporting between the tools your company already runs on (Granola, Mercury, GitHub, Calendar, etc.). Valet is an agent platform whose canonical interface is a CLI driven by a machine-readable instruction file published at `https://valet.dev/SKILL.md`. The fast path for the prebuilt, domain-specific agents (Sales, Venture, Finance, Product, Compliance, Procurement, Engineering, Nonprofit) is the **valet.dev gallery's one-click "Add to Slack"** button; the general path for any *custom* agent is the **`valet` CLI**, which authenticates the user, connects Slack to their org once, provisions a dedicated Slack app per agent, attaches connectors, and deploys. This is a **create/deploy workflow, not read-only** — it provisions real Slack apps and platform resources, so confirm before any destructive teardown.

## When to Use

- "Add an AI agent to our Slack that summarizes sales calls / briefs us before founder meetings / posts a daily finance digest / reports what shipped."
- The user names one of Valet's business domains — **Sales, Venture, Finance, Product, Compliance, Procurement, Engineering, Nonprofit** — and wants a ready-made Slack teammate.
- The user wants to *build a custom* agent from a plain-English description, a SOP/onboarding doc, or a set of skill/MCP URLs, and have it respond in Slack.
- "Install the valet CLI", "create/deploy/design a Valet agent", "connect our Slack to Valet", "create a Slack channel/bot for this agent".
- Capturing an existing workflow as a repeatable agent ("save this as an agent", "make this repeatable").

## Workflow

The optimal method is the **`valet` CLI driven by `https://valet.dev/SKILL.md`** — that document is the authoritative, versioned operating manual for the platform and is discoverable via `https://valet.dev/.well-known/agent-skills/index.json` (Cloudflare agent-skills RFC v0.2.0, with a sha256 over the SKILL.md). Always fetch and follow that file; it is updated more often than this reference. For the curated prebuilt agents, the browser "Add to Slack" button is faster — see "Browser fallback" at the end.

1. **Load the source of truth.** Fetch `https://valet.dev/SKILL.md` (canonical: `https://www.valet.dev/SKILL.md`). Treat its instructions as authoritative over anything cached here. Optionally verify integrity against the `sha256` in `/.well-known/agent-skills/index.json`.

2. **Install the CLI.** Check `valet version` first. If missing, install via Homebrew: `brew install valetdotdev/tap/valet`. The tap ships prebuilt binaries for macOS (arm64/amd64) and Linux (arm64/amd64). **If `brew install` fails for any reason, do not troubleshoot or work around it** — tell the user to run it in their terminal and resolve manually, then stop until they confirm. (Per the published SKILL.md, Homebrew failures are explicitly out of scope for automated repair.)

3. **Authenticate.** Nothing else works until logged in. Run `valet auth login` (opens a browser for OAuth) and confirm with `valet auth whoami`, which also surfaces the user's default org. Do not proceed on `Error: not logged in`.

4. **Connect Slack to the org — once per org (prerequisite).** Slack is a two-phase special case. First authorize Valet to create apps in the workspace:
   ```
   valet channels create slack --org <org>
   ```
   The CLI prompts for a Slack **app configuration token** and **refresh token** (the user generates them at https://api.slack.com/apps under "Your App Configuration Tokens"). There is exactly one org-level Slack connection per org — skip if `valet channels --org <org>` already lists a `slack` entry with the workspace name. **Never ask the user to paste secret values into this session** — direct them to the prompt/their terminal.

5. **Scaffold the agent project.** `valet new <name>` (or `mkdir -p <name>/channels`) creates a project with `SOUL.md`, `AGENTS.md`, `channels/`, `skills/`. Write `SOUL.md` (Purpose, Workflow phases, Guardrails Always/Never) — this defines the agent's identity and behavior and is the only required file. Replace user-specific IDs with `<placeholders>`.

6. **Set up org-scoped resources (catalog first, reuse, then custom).** For the tools the agent needs (Granola, Mercury, GitHub, Calendar, Slack-MCP, etc.):
   - Secrets: `valet secrets set NAME=<value> --org <org>` (direct the user to set these in *their* terminal; never request the value here).
   - Connectors: `valet connectors catalog` → `valet connectors create <entry> --org <org>`. Only create custom `mcp-server`/`command` connectors when the catalog lacks an entry. Name a `command` connector after the exact CLI command the agent will type (e.g. `gh`, not the npm package).

7. **Create the agent and attach resources.**
   ```
   cd <name>
   valet agents create <name> --org <org> \
     --attach-connector <connector> --attach-channel <channel>
   ```
   This creates the agent, links the directory, deploys v1, and waits for readiness.

8. **Give the agent its own Slack identity — once per agent.** After the org-level connection exists, provision a dedicated Slack app/bot for this agent. **Always pass `--bot-name`** (server-side defaults are unreliable across orgs):
   ```
   valet channels create slack <channel-name> --agent <name> --bot-name <display-name>
   ```
   The CLI opens a browser for the OAuth install flow, polls until install completes, and reports the bot name + workspace. (`valet channels attach slack --agent <name> --bot-name <display-name>` is equivalent.)

9. **Verify secret-backed commands locally before deploying.** `valet exec` is the only way to run a command with Valet-managed secrets injected (they are NOT shell env vars). Test each connector command, e.g. `valet exec -a <name> GITHUB_TOKEN -- gh pr list`. Fix failures now.

10. **Write channel files + deploy.** For each Slack/webhook channel, write `channels/<channel-name>.md` telling the agent how to handle incoming messages, then `valet agents deploy` to pick them up. Run the interactive test loop (`valet logs` in the background, trigger the channel, inspect for `mcp_call_tool_*` and `dispatch_complete`).

11. **Hand off.** Write `AGENTS.md` (last) describing connectors, channels, secrets, and any external setup — never include secret values.

### Browser fallback (fastest path for prebuilt gallery agents)

For the curated, domain-specific agents, skip the CLI entirely:

1. Open `https://valet.dev/`.
2. Use the **"Filter agents by team"** tablist to pick a domain: **ALL, SALES, VENTURE, FINANCE, PRODUCT, COMPLIANCE, PROCUREMENT, ENGINEERING, NONPROFIT** (or the "Search agents" box).
3. On the matching agent card (e.g. Sales call-notes via Granola, Venture founder-briefs, Finance Mercury read-only digest, Product GitHub ship-log), click **"Add to Slack"** and complete the Slack OAuth install in the popup.
4. The agent then lives as a Slack app (`@Sales Valet`, `@Finance Valet`, etc.) the team can @mention. Customization beyond the gallery still requires the CLI flow above.

## Site-Specific Gotchas

- **The site is built for agents — use `valet.dev/SKILL.md` as the source of truth.** It's linked from the homepage `Link` header (`rel="service-doc"; type="text/markdown"`) and indexed at `/.well-known/agent-skills/index.json` with a sha256. It supersedes this file; re-fetch it each run. Canonical host is `www.valet.dev` (the index `url` field uses `www`).
- **Slack is two-phase and easy to get wrong.** Org-level `valet channels create slack --org <org>` is a *one-time authorization* (config token + refresh token from api.slack.com/apps), NOT a reusable channel. Each agent then needs its *own* `valet channels create slack --agent <name>`, which provisions a separate Slack app/bot. Running the per-agent step before the org step errors and tells you to do Step 1 first.
- **Always pass `--bot-name`** on every per-agent Slack create/attach — auto-defaults from the agent name are unreliable across orgs and surfaces.
- **Detaching a Slack channel destroys the per-agent bot** (prompts for confirmation; `--force` skips). Destroying the *org-level* Slack channel cascades and removes every per-agent bot first. Treat both as destructive.
- **Never ask for secret values in the LLM session.** Direct the user to `valet secrets set NAME=VALUE --org <org>` (or `--agent`) in their own terminal. Org-scoped is the default; agent-scoped overrides the org value of the same name — the canonical fix when one agent needs different credentials (do NOT spin up a parallel connector).
- **Secrets are not shell env vars.** `curl`/`npx`/`node` cannot read them. Use `valet exec <SECRET,...> -- <cmd>` (explicit mode) or `valet exec <connector-name>` (connector mode). Use `{{NAME}}` template syntax in connector `--env`/`--header`/`--url` and in `valet exec` args.
- **Command-connector naming rule:** the connector name becomes the executable on the agent's PATH and must equal the CLI command exactly (e.g. `agentmail`, not `agentmail-cli`). SOUL.md must reference that same name — calling `npx <pkg>` directly bypasses secret injection.
- **Homebrew failures are out of scope.** If `brew install valetdotdev/tap/valet` fails, the SKILL.md explicitly says to stop and let the user fix brew manually — do not retry tap/permission/network issues.
- **Deployed files are read-only at runtime;** files the agent writes (e.g. `MEMORY.md`) do not survive a deploy. Each edit + deploy triggers a full VM reboot — wait for it before evaluating logs.
- **`valet.yaml` is opt-in.** Only write the manifest when the user explicitly asks ("yaml", "1-click deploy", "dashboard setup"). It only supports *catalog* connectors/channels; document custom ones in `AGENTS.md`. The `story` block has a strict 3-step (trigger/action/outcome) contract and hard length caps — run `valet manifests validate` after every edit.
- **Sandbox/headless limitation observed during testing:** `valet auth login`, the Slack OAuth popups, and any command hitting `api.valet.dev` (e.g. `valet connectors catalog`, `valet channels catalog`, deploys) require a real authenticated Valet account and outbound network to `api.valet.dev`. In a locked-down sandbox these fail with DNS/`not logged in` errors — the CLI itself is correct; the work must run in the user's authenticated environment. The CLI binary, full command surface, `valet help`, and the Slack two-phase help text were verified locally (valet/0.1.62).
- **Don't expect a scriptable browser flow for the full task.** "Add to Slack" requires per-workspace Slack OAuth (account-specific) and custom agents require the CLI — neither is a deterministic browser script worth generating. Drive the CLI per the published SKILL.md.

## Expected Output

The deliverable is one or more deployed Slack agents plus a local agent project. Representative outcome shapes:

```json
{
  "outcome": "prebuilt_added",
  "method": "browser",
  "domain": "finance",
  "agent": "Finance Valet",
  "card_headline": "Ask your Mercury account anything — right from Slack.",
  "connectors": ["slack", "mercury"],
  "slack_app": "@Finance Valet",
  "note": "Installed via valet.dev gallery 'Add to Slack' OAuth. Read-only by design; never moves money."
}
```

```json
{
  "outcome": "custom_agent_deployed",
  "method": "cli",
  "org": "acme",
  "agent": "ship-reporter",
  "soul_md": "SOUL.md written (Purpose, Workflow, Guardrails)",
  "connectors": [{ "name": "github", "source": "catalog", "scope": "org" }],
  "channels": [
    { "type": "slack", "scope": "org", "role": "authorization-prerequisite", "workspace": "Acme (T12345)" },
    { "type": "slack", "scope": "agent", "bot": "@ship-reporter", "prompt": "channels/ship-reporter.md" }
  ],
  "secrets": ["GITHUB_TOKEN (org-scoped)"],
  "verified_locally": "valet exec -a ship-reporter GITHUB_TOKEN -- gh ... succeeded",
  "release": "v1 deployed, process ready"
}
```

```json
{
  "outcome": "blocked_needs_user_action",
  "method": "cli",
  "stage": "auth | slack_org_connect | secret_set",
  "reason": "valet auth login / Slack config token / valet secrets set must run in the user's own authenticated terminal — cannot be completed headless or by pasting secrets into the chat.",
  "next_step": "Direct the user to run the named command, wait for confirmation, then resume."
}
```

```json
{
  "outcome": "install_blocked",
  "method": "cli",
  "stage": "brew_install",
  "reason": "brew install valetdotdev/tap/valet failed (tap/permission/network).",
  "next_step": "Per valet.dev/SKILL.md, stop and have the user resolve Homebrew manually; do not retry or work around."
}
```
