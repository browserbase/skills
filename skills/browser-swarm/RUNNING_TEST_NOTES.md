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

### Real-browser setup accepted stale extension workers

- Repro: Arc connected to the relay and `/health` returned `extensionConnected: true`, but the active service worker reported version `0.1.0` while the unpacked manifest was `0.1.1`.
- Fix: `setup-real-browser.mjs` now reads the unpacked manifest, prints the expected extension version/worker, and exits `3` with `versionMatches: false` when the connected worker version is stale.
- Evidence: `node scripts/setup-real-browser.mjs --browser arc --no-open --no-start-relay --timeout 2 --json` against the stale Arc worker exited `3` and reported `versionMatches: false`; the same helper against disposable Chrome on relay port `19995` exited `0` with `versionMatches: true`.

### Review-reported relay/setup hardening issues

- Repro: targeted review found several real edge cases: worker endpoints could forward `Target.createTarget` / `Target.closeTarget` if a `sessionId` was present, unknown `sessionId` messages fell back to the first visible worker target, extension reconnects could leave stale relay targets, the relay `screenshot --path` CLI ignored `--path`, synthetic event failures could send an error after a successful response, `setup-real-browser` leaked the parent log file descriptor and accepted unknown browsers after spreading `undefined`, and `launch-chrome` accepted missing bare executable names before reaching the "Chrome not found" error.
- Fix: blocked worker lifecycle commands before the session forwarding path, made unknown sessions fail closed, clear targets on extension `hello`, write relay CLI screenshots to `--path`, warn instead of failing on synthetic event emission, close the parent relay log fd after spawn, validate browser names before spreading config, and only accept bare Chrome candidates when they exist on `PATH`.
- Evidence: `BROWSER_SWARM_PORT=19997 BROWSER_SWARM_BROWSE_BIN=<browse cli> npm run e2e` passed with extra probes for `Target.createTarget` / `Target.closeTarget` with an attached session, unknown session fallback, relay CLI screenshot writing (`1509844` bytes), one-target visibility, public read tasks, and three same-page parallel `fill` + `click #submit` write tasks. `node scripts/setup-real-browser.mjs --browser not-a-browser --no-open --no-start-relay --no-wait` now exits `1` with the supported browser list.

### Session-scoped Target command and root closeTarget regressions

- Repro: follow-up review found that a worker could send `Target.getTargets`, `Target.getTargetInfo`, or `Target.attachToTarget` with its own synthetic `sessionId` and skip the no-session isolation switch, forwarding the command to Chrome raw. It also found that root `Target.closeTarget` relied on an extension detach event that could be skipped after `chrome.tabs.remove`, leaving stale relay targets.
- Fix: relay now scopes `Target.getTargets`, `Target.getTargetInfo`, and `Target.attachToTarget` before the session forwarding path and validates any provided `sessionId`. Root `Target.closeTarget` removes the closed target from the relay map and broadcasts a detach after a successful close response.
- Evidence: `BROWSER_SWARM_PORT=20000 BROWSER_SWARM_BROWSE_BIN=<browse cli> npm run e2e` passed. The run verified session-scoped `Target.getTargets` saw exactly one worker target, session-scoped sibling attach/info errored, root create increased target count `3 -> 4`, root close reduced it `4 -> 3`, relay screenshot wrote `1510778` bytes, and the three same-page parallel write tasks still passed.

### Worker shell selector quoting

- Repro: during a latest-head mixed Codex + Claude Code Chrome smoke, the Codex worker's first `fill #box ...` shell invocation treated `#box` as a shell comment and failed before retrying with a quoted selector.
- Fix: tightened the worker contract to explicitly quote CSS selectors that contain shell-special characters, such as `"#box"` and `"#submit"`, whenever invoking `browse` through a shell.
- Evidence: the same worker retried with a quoted selector and completed successfully. The main harness verified the Codex worker tab title/text/value as `latest-head-codex-worker`, the Claude Code worker tab title/text/value as `latest-head-claude-worker`, and exactly one visible tab per target-bound endpoint.

### Claude worker reported an unscoped tab count

