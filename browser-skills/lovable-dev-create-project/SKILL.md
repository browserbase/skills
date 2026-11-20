---
name: lovable-dev-create-project
title: "Lovable Project Creation"
description: "Turn a product or app idea into a Lovable project using Lovable Build with URL for shareable instant creation, or Lovable MCP for authenticated project creation, iteration, inspection, and deployment when available."
website: "lovable.dev"
category: "app-builders"
tags: ["lovable", "ai-builder", "prototype", "project-creation", "mcp", "direct-url", "authenticated"]
status: "launched"
partner: true
source: "first-party Browserbase skill, 2026-05-08"
updated: "2026-05-08"
recommended_method: "mcp"
alternative_methods:
  - method: "fetch"
    rationale: "Use Lovable's Build with URL (`https://lovable.dev/?autosubmit=true#prompt=...`) for shareable one-click creation links, unauthenticated handoff, or when no MCP connection is available."
  - method: "browser"
    rationale: "Use browser automation when MCP is unavailable, when the user needs to sign in, select a workspace from the Lovable UI, upload local assets, or visually confirm the generated project. Browser is also the verification surface for Build with URL links."
---

# Lovable Project Creation

## Purpose

Given a product idea, app brief, design direction, reference assets, or existing app concept, create a Lovable project and return the project/editor URL plus enough context for follow-up iteration. Prefer structured creation surfaces over manual UI automation:

1. **Lovable MCP** when the agent has an authenticated `https://mcp.lovable.dev` connection and the user wants project creation plus continued management.
2. **Build with URL** when the user wants a shareable one-click Lovable creation link or the agent only needs to hand off a prompt into Lovable.
3. **Browser automation** only for login/workspace selection, asset upload, UI-only flows, or verification.

`recommended_method: "mcp"` because Lovable MCP is the most powerful creation surface — authenticated project creation plus continued iteration, inspection, and deployment from a single connection. Build with URL is the recommended fallback for unauthenticated handoffs and shareable creation links; the browser remains a handoff and verification layer rather than the first choice.

Official docs:

```text
https://docs.lovable.dev/integrations/build-with-url
https://docs.lovable.dev/integrations/lovable-mcp-server
https://docs.lovable.dev/introduction/getting-started
https://docs.lovable.dev/introduction/dashboard-overview
https://docs.lovable.dev/llms.txt
```

## When to Use

- "Make a Lovable project for this app idea."
- "Turn this PRD / spec / sketch into a Lovable app."
- "Create a Lovable link I can share with the team."
- "Use Lovable MCP to create the project and keep iterating."
- "Build me a dashboard / SaaS prototype / landing page in Lovable."
- "Open Lovable with this prompt and these reference images."

Do not use this skill for read-only research about existing Lovable projects unless the task includes creation, remixing, iteration, inspection, deployment, or project management.

## Inputs to Collect

Collect only what is needed to form a high-quality first prompt:

| Input | Why it matters |
|---|---|
| Product idea or job-to-be-done | Anchors the generated app. |
| Target users and primary workflow | Prevents generic landing-page output. |
| Must-have features | Gives Lovable concrete build targets. |
| Data model and integrations | Helps Lovable decide tables, auth, APIs, and backend shape. |
| Visual style and brand constraints | Guides layout, typography, color, density, and tone. |
| Reference images or screenshots | Useful for sketches, Figma screenshots, existing apps, and brand examples. |
| Workspace / visibility / deployment intent | Required for MCP create/deploy decisions; affects privacy and paid actions. |
| Hard constraints | Examples: "no paid deploy", "do not connect GitHub", "private repo only", "use Supabase", "mobile-first". |

If the user gives a short idea, expand it into a clear implementation prompt instead of asking for every field. Ask follow-up questions only when missing information would change privacy, cost, credentials, or target workspace.

## Prompt Construction

Build a single prompt that Lovable can act on without additional context. Include:

- **App summary**: one paragraph describing the product and audience.
- **Core user flows**: 3-7 concrete flows, written as user actions.
- **Screens/pages**: named pages with the key elements each should contain.
- **Data model**: entities, fields, relationships, and sample rows if known.
- **Auth and roles**: guest/user/admin behavior, if applicable.
- **Integrations**: APIs, databases, payments, email, analytics, storage, or connectors.
- **Design direction**: product category, density, tone, color constraints, references, responsive behavior.
- **Acceptance checks**: observable outcomes the first version should satisfy.
- **Iteration notes**: what to leave flexible for later.

Keep secrets out of the prompt. Use placeholders such as `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` and tell the user to add real values inside Lovable's secure settings or the connected service.

