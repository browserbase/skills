---
name: amplitude-com-product-analytics-mcp
title: "Amplitude Product Analytics MCP"
description: "Connect an MCP client to Amplitude's hosted MCP server for product analytics, charts, dashboards, experiments, cohorts, feature flags, Session Replay, feedback, and AI agent analytics with OAuth, US/EU region selection, progressive tool discovery, and safe write workflows."
website: "amplitude.com"
category: "analytics"
tags: ["amplitude", "mcp", "product-analytics", "experiments", "dashboards", "session-replay", "feature-flags", "oauth"]
status: "launched"
partner: true
source: "official Amplitude MCP docs from https://amplitude.com/docs/amplitude-ai/amplitude-mcp, 2026-05-22"
updated: "2026-05-22"
recommended_method: "mcp"
verified: true
proxies: false
alternative_methods:
  - method: "browser"
    rationale: "Use the Amplitude web app only for OAuth recovery, admin content-access settings, visual review of created content, or workflows the MCP server cannot expose."
  - method: "api"
    rationale: "Use Amplitude's direct APIs when building production integrations or batch jobs that need stable request/response contracts outside an MCP client."
---

# Amplitude Product Analytics MCP

## Purpose

Connect an AI assistant or coding agent to Amplitude's hosted MCP server so it can analyze product data, retrieve saved content, query charts, inspect experiments, create Amplitude objects, and debug user behavior from the agent's normal workspace.

Default hosted server:

```text
https://mcp.amplitude.com/mcp
```

EU residency server:

```text
https://mcp.eu.amplitude.com/mcp
```

Use the US server unless the user's Amplitude data resides in the EU region. The server uses OAuth and runs as the authenticated Amplitude user, so available organizations, projects, dashboards, experiments, replays, and write actions are limited by that user's Amplitude permissions.

## When to Use

- Answer questions about Amplitude charts, dashboards, notebooks, cohorts, metrics, feature flags, experiments, events, properties, or product usage.
- Investigate trends, spikes, drops, funnel conversion, retention, segmentation, or experiment results from Amplitude data.
- Create or edit Amplitude charts, dashboards, notebooks, cohorts, metrics, experiments, or feature flags from a natural-language brief.
- Pull Session Replay timelines to debug a user report, rage clicks, errors, or onboarding friction.
- Analyze customer feedback, product opportunities, or AI agent analytics captured in Amplitude.
- Configure Amplitude MCP in Codex CLI, Claude Code, Cursor, ChatGPT, Claude, Gemini CLI, Lovable, Kiro, Replit, Figma Make, or another MCP-capable client.

Do not use this skill for general web analytics if the user has not asked to use Amplitude or if no Amplitude MCP connection/account is available. In that case, ask for the right analytics source or provide setup instructions.

## Setup

### 1. Pick the region

| Region | URL |
|---|---|
| United States / default | `https://mcp.amplitude.com/mcp` |
| EU residency | `https://mcp.eu.amplitude.com/mcp` |

If the user is unsure, start with the default US URL. If OAuth succeeds but expected projects or data are missing, ask whether their Amplitude organization uses EU residency.

### 2. Configure the MCP client

Use the client's native MCP setup path when available:

| Client | Setup |
|---|---|
| Codex CLI | `codex mcp add amplitude --url https://mcp.amplitude.com/mcp` |
| Claude Code | `claude mcp add -t http -s user Amplitude "https://mcp.amplitude.com/mcp"` |
| Claude Desktop / Claude.ai | Settings > Connectors > Add custom connector, name `Amplitude`, URL `https://mcp.amplitude.com/mcp` |
| Cursor | Add `{"mcpServers":{"Amplitude":{"url":"https://mcp.amplitude.com/mcp","transport":"streamable-http"}}}` to Cursor MCP settings, or use Cursor's Amplitude deep link if available. |
| Gemini CLI | Add `{"selectedAuthType":"oauth-personal","mcpServers":{"amplitude":{"httpUrl":"https://mcp.amplitude.com/mcp"}}}` to `~/.gemini/settings.json`, then run `gemini/mcp auth amplitude`. |
| Kiro | Add `{"mcpServers":{"amplitude-mcp":{"type":"http","url":"https://mcp.amplitude.com/mcp"}}}` to Kiro's MCP config. |
| Lovable | Settings > Connectors > search for `Amplitude` > connect. |
| Replit | Workspace settings > Integrations > MCP Servers > add name `Amplitude`, URL `https://mcp.amplitude.com/mcp`. |
| ChatGPT | Settings > Apps & Connectors > Browse Connectors > Amplitude > Connect. |
| Other MCP clients | Configure a remote HTTP/streamable HTTP MCP server at `https://mcp.amplitude.com/mcp` and complete OAuth. |

