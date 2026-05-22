// codegen-stagehand.mjs — ops[] + snapshots[] → runnable Stagehand TS.
//
// Stagehand-native emitter: every element-finding op collapses into a
// `stagehand.page.act(...)` call, letting Stagehand self-heal across DOM
// drift. Deterministic ops (goto, waits, keyboard, scroll, eval, page_nav)
// stay as `page.*` — there's no element to find, so no point paying for an
// LLM call. The final extract step uses `stagehand.page.extract({ instruction, schema })`.
//
// Connects to a Browserbase session bound to BROWSERBASE_CONTEXT_ID at
// runtime (or falls back to env=LOCAL for development).

import Anthropic from "@anthropic-ai/sdk";
import { resolveOpRef, collectSnapshots } from "./selector-resolver.mjs";

// ── Helpers ────────────────────────────────────────────────────────

function jsStr(s) {
  return JSON.stringify(String(s ?? ""));
}

// Truncate intent so it doesn't bloat act() instructions.
function shortIntent(s) {
  const t = (s || "").replace(/[\r\n]+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 137) + "..." : t;
}

// Heuristic: roughly describe a selector for an `act` instruction when we
// don't have a resolved ARIA node. Stagehand parses natural language, not
// CSS, so we hand it the selector as a hint, not a directive.
function describeSelector(sel) {
  if (!sel) return "";
  return ` (originally targeted CSS selector \`${sel}\`)`;
}

// Build a natural-language action string for an `act` op.
function actInstruction(verb, op, resolvedNode) {
  const intent = shortIntent(op.intent);
  const intentSuffix = intent && intent !== `turn ${op.turn}` ? ` — ${intent}` : "";

  if (resolvedNode) {
    const role = resolvedNode.role || "element";
    const name = resolvedNode.name ? ` "${resolvedNode.name}"` : "";
    switch (verb) {
      case "click":
        return `click the ${role}${name}${intentSuffix}`;
      case "fill":
        return `fill the ${role}${name} with "${op.value ?? ""}"${intentSuffix}`;
      case "select":
        return `select "${op.value ?? ""}" in the ${role}${name}${intentSuffix}`;
    }
  }

  // Selector-based fallback — describe by intent + selector hint.
  const hint = describeSelector(op.selector);
  switch (verb) {
    case "click":
      return intent ? `${intent}${hint}` : `click the element${hint}`;
    case "fill":
      return `fill the field with "${op.value ?? ""}"${hint}${intentSuffix}`;
    case "select":
      return `select "${op.value ?? ""}" in the dropdown${hint}${intentSuffix}`;
  }
  return intent || verb;
}

// ── Op → Stagehand code ───────────────────────────────────────────