- Repro: in the current-head mixed Codex + Claude Code Chrome smoke on relay port `20006`, the Claude worker successfully filled and submitted its target-bound tab but reported `tabCount: 2` after using non-contract raw/relay-level inspection instead of `browse tab list`.
- Fix: tightened the worker contract to forbid raw WebSocket scripts, `curl` relay endpoints, and `/swarm/*` admin endpoint probes from worker agents. Worker `tabCount` must come from `browse tab list` on the assigned target-bound endpoint and should be `1`.
- Evidence: the top-level harness independently connected to both target-bound endpoints and verified each returned exactly one visible target. It also verified distinct DOM state for Codex (`current-head-codex-worker-87267b6`) and Claude Code (`current-head-claude-worker-87267b6`) on identical same-page tabs.

### Long browse session names can block worker startup

- Repro: after tightening the Claude Code worker prompt to use only browse CLI commands, a first-command `browse fill` with session names like `browser-swarm-current-claude-strict-90398373` hung until the CLI returned `Driver daemon socket was not ready after 30000ms`.
- Fix: shortened the recommended session naming pattern to `bs-<label>-<short-id>` and documented a preference for session names under 32 characters.
- Evidence: rerunning the same target-bound endpoint with short session `bs-claude-9039` succeeded: `browse get title`, `fill "#box"`, `click "#submit"`, `tab list`, `get text "#result"`, `get value "#box"`, and `screenshot --path` all returned. `tab list` showed exactly one target and the final value/result were both `current-head-claude-short-87267b6`.

### Installed skill copy had stale worker instructions

- Repro: `~/.agents/skills/browser-swarm/SKILL.md` differed from the PR checkout in the worker-critical sections for extension version checks, short session names, selector quoting, raw relay probes, `tab list`, and `screenshot --path`.
- Fix: the local untracked real directory at `~/.agents/skills/browser-swarm` was moved to a timestamped backup and replaced with a symlink to this PR checkout's `skills/browser-swarm` directory. Existing `~/.codex/skills/browser-swarm` and `~/.claude/skills/browser-swarm` already point through `~/.agents/skills/browser-swarm`, so both CLIs now resolve the current worker contract.
- Evidence: `cmp -s ~/.agents/skills/browser-swarm/SKILL.md /Users/shrey/Developer/skills-browser-swarm-extension/skills/browser-swarm/SKILL.md` now passes and prints `skill-md-in-sync`.

### Duplicate root closeTarget detach events

- Repro: follow-up review found that root `Target.closeTarget` could broadcast `Target.detachedFromTarget` after a successful close while the extension's `chrome.tabs.onRemoved` path could also send `targetDetached`, producing duplicate detach events for the same target.
- Fix: relay target detaches are now idempotent. Both the extension `targetDetached` handler and the root `Target.closeTarget` cleanup only broadcast when the relay target map actually contained the target.
- Evidence: `BROWSER_SWARM_PORT=20005 BROWSER_SWARM_BROWSE_BIN=<browse cli> npm run e2e` passed on the latest rerun. The run verified root create increased target count `3 -> 4`, root close reduced it `4 -> 3`, and exactly one root detach event was observed for the closed target. The same run also reverified session-scoped isolation, relay screenshot output (`1510792` bytes), and three same-page parallel write tasks.

### Root lifecycle commands with sessionId bypassed relay state

- Repro: follow-up review found that root-client `Target.createTarget` and `Target.closeTarget` with a `sessionId` fell through to raw CDP forwarding instead of the relay's target-map update and detach-broadcast paths.
- Fix: root lifecycle commands now run through the relay's create/close handlers before session forwarding, regardless of whether the root client included a `sessionId`.
- Evidence: `BROWSER_SWARM_PORT=20005 BROWSER_SWARM_BROWSE_BIN=<browse cli> npm run e2e` passed. The root lifecycle probe now attaches to an existing target, sends both root `Target.createTarget` and `Target.closeTarget` with that `sessionId`, verifies target count `3 -> 4 -> 3`, and observes exactly one detach event.

## Current Evidence