For EU residency, replace the URL with `https://mcp.eu.amplitude.com/mcp`.

### 3. Authenticate and verify access

After adding the server:

1. Complete the Amplitude OAuth flow.
2. Ensure the MCP tools appear in the client.
3. Call `get_context` to confirm the authenticated user, organization, and accessible projects.
4. If the client supports project selection, pick the project that matches the user's request.
5. Call `get_project_context` before project-specific work so time zone, currency, session definitions, and AI context are available.

If no tools appear after OAuth, restart or reload the MCP client. Many clients only load MCP servers at startup.

## Progressive Tool Discovery

For clients with tight context budgets, use progressive discovery:

```text
https://mcp.amplitude.com/mcp?discovery=progressive
```

EU:

```text
https://mcp.eu.amplitude.com/mcp?discovery=progressive
```

Progressive mode starts with a small tool list, then discovers schemas on demand. Use this sequence before calling a specialized tool:

1. Call `get_context` to confirm organization and project access.
2. Call `list_tool_categories` to see available product surfaces.
3. Call `get_category_tools` for the relevant category, such as `analytics`, `experiments`, `dashboards`, `session_replay`, `feedback`, or `agent_analytics`.
4. Call `describe_tool` for the exact tool you plan to use.
5. Call the tool only after confirming required parameters and schema.

In progressive mode, do not assume hidden tools are unavailable just because `tools/list` is short. Discover the relevant category first.

## Tool Selection

Common Amplitude MCP tools include:

| Need | Prefer |
|---|---|
| Find saved content | `search` |
| Read an Amplitude URL | `get_from_url` |
| Confirm org/project context | `get_context`, then `get_project_context` |
| Retrieve charts or dashboards | `get_charts`, `get_dashboard` |
| Query saved chart data | `query_chart` or `query_charts` |
| Run ad-hoc analytics | `query_amplitude_data` |
| Render a chart and get an edit URL | `render_chart` |
| Save chart changes | `save_chart_edits` |
| Create dashboards or notebooks | `create_dashboard`, `create_notebook` |
| Create or inspect cohorts | `create_cohort`, `get_cohorts` |
| Inspect or update experiments | `get_experiments`, `query_experiment`, `create_experiment`, `update_experiment` |
| Inspect or update flags | `get_flags`, `create_flags`, `update_flag` |
| Debug replays | `get_session_replays`, `list_session_replays`, `get_session_replay_events` |
| Analyze feedback | `get_feedback_insights`, `get_feedback_comments`, `get_feedback_mentions`, `get_feedback_sources`, `get_feedback_trends` |
| Analyze AI agents | `query_agent_analytics_metrics`, `query_agent_analytics_sessions`, `query_agent_analytics_spans`, `get_agent_analytics_conversation`, `search_agent_analytics_conversations`, `get_agent_analytics_schema` |

Tool schemas may change. In progressive mode, always call `describe_tool` before a first call. Outside progressive mode, inspect the client-visible tool schema before unfamiliar write operations.

## Workflows

### Analyze a trend or anomaly

1. Search for relevant saved charts, dashboards, metrics, or events.
2. Retrieve full definitions with `get_charts`, `get_dashboard`, `get_from_url`, or `get_project_context`.
3. Query the data with `query_chart`, `query_charts`, or `query_amplitude_data`.
4. Segment by likely drivers such as platform, traffic source, plan, country, experiment exposure, or feature flag.
5. Cross-check deployments, experiments, session replays, or feedback when the metric movement needs explanation.
6. Return the relevant Amplitude links, date range, project, filters, and concrete data points used.

Example prompts:

```text
What were daily active users over the last 7 days?
Why did this funnel conversion drop last Tuesday? [paste chart URL]
Compare onboarding completion between converters and drop-offs this month.
```

### Create or edit Amplitude content

Write workflows can create or modify real Amplitude objects. Before writes, confirm the target project and summarize the intended change.

1. Search for existing content first so you do not duplicate a dashboard, metric, cohort, or flag.
2. Retrieve current definitions when editing existing objects.
3. Build the smallest valid payload from verified requirements.
4. Prefer temporary chart renders or draft-like intermediate states when available.
5. Before final save, show the title, project, date range, events, filters, chart type, destination dashboard/notebook, and any write side effects.
6. After saving, return the resulting Amplitude URL or object ID.

Safe examples:

```text
Create a chart showing weekly active users broken down by platform.
Build an executive dashboard for launch health using activation, retention, and error signals.
Create a cohort of power users who completed 10 or more sessions in the last 30 days.
```

