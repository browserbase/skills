# `browse` CLI → Stagehand translation table

This is the table the generator (`scripts/export.mjs`) applies when walking `trace.json`. Each row is "what the autobrowse inner agent did with the `browse` CLI" → "what Stagehand call the generator emits."

## Why three different output shapes?

The `browse` CLI mixes three element-targeting strategies:

- **Stable selectors** (XPath like `//label[normalize-space(.)='Street']`, CSS like `#dform_widget_Request_description`). These survive across sessions and DOM rerenders. They map cleanly to Stagehand's `Action` descriptor and replay with no LLM call.
- **ARIA refs** (`[0-970]`, `0-58`). Valid only inside the snapshot they came from — re-snapshotting can reassign refs. They cannot be cached. Stagehand's `observe()` is the natural replacement: at runtime, ask Stagehand to find an element matching the natural-language intent we captured from the assistant's reasoning, then `act()` on the returned `Action`.
- **Pure natural language** (`browse type "hello"` with no selector context — assumes focus). These also have no stable target. Stagehand can either accept a plain string instruction to `act()`, or we can drop to Playwright primitives (`page.keyboard.type`).

## Mapping

| `browse` form | Stagehand emission | Why |
|---|---|---|
| `browse stop` / `browse env local` / `browse env remote` | (dropped — replaced by `new Stagehand({ env })` + `stagehand.init()` at top) | Stagehand owns the session. The env flag picks `LOCAL` vs `BROWSERBASE`. |
| `browse open <url>` / `browse newpage <url>` | `await page.goto(url)` | Direct Playwright primitive. |
| `browse wait load` | `await page.waitForLoadState('load')` | Direct primitive. |
| `browse wait timeout <ms>` | `await page.waitForTimeout(ms)` | Direct primitive. |
| `browse wait selector "<sel>"` | `await page.waitForSelector(sel)` | Direct primitive. |
| `browse snapshot` | (dropped) | Snapshots exist to surface ARIA refs to an LLM. Stagehand's `act`/`observe` see the DOM themselves. |
| `browse screenshot <path>` | (dropped) | Debug-only; not needed in a deterministic replay. |
| `browse get url/title` | (dropped) | If the strategy uses these to gate a step, the corresponding step is preserved; the read itself is dropped. |
| `browse get text <sel>` | `await page.locator(sel).innerText()` (manual port; v1 drops) | v1 leaves these out and relies on the final `extract()` to pull all output data. |
| `browse click "//xpath-or-#css"` | **Cached `Action`**: `await stagehand.act({ selector, method: "click", arguments: [], description })` | Stable selector → deterministic replay, no LLM. |
| `browse click <ref>` (e.g. `0-970`, `[0-58]`) | **observe() fallback**: `const a = await stagehand.observe(intent); await stagehand.act(a[0]);` | Refs are session-scoped; resolve at runtime via NL intent. |
| `browse fill "<sel>" "<value>" [--no-press-enter]` | Cached `Action` with `method: "fill"`, `arguments: [value]` | The `--no-press-enter` flag is stripped (Stagehand's fill doesn't press Enter). |
| `browse select "<sel>" "<value>"` | Cached `Action` with `method: "selectOptionFromDropdown"`, `arguments: [value]` | Stable selector. |
| `browse type "<text>"` (no selector — types into focused element) | `await page.keyboard.type(text)` | No targetable element; assume focus is correct from the prior step. |
| `browse press <key>` | `await page.keyboard.press(key)` | Direct primitive. |
| `browse scroll <x> <y> <dx> <dy>` | `await page.mouse.move(x,y); await page.mouse.wheel(dx,dy)` | Direct primitive. |
| `browse back` / `forward` / `reload` | `page.goBack()` / `page.goForward()` / `page.reload()` | Direct primitive. |
| (anything else) | `// TODO: unhandled browse verb <verb>` comment | Surfaces gaps; the user hand-ports. |

## Intent sourcing

Each `Action` descriptor needs a `description` for self-healing. The generator pulls intent from two sources, in priority order:

1. **The assistant's `reasoning` text on the same turn as the tool call.** From `trace.json`, the entry with `role: "assistant"` and a `reasoning` field that immediately precedes the `tool_input`. The first line/sentence becomes the description. This is the highest-quality source because it captures the agent's actual goal.
2. **The strategy.md section heading** for the turn range. Strategy headers carry markers like `### Page 2 — Location (turns 8–18)`. If reasoning is empty, the section heading is the fallback.

If both are missing, the description falls back to `click element (turn N)`.

## Selectors cache side-car (`selectors.cache.json`)

The generator writes a sibling file alongside the `.ts`:

```json
{
  "task": "sf-311-request",
  "generated_from": { "workspace": "...", "run": "run-022" },
  "actions": [
    {
      "description": "Now I'll click the Street radio button.",
      "selector": "//label[normalize-space(.)='Street']",
      "method": "click",
      "arguments": [],
      "turn": 8,
      "section": "Page 2 — Location (turns 8–18)"
    },
    ...
  ]
}
```

This is **not** a parallel cache that the script reads at runtime — Stagehand's built-in `cacheDir` (configured to `./.stagehand-cache` in the constructor) handles runtime caching. The side-car exists so a human can scan, edit, or diff the selectors the export captured.

## Selector classification (heuristic)

The generator classifies the target string of `click`/`fill`/`select`:

- **Ref** — matches `^\[?\d+-\d+\]?$` (e.g., `0-970`, `[0-58]`).
- **XPath** — starts with `/`, `./`, or `//`.
- **CSS** — starts with `#`, `.`, `[`, or matches a tag-name pattern.
- **Unknown** — anything else; falls back to `observe()`.

Heuristics are intentionally permissive — a misclassification just means the generated line is the wrong shape; the user can edit it. The verification run catches issues that matter at runtime.
