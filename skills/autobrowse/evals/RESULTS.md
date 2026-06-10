# Eval results — 2026-06-09 (Fable 5 vs Opus 4.8)

First findings from this harness, comparing `claude-fable-5` and `claude-opus-4-8` in both autobrowse roles. ~200 verified runs, ~$220 API spend. Small n (2–3 trials/cell) — directional, not definitive.

## Headline

**Best configuration tested: Sonnet 4.6 as the inner (browsing) agent + Fable 5 as the outer (strategy-writing) agent.** On the OpenTable task it produced the most reliable *and* cheapest converged runs of any cell — beating even Opus-as-browser — because the expensive model's intelligence lands in `strategy.md` once instead of in every run.

## OpenTable 2×2 (Tier B, Akamai-walled, verified+proxied Browserbase sessions)

| Inner ↓ / Outer → | Opus 4.8 writes | Fable 5 writes |
|---|---|---|
| **Sonnet 4.6 browses** | 5/6 holdout, $1.40/run, 90s | **6/6 holdout, $0.96/run, 64s** |
| **Opus 4.8 browses** | 6/6, $1.20/run, 63s | — |
| **Fable 5 browses** | 5/6, $1.66/run, 93s | — |

- **Inner axis:** Opus beat Fable as the browser — same convergence (iter 2–3), half the training cost (~$5.5 vs ~$11/trial), perfect holdout. Fable reasons more per turn; at 2× token pricing that compounds (blind iteration-1 attempts: ~$7 vs ~$3).
- **Outer axis (same Sonnet inner in both):** Fable-authored strategies were more reliable (6/6 vs 5/6) and made the same agent ~30% faster and cheaper. Qualitatively, Fable's skills encode *mechanisms* — React hydration timing ("`wait load` returns before the widget renders; snapshot shows ~2 refs"), Akamai cookie behavior ("`browse stop` wipes cookies → never stop the session"), broken-command landmines ("`wait selector text=...` ETIMEDOUTs") — where Opus's skills describe symptoms. Same pattern appeared on the Tier A fixtures: Fable was the only outer model to identify a deliberately planted 900ms delayed-render trap and prescribe the exact fix.
- Fable's outer calls cost $0.13 vs Opus's $0.05 per improvement — negligible in absolute terms.

## Tier A fixtures (deterministic local sites)

- All models 100% on the easy task; differentiation is pure cost (Sonnet $0.16/run, Opus $0.60, Fable $0.97). On tasks the cheap model already does, frontier inner agents are pure overhead.
- On the trap-laden checkout fixture, inner reliability ranked Fable (6/6) > Opus (5/6) > Sonnet (4/6) — monotonic with price. This did **not** generalize to OpenTable, where Opus matched/beat Fable as inner.

## Other observations

- **Zero false-successes in ~200 runs** — no model claimed `success:true` against a failing verifier. Failures were honest (turn-budget exhaustion, no final JSON).
- **Live-site drift is real:** Akamai blocked every iteration-1 attempt in a morning round and none in an evening round. Only within-round (concurrent, paired) comparisons are valid on live sites.
- One Fable-cell strategy explicitly reasoned about the grader ("the verifier requires success:true — persist"). Benign here (persistence, not fabrication), but a preview of strategies evolving against the verifier's letter on harder tasks.

## Recommended default

`inner_model: claude-sonnet-4-6`, `outer_model: claude-fable-5`, escalating the inner to Opus only when a task fails to converge because the inner agent can't execute good instructions. Training cost per new skill: ~$1–2; converged verified runs: ~$1.