- Chrome disposable grouped e2e: PASS on relay ports `19990`, `19997`, `20000`, `20003`, `20004`, `20005`, `20007`, and `20009`; the latest current-head runtime run includes extension version `0.1.1`, lifecycle/session isolation regression probes, root create/close cleanup with a root `sessionId`, single detach-event assertion, relay CLI screenshot output (`1510257` bytes), and three same-page parallel `fill` + `click #submit` write tasks.
- Chrome raw CDP isolation: PASS; worker endpoint sees only its target and rejects sibling/lifecycle commands.
- Chrome same-page read/write workflow: PASS; three workers write distinct values to identical pages in parallel.
- Codex subagents: PASS in prior live stress; three real Codex `worker` agents each operated through a distinct target-bound endpoint and reported title/url/tab evidence plus screenshots.
- Codex subagents, same-page live stress: PASS on relay port `19993`; three real Codex workers operated concurrently against `http://127.0.0.1:18085/same`, all returned `status: success`, and the main harness verified distinct final states:
  - `alpha` / `DCF37DE487790F11CF7BA258D9EDF0CE`: `strict-same-page alpha-strict-success-worker`, `#result` and `#box` both `alpha-strict-success-worker`.
  - `beta` / `47BD8E6FB1ABFFD555DB4088DE5F1D46`: `strict-same-page beta-strict-success-worker`, `#result` and `#box` both `beta-strict-success-worker`.
  - `gamma` / `E84CA16552C06E2CCAAD63B5B9BB1ECD`: `strict-same-page gamma-strict-success-worker`, `#result` and `#box` both `gamma-strict-success-worker`.
- Claude Code CLI agent smoke: PASS with `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json`.
- Mixed Codex + Claude Code live workflow: PASS; one Codex worker and one Claude Code agent operated concurrently in the same disposable Chrome profile against identical same-page tabs, each reported distinct title/text/value/url/tab evidence, and the main harness independently verified one visible target per worker.
- Mixed Codex + Claude Code latest-head workflow: PASS on relay port `19999` at commit `a3fe8ad`; one real Codex `worker` subagent and one `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json` worker ran concurrently in the same disposable Chrome profile against identical `http://127.0.0.1:18087/same` tabs. Workers reported structured JSON back to the main harness, and the main harness independently verified:
  - `latest-codex` / `4F9712E1E1408A823031DEE300FCC576`: title `latest-mixed-worker latest-codex-worker`, `#result` and `#box` both `latest-codex-worker`, and exactly one visible tab.
  - `latest-claude` / `310A4D4A6038315C96A8D119F13F9885`: title `latest-mixed-worker latest-claude-worker`, `#result` and `#box` both `latest-claude-worker`, and exactly one visible tab.
- Mixed Codex + Claude Code current-head workflow: PASS on relay port `20001` at commit `5297512`; one real Codex `worker` subagent and one `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json` worker ran concurrently in a disposable Chrome profile against identical `http://127.0.0.1:18088/same` tabs. Workers reported structured JSON back to the main harness, screenshots were written to `/tmp/browser-swarm-current-codex.png` and `/tmp/browser-swarm-current-claude.png`, and the main harness independently verified:
  - `latest-head-codex` / `1EA89C9D06A7B348181A52C63DE6D245`: title `latest-head-mixed-worker latest-head-codex-worker`, `#result` and `#box` both `latest-head-codex-worker`, and exactly one visible tab.
  - `latest-head-claude` / `B8D878CE8DC8287AF1D2D737A4B019E0`: title `latest-head-mixed-worker latest-head-claude-worker`, `#result` and `#box` both `latest-head-claude-worker`, and exactly one visible tab.
