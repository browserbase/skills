// Record a human browser flow on a Browserbase session.
// Opens a cloud browser, hands you a live-view URL to click around in, captures
// each interaction as a semantic step, and saves a Chrome DevTools Recorder file.
//
//   RR_URL=https://site.com RR_OUT=/tmp/rec.json \
//     node --env-file=.env scripts/record.mjs
//
// Stop with ENTER (interactive) or after RR_SECONDS (non-interactive).
//
// NOTE: uses raw Playwright over CDP (not Stagehand) because Stagehand's wrapped
// page breaks page.exposeBinding, which is how we ship captured events to Node.
import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import readline from 'node:readline';

const START_URL = process.env.RR_URL || 'https://example.com';
const OUT = process.env.RR_OUT || `/tmp/recording-${Date.now()}.json`;
const TITLE = process.env.RR_TITLE || 'Recorded flow';
// per-step screenshots live beside the recording: <out>-shots/step-NN.png. They
// are the visual record of intent (what the page looked like at each commit) and
// double as the replay oracle.
const SHOTS = process.env.RR_SHOTS || OUT.replace(/\.json$/, '') + '-shots';
mkdirSync(SHOTS, { recursive: true });
const SECONDS = process.env.RR_SECONDS ? parseInt(process.env.RR_SECONDS, 10) : null;
// stop the recording by creating this file (lets the agent stop it conversationally)
const STOP_FILE = process.env.RR_STOP || '/tmp/rr-stop';
try { unlinkSync(STOP_FILE); } catch (_) {}
const inject = readFileSync(new URL('./inject.js', import.meta.url), 'utf8');

// Two modes:
//  - attach (RR_CONNECT_URL set): join a session someone else owns — e.g. the
//    keep-alive session browser-trace's `bb-capture.mjs --new` created — so the
//    CDP firehose and this semantic interaction stream observe the SAME session.
//  - create (default): spin up our own session (standalone, no trace).
const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
let session = null;
const connectUrl = process.env.RR_CONNECT_URL
  || (session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID })).connectUrl;
const browser = await chromium.connectOverCDP(connectUrl);
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.newPage());

const events = [];
// context-level so it applies to every page/tab the user opens
await context.addInitScript({ content: inject });

await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

// Drain the in-page buffer across all open tabs. We poll instead of using
// exposeBinding, which does not deliver over Browserbase's CDP connection.
async function drain() {
  for (const p of context.pages()) {
    try {
      const evs = await p.evaluate(() => {
        const e = window.__rr_events || [];
        window.__rr_events = [];
        try { localStorage.removeItem('__rr_buf'); } catch (_) {}
        return e;
      });
      if (evs && evs.length) {
        events.push(...evs);
        // screenshot the page that just produced events; attach to the last one
        try {
          const shot = `${SHOTS}/step-${String(events.length).padStart(2, '0')}.png`;
          await p.screenshot({ path: shot });
          events[events.length - 1].screenshot = shot;
        } catch (_) { /* page mid-navigation; skip this shot */ }
      }
    } catch (_) { /* context navigating; next tick */ }
  }
}
const poll = setInterval(drain, 600);

let liveUrl = 'https://www.browserbase.com/sessions';
if (session) {
  try {
    const dbg = await bb.sessions.debug(session.id);
    liveUrl = dbg.debuggerFullscreenUrl || dbg.debuggerUrl || liveUrl;
  } catch (e) {
    console.error('(could not fetch live view url:', String(e).slice(0, 120), ')');
  }
} else {
  // attach mode: bb-capture already printed the live debugger URL for this session
  liveUrl = process.env.RR_LIVE_URL || '(use the live URL bb-capture printed)';
}

console.log('\n=== RECORDING ===');
console.log('Open this live view and interact (click around, fill forms):');
console.log('  ' + liveUrl);
console.log(`Stop by: pressing ENTER, creating ${STOP_FILE}` + (SECONDS ? `, or after ${SECONDS}s.` : '.') + '\n');

await new Promise((resolve) => {
  let done = false;
  const fin = () => { if (!done) { done = true; clearInterval(sentinel); resolve(); } };
  // conversational stop: agent runs `touch /tmp/rr-stop` to end the recording
  const sentinel = setInterval(() => { if (existsSync(STOP_FILE)) fin(); }, 500);
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Press ENTER to stop recording... ', () => { rl.close(); fin(); });
  }
  if (SECONDS) setTimeout(fin, SECONDS * 1000);
  else if (!process.stdin.isTTY) setTimeout(fin, 600000); // 10-min safety cap
});
try { unlinkSync(STOP_FILE); } catch (_) {}

clearInterval(poll);
await drain(); // final flush

const recording = {
  title: TITLE,
  source: 'browserbase-record-replay',          // Chrome DevTools Recorder compatible
  startUrl: START_URL,
  shots: SHOTS,
  steps: [{ type: 'navigate', url: START_URL }, ...events],
};
writeFileSync(OUT, JSON.stringify(recording, null, 2));
console.log(`\nSaved ${events.length} interaction step(s) -> ${OUT}`);
console.log(`Screenshots -> ${SHOTS}`);

// detach our CDP client; in attach mode we leave the session running for the
// trace owner (bb-capture) to stop and finalize.
await browser.close();
