// Replay a recorded flow against a fresh Browserbase session using the `browse` CLI.
//
// Engine: every step is executed through deterministic `browse` subcommands
// (open / click / fill / select / key / eval / mouse). Selection is resolved
// "highest-confidence first":
//   1. semantic    — recorded aria/ or text/ selector -> matched to a live
//                    snapshot ref (survives Google-style dynamic id churn)
//   2. recorded    — recorded xpath, then css, each VERIFIED with `get visible`
//                    before acting (browse click reports success even on a
//                    no-match, so we never trust it blind)
//   3. heal        — snapshot-match the step's value / prior typed value to a
//                    ref (this is what rescues unlabeled autocomplete picks)
//   4. coords      — last resort: `get box` a recorded selector, click center
// Passes 3-4 are gated behind RR_HEAL=1.
//
//   RR_FILE=/tmp/rec.json [RR_HEAL=1] [RR_SHOTS=/tmp/shots] \
//     node --env-file=.env scripts/replay.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = process.env.RR_FILE;
if (!FILE) { console.error('Set RR_FILE=path/to/recording.json'); process.exit(1); }
const HEAL = process.env.RR_HEAL === '1';
const SHOTS = process.env.RR_SHOTS || `/tmp/replay-${Date.now()}`;
const SESSION = process.env.RR_SESSION || `rr-${Date.now()}`;
mkdirSync(SHOTS, { recursive: true });
const rec = JSON.parse(readFileSync(FILE, 'utf8'));

// --- browse CLI wrapper -----------------------------------------------------
// Runs `browse <args> --remote -s <session>`, strips the npm update banner, and
// best-effort parses the JSON body. Never throws: a failed/empty call returns
// { ok:false }, which the resolver treats as "this selector didn't resolve".
function browse(args, { json = true } = {}) {
  let raw = '';
  try {
    raw = execFileSync('browse', [...args, '--remote', '-s', SESSION], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
    });
  } catch (e) {
    raw = (e.stdout || '') + (e.stderr || '');
    if (!raw) return { ok: false, raw: String(e).slice(0, 160) };
  }
  if (!json) return { ok: true, raw };
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a === -1 || b <= a) return { ok: false, raw }; // e.g. "Could not find an element..."
  try { return { ok: true, json: JSON.parse(raw.slice(a, b + 1)), raw }; }
  catch { return { ok: false, raw }; }
}

// --- selector handling ------------------------------------------------------
function classify(sel) {
  if (sel.startsWith('aria/')) return { kind: 'aria', label: sel.slice(5), sel };
  if (sel.startsWith('text/')) return { kind: 'text', label: sel.slice(5), sel };
  if (sel.startsWith('xpath/')) return { kind: 'xpath', value: sel.slice(6), sel: sel.slice(6) };
  if (sel.startsWith('pierce/')) return { kind: 'css', value: sel.slice(7), sel: sel.slice(7) };
  return { kind: 'css', value: sel, sel };
}
function candidates(step) {
  const seen = new Set(), out = [];
  for (const g of step.selectors || []) for (const s of g) {
    if (typeof s === 'string' && !seen.has(s)) { seen.add(s); out.push(classify(s)); }
  }
  return out;
}
// `get visible` resolves css/xpath/ref and returns {visible:true|false}; a
// no-match falls out as ok:false. This is our trustworthy existence probe.
const resolves = (sel) => { const r = browse(['get', 'visible', sel]); return r.ok && r.json?.visible === true; };

// Match a human label to a live snapshot ref. --compact yields lines like
// "  [0-41] combobox: Where to?"; we score interactive nodes by name overlap.
const INTERACTIVE = ['option', 'button', 'link', 'menuitem', 'menuitemradio', 'tab', 'combobox', 'listitem', 'checkbox', 'radio', 'cell', 'gridcell'];
function snapshotRef(label) {
  if (!label) return null;
  const want = label.toLowerCase().trim();
  const tokens = want.split(/\s+/).filter((t) => t.length > 1);
  for (const filter of [label, tokens[0]].filter(Boolean)) {
    const r = browse(['snapshot', '--compact', '--filter', filter]);
    const tree = r.json?.tree;
    if (!tree) continue;
    let best = null, bestScore = 0;
    for (const line of tree.split('\n')) {
      const m = line.match(/\[(\d+-\d+)\]\s+([^:\n]+?)(?::\s*(.*))?\s*$/);
      if (!m) continue;
      const [, ref, roleRaw, nameRaw] = m;
      const role = roleRaw.trim().toLowerCase(), name = (nameRaw || '').toLowerCase().trim();
      if (!name) continue;
      let score = 0;
      if (name === want) score = 100;
      else if (name.startsWith(want)) score = 80;
      else if (name.includes(want)) score = 60;
      else if (tokens.some((t) => name.includes(t))) score = 40;
      if (!score) continue;
      if (INTERACTIVE.includes(role)) score += 10;
      if (score > bestScore) { bestScore = score; best = `@${ref}`; }
    }
    if (best) return best;
  }
  return null;
}

