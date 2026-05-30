#!/usr/bin/env bun
/**
 * Browsability — Drivability probe (deterministic, no model, no task run).
 *
 *   bun scripts/friction.ts <url> [--out <dir>]
 *
 * Measures the parts of the rubric readable from a single page load, grounded in
 * what browser-agent frameworks (e.g. open-source Stagehand) treat as hard
 * (see references/rubric.md):
 *   B1 reachability  — fraction of interactive controls that SURVIVE the accessibility-tree
 *                      prune (kept iff: accessible name OR named children OR a non-structural role).
 *   C* tax proxy     — native vs custom controls; a custom dropdown costs two steps (expand,
 *                      then select) where a native <select> costs one.
 *   B3 traps         — cross-origin iframes, shadow hosts, DOM depth (>256), DOM size.
 *
 * Full score also needs the agent run (Axis A ladder + real C + D) — see scripts/score.ts.
 * Requires the `browse` CLI (npm i -g @browserbasehq/browse-cli). Remote mode needs BROWSERBASE_API_KEY.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
if (!url) { console.error("usage: bun scripts/friction.ts <url> [--out <dir>]"); process.exit(1); }
const outDir = (() => { const i = args.indexOf("--out"); return i >= 0 && args[i + 1] ? args[i + 1] : "browsability-out"; })();

const PROBE = `(()=>{
  const SEL='a[href],button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=menuitem],[role=tab],[role=combobox],[onclick],[contenteditable=""],[contenteditable=true],[tabindex]';
  const ix=[...document.querySelectorAll(SEL)];
  const nativeTag=e=>{const t=e.tagName;return t==='BUTTON'||t==='SELECT'||t==='TEXTAREA'||t==='INPUT'||(t==='A'&&!!e.getAttribute('href'));};
  const hasName=e=>{
    const a=((e.getAttribute&&(e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('alt')||e.getAttribute('placeholder')))||'').trim();
    if(a)return true;
    if(e.getAttribute&&e.getAttribute('aria-labelledby'))return true;
    if(e.labels&&e.labels.length)return true;
    if((e.textContent||'').trim())return true;
    return false;
  };
  const reachable=ix.filter(e=>hasName(e)||nativeTag(e));
  const custom=ix.filter(e=>{const t=e.tagName;const r=(e.getAttribute&&e.getAttribute('role'))||'';const click=e.hasAttribute&&e.hasAttribute('onclick');return (r==='button'||r==='link'||click)&&!(t==='BUTTON'||t==='A');});
  const customDropdowns=[...document.querySelectorAll('[role=combobox]:not(select),[role=listbox],[aria-haspopup]')].length;
  const nativeSelects=document.querySelectorAll('select').length;
  const frames=[...document.querySelectorAll('iframe')];
  let xorigin=0; frames.forEach(f=>{try{const u=new URL(f.src,location.href);if(u.origin!==location.origin)xorigin++;}catch(e){}});
  let openShadow=0; document.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)openShadow++;});
  const customElements=[...document.querySelectorAll('*')].filter(e=>e.tagName.includes('-')).length;
  let maxDepth=0,nodes=0;
  (function walk(n,d){nodes++;if(d>maxDepth)maxDepth=d;let c=n.firstElementChild;while(c){walk(c,d+1);c=c.nextElementSibling;}})(document.documentElement,1);
  return JSON.stringify({interactive:ix.length,reachable:reachable.length,custom:custom.length,customDropdowns,nativeSelects,iframes:frames.length,crossOriginIframes:xorigin,openShadowHosts:openShadow,customElements,maxDepth,nodes,textLen:(document.body.innerText||'').length});
})()`;

function probe(target: string): any {
  try {
    execFileSync("browse", ["open", target], { stdio: "ignore", timeout: 60000 });
    const out = execFileSync("browse", ["eval", PROBE], { encoding: "utf8", timeout: 30000 });
    const env = out.match(/\{\s*"result"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/);
    if (!env) throw new Error("browse eval returned no result");
    return JSON.parse(JSON.parse(`"${env[1]}"`));
  } finally {
    try { execFileSync("browse", ["stop"], { stdio: "ignore", timeout: 15000 }); } catch {}
  }
}

const p = probe(url);
const reachRatio = p.interactive ? p.reachable / p.interactive : 1;
const customRatio = p.interactive ? p.custom / p.interactive : 0;

const b1 = Math.round(reachRatio * 25);
const taxProxy = Math.max(0, Math.round(20 * (1 - Math.min(customRatio * 1.5, 1)) - Math.min(p.customDropdowns, 5)));
const traps: string[] = [];
let b3 = 15;
if (p.crossOriginIframes > 0) { b3 -= 6; traps.push(`${p.crossOriginIframes} cross-origin iframe(s) — out-of-process frames are fragile for agents`); }
if (p.maxDepth > 256) { b3 -= 5; traps.push(`DOM depth ${p.maxDepth} > 256 — deep trees force slower, shallower snapshots`); }
else if (p.maxDepth > 128) { b3 -= 2; traps.push(`DOM depth ${p.maxDepth} — approaching the deep-tree cliff`); }
if (p.nodes > 8000) { b3 -= 3; traps.push(`${p.nodes} DOM nodes — large tree risks accessibility-snapshot truncation`); }
if (p.customElements > 5 && p.openShadowHosts === 0) { b3 -= 2; traps.push(`${p.customElements} custom elements, 0 open shadow hosts — possible closed shadow DOM (opaque to agents)`); }
b3 = Math.max(0, b3);
const partial = b1 + taxProxy + b3;

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/friction.json`, JSON.stringify({ url, scannedAt: new Date().toISOString(), raw: p, scores: { b1, taxProxy, b3, partial, of: 60 }, traps }, null, 2));

const pct = (n: number) => `${(n * 100) | 0}%`;
console.log(`\n  Drivability probe — ${url}`);
console.log(`  ${"─".repeat(52)}`);
console.log(`  B1 reachability    ${String(b1).padStart(2)}/25   ${p.reachable}/${p.interactive} controls survive the a11y prune (${pct(reachRatio)})`);
console.log(`  C  tax proxy       ${String(taxProxy).padStart(2)}/20   ${p.custom} custom controls (${pct(customRatio)}), ${p.customDropdowns} custom dropdown(s), ${p.nativeSelects} native <select>`);
console.log(`  B3 structural      ${String(b3).padStart(2)}/15   depth ${p.maxDepth}, ${p.nodes} nodes, ${p.iframes} iframe(s) [${p.crossOriginIframes} x-origin], ${p.openShadowHosts} shadow host(s), ${p.customElements} custom el`);
console.log(`  ${"─".repeat(52)}`);
console.log(`  Drivability partial ${partial}/60   (Axis A ladder + real agent tax + recoverability need the agent run — scripts/score.ts)`);
if (traps.length) { console.log(`\n  Traps detected:`); for (const t of traps) console.log(`   • ${t}`); }
console.log(`\n  → ${outDir}/friction.json\n`);
