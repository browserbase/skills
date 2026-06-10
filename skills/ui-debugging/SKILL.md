---
name: ui-debugging
description: Debug and fix user-reported UI bugs using exact browser checks instead of repeated browsing. Use when a bug report describes user-visible misbehavior in a web app you have code access to - wrong state after a click, missing or overlapping elements, validation accepting bad input, stale async results, broken mobile layout, focus or accessibility failures. The workflow - reproduce in a browser with a source-blind probe, fix, then verify with an exact post-fix check whose JSON output names the failing element and the pass condition - measurably outperforms one-shot fixing (39% -> 67% fix rate on an 18-bug benchmark, with zero re-browsing during repair).
license: MIT
metadata:
  author: browserbase
  version: "0.1.0"
allowed-tools: Bash Read Edit Glob Grep
compatibility: "Works with any browser tool that can navigate and evaluate JS in the page (browse CLI, Stagehand/Playwright page.evaluate, chrome-devtools). Local apps: browse CLI local mode. Deployed/staging sites: browse --remote (Browserbase session)."
---

# UI Debugging — fix bugs with exact browser checks

Fix UI bugs by treating the browser as a **diagnostic instrument, not an explorer**. The core finding from benchmarking this workflow: when a fix attempt fails, more browsing barely helps — a *sharper assertion* does. One precise DOM check that names the exact wrong element recovers bugs that narrative re-investigation cannot.

## When to use

A user-visible bug in a web app whose code you can edit: state bugs (counter goes down instead of up, draft lost on tab switch), validation bugs (bad input accepted), async bugs (stale results, spinner never clears), auth/visibility bugs (protected UI still shown), layout bugs (overflow, hidden menus, overlap), a11y bugs (focus not moving into a dialog, missing accessible names).

For *finding* unknown bugs in changed UI, use the `ui-test` skill; this skill is for *fixing* a reported bug and proving the fix.

## The loop

```
1. REPRODUCE  browser probe, source-blind         -> evidence
2. FIX        smallest credible code change
3. CHECK      exact check: passed / measurements  -> if passed, done
4. FEED BACK  the check's JSON (not prose!) into the next fix attempt -> goto 2
```

With the `browse` CLI:

```bash
browse open http://127.0.0.1:5173/route --wait networkidle
browse viewport 375 700        # only for mobile-width bugs
browse eval '<check expression>'
```

For a deployed or staging site, add `--remote` to run in a Browserbase cloud session (you also get a session replay to attach to the bug report). Any tool with `page.evaluate` works the same way.

### Step 1 — Reproduce with a source-blind probe

Before reading any code, write a probe that follows the *user's* reproduction path using only what is visible on the page: query visible controls, set input values, dispatch events, click, wait, then return the before/after state. Do not let what you expect from the source bias what you measure.

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // For React apps, set inputs via the native setter so state actually updates:
  const setValue = (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const before = document.querySelector("output")?.textContent;
  [...document.querySelectorAll("button")].find((b) => b.textContent === "+")?.click();
  await sleep(100);
  return { before, after: document.querySelector("output")?.textContent };
})()
```

### Step 2 — Fix

Read the code, make the smallest change that explains *all* of the probe evidence. Prefer 1–2 files. Don't refactor.

### Step 3 — Write an exact check (the part that wins)

Write the verification as a **check contract** — a page-side expression returning:

```js
{
  passed: <boolean>,            // the assertion, computed in the page
  ...measurements,              // named evidence: elements, computed styles, rects, text
  passCondition: "<one sentence: what passing means>",
  instructionToFixer: "<when failing: exactly what must change>"
}
```

Three rules make checks effective:

1. **Name the exact element the assertion inspects.** Don't just assert "menu is visible" — return *which* element your selector matched, its `display`/`visibility`, its rect, and all other candidates. The classic failure: the selector matches a hidden desktop `<nav>` that appears before the mobile menu, so the fix targeted the wrong surface. The check that finally fixed it returned `querySelectorMatched: {dataProbe: "desktop-nav", display: "none"}, candidates: [...]` — instantly telling the fixer the *first match* was the problem.
2. **Measure, don't summarize.** `getComputedStyle`, `getBoundingClientRect`, `document.activeElement`, `scrollWidth > clientWidth`, regex over `document.body.innerText` — concrete numbers and booleans, not impressions.
3. **Compute `passed` inside the page.** The assertion runs where the truth lives; nothing is lost in translation.

Worked example — "focus doesn't move into the delete dialog":

```js
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const describe = (el) => ({
    tag: el?.tagName || "", role: el?.getAttribute?.("role") || "",
    text: (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
  });
  document.querySelector('[role="menuitem"], button')?.click();
  await sleep(120);
  document.querySelector('button[data-variant="destructive"]')?.click();
  await sleep(150);
  const dialog = document.querySelector('[role="dialog"]');
  const active = document.activeElement;
  return {
    passed: !!dialog && dialog.contains(active),
    dialog: describe(dialog), active: describe(active),
    passCondition: "after the delete confirmation opens, document.activeElement is inside the dialog",
    instructionToFixer: "Focus a real button/input inside the dialog when it opens (autoFocus or a ref/effect on the dialog content), not the trigger behind the modal."
  };
})()
```

### Step 4 — Feed the JSON back, not a summary

When the check fails after a fix, the next fix attempt gets the **raw check result** plus what the previous patch changed. Resist re-browsing for more narrative evidence — benchmark data shows the check payload is what converts failures, not fresh exploration. Re-run the *same* check after the next fix; never "eyeball" verification.

## Anti-patterns

- **Vague evidence**: "the mobile menu does not appear correctly" — true, but the fixer can patch the wrong nav surface. Name the element.
- **More browsing on failure**: a second narrative investigation mostly restates the first. Convert the failure into a sharper check instead.
- **Asserting outside the page**: extracting text and judging it in your head loses the measurements the next fix needs.
- **Trusting the click**: `el.click()` on React inputs without the native value setter silently does nothing; verify state actually changed in the probe output.
- **Declaring victory without re-running the check**: the check is the definition of done.

## Provenance

This workflow was extracted from ui-debug-bench, a benchmarked debugger→fixer harness: a browser-only debugger agent reproduces a planted bug, a code-only fixer patches it, and a deterministic check verifies. Measured on its 18-bug suite (6 realistic vibe-coded React apps; browse CLI + claude-opus-4-8): one-shot fixing solved 7/18; feeding the check's exact failure back into the fixer reached 11–12/18 — with zero re-browsing during repair. An earlier prototype showed the same ladder (6/18 one-shot, 8/18 with re-browse repair, 10/18 with exact probes). Sharper assertions beat more browsing.
