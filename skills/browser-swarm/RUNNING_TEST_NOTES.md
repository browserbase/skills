# Browser Swarm Running Test Notes

This file tracks issues found while stress-testing browser-swarm and the evidence used to close them.

## Fixed Issues

### Arc tab grouping crashes Arc

- Repro: Arc 1.146.0 crashed after the grouped path called `chrome.tabGroups.query` / `chrome.tabs.group`.
- Fix: Added `--no-group` mode and documented Arc as no-group only.
- Evidence: Arc no-group smoke and multi-tab real-world research both passed without extension warnings or an Arc crash.

### Disposable Chrome relay port conflicts with installed real-browser extension

- Repro: Arc's installed browser-swarm extension can connect to the default relay port while disposable Chrome tests are running.
- Fix: Added `--relay-port` / `BROWSER_SWARM_PORT` support and temporary extension patching in `launch-chrome.mjs`.
- Evidence: `BROWSER_SWARM_PORT=19990 BROWSER_SWARM_BROWSE_BIN=/Users/shrey/Developer/cli/bin/run.js npm run e2e` launched disposable Chrome with `/tmp/browser-swarm-extension-19990` and passed.

### E2E write assertions treated `browse get` results as strings

- Repro: `browse get title/text/value` returns JSON objects like `{ "title": "..." }`, `{ "text": "..." }`, and `{ "value": "..." }`; the new write test initially compared the whole object.
- Fix: Added `parseGetField()` to assert the specific returned field.
- Evidence: Parser checks passed and the e2e progressed to real browser behavior assertions.

### Parallel same-page input submission was flaky

- Repro: Three target-bound worker sessions on the same URL/title filled distinct values in parallel, but parallel submit via `fill --press-enter`, explicit `press Enter`, or `click #submit` left the third tab unsubmitted before the transport fix.
- Root cause: Chrome's visible input surface needs tab activation/serialization for `Input.*` CDP commands when multiple background tabs receive input concurrently through the extension debugger transport.
- Fix: The extension now activates the owning tab and serializes forwarded `Input.*` commands before sending them through `chrome.debugger.sendCommand`.
- Evidence: The Chrome e2e now passes with three same-page worker tabs, parallel `fill`, parallel `click #submit`, distinct title/text/value results, and one visible target per worker.

### Worker prompts allowed invalid browse command probes

- Repro: In one live Codex worker stress, beta/gamma successfully mutated their assigned tabs but tried invalid commands while collecting evidence (`screenshot <path>` and `pages`) before retrying with valid commands.
- Fix: Tightened the worker contract with explicit command-shape guidance: do not probe commands during the run, use `tab list`, and use `screenshot --path <path>`.
- Evidence: Strict rerun on Chrome relay port `19993` spawned three real Codex workers in parallel. All returned `status: success`, used one target each, reported no errors, and the main harness verified distinct DOM state for all three same-URL tabs.

## Current Evidence

- Chrome disposable grouped e2e: PASS on relay port `19990`.
- Chrome raw CDP isolation: PASS; worker endpoint sees only its target and rejects sibling/lifecycle commands.
- Chrome same-page read/write workflow: PASS; three workers write distinct values to identical pages in parallel.
- Codex subagents: PASS in prior live stress; three real Codex `worker` agents each operated through a distinct target-bound endpoint and reported title/url/tab evidence plus screenshots.
- Codex subagents, same-page live stress: PASS on relay port `19993`; three real Codex workers operated concurrently against `http://127.0.0.1:18085/same`, all returned `status: success`, and the main harness verified distinct final states:
  - `alpha` / `DCF37DE487790F11CF7BA258D9EDF0CE`: `strict-same-page alpha-strict-success-worker`, `#result` and `#box` both `alpha-strict-success-worker`.
  - `beta` / `47BD8E6FB1ABFFD555DB4088DE5F1D46`: `strict-same-page beta-strict-success-worker`, `#result` and `#box` both `beta-strict-success-worker`.
  - `gamma` / `E84CA16552C06E2CCAAD63B5B9BB1ECD`: `strict-same-page gamma-strict-success-worker`, `#result` and `#box` both `gamma-strict-success-worker`.
- Claude Code CLI agent smoke: PASS with `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json`.
- Mixed Codex + Claude Code live workflow: PASS; one Codex worker and one Claude Code agent operated concurrently in the same disposable Chrome profile against identical same-page tabs, each reported distinct title/text/value/url/tab evidence, and the main harness independently verified one visible target per worker.
- Arc no-group read/write workflow: PASS for DOM-level writes; target isolation, `fill`, `get`, and DOM `eval` submission worked without tab-group calls or Arc crash.
- Arc mixed Codex + Claude Code DOM-write workflow: PASS on relay port `19989` with Arc's currently loaded extension version `0.1.0`; two Codex workers and one Claude Code worker operated concurrently against `http://127.0.0.1:18086/same`, all reported success, and the main harness verified distinct final states:
  - `arc-alpha` / `BF917D95D6A0ACE58CA44CDC4D1C2233`: `arc-dom-same-page arc-alpha-codex-dom-worker`, `#result` and `#box` both `arc-alpha-codex-dom-worker`.
  - `arc-beta` / `03022778C08DA83029B6B9C80962B2FF`: `arc-dom-same-page arc-beta-codex-dom-worker`, `#result` and `#box` both `arc-beta-codex-dom-worker`.
  - `arc-gamma` / `A52E444ED6ADF2F84DB4C1FC813BDA36`: `arc-dom-same-page arc-gamma-claude-dom-worker`, `#result` and `#box` both `arc-gamma-claude-dom-worker`.

## Remaining Issues

### Arc no-group pointer click did not submit the second background tab

- Repro: Two Arc no-group worker tabs on `http://127.0.0.1:18082/same` filled distinct values in parallel. `click #submit` submitted the first tab, but the second stayed at title `arc-swarm-write-page` with `#result` as `empty` even though `#box` held `arc-beta-worker`.
- Workaround verified: `browse eval 'document.getElementById("form").requestSubmit(); document.title'` on the second target submitted the correct value and preserved target isolation.
- Likely cause: Arc was still running the previously loaded unpacked extension service worker. The installed skill has been synced with the input-command queue fix, but Computer Use cannot reload Arc here (`Apple event error -1743`), so the latest extension worker could not be confirmed in Arc.
- Confirmation: after adding extension metadata to `/health`, Arc reported Browser Swarm Bridge version `0.1.0` even though the repo and installed skill are at manifest version `0.1.1`.
- Additional reload attempts: restarting the relay, pressing Arc's top-level `Update` button, and toggling the extension control through Arc's Details page did not change `/health`; it continued to report version `0.1.0`.
- Current status: Arc real-browser workflows are usable for read/write work when irreversible write actions use DOM-level commands (`browse eval`) instead of pointer clicks. The pointer-click path still needs a real Arc extension refresh to `0.1.1` before it can be judged against the input-command queue fix.
- Follow-up: restart Arc or otherwise force Browser Swarm Bridge to reload, confirm `/health` reports version `0.1.1`, and rerun the Arc pointer-click write test.

## Open Checks

- Manually reload the Arc extension and rerun the Arc pointer-click write test.