// --- per-step execution -----------------------------------------------------
const act = (type, sel, value) =>
  type === 'change' ? browse(['fill', sel, value ?? '']) : browse(['click', sel]);

function doStep(step, ctx) {
  const cands = candidates(step);
  const arias = cands.filter((c) => c.kind === 'aria' || c.kind === 'text');
  const xpaths = cands.filter((c) => c.kind === 'xpath');
  const csses = cands.filter((c) => c.kind === 'css');

  // 1. semantic: recorded aria/text label -> live snapshot ref
  for (const c of arias) {
    const ref = snapshotRef(c.label);
    if (ref) { act(step.type, ref, step.value); return { status: 'ok', via: 'semantic', selector: c.sel, ref }; }
  }
  // 2. recorded selectors, verified before acting (xpath is anchored; css last)
  for (const c of [...xpaths, ...csses]) {
    if (resolves(c.sel)) { act(step.type, c.sel, step.value); return { status: 'ok', via: c.kind, selector: c.sel }; }
  }
  if (!HEAL) return { status: 'failed', reason: 'no selector matched (try RR_HEAL=1)' };

  // 3. heal: match this step's value, or the value typed just before (rescues
  //    autocomplete suggestion clicks whose only recorded selector was a
  //    dynamic #id) to a snapshot ref.
  for (const label of [step.value, ctx.lastValue].filter(Boolean)) {
    const ref = snapshotRef(label);
    if (ref) { act(step.type, ref, step.value); return { status: 'healed', via: 'value-snapshot', label, ref }; }
  }
  // 4. coords: a recorded selector that exists but wasn't "visible" — click its box center
  for (const c of [...xpaths, ...csses]) {
    const r = browse(['get', 'box', c.sel]);
    const box = r.json;
    if (box && typeof box.x === 'number') {
      browse(['mouse', 'click', String(Math.round(box.x)), String(Math.round(box.y))]);
      return { status: 'healed', via: 'coords', selector: c.sel };
    }
  }
  return { status: 'failed', reason: 'unresolvable after heal' };
}

// --- run --------------------------------------------------------------------
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const results = [];
let i = 0, ctx = { lastValue: null };

for (const step of rec.steps) {
  i++;
  try {
    if (step.type === 'navigate') {
      const r = browse(['open', step.url]);
      results.push({ step: i, type: 'navigate', status: r.ok ? 'ok' : 'error', url: step.url });
    } else if (step.type === 'scroll') {
      browse(['eval', `window.scrollBy(${step.x || 0}, ${step.y || 0}); 'ok'`]);
      results.push({ step: i, type: 'scroll', status: 'ok' });
    } else if (step.type === 'keyDown' || step.type === 'keyUp') {
      if (step.type === 'keyDown') browse(['key', step.key]);
      results.push({ step: i, type: step.type, status: 'ok', key: step.key });
    } else if (step.type === 'click' || step.type === 'change') {
      results.push({ step: i, type: step.type, ...doStep(step, ctx) });
      if (step.type === 'change' && step.value) ctx.lastValue = step.value;
    } else {
      results.push({ step: i, type: step.type, status: 'skipped' });
    }
  } catch (e) {
    results.push({ step: i, type: step.type, status: 'error', error: String(e).slice(0, 200) });
  }
  // autocomplete/menus need a beat to render before the next step snapshots
  sleep(step.type === 'change' ? 900 : 400);
  browse(['screenshot', '-p', `${SHOTS}/step-${String(i).padStart(2, '0')}-${step.type}.png`]);
}

// best-effort live-view link (newest running session is the one we just drove)
let liveView = null;
try {
  const ls = browse(['cloud', 'sessions', 'list', '--status', 'RUNNING', '--json'], { json: false });
  const id = JSON.parse(ls.raw.slice(ls.raw.indexOf('['), ls.raw.lastIndexOf(']') + 1))[0]?.id;
  if (id) {
    const dbg = browse(['cloud', 'sessions', 'debug', id]);
    liveView = dbg.json?.debuggerFullscreenUrl || null;
  }
} catch { /* live view is optional */ }

try { browse(['stop'], { json: false }); } catch { /* daemon may already be gone */ }

const ok = results.filter((r) => r.status === 'ok' || r.status === 'healed').length;
console.log(JSON.stringify({ file: FILE, session: SESSION, liveView, screenshots: SHOTS, results }, null, 2));
console.log(`\nReplay: ${ok}/${results.length} steps succeeded. Screenshots -> ${SHOTS}`);
