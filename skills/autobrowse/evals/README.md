# autobrowse-evals

Eval harness for the [autobrowse](https://github.com/browserbase/skills/tree/main/skills/autobrowse) self-improving browser-automation loop. Measures the four things that matter — **convergence speed**, **accuracy**, **runtime speed**, and **token cost** — and makes them comparable across inner/outer models, prompts, and architectures.

## The four artifacts being evaluated

| Artifact | What it is | Metrics |
|---|---|---|
| Single run | One `evaluate.mjs` attempt, empty strategy | accuracy baseline, speed, tokens |
| Learning loop | evaluate → verify → improve, repeated | convergence speed, cumulative cost |
| Graduated strategy | frozen best strategy.md run by a fresh agent | **holdout** accuracy/speed/tokens |
| Codegen script | deterministic playwright/stagehand output | (future: wire `codegen.mjs --verify` in) |

The core design decision: **training and evaluation are separated.** Convergence is measured during the loop; the *result* is measured by freezing the best strategy and running it N fresh times (holdout). And **pass/fail is never self-reported** — every task has a programmatic verifier; the agent's own `success: true` is only used to compute the false-success (reward-hacking) rate.

## Layout

```
eval/
  run-matrix.mjs        orchestrator: condition × task × trial → train + holdout
  outer-agent.mjs       scripted outer loop (one structured-output call per iteration;
                        outer tokens metered — the interactive loop never records them)
  report.mjs            aggregates runs/results.jsonl into scorecards
  conditions/*.json     sweepable variables: inner_model, outer_model, outer_prompt, iters
  prompts/outer-*.md    outer-prompt variants (default = SKILL.md methodology, lean = ablation)
  tasks/<task>/         task.md (autobrowse format) + verify.mjs + meta.json + mock-output.json
fixtures/               self-hosted deterministic sites (Tier A ground truth)
runs/                   workspaces, traces, results.jsonl (gitignored)
```

## Benchmark suite (9 tasks, 3 tiers)

Tasks marked ◆ are drawn from the browse.sh prompt library (`prompts/<domain>/<task>.md`).

| Tier | Task | Env | Verification |
|---|---|---|---|
| **A — deterministic** | `fixture-checkout` | local | exact confirmation code (shared hash function) + total |
| | `fixture-flightdeck` | local | exact cheapest-nonstop answer; traps: cheaper 1-stop, cheaper wrong route |
| | `books-toscrape` | local | exact count/prices/titles (static demo site) |
| **B — live, stable** | `uspto-patent-lookup` ◆ | remote | patent facts are immutable (US 11,000,000) |
| | `google-flights` ◆ | local | invariants: nonstop, airline set, price band, internal consistency |
| | `opentable-availability` ◆ | local | invariants: date/party echoed, slot format, availability consistency |
| | `youtube-transcript` ◆ | local | immutable content ("Me at the zoo" transcript phrases) |
| **C — bot-protected** | `stockx-price` ◆ | remote | product identity + price band (PerimeterX) |
| | `yelp-reviews` ◆ | remote | rating/review-count bands + per-review structure (DataDome) |

Tier A gives model comparisons statistical teeth; Tier B measures real-site competence with invariant checks; Tier C measures infrastructure robustness (report it separately — variance is the site's, not the model's).

**Verifier protocol** (mirrors autobrowse's codegen runner protocol): `node eval/tasks/<task>/verify.mjs --run-dir <traceDir>` → one JSON line `{passed, checks: [{name, ok, detail}], reason}`. Each task's `mock-output.json` is its documented known-good output; `npm run test:verifiers` asserts every verifier passes it and rejects a garbage `{"success": true}` — i.e., verifiers are tested against reward-hacking.

## Setup

```bash
npm install
cp .env.example .env        # ANTHROPIC_API_KEY (+ BROWSERBASE_API_KEY for remote tasks)
npm install -g browse       # the browse CLI used by the inner agent
# AUTOBROWSE_DIR defaults to the parent dir (this folder ships inside the skill)
```

## Usage

```bash
npm run test:verifiers                                  # verifier soundness (no keys needed)
node eval/run-matrix.mjs --conditions baseline --tasks fixture-checkout --mock   # free pipeline check

# Real runs
node eval/run-matrix.mjs --conditions pilot --tasks fixture-checkout            # cheap pilot
node eval/run-matrix.mjs --conditions baseline --tasks all --trials 3           # full baseline
node eval/run-matrix.mjs --conditions baseline,inner-haiku,inner-opus,outer-sonnet,outer-prompt-lean \
    --tasks fixture-checkout,fixture-flightdeck,books-toscrape --trials 3       # model/prompt screen on Tier A

npm run report                                          # markdown scorecards
node eval/report.mjs --json                             # raw aggregates
```

The fixture server (`npm run fixtures`, port 4173) auto-starts when a selected task needs it.

## Metrics (see report footer for definitions)

- **Convergence:** converged-rate, iters-to-first-verified-pass, regressions, cumulative train cost (inner + outer)
- **Accuracy:** holdout pass rate (frozen strategy, fresh runs), **false-success rate** (claimed success, verifier failed)
- **Speed:** holdout wall clock split into browser ms (sum of browse-CLI `duration_ms` in trace.json) vs model ms
- **Tokens/cost:** per-run tokens, recomputed centrally in `eval/lib/pricing.mjs` (don't trust evaluate.mjs's stale table), and **skill value** = how much the learned strategy cheapens a run vs the blind iteration-1 attempt (tests the README's "80%+ reduction" claim)

## Experiment design notes

- **Screen, don't grid.** Vary one axis at a time against `baseline` (5 conditions ship: baseline, inner-haiku, inner-opus, outer-sonnet, outer-prompt-lean). Deep-dive only the interesting 2–3 combos.
- **Pair comparisons on the same tasks**; live-site variance makes unpaired suite means meaningless. Tier C reports separately.
- **Trials:** ≥3 per cell for anything you'll make a decision on. `results.jsonl` is append-only — rerun cells freely, the report aggregates.
- **Cost calibration:** run `pilot` on one Tier A task first and read `inner_cost_usd`/`outer_cost_usd` from `runs/results.jsonl` before launching a sweep.

## Fidelity caveats / roadmap

- The scripted outer agent sees a curated evidence pack (summary, verifier verdict, failed commands), not the full tool-using trace exploration Claude Code does. A Claude-Agent-SDK outer agent with Read/Grep tools is the natural next architecture variant — and would also let `--browser-trace` evidence (unified-events.jsonl) become a sweepable axis.
- `codegen.mjs --verify` (deterministic script artifact) isn't wired into the matrix yet; its runner protocol is identical to the verifier protocol here, so it slots in as a fourth phase.
- The local checkout's `judge.mjs` (A/B strategy judge) and `--supervise` watcher are complementary: the judge compares strategy *versions* by run evidence; this harness compares *conditions* by verified outcomes. `supervised` already lands in evaluate.mjs's meta.json and could become another condition axis.
