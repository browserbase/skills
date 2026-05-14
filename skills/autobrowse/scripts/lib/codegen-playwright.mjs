// codegen-playwright.mjs — ops[] + snapshots[] → runnable Playwright TS.
//
// Connects to a Browserbase session bound to BROWSERBASE_CONTEXT_ID at
// runtime (or falls back to chromium.launch for local dev). Replays the
// mined trace using resolved Playwright locators and ends with an
// LLM-generated extract block that pulls the final result JSON.

import Anthropic from "@anthropic-ai/sdk";
import {
  resolveOpRef,
  renderLocator,
  collectSnapshots,
} from "./selector-resolver.mjs";

// ── Op → Playwright code ──────────────────────────────────────────

function jsStr(s) {
  return JSON.stringify(String(s ?? ""));
}

// Cheap classifier: does a CSS selector target an <input type="checkbox">?
function isCheckboxSelector(s) {
  if (!s) return false;
  return /input\s*\[\s*type\s*=\s*['"]?checkbox['"]?\s*\]/i.test(s) ||
    /\[type=checkbox\]/i.test(s);
}

// Cheap classifier: does a CSS selector target an <input type="radio">?
function isRadioSelector(s) {
  if (!s) return false;
  return /input\s*\[\s*type\s*=\s*['"]?radio['"]?\s*\]/i.test(s) ||
    /\[type=radio\]/i.test(s);
}

function emitOp(op, snapshots) {
  const lines = [];
  const cached = null;
  const stats = { cached: 0, ref_resolved: 0, ref_failed: 0, dropped: 0 };
  const sec = op.section ? `// [${op.section}] ` : "";
  const intent = (op.intent || "").replace(/[\r\n]+/g, " ").slice(0, 140);
  // Skip the intent header when intent is just the fallback "turn N" string
  // (i.e., the agent had no reasoning for this turn).
  const hasUsefulIntent = intent && intent !== `turn ${op.turn}`;
  const header = hasUsefulIntent ? `  ${sec}// turn ${op.turn}: ${intent}` : (op.section ? `  ${sec}` : null);

  switch (op.kind) {
    case "goto":
      if (header) lines.push(header);
      lines.push(`  await page.goto(${jsStr(op.url)});`);
      stats.cached++;
      break;

    case "wait_load":
      lines.push(`  await page.waitForLoadState("load");`);
      break;
    case "wait_timeout":
      lines.push(`  await page.waitForTimeout(${op.ms || 1000});`);
      break;
    case "wait_selector":
      lines.push(`  await page.waitForSelector(${jsStr(op.selector)});`);
      break;

    case "click_sel": {
      if (header) lines.push(header);
      // Detect radio inputs by selector pattern → use forceClickRadio
      // (styled labels commonly intercept actionability checks).
      if (isRadioSelector(op.selector)) {
        lines.push(`  await forceClickRadio(page.locator(${jsStr(op.selector)}));`);
      } else {
        lines.push(`  await page.locator(${jsStr(op.selector)}).click();`);
      }
      stats.cached++;
      return { lines, cached: { kind: "click", code: `page.locator(${jsStr(op.selector)}).click()`, selector: op.selector, op }, stats };
    }
    case "fill_sel": {
      if (header) lines.push(header);
      // Detect checkbox inputs by selector pattern → use forceCheck
      // (Playwright's .fill() rejects checkboxes; styled labels often
      // intercept .check() actionability).
      if (isCheckboxSelector(op.selector)) {
        lines.push(`  await forceCheck(page.locator(${jsStr(op.selector)}));`);
      } else {
        lines.push(`  await page.locator(${jsStr(op.selector)}).fill(${jsStr(op.value)});`);
      }
      stats.cached++;
      return { lines, cached: { kind: "fill", code: `page.locator(${jsStr(op.selector)}).fill(${jsStr(op.value)})`, selector: op.selector, value: op.value, op }, stats };
    }
    case "select_dropdown": {
      if (header) lines.push(header);
      // Always use selectWithFallback — handles transiently-disabled selects
      // via JS-enable + native value setter when .selectOption() times out.
      lines.push(`  await selectWithFallback(page.locator(${jsStr(op.selector)}), ${jsStr(op.value)});`);
      stats.cached++;
      return { lines, cached: { kind: "select", code: `selectWithFallback(page.locator(${jsStr(op.selector)}), ${jsStr(op.value)})`, selector: op.selector, value: op.value, op }, stats };
    }

    case "select_ref": {
      const r = resolveOpRef(op, snapshots);
      if (!r.resolved) {
        if (header) lines.push(header);
        lines.push(`  // TODO: could not resolve select ref ${op.ref} (${r.reason})`);
        lines.push(`  // Original: ${op.command}`);
        stats.ref_failed++;
        return { lines, cached: null, stats };
      }
      const best = r.candidates[0];
      if (header) lines.push(header);
      lines.push(`  await selectWithFallback(${best.code}, ${jsStr(op.value)});`);
      stats.ref_resolved++;
      return {
        lines,
        cached: {
          kind: "select",
          ref: op.ref,
          source_turn: r.sourceTurn,
          node: { role: r.node.role, name: r.node.name, depth: r.node.depth },
          primary: { method: best.method, args: best.args, confidence: best.confidence, code: best.code },
          fallbacks: r.candidates.slice(1).map((c) => ({ method: c.method, args: c.args, confidence: c.confidence, code: c.code })),
          op,
        },
        stats,
      };
    }

    case "click_ref":
    case "fill_ref": {
      const r = resolveOpRef(op, snapshots);
      if (!r.resolved) {
        if (header) lines.push(header);
        lines.push(`  // TODO: could not resolve ref ${op.ref} (${r.reason})`);
        lines.push(`  // Original: ${op.command}`);
        stats.ref_failed++;
        return { lines, cached: null, stats };
      }
      const best = r.candidates[0];
      const method = op.kind === "click_ref" ? "click" : "fill";
      const args = method === "fill" ? `(${jsStr(op.value)})` : `()`;
      if (header) lines.push(header);
      // Bake in force-helpers when the resolved node role tells us what we're dealing with.
      const role = (r.node.role || "").toLowerCase();
      if (op.kind === "click_ref" && role === "radio") {
        lines.push(`  await forceClickRadio(${best.code});`);
      } else if (op.kind === "click_ref" && role === "checkbox") {
        lines.push(`  await forceCheck(${best.code});`);
      } else if (op.kind === "fill_ref" && role === "checkbox") {
        lines.push(`  await forceCheck(${best.code});`);
      } else {
        lines.push(`  await ${best.code}.${method}${args};`);
      }
      // Emit alternative candidates as comments — the self-healer (P1) reads
      // these and selectors.cache.json to swap when the primary breaks.
      if (r.candidates.length > 1) {
        const alts = r.candidates.slice(1, 3).map((c) => c.code).join("  |  ");
        lines.push(`  //   fallbacks: ${alts}`);
      }
      stats.ref_resolved++;
      return {
        lines,
        cached: {
          kind: method,
          ref: op.ref,
          source_turn: r.sourceTurn,
          node: { role: r.node.role, name: r.node.name, depth: r.node.depth },
          primary: { method: best.method, args: best.args, confidence: best.confidence, code: best.code },
          fallbacks: r.candidates.slice(1).map((c) => ({ method: c.method, args: c.args, confidence: c.confidence, code: c.code })),
          op,
        },
        stats,
      };
    }

    case "type_focused":
      lines.push(`  await page.keyboard.type(${jsStr(op.text)});`);
      break;

    case "eval": {
      if (header) lines.push(header);
      // Escape backticks, escape sequences, and ${} for safe embedding in a
      // TS template literal. The expression runs in page context, same as
      // the original `browse eval` did via CDP.
      const escaped = op.expression
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");
      lines.push(`  await page.evaluate(\`${escaped}\`);`);
      stats.cached++;
      return {
        lines,
        cached: { kind: "eval", expression: op.expression, op },
        stats,
      };
    }
    case "press":
      lines.push(`  await page.keyboard.press(${jsStr(op.key)});`);
      break;

    case "scroll": {
      const [x, y, dx, dy] = op.coords;
      if ([x, y, dx, dy].some((n) => Number.isNaN(n))) {
        lines.push(`  // skip: malformed scroll ${JSON.stringify(op.coords)}`);
      } else {
        lines.push(`  await page.mouse.move(${x}, ${y});`);
        lines.push(`  await page.mouse.wheel(${dx}, ${dy});`);
      }
      break;
    }

    case "page_nav":
      if (op.verb === "back") lines.push(`  await page.goBack();`);
      else if (op.verb === "forward") lines.push(`  await page.goForward();`);
      else if (op.verb === "reload") lines.push(`  await page.reload();`);
      break;

    case "session":
    case "perception":
      lines.push(`  // skip (${op.kind}): ${op.command}`);
      stats.dropped++;
      break;

    case "unhandled":
      lines.push(`  // TODO: unhandled browse verb '${op.verb}' (turn ${op.turn}): ${op.command}`);
      stats.dropped++;
      break;
  }
  return { lines, cached, stats };
}

// ── LLM-generated extract block ───────────────────────────────────

async function generateExtractBlock({ snapshots, zodSchema, outputShape, taskMd, finalReasoning }) {
  const FALLBACK = `    // TODO: extract step could not be auto-generated. Hand-write or re-run export with ANTHROPIC_API_KEY set.
    const result: Output = { success: false, error: "extract step not generated" } as unknown as Output;`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { code: FALLBACK, generated: false, reason: "no ANTHROPIC_API_KEY" };
  }
  if (!snapshots.length) {
    return { code: FALLBACK, generated: false, reason: "no snapshots in trace" };
  }

  // Send the final snapshot + schema + agent's final reasoning to Claude.
  const finalSnap = snapshots[snapshots.length - 1];
  const treeText = finalSnap.tree.nodes
    .map((n) => `${"  ".repeat(n.depth)}[${n.ref}] ${n.role}${n.name ? ": " + n.name : ""}`)
    .join("\n")
    .slice(0, 10_000); // safety cap

  const prompt = `You are generating the final extract step for a deterministic Playwright replay script.

The replay script will navigate to a page that the agent previously walked through. Your job is to write TypeScript code that **queries the live page at replay time** to populate a \`result\` variable matching this Zod schema:

\`\`\`ts
const OutputSchema = ${zodSchema};
type Output = z.infer<typeof OutputSchema>;
\`\`\`

The expected output shape (from task.md):
\`\`\`json
${JSON.stringify(outputShape, null, 2)}
\`\`\`

The accessibility tree of the final page (after all actions ran) is below. Use it ONLY as a guide to pick selectors — do not hardcode field values from it:
\`\`\`
${treeText}
\`\`\`

The agent's prior reasoning (for context — do not copy data from it into the result):
${finalReasoning ? finalReasoning.slice(0, 1500) : "(none)"}

**Critical rules**:
- Generate code that calls Playwright locators (\`page.getByRole(...)\`, \`page.getByText(...)\`, \`page.getByLabel(...)\`, \`page.locator(...)\`) to fetch text content from the live page. Do **NOT** bake the agent's findings in as static literals.
- For each field, pick the most stable locator (prefer \`getByRole\` with name → \`getByLabel\` → \`getByText\`) and call \`.textContent()\` / \`.innerText()\` / \`.inputValue()\`.
- For repeated items (arrays in the schema), use \`.all()\` or \`.allTextContents()\` plus a small loop or \`.map()\`. Pick a parent locator and walk its children.
- Coerce types correctly: \`Number(...)\` for numbers, parse dates with \`new Date(...)\`, etc.
- For fields you cannot locate, use an empty sentinel: \`""\` for strings, \`0\` for numbers, \`null\` for nullable, \`[]\` for arrays.
- Set \`success: true\` at the end if extraction completed without throwing.
- The variable MUST be named \`result\` and typed \`Output\` (already defined above).
- Output ONLY the code block. No prose, no markdown fences, no \`async function\` wrapper. The code will be inserted inside a try-block where \`page\` is in scope.
- Keep it concise. Aim for under 80 lines.

Begin the code now:`;

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content.find((b) => b.type === "text")?.text ?? "";
    const stopReason = resp.stop_reason;
    // Strip leading/trailing markdown fences if Claude added them.
    let code = text.trim().replace(/^```(?:typescript|ts)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    if (!code) return { code: FALLBACK, generated: false, reason: "empty LLM response" };

    // Structural validation. Truncated output (stop_reason === "max_tokens")
    // produces unparseable code — refuse it. Also require that braces /
    // brackets / parens balance, since the LLM occasionally drops a closer.
    if (stopReason === "max_tokens") {
      return { code: FALLBACK, generated: false, reason: "LLM output truncated at max_tokens" };
    }
    const balance = checkBalance(code);
    if (!balance.ok) {
      return { code: FALLBACK, generated: false, reason: `LLM output unbalanced: ${balance.reason}` };
    }
    if (!/\bresult\b/.test(code)) {
      return { code: FALLBACK, generated: false, reason: "LLM output did not declare a `result` variable" };
    }

    // Indent two extra spaces for the try-block context.
    code = code.split("\n").map((l) => (l.length ? "    " + l : l)).join("\n");
    return { code, generated: true, reason: null };
  } catch (err) {
    return { code: FALLBACK, generated: false, reason: String(err?.message || err) };
  }
}

// Crude balance check — counts brackets ignoring those inside strings or
// comments. Good enough to catch LLM truncation, not a parser.
function checkBalance(code) {
  let depth = { "{": 0, "[": 0, "(": 0 };
  const open = { "{": "}", "[": "]", "(": ")" };
  let inStr = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const prev = code[i - 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === "*" && c === "/") inBlockComment = false;
      continue;
    }
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c in depth) depth[c]++;
    else if (c === "}") depth["{"]--;
    else if (c === "]") depth["["]--;
    else if (c === ")") depth["("]--;
  }
  for (const k of Object.keys(depth)) {
    if (depth[k] !== 0) {
      return { ok: false, reason: `unbalanced '${k}' (${depth[k]} open at end)` };
    }
  }
  return { ok: true };
}

// ── Final script wrapper ──────────────────────────────────────────

function wrapScript({ task, runId, workspace, zodSchema, body, extractCode }) {
  return `// Generated by autobrowse export --target playwright from ${runId}.
// Source: ${workspace}/tasks/${task}/{task.md, strategy.md} + traces/${task}/${runId}/trace.json
// Hand-edit freely. selectors.cache.json mirrors resolved locators + fallbacks.
import { chromium } from "playwright";
import { z } from "zod";
import "dotenv/config";
import { execFileSync } from "node:child_process";

const OutputSchema = ${zodSchema};
type Output = z.infer<typeof OutputSchema>;

interface BbSession {
  wssUrl: string;
  sessionId: string;
}

function createBrowserbaseSession(): BbSession | null {
  const ctx = process.env.BROWSERBASE_CONTEXT_ID;
  if (!ctx) return null;

  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error("BROWSERBASE_CONTEXT_ID is set but BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID are missing.");
  }

  const stdout = execFileSync(
    "bb",
    ["sessions", "create", "--context-id", ctx, "--persist", "--advanced-stealth", "--solve-captchas"],
    { encoding: "utf-8" },
  );
  const session = JSON.parse(stdout);
  const wssUrl = \`wss://connect.browserbase.com?apiKey=\${apiKey}&sessionId=\${session.id}\`;
  return { wssUrl, sessionId: session.id };
}

function releaseBrowserbaseSession(bb: BbSession): void {
  try {
    execFileSync("bb", ["sessions", "update", bb.sessionId, "--status", "REQUEST_RELEASE"], { stdio: "ignore" });
  } catch {
    /* best-effort */
  }
}

// ── Helpers ────────────────────────────────────────────────────────
//
// Baked-in workarounds for patterns that broke during the bizfile demo:
// styled-label overlays intercepting clicks on radios/checkboxes, selects
// that render briefly disabled while other fields are committing, and
// React-controlled inputs that strip simulated keystrokes mid-typing.

import type { Locator, Page } from "playwright";

/** Check a styled checkbox, bypassing actionability (the visible label often intercepts). */
async function forceCheck(loc: Locator): Promise<void> {
  await loc.first().check({ force: true });
}

/** Click a styled radio, bypassing actionability (the visible label often intercepts). */
async function forceClickRadio(loc: Locator): Promise<void> {
  await loc.first().click({ force: true });
}

/**
 * Select an option; if the <select> is rendered disabled (common right after
 * a prior field commits in React-controlled forms), force-enable it and set
 * the value via React's tracked-value setter so the form picks it up.
 */
async function selectWithFallback(loc: Locator, value: string): Promise<void> {
  try {
    await loc.first().selectOption(value, { timeout: 5000 });
    return;
  } catch {
    await loc.first().evaluate((el, v) => {
      const sel = el as HTMLSelectElement;
      sel.disabled = false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (!setter) throw new Error("No value setter on HTMLSelectElement");
      setter.call(sel, v);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }
}

/**
 * Fill a text input via React's tracked-value setter. Bypasses keystroke-by-
 * keystroke event handling (autosuggests that intercept space, autocompletes
 * that drop characters, etc.). Always prefer this over .fill()/.type() on
 * React-controlled forms.
 */
async function reactFill(page: Page, labelPattern: RegExp | string, value: string): Promise<void> {
  await page.getByLabel(labelPattern).first().click();
  await page.evaluate((v) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el) throw new Error("No active element to fill");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("No value setter on HTMLInputElement");
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** Click "Next Step" (or other named button) via find-by-text in page context;
 *  avoids the race where getByRole resolves to a stale element between SPA wizard steps. */
async function clickButtonByText(page: Page, text: string, waitAfterMs = 1500): Promise<void> {
  await page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === t,
    );
    if (!btn) throw new Error(\`Button "\${t}" not found in DOM\`);
    (btn as HTMLElement).click();
  }, text);
  await page.waitForLoadState("load");
  await page.waitForTimeout(waitAfterMs);
}

// ───────────────────────────────────────────────────────────────────

async function main(): Promise<Output> {
  const bb = createBrowserbaseSession();
  const browser = bb
    ? await chromium.connectOverCDP(bb.wssUrl)
    : await chromium.launch({ headless: false });

  const context = bb ? browser.contexts()[0] : await browser.newContext();
  const page = context.pages()[0] ?? (await context.newPage());

  try {
${body}

${extractCode}

    return OutputSchema.parse(result);
  } finally {
    if (bb) {
      releaseBrowserbaseSession(bb);
    } else {
      await browser.close();
    }
  }
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit((result as { success?: boolean })?.success === true ? 0 : 2);
  })
  .catch((err) => {
    console.error("FATAL:", err);
    console.log(JSON.stringify({ success: false, error: String(err) }));
    process.exit(1);
  });
`;
}

// ── Top-level entry ───────────────────────────────────────────────

export async function generatePlaywrightScript({
  task,
  runId,
  workspace,
  trace,
  ops,
  zodSchema,
  outputShape,
  taskMd,
  finalReasoning,
}) {
  const snapshots = collectSnapshots(trace);
  const bodyLines = [];
  const cachedActions = [];
  const stats = { cached: 0, ref_resolved: 0, ref_failed: 0, dropped: 0 };

  for (const op of ops) {
    const r = emitOp(op, snapshots);
    bodyLines.push(...r.lines);
    if (r.cached) cachedActions.push({ turn: op.turn, intent: op.intent, section: op.section, ...r.cached });
    stats.cached += r.stats.cached;
    stats.ref_resolved += r.stats.ref_resolved;
    stats.ref_failed += r.stats.ref_failed;
    stats.dropped += r.stats.dropped;
  }

  const extract = await generateExtractBlock({
    snapshots,
    zodSchema,
    outputShape,
    taskMd,
    finalReasoning,
  });

  const scriptCode = wrapScript({
    task,
    runId,
    workspace,
    zodSchema,
    body: bodyLines.join("\n"),
    extractCode: extract.code,
  });

  return {
    scriptCode,
    cachedActions,
    stats,
    extract: { generated: extract.generated, reason: extract.reason },
  };
}

// ── Scaffold files (package.json, tsconfig.json) ──────────────────

export function playwrightPackageJson(task) {
  return {
    name: `${task}-playwright`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { start: `tsx ${task}.ts` },
    dependencies: {
      playwright: "^1.47.0",
      zod: "^3.23.0",
      dotenv: "^16.4.0",
    },
    devDependencies: {
      tsx: "^4.7.0",
      typescript: "^5.4.0",
      "@types/node": "^20.0.0",
    },
  };
}

export function playwrightTsconfig() {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      lib: ["ES2022", "DOM"],
      types: ["node"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  };
}