function emitOp(op, snapshots) {
  const lines = [];
  const stats = { deterministic: 0, act: 0, ref_resolved: 0, ref_failed: 0, dropped: 0 };
  const sec = op.section ? `// [${op.section}] ` : "";
  const intent = (op.intent || "").replace(/[\r\n]+/g, " ").slice(0, 140);
  const hasUsefulIntent = intent && intent !== `turn ${op.turn}`;
  const header = hasUsefulIntent ? `  ${sec}// turn ${op.turn}: ${intent}` : (op.section ? `  ${sec}` : null);

  const pushAct = (verb, resolvedNode = null) => {
    if (header) lines.push(header);
    const instruction = actInstruction(verb, op, resolvedNode);
    lines.push(`  await page.act(${jsStr(instruction)});`);
    stats.act++;
    return { kind: "act", verb, instruction, op };
  };

  switch (op.kind) {
    case "goto":
      if (header) lines.push(header);
      lines.push(`  await page.goto(${jsStr(op.url)});`);
      stats.deterministic++;
      return { lines, cached: { kind: "goto", url: op.url, op }, stats };

    case "wait_load":
      lines.push(`  await page.waitForLoadState("load");`);
      stats.deterministic++;
      break;
    case "wait_timeout":
      lines.push(`  await page.waitForTimeout(${op.ms || 1000});`);
      stats.deterministic++;
      break;
    case "wait_selector":
      lines.push(`  await page.waitForSelector(${jsStr(op.selector)});`);
      stats.deterministic++;
      break;

    case "click_sel": {
      const cached = pushAct("click");
      return { lines, cached, stats };
    }
    case "fill_sel": {
      const cached = pushAct("fill");
      return { lines, cached, stats };
    }
    case "select_dropdown": {
      const cached = pushAct("select");
      return { lines, cached, stats };
    }

    case "click_ref":
    case "fill_ref":
    case "select_ref": {
      const r = resolveOpRef(op, snapshots);
      const verb = op.kind === "click_ref" ? "click" : op.kind === "fill_ref" ? "fill" : "select";
      if (!r.resolved) {
        // Even without a resolved node we can still try act() with the
        // agent's intent — Stagehand will look at the live page.
        if (header) lines.push(header);
        lines.push(`  // ref ${op.ref} did not resolve in snapshots (${r.reason}); falling back to intent-only act`);
        const cached = pushAct(verb, null);
        stats.ref_failed++;
        return { lines, cached, stats };
      }
      const cached = pushAct(verb, r.node);
      cached.ref = op.ref;
      cached.source_turn = r.sourceTurn;
      cached.node = { role: r.node.role, name: r.node.name, depth: r.node.depth };
      stats.ref_resolved++;
      return { lines, cached, stats };
    }

    case "type_focused":
      lines.push(`  await page.keyboard.type(${jsStr(op.text)});`);
      stats.deterministic++;
      break;

    case "eval": {
      if (header) lines.push(header);
      const escaped = (op.expression || "")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");
      lines.push(`  await page.evaluate(\`${escaped}\`);`);
      stats.deterministic++;
      return { lines, cached: { kind: "eval", expression: op.expression, op }, stats };
    }
    case "press":
      lines.push(`  await page.keyboard.press(${jsStr(op.key)});`);
      stats.deterministic++;
      break;

    case "scroll": {
      const [x, y, dx, dy] = op.coords;
      if ([x, y, dx, dy].some((n) => Number.isNaN(n))) {
        lines.push(`  // skip: malformed scroll ${JSON.stringify(op.coords)}`);
        stats.dropped++;
      } else {
        lines.push(`  await page.mouse.move(${x}, ${y});`);
        lines.push(`  await page.mouse.wheel(${dx}, ${dy});`);
        stats.deterministic++;
      }
      break;
    }

    case "page_nav":
      if (op.verb === "back") lines.push(`  await page.goBack();`);
      else if (op.verb === "forward") lines.push(`  await page.goForward();`);
      else if (op.verb === "reload") lines.push(`  await page.reload();`);
      stats.deterministic++;
      break;

    case "session":
    case "perception":
      lines.push(`  // skip (${op.kind}): ${op.command}`);
      stats.dropped++;
      break;

    case "unhandled": {
      // Best-effort act() with the intent string; the original verb was
      // something our op walker didn't classify.
      if (header) lines.push(header);
      lines.push(`  // unhandled browse verb '${op.verb}' — attempting act() with intent`);
      const cached = pushAct("click");
      stats.dropped++;
      return { lines, cached, stats };
    }
  }
  return { lines, cached: null, stats };
}

// ── Extract instruction (one tiny LLM call, optional) ─────────────