For experiments and feature flags, be stricter: confirm rollout, variants, traffic allocation, metrics, and ownership before creating or updating anything.

### Debug with Session Replay

1. Identify the user, account, event, session, time range, or replay URL.
2. Use `get_session_replays` or `list_session_replays` to find candidate recordings.
3. Use `get_session_replay_events` to extract the processed interaction timeline.
4. Summarize steps, friction, errors, rage clicks, and likely reproduction paths.
5. Link the replay and note any limits or missing context.

Do not expose private user data unnecessarily. Return only the details needed for debugging.

### Analyze feedback or opportunities

Use feedback tools when the user asks about complaints, feature requests, pain points, praise, opportunities, account health, or customer sentiment:

1. Use `get_feedback_sources` if source filtering matters.
2. Use `get_feedback_insights`, `get_feedback_comments`, or `get_feedback_trends` to gather evidence.
3. Group themes by user impact, frequency, revenue/account relevance, and recency.
4. Cross-reference charts, cohorts, experiments, or replays when the recommendation depends on behavior.

### Analyze AI agent quality

Use agent analytics tools when the user's product captures AI agent sessions in Amplitude:

1. Call `get_agent_analytics_schema` to learn available agents, topics, tools, quality rubrics, and filter fields.
2. Query metrics or sessions by quality, cost, latency, error rate, user sentiment, topic, or agent.
3. Inspect conversations or spans only when needed for root cause.
4. Return aggregate patterns first, then representative examples.

## Amplitude MCP Marketplace Plugin

Amplitude also maintains an MCP Marketplace plugin with reusable skills, agents, and commands for Claude Code, Cursor, Claude, and Codex.

Install in clients that support plugin marketplaces:

```text
/plugin marketplace add amplitude/mcp-marketplace
/plugin install amplitude@amplitude
```

Use the plugin when the user wants higher-level Amplitude workflows such as creating charts, analyzing dashboards, debugging replays, monitoring experiments, planning instrumentation, producing daily or weekly briefs, or reviewing AI agent insights. The plugin complements the MCP server; it does not replace OAuth or the hosted MCP connection.

## Security and Compliance

- The MCP server authenticates with OAuth 2.0 and runs as the authenticated Amplitude user.
- Respect organization and project permissions. If a tool cannot see content, do not work around it with unrelated accounts.
- Amplitude admins can enable, block, or restrict MCP access from Settings > Content Access > MCP.
- Individual users cannot override organization-level MCP restrictions.
- The AI client processes Amplitude data after tool calls. Follow the user's organization policy for AI-powered data analysis, GDPR, CCPA, and other compliance requirements.
- Do not paste Amplitude OAuth tokens, cookies, API keys, raw user profiles, unnecessary PII, or private dashboard contents into public logs, PRs, screenshots, or issues.
- Treat third-party feedback and session replay content as sensitive user data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| OAuth opens the wrong org | Log out of extra Amplitude orgs in the browser, then reconnect the MCP server. |
| Expected projects are missing | Call `get_context`, confirm account permissions, and verify whether the org uses the EU URL. |
| Tools are not visible | Restart the MCP client, reconnect the server, and re-run OAuth. |
| Cursor tool calls fail after previously working | Clear all MCP tokens from the Cursor Command Palette, then re-authenticate. |
| Write tools fail | Confirm the user has the required Amplitude role and retrieve the latest tool schema before retrying. |
| Progressive mode seems to have too few tools | Call `list_tool_categories`, then `get_category_tools`, then `describe_tool`. |
| Session Replay calls return little data | Narrow the time range, user, or event filter and confirm Session Replay is enabled for the project. |
| Admin restrictions block MCP | Ask an Amplitude org admin to check Settings > Content Access > MCP. |

## Expected Output

For analysis:

```json
{
  "success": true,
  "project": "Production",
  "date_range": "last_7_days",
  "tools_used": ["search", "query_chart"],
  "summary": "DAU increased 8.4% week over week, driven mostly by mobile users.",
  "evidence": [
    {
      "label": "DAU chart",
      "url": "https://app.amplitude.com/analytics/example/chart/abc123",
      "metric": "daily_active_users",
      "value": 12345
    }
  ],
  "next_steps": ["Segment by acquisition source", "Review onboarding replays for new mobile users"]
}
```

For setup:

```json
{
  "success": true,
  "server_url": "https://mcp.amplitude.com/mcp",
  "client": "codex",
  "verification": "get_context returned the expected organization and project",
  "notes": ["Use the EU URL only for EU-residency organizations"]
}
```
