# Evaluation Rubric — Arena Methodology

Score each dimension 0–100 based on aggregated trace evidence. Ground every score in specific trace fields: `tool_calls`, `errors`, `retries`, `interruptions_asking_for_creds`, `completion_status`, `friction_points`.

## Table of contents

1. **Goal completion rate (primary sanity check)**
2. Setup Friction (25%)
3. Speed (20%)
4. Efficiency (20%)
5. Error Recovery (15%)
6. Doc Quality (20%)
7. Score-to-grade mapping
8. Calibration notes

---

## 0. Onboarding success rate — the sanity floor

Before scoring any dimension, compute two rates across all valid agents:

```
onboarding_success_rate = count(onboarding_status == "completed") / count(agents)
docs_promise_met_rate   = count(docs_promise_met == true) / count(agents)
```

**Cap rule (based on onboarding_success_rate):**

- ≥ 0.9 → no cap
- ≥ 0.7 → cap any dimension at 85
- ≥ 0.5 → cap any dimension at 70
- < 0.5 → cap any dimension at 55 (docs fundamentally failed)

Rationale: if agents couldn't complete onboarding, no amount of nice prose or fast fetches earns the docs an A.

**docs_promise_met_rate is independent signal.** An agent can "complete" something (status = completed) but have `docs_promise_met = false` if the docs didn't clearly state what completion looks like. A low docs_promise_met_rate with a high onboarding_success_rate = "agents are succeeding in spite of the docs, not because of them." Flag this explicitly in the report.

**Look at `primary_outcome_achieved` across agents.** If all 5 agents achieved slightly different outcomes, the docs are ambiguous about what success means — that's a doc quality issue. If they all converge on the same outcome, the docs are clear.

**Narrative review findings (from Step 6.5) dominate over structured scores.** If the prose review surfaces convergent hallucinations (e.g., all agents used the wrong npm package) or systematic doc bugs invisible to the JSON self-report, cap Doc Quality at 50 regardless of other signals. An agent completing the task using a wrong-but-similar package isn't success — it means the docs left enough ambiguity for training-data priors to take over. That's a fundamental doc failure.

**Model-mix analysis (when `model = Mixed`).** If the user ran a mixed-model audit, compare onboarding success + docs_promise_met + friction count across models:
- If Opus succeeds but Haiku fails → the docs lean on reasoning the smaller model can't do. That's a doc clarity gap (docs should work for all capable agents, not just the best).
- If Haiku and Sonnet both succeed but flag more friction than Opus → same finding at lower severity.
- If all three succeed equally cleanly → the docs are robust. Rare and great signal.

Flag the model-mix gap in the report's narrative review section: *"Haiku struggled at X where Opus breezed through — docs too reliant on model-level inference."*

---

## 1. Setup Friction (weight 25%)

**Question:** How much ceremony stands between "I want to try this" and "I have code running"?

**Signals:**
- `interruptions_asking_for_creds` — every ask is friction.
- `errors[].stage = "config"` — misconfig issues.
- `errors[].message` containing `401`, `403`, `auth`, `unauthorized` — credential-related.
- `friction_points[].phase = "setup"` — setup-stage pain.
- Retries on install or first auth attempt.

**Anchors:**
- 90+: Zero credential friction (agent found keys, or none required). No auth retries. Install worked first try.
- 70: One small friction — a credential prompt or a single retry.
- 50: Multiple setup frictions — e.g., credential hunt + install conflict.
- 30: Agent spent most of its effort just trying to get set up.
- <20: Agent never got past setup.

## 2. Speed (weight 20%)

**Question:** How fast did agents get to working code?

**Signals:**
- `wall_time_estimate_sec` — total run time.
- `time_to_first_working_code_sec` — time to a running snippet.
- Relative to task complexity (a Stripe charge should take longer than a `curl`).

**Anchors:**
- 90+: Under 2 minutes to working code for a simple task.
- 70: 2–5 minutes — reasonable.
- 50: 5–10 minutes — noticeable drag.
- 30: Over 10 minutes — painful.
- <20: Never finished within the run.

Adjust for task complexity. A payments flow is not a cloud browser session.

## 3. Efficiency (weight 20%)

**Question:** Did agents get there in a straight line, or did they wander?

**Signals:**
- Sum of `tool_calls[].count` across all agents — total work.
- `code_attempts` — how many drafts before working.
- `retries` — repeated failing calls.
- `doc_pages_fetched` — if >5 pages for a simple task, docs are fragmented.
- `completed_subtasks` / total `tool_calls` ratio.

**Anchors:**
- 90+: Under 10 tool calls for a simple task, zero wasted calls, single working draft.
- 70: 10–20 calls, one retry or minor exploration.
- 50: 20–40 calls, some wandering — agent wasn't sure where to look.
- 30: 40+ calls — agent is thrashing.
- <20: Pathological loop or massive exploration.

## 4. Error Recovery (weight 15%)

**Question:** When something broke, did the agent (and the docs) help each other recover?

**Signals:**
- `errors[].recovered` — recovery rate.
- Whether errors led to `retries` that succeeded or to `completion_status` degradation.
- Docs surfaces relevant error info when fetched after an error (check `friction_points` for "no troubleshooting" notes).
- `friction_points[].severity = critical | high` at the execution phase.

**Anchors:**
- 90+: Zero errors, or all errors recovered cleanly with clear doc guidance.
- 70: Errors happened but agents recovered — minor friction.
- 50: Errors slowed progress noticeably; docs didn't help.
- 30: Errors frequently fatal; docs silent on failure modes.
- <20: Every error killed the run.

## 5. Doc Quality (weight 20%)

**Question:** Did the docs provide what agents needed, when they needed it?

**Signals:**
- `doc_pages_fetched` (fragmentation signal if high for a simple task).
- `friction_points` mentioning broken examples, missing info, unclear sections.
- `positive_moments` citing concrete doc wins.
- Whether the code in docs was copy-pasteable and worked.
- Presence/absence of a `llms.txt`, quickstart, or clear API reference.

**Anchors:**
- 90+: A single quickstart page + working code got the agent to done. Minimal fragmentation.
- 70: Had to piece it together from 2–3 pages, but each was correct.
- 50: Fragmented or stale in places — examples needed adaptation.
- 30: Docs omit critical info (error handling, session lifecycle, etc.).
- <20: Docs either wrong, absent, or actively misleading.

## 6. Score-to-grade mapping

```
total = setup*0.25 + speed*0.20 + efficiency*0.20 + recovery*0.15 + doc*0.20
```

| Total   | Grade |
|---------|-------|
| 90–100  | A     |
| 75–89   | B     |
| 60–74   | C     |
| 45–59   | D     |
| 0–44    | F     |

## 7. Calibration notes

- **Don't inflate.** Every dimension at 80+ requires evidence. Default-to-B, move to A only with clear wins.
- **Don't deflate.** An absent signal is not a bad signal — a dim with no complaints starts at 75, not 50.
- **Weight severity.** One `critical` friction_point is worth 5 `low` ones.
- **Cite evidence per dimension.** The report shows a one-line rationale per dim — always quote or reference a specific trace field.
- **Blocked-on-credentials is not a failure of the docs** (unless the docs pretend credentials aren't needed). Score setup friction accordingly, but don't dock Doc Quality for an agent correctly refusing to invent keys.
