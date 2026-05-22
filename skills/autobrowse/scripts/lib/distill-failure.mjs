// distill-failure.mjs — replay failure → strategy.md addendum.
//
// When the in-loop replay (Playwright or Stagehand) fails, this module asks
// Claude Haiku to distill the error into a concise, actionable strategy.md
// entry: what failed, the likely cause, and what to try next iteration. The
// addendum is appended to strategy.md's "Recent <Target> Failures" section
// so both the explorer agent (next evaluate run) and the codegen (next
// export) can react.

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "node:fs";

function targetLabel(target) {
  return target === "stagehand" ? "Stagehand" : "Playwright";
}

const FALLBACK = (iter, exitCode, stderrSnip, target) =>
  `### Iteration ${iter} — ${targetLabel(target)} replay failed (exit ${exitCode})

\`\`\`
${stderrSnip.slice(0, 800)}
\`\`\`

(Auto-summary unavailable — ANTHROPIC_API_KEY missing or LLM call errored. Read the raw error above and decide the next move.)
`;

export async function distillFailure({
  iteration,
  taskName,
  target = "playwright",
  scriptPath,
  exitCode,
  stdout = "",
  stderr = "",
  runLogPath = null,
}) {
  const stderrSnip = stderr.slice(0, 4000);
  const stdoutSnip = stdout.slice(0, 1000);

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      addendum: FALLBACK(iteration, exitCode, stderrSnip, target),
      generated: false,
      reason: "no ANTHROPIC_API_KEY",
    };
  }

  // Pull a small slice of the script around the failing line, if we can
  // infer it from the stderr (Playwright prints "at main (<path>:<line>:<col>)").
  let scriptSnippet = "";
  try {
    const m = stderrSnip.match(/at\s+\w+\s+\(([^:]+):(\d+):\d+\)/);
    if (m && fs.existsSync(m[1])) {
      const lines = fs.readFileSync(m[1], "utf-8").split("\n");
      const failingLine = parseInt(m[2], 10) - 1;
      const lo = Math.max(0, failingLine - 6);
      const hi = Math.min(lines.length, failingLine + 4);
      scriptSnippet = lines
        .slice(lo, hi)
        .map((l, i) => `${(lo + i + 1).toString().padStart(4)}${lo + i === failingLine ? " →" : "  "} ${l}`)
        .join("\n");
    }
  } catch {
    /* best-effort */
  }

  const tLabel = targetLabel(target);
  const targetGuidance = target === "stagehand"
    ? `This is a Stagehand-native script: every interactive step is a \`page.act("...")\` call that lets the model self-heal across DOM drift. Failures usually mean either (a) the act() instruction was too vague for the model to pick the right element, (b) the page state wasn't ready when act() ran (need a wait), or (c) the \`page.extract({ instruction, schema })\` step couldn't find the fields.\n\nFixes to suggest: rewrite the act() instruction to reference a more specific element (role, name, surrounding text); insert a \`page.waitForLoadState\` / \`page.waitForTimeout\` before the failing act(); restructure the extract instruction to name fields explicitly.`
    : `This is a deterministic Playwright script with resolved locators. Failures usually mean (a) the locator broke (DOM drift, role/name changed), (b) actionability check failed (disabled, intercepted by overlay, off-screen), or (c) a timing issue (element rendered too late, or stale after re-render).\n\nFixes to suggest: force-click via .click({force:true}); use eval-find-by-text instead of getByRole; add a waitForTimeout before the action; swap to a fallback locator from selectors.cache.json.`;

  const prompt = `A deterministic ${tLabel} replay script for task "${taskName}" just failed mid-replay. You are writing one short Markdown entry that will be appended to that task's \`strategy.md\` so the next iteration of the explorer agent can learn from this failure.

${targetGuidance}

Exit code: ${exitCode}
Script path: ${scriptPath}

Stderr (last 4KB):
\`\`\`
${stderrSnip}
\`\`\`

${stdoutSnip ? `Stdout (last 1KB):\n\`\`\`\n${stdoutSnip}\n\`\`\`\n` : ""}${scriptSnippet ? `Script context around the failing line:\n\`\`\`ts\n${scriptSnippet}\n\`\`\`\n` : ""}

Write a tight Markdown entry with this exact structure (no surrounding prose, no fences around the entry itself):

### Iteration ${iteration} — <one-line failure summary>

- **What failed**: <locator / act() instruction / step / line number>
- **Likely cause**: <one sentence>
- **Fix to try next iteration**: <one actionable suggestion the explorer or codegen can adopt>

Keep it under 80 words total. Be specific. Reference the actual locator, act() instruction, or line number when you can.`;

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!text || !text.startsWith("###")) {
      return {
        addendum: FALLBACK(iteration, exitCode, stderrSnip, target),
        generated: false,
        reason: "LLM output did not match expected heading",
      };
    }
    return { addendum: text + "\n", generated: true, reason: null };
  } catch (err) {
    return {
      addendum: FALLBACK(iteration, exitCode, stderrSnip, target),
      generated: false,
      reason: String(err?.message || err),
    };
  }
}

// Append an addendum to strategy.md under the "Recent <Target> Failures"
// section. Creates the section if it doesn't exist.
export function appendToStrategy(strategyPath, addendum, target = "playwright") {
  const SECTION_HEADER = `## Recent ${targetLabel(target)} Failures`;
  let md = fs.existsSync(strategyPath) ? fs.readFileSync(strategyPath, "utf-8") : "";

  if (!md.trim()) {
    md = `# Navigation Strategy\n\n## Navigation Heuristics\n\n(grows as the explorer learns)\n\n## Codegen Hints\n\n(per-task overrides the codegen should apply)\n\n${SECTION_HEADER}\n\n${addendum}`;
  } else if (md.includes(SECTION_HEADER)) {
    // Insert addendum right after the section header (newest first).
    md = md.replace(SECTION_HEADER, `${SECTION_HEADER}\n\n${addendum.trim()}\n`);
  } else {
    md += `\n\n${SECTION_HEADER}\n\n${addendum}`;
  }

  fs.writeFileSync(strategyPath, md);
}
