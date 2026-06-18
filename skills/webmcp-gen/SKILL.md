---
name: webmcp-gen
description: Create, compile, and validate site-specific WebMCP init scripts from a target URL and desired tool capability. Use when the user wants to author WebMCP tools for a website, produce a webmcp.init.js artifact, or test WebMCP registration and invocation through Stagehand.
compatibility: "Requires Node 18+ and Chrome/Chromium with WebMCP testing flags. Run `pnpm install` in the skill directory to install the Stagehand dependency. Page exploration uses the browse CLI (`npm install -g browse`)."
license: MIT
allowed-tools: Bash Read Grep Edit Write
---

# WebMCP Gen

Author website-specific WebMCP tools by writing a manifest, compiling it to an init script, and validating that Chrome registers and invokes the tools.

This skill does not call a nested agent. You are responsible for exploring the page, writing `manifest.json`, and iterating based on validation output.

## Setup check

From the skill directory, install dependencies if they are not already installed:

```bash
cd skills/webmcp-gen
pnpm install
```

This installs the pinned Stagehand package plus the TypeScript toolchain (`tsx`,
`typescript`, `@types/node`) used to run the generated `stagehand-example.ts`.

## Workflow

1. Pick an artifact slug with exactly one slash:

```text
<domain>/<task>
```

Example:

```text
example.com/page-context
```

2. Scaffold the artifact:

```bash
node scripts/scaffold.mjs example.com/page-context --url https://example.com
```

3. Explore the target page with the `browse` CLI:

```bash
browse open https://example.com --local
browse snapshot
browse get title
browse get url
browse get text body
browse get html body
```

Prefer `browse snapshot`, page text, and DOM inspection over screenshots unless visual layout matters. Use `browse stop` when exploration is complete.

4. Edit `artifacts/<domain>/<task>/manifest.json`. The manifest is the source of truth.

5. Compile:

```bash
node scripts/compile.mjs artifacts/example.com/page-context
```

6. Generate a runnable Stagehand example (`stagehand-example.ts`) and run it with `tsx`:

```bash
node scripts/generate-stagehand-example.mjs artifacts/example.com/page-context
npx tsx artifacts/example.com/page-context/stagehand-example.ts
```

7. Validate:

```bash
node scripts/validate.mjs artifacts/example.com/page-context
```

8. If validation fails, inspect `eval.json` and `eval-report.md`, patch `manifest.json`, then compile and validate again.

## Manifest contract

```json
{
  "domain": "example.com",
  "task": "page-context",
  "url": "https://example.com",
  "generatedAt": "2026-06-04T00:00:00.000Z",
  "tools": [
    {
      "name": "example_com_page_context",
      "description": "Returns page context.",
      "inputSchema": {
        "type": "object",
        "properties": {},
        "required": []
      },
      "implementation": {
        "kind": "dom",
        "source": "return { success: true, title: document.title, url: location.href };"
      },
      "fixtureInput": {}
    }
  ]
}
```

## Authoring rules

- `implementation.source` is inserted inside `async (input) => { ... }`; write JavaScript statements, not a full function wrapper.
- Return a JSON-serializable object.
- WebMCP code runs inside the browser page. Use browser-native APIs: `document`, `location`, `navigator`, and same-origin `fetch`.
- Do not use Playwright, Puppeteer, Stagehand, XPath helpers, or agent/browser commands inside `implementation.source`.
- `document.querySelector` and `querySelectorAll` must receive valid browser CSS selectors only.
- To find visible text, use `Array.from(document.querySelectorAll(...)).find((el) => (el.textContent || "").includes("..."))`.
- Do not include API keys, bearer tokens, cookies, localStorage secrets, or user credentials.
- Do not use `eval` or `new Function`.
- Avoid destructive actions unless the user explicitly asked for them.
- Make implementations defensive: check for missing elements and return structured `{ success: false, error: "..." }` responses.
- Generated init scripts register WebMCP tools only in the top frame.

## Output layout

```text
artifacts/<domain>/<task>/
  manifest.json
  webmcp.init.js
  stagehand-example.ts
  eval.json
  eval-report.md
```

To turn the example into a standalone project, scaffold a Stagehand app with
`npx create-browser-app` and drop the generated `webmcp.init.js` into it (load it
with `page.addInitScript({ path: "webmcp.init.js" })`).