async function generateExtractInstruction({ outputShape, taskMd, finalReasoning }) {
  const FALLBACK = `Extract the final result from the page that matches the provided schema. Pull every field directly from visible page content.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { instruction: FALLBACK, generated: false, reason: "no ANTHROPIC_API_KEY" };
  }

  const prompt = `You are writing ONE natural-language instruction for \`stagehand.page.extract({ instruction, schema })\`. Stagehand will read the live page and populate a Zod schema. Your instruction should tell it which data to pull.

Task description (excerpt from task.md):
\`\`\`
${(taskMd || "").slice(0, 1500)}
\`\`\`

Expected output shape:
\`\`\`json
${JSON.stringify(outputShape, null, 2)}
\`\`\`

Agent's final reasoning (context — do NOT copy values from it):
${finalReasoning ? finalReasoning.slice(0, 800) : "(none)"}

Write ONE instruction sentence (max 50 words) telling Stagehand what to extract from the page. Reference the schema fields by name. Do not include the schema itself, code, or markdown — just the sentence.`;

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text) return { instruction: FALLBACK, generated: false, reason: "empty LLM response" };
    // Strip stray quoting / fences.
    const cleaned = text.replace(/^["'`]+|["'`]+$/g, "").replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
    return { instruction: cleaned || FALLBACK, generated: true, reason: null };
  } catch (err) {
    return { instruction: FALLBACK, generated: false, reason: String(err?.message || err) };
  }
}

// ── Script wrapper ────────────────────────────────────────────────

function wrapScript({ task, runId, workspace, zodSchema, body, extractInstruction }) {
  return `// Generated by autobrowse export --target stagehand from ${runId}.
// Source: ${workspace}/tasks/${task}/{task.md, strategy.md} + traces/${task}/${runId}/trace.json
// Hand-edit freely. selectors.cache.json mirrors the act() instructions per turn.
//
// Stagehand-native: every interactive step is a page.act() call so the script
// self-heals across DOM drift. Deterministic steps (goto, waits, keyboard,
// scroll) stay as raw Playwright page.* calls.
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import "dotenv/config";

const OutputSchema = ${zodSchema};
type Output = z.infer<typeof OutputSchema>;

const MODEL_NAME = process.env.STAGEHAND_MODEL ?? "claude-sonnet-4-5-20250929";

function createStagehand(): Stagehand {
  const ctxId = process.env.BROWSERBASE_CONTEXT_ID;
  const useBrowserbase = Boolean(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);

  if (!useBrowserbase) {
    return new Stagehand({ env: "LOCAL", modelName: MODEL_NAME });
  }

  return new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    modelName: MODEL_NAME,
    browserbaseSessionCreateParams: {
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      browserSettings: {
        ...(ctxId ? { context: { id: ctxId, persist: true } } : {}),
        advancedStealth: true,
        solveCaptchas: true,
      },
    },
  });
}

async function main(): Promise<Output> {
  const stagehand = createStagehand();
  await stagehand.init();
  const page = stagehand.page;

  try {
${body}

    const result = await page.extract({
      instruction: ${jsStr(extractInstruction)},
      schema: OutputSchema,
    });
    return OutputSchema.parse({ ...result, success: true });
  } finally {
    await stagehand.close();
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

export async function generateStagehandScript({
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
  const stats = { deterministic: 0, act: 0, ref_resolved: 0, ref_failed: 0, dropped: 0 };

  for (const op of ops) {
    const r = emitOp(op, snapshots);
    bodyLines.push(...r.lines);
    if (r.cached) cachedActions.push({ turn: op.turn, intent: op.intent, section: op.section, ...r.cached });
    stats.deterministic += r.stats.deterministic;
    stats.act += r.stats.act;
    stats.ref_resolved += r.stats.ref_resolved;
    stats.ref_failed += r.stats.ref_failed;
    stats.dropped += r.stats.dropped;
  }

  const extract = await generateExtractInstruction({ outputShape, taskMd, finalReasoning });

  const scriptCode = wrapScript({
    task,
    runId,
    workspace,
    zodSchema,
    body: bodyLines.join("\n"),
    extractInstruction: extract.instruction,
  });

  return {
    scriptCode,
    cachedActions,
    stats,
    extract: { generated: extract.generated, reason: extract.reason, instruction: extract.instruction },
  };
}

// ── Scaffold files ────────────────────────────────────────────────

export function stagehandPackageJson(task) {
  return {
    name: `${task}-stagehand`,
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: { start: `tsx ${task}.ts` },
    dependencies: {
      "@browserbasehq/stagehand": "^2.0.0",
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

export function stagehandTsconfig() {
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