- Mixed Codex + Claude Code current-head workflow after root lifecycle fix: PASS on relay port `20006` at commit `87267b6`; one real Codex worker and one Claude Code worker ran concurrently against identical `http://127.0.0.1:18089/same` tabs. Codex reported `current-head-codex-worker-87267b6`; Claude Code reported `current-head-claude-worker-87267b6`; the main harness independently verified each target-bound endpoint returned exactly one visible target and distinct title/text/value state. A follow-up strict browse-only probe on the Claude endpoint passed with short session `bs-claude-9039`.
- Mixed Codex + Claude Code latest runtime-tested workflow: PASS on relay port `20008` at commit `d455b35`; one real Codex `worker` subagent (`Huygens`) and one `claude -p --permission-mode bypassPermissions --allowedTools Bash --output-format json` worker ran concurrently in a disposable Chrome profile against identical `http://127.0.0.1:18090/same` tabs. Both returned structured JSON to the main harness, screenshots were written to `/tmp/browser-swarm-current-codex-d455b35.png` (`29126` bytes) and `/tmp/browser-swarm-current-claude-d455b35.png` (`28992` bytes), and the main harness independently verified:
  - `codex` / `D1D15F9203AA0E26361423D710F61F8A`: title `mixed-agent-current-head current-head-codex-d455b35`, `#result` and `#box` both `current-head-codex-d455b35`, and exactly one visible tab.
  - `claude` / `0FDA5641813BA341A0CA34359814E2E9`: title `mixed-agent-current-head current-head-claude-d455b35`, `#result` and `#box` both `current-head-claude-d455b35`, and exactly one visible tab.
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
- Additional reload attempts: restarting the relay, stopping the relay before pressing Reload, pressing Arc's top-level `Update` button, pressing the Browser Swarm card's `Reload` button, and toggling the extension control through Arc's Details page did not change `/health`; it continued to report version `0.1.0`.
- Diagnostic evidence: `chrome-extension://fnkkfpnldmkoglemodoamghhienkeodp/manifest.json` serves manifest version `0.1.1`, but `chrome://serviceworker-internals` shows the active Browser Swarm service worker registration is still running. `navigator.serviceWorker.getRegistrations()` from the extension origin sees the registration, but `unregister()` fails with `AbortError: Worker disallowed` and `update()` timed out through the debugger.
- Non-destructive workaround attempts: launching a disposable Arc instance with `open -na Arc --args --user-data-dir=/tmp/browser-swarm-arc-profile --load-extension=/tmp/browser-swarm-arc-extension-19998 ...` did start an Arc process, but the extension never connected to a relay on port `19998` after 25 seconds. Launching Arc directly via `CHROME_PATH=/Applications/Arc.app/Contents/MacOS/Arc node scripts/launch-chrome.mjs --relay-port 20002 --profile /tmp/browser-swarm-arc-direct-profile --fresh --url about:blank` also started a temp Arc process, but `/health` stayed `extensionConnected: false` for 30 seconds. The temp Arc processes and relays were killed. These attempts do not prove pointer-click behavior on Arc `0.1.1`.
- Post skill-sync probe: after replacing the stale local `~/.agents/skills/browser-swarm` copy with a symlink to this PR checkout, both the installed manifest and repo manifest read `0.1.1`, but `node scripts/setup-real-browser.mjs --browser arc --no-open --timeout 8 --json` still exited `3` because Arc reconnected with active worker version `0.1.0`.
- Final non-destructive refresh attempt: using the currently connected Browser Swarm bridge itself to open `chrome://serviceworker-internals` failed with `Cannot access a chrome:// URL`; trying `arc://serviceworker-internals` failed with `Extension manifest must request permission to access this host`. Computer Use also cannot attach to Arc in this environment (`Apple event error -1743`), so the UI-only Stop-then-Reload path cannot be performed by this agent.
- Additional programmatic refresh probes: Arc exposes `DevToolsActivePort`, but its browser WebSocket rejects external clients with `403 Forbidden` even when Chrome DevTools-style Origin headers are used, so `ServiceWorker.updateRegistration` cannot be called through the browser-level DevTools socket. AppleScript can see Arc windows, but recursive accessibility queries against `chrome://serviceworker-internals` hang or expose unlabeled controls, so clicking the correct Stop control cannot be done safely by this agent.
- Current status: Arc real-browser workflows are usable for read/write work when irreversible write actions use DOM-level commands (`browse eval`) instead of pointer clicks. The pointer-click path still needs a real Arc extension refresh to `0.1.1` before it can be judged against the input-command queue fix.
- Follow-up: restart Arc or otherwise force Browser Swarm Bridge to reload, confirm `/health` reports version `0.1.1`, and rerun the Arc pointer-click write test.

## Open Checks

- Manually reload the Arc extension and rerun the Arc pointer-click write test.