Example prompt skeleton:

```text
Build a web app called {name} for {audience}. It helps users {job_to_be_done}.

Core flows:
- {flow_1}
- {flow_2}
- {flow_3}

Pages:
- Dashboard: {contents}
- {Page}: {contents}

Data model:
- {Entity}: {fields}
- {Entity}: {fields}

Design:
- {visual style}
- {responsive and accessibility constraints}

Constraints:
- Do not use real credentials. Use environment variable placeholders.
- Do not publish or connect external paid services until I confirm.

Acceptance checks:
- {check_1}
- {check_2}
```

## Path A: Lovable MCP

Use this path when an authenticated Lovable MCP server is available. It is best for agents that need to create, inspect, iterate, manage visibility, or deploy without relying on manual page automation.

### 1. Confirm MCP availability and scope

Lovable MCP is authenticated account access. Before using it, confirm:

- The user wants the connected Lovable account used.
- The target workspace is clear.
- The user understands MCP calls can edit real projects and consume real credits.
- The user has approved any deploy, GitHub connection, database query, visibility change, or paid action.

Never use MCP to inspect or edit private projects, repositories, databases, or deployments unless the user explicitly asked for that project/account action.

### 2. List workspaces and create the project

Use the MCP client tools exposed by the runtime. The canonical flow is:

```text
list_workspaces()
create_project(
  workspace_id: "<workspace_id>",
  description: "<short project name>",
  initial_message: "<detailed prompt>"
)
```

Capture and return:

- `project_id`
- `editor_url`
- `preview_url`
- `sandbox_url`, if returned
- workspace name
- initial prompt used

If project creation supports `wait=false`, use it for long builds and poll with the relevant message/status tool until the initial build finishes or returns a clear error.

### 3. Iterate through MCP

For follow-up requests, continue with MCP project tools instead of starting a new project:

```text
send_message(project_id: "<project_id>", message: "<specific change request>")
get_project(project_id: "<project_id>")
list_files(project_id: "<project_id>")
read_file(project_id: "<project_id>", path: "src/App.tsx")
```

Keep iteration prompts small and concrete. Prefer one coherent change per message:

- "Add admin-only organization settings with invite links."
- "Replace the sample data with editable records backed by Lovable Cloud."
- "Make the dashboard denser and improve mobile navigation."

### 4. Deploy only after approval

`deploy_project` is externally visible and can expose real data or consume plan resources. Ask before deployment. After approval:

```text
deploy_project(project_id: "<project_id>")
```

Return the live URL, note visibility constraints, and remind the user if the app uses placeholder credentials.

## Path B: Build with URL

Use this path for shareable, instant project creation links. It is also the best unauthenticated handoff when no MCP connection is available.

### 1. Build the direct URL

Lovable Build with URL uses:

```text
https://lovable.dev/?autosubmit=true#prompt=<URL_ENCODED_PROMPT>
```

With public reference images:

```text
https://lovable.dev/?autosubmit=true#prompt=<URL_ENCODED_PROMPT>&images=<URL_ENCODED_IMAGE_URL>&images=<URL_ENCODED_IMAGE_URL>
```

Rules:

- `autosubmit=true` is required for automatic creation.
- `prompt` is required.
- URL-encode the full prompt.
- Use at most 10 image URLs.
- Image URLs must be public and direct enough for Lovable to fetch.
- Keep the URL practical; very long prompts can exceed browser or parser limits.

Node helper:

```js
const prompt = `Build a web app called ...`;
const images = [
  "https://example.com/reference-home.png",
  "https://example.com/reference-dashboard.webp",
];

const params = new URLSearchParams({ autosubmit: "true" });
const hash = new URLSearchParams();
hash.set("prompt", prompt);
for (const image of images) hash.append("images", image);

const url = `https://lovable.dev/?${params.toString()}#${hash.toString()}`;
console.log(url);
```

### 2. Share or open the URL

If the user only asked for a Lovable creation link, return the URL and the prompt. If they asked you to create the project, open it in a browser session:

```bash
browse open "$LOVABLE_URL"
```

Expected behavior:

- Logged-in users select a workspace, then Lovable starts app creation automatically.
- Logged-out users are redirected to signup/login; the prompt and images should be preserved after authentication.

### 3. Verify project creation

After opening the URL, verify all of the following before reporting success:

- The page is on `lovable.dev`.
- The prompt text appears in the project creation/chat context or the editor opens for the generated app.
- A workspace selection or authentication gate is handled by the user, not bypassed.
- The resulting page has a project/editor URL, preview URL, or visible generation state.
- If the URL was too long or malformed, Lovable shows a parse/generation error or the prompt is truncated; rebuild with a shorter prompt.

Return:

```json
{
  "success": true,
  "method": "build_with_url",
  "creation_url": "https://lovable.dev/?autosubmit=true#prompt=...",
  "editor_url": "https://lovable.dev/projects/...",
  "prompt_used": "...",
  "assets": ["https://..."]
}
```

If login is required and the agent cannot authenticate, return `success: false`, `reason: "requires_user_login"`, and the creation URL.

## Path C: Browser UI Fallback

Use browser automation when the task requires the Lovable UI:

- User must log in or choose a workspace interactively.
- Assets are local files that need upload through the prompt `+` menu.
- The user wants a visual confirmation of the generated app.
- MCP is unavailable and Build with URL is insufficient.

Workflow:

1. Open `https://lovable.dev/`.
2. If logged out, stop at the login screen and ask the user to authenticate.
3. On the dashboard, select the intended workspace if multiple are visible.
4. Attach files/images only if the user provided them and approved upload.
5. Paste or type the detailed prompt into the dashboard prompt box.
6. Submit once.
7. Wait for the editor/project page to load and generation to start.
8. Capture the editor URL and preview URL.

Do not click publish, connect GitHub, enable paid integrations, delete projects, change visibility, or expose private data without explicit confirmation.

## Assets and Constraints

### Public images for Build with URL

Use the `images` parameter only for public image URLs. Do not include:

- Signed URLs with sensitive tokens.
- Private S3/GCS/blob links.
- Customer files not explicitly approved for upload.
- Images containing secrets, private dashboards, or PII.

If images are private, use MCP/browser attachment only after explicit user approval, or ask the user to provide sanitized public references.

### Local files

Browser upload is safer than converting local files to public links. Before upload, summarize filenames and ask for confirmation if files may contain sensitive content.

### Private repos

Do not connect GitHub or import private repository content unless the user explicitly requests that repository and understands Lovable may read code from it. If the user wants repo context in the prompt, summarize relevant constraints instead of pasting secrets or proprietary source wholesale.

## Safety Rules

- **Credentials**: never paste API keys, passwords, tokens, service-role keys, database URLs, or OAuth secrets into Lovable chat or Build with URL. Use placeholder env var names.
- **Paid actions**: ask before actions that may consume credits, upgrade plans, deploy apps, connect paid services, or trigger third-party billing.
- **Deployments**: ask before publishing. A deployed app can be reachable by anyone with the link depending on plan/workspace settings.
- **Visibility**: ask before changing project, folder, or app visibility. Editor access and published app access can differ.
- **Databases**: ask before running SQL, creating schemas, or modifying production data through MCP.
- **Personal data**: avoid putting PII, customer data, internal roadmaps, or confidential screenshots in prompts unless the user explicitly approved the specific data.
- **One project per concept**: do not create multiple projects while experimenting unless the user asks for variants.

## Troubleshooting

| Symptom | Action |
|---|---|
| URL opens but does not submit | Confirm `autosubmit=true` is in the query string before `#`, and `prompt=` is in the hash. |
| Prompt is missing or truncated | Rebuild with `URLSearchParams`; shorten the prompt or move assets/context into MCP/browser attachment. |
| Images are ignored | Confirm each image URL is public, URL-encoded, and JPEG/PNG/WebP. |
| Login page appears | Stop and return the creation URL, or ask the user to authenticate in the browser. |
| Workspace selection blocks creation | Ask the user which workspace to use, or use MCP `list_workspaces` if available. |
| MCP tool names differ | Fetch Lovable's current docs/index, then map the available runtime tools to the same create/iterate/deploy workflow. |
| Build consumes credits slowly or hangs | Poll project/message status if MCP supports it; otherwise keep the editor URL and report the current visible state. |

## Expected Output

For MCP creation:

```json
{
  "success": true,
  "method": "mcp",
  "project_id": "...",
  "workspace": "...",
  "editor_url": "https://lovable.dev/projects/...",
  "preview_url": "https://...",
  "prompt_used": "..."
}
```

For Build with URL handoff:

```json
{
  "success": true,
  "method": "build_with_url",
  "creation_url": "https://lovable.dev/?autosubmit=true#prompt=...",
  "prompt_used": "...",
  "assets": []
}
```

For login or approval blockers:

```json
{
  "success": false,
  "reason": "requires_user_login",
  "creation_url": "https://lovable.dev/?autosubmit=true#prompt=...",
  "next_step": "User signs in and selects the workspace."
}
```
