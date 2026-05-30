#!/usr/bin/env bun
/**
 * Browsability — composite scorer. Combines the deterministic Drivability probe
 * (friction.json) with agent-run results (tasks.json) into the full rubric score.
 *
 *   bun scripts/score.ts --friction <dir>/friction.json [--tasks tasks.json] [--out <dir>]
 *
 * Rubric (see references/rubric.md), 0-100:
 *   A  Access Resistance  30  — inverse of the lowest assistance rung that passes
 *   B1 Reachability       25  — from friction probe
 *   B3 Structural traps   15  — from friction probe
 *   C  Agent tax          20  — agent steps OVER the human baseline (delta, not absolute)
 *   D  Recoverability      10  — self-heal / site-errors / overlays / step-ceiling
 *
 * tasks.json shape:
 *   { "url": "...",
 *     "tasks": [ { "name": "...", "type": "...", "humanBaselineSteps": 3,
 *                  "runs": [ {"rung":0,"success":false,"steps":12,"model":"...","note":"hCaptcha"},
 *                            {"rung":2,"success":true,"steps":5,"model":"...","note":""} ] } ] }
 * rung index: 0=vanilla 1=default-assist 2=proxy+fingerprint 3=advanced-stealth 4=verified
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const frictionPath = flag("--friction", "browsability-out/friction.json")!;
const tasksPath = flag("--tasks");
const outDir = flag("--out", "browsability-out")!;
const MAX_RUNG = 4;

if (!existsSync(frictionPath)) { console.error(`no friction file at ${frictionPath} — run scripts/friction.ts first`); process.exit(1); }
const friction = JSON.parse(readFileSync(frictionPath, "utf8"));
const url = friction.url;
const b1 = friction.scores.b1;          // /25
const b3 = friction.scores.b3;          // /15
const taxProxy = friction.scores.taxProxy; // /20 fallback

type Run = { rung: number; success: boolean; steps?: number; model?: string; note?: string };
type Task = { name: string; type?: string; humanBaselineSteps?: number; runs?: Run[] };

let a = 0, c = taxProxy, d = 10, tasks: Task[] = [], haveRuns = false;
const med = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)) : 0; };

if (tasksPath && existsSync(tasksPath)) {
  tasks = (JSON.parse(readFileSync(tasksPath, "utf8")).tasks ?? []) as Task[];
  const withRuns = tasks.filter((t) => t.runs && t.runs.length);
  haveRuns = withRuns.length > 0;
  if (haveRuns) {
    // A — worst-case minimum passing rung across tasks
    const rungs = withRuns.map((t) => {
      const ok = (t.runs || []).filter((r) => r.success).map((r) => r.rung);
      return ok.length ? Math.min(...ok) : MAX_RUNG + 1; // unsolved even at top
    });
    const siteRung = Math.max(...rungs);
    a = Math.round(30 * (1 - Math.min(siteRung, MAX_RUNG) / MAX_RUNG));

    // C — agent tax = steps over human baseline on the cheapest passing run
    const taxes: number[] = [];
    for (const t of withRuns) {
      const passing = (t.runs || []).filter((r) => r.success && typeof r.steps === "number");
      if (passing.length && typeof t.humanBaselineSteps === "number") {
        const best = passing.reduce((a, b) => (a.rung <= b.rung ? a : b));
        taxes.push(Math.max(0, (best.steps as number) - t.humanBaselineSteps));
      }
    }
    if (taxes.length) c = Math.max(0, Math.round(20 * (1 - Math.min(med(taxes), 8) / 8)));

    // D — recoverability from run notes
    const allRuns = withRuns.flatMap((t) => t.runs || []);
    const deadEnds = allRuns.filter((r) => /captcha|modal|shadow|iframe|overlay|consent|cookie|timeout|stuck|self-?heal|blocked/i.test(r.note || "")).length;
    d = Math.max(0, 10 - deadEnds * 2);
  }
}

const total = Math.round(a + b1 + b3 + c + d);
const grade = (t: number) => t >= 90 ? "A" : t >= 80 ? "B+" : t >= 70 ? "B" : t >= 60 ? "C+" : t >= 50 ? "C" : t >= 35 ? "D" : "F";
const rungName = ["L0 vanilla", "L1 default-assist", "L2 proxy+fingerprint", "L3 advanced-stealth", "L4 verified"];

mkdirSync(outDir, { recursive: true });
const report = {
  url, scoredAt: new Date().toISOString(), total, grade: grade(total),
  axes: { accessResistance: a, reachability_B1: b1, structural_B3: b3, agentTax_C: c, recoverability_D: d },
  driveabilityOnly: !haveRuns, tasks,
};
writeFileSync(`${outDir}/browsability.json`, JSON.stringify(report, null, 2));

console.log(`\n  Browsability — ${url}`);
console.log(`  ${"─".repeat(50)}`);
console.log(`  SCORE  ${total}/100   GRADE ${grade(total)}${haveRuns ? "" : "   (Drivability only — agent ladder not run)"}`);
console.log(`  A  Access Resistance  ${String(a).padStart(2)}/30${haveRuns ? "" : "   PENDING"}`);
console.log(`  B1 Reachability       ${String(b1).padStart(2)}/25`);
console.log(`  B3 Structural traps   ${String(b3).padStart(2)}/15`);
console.log(`  C  Agent tax          ${String(c).padStart(2)}/20${haveRuns ? "" : "   (proxy from probe)"}`);
console.log(`  D  Recoverability     ${String(d).padStart(2)}/10${haveRuns ? "" : "   PENDING"}`);
console.log(`  ${"─".repeat(50)}`);
console.log(`  → ${outDir}/browsability.json\n`);
