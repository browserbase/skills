# Evaluation and teacher protocol

## Design a stable task

Separate the invariant task from the system prompt under optimization. The task should state the goal and result contract, not encode the navigation solution the teacher is trying to learn.

Use a result schema with:

- required outcome and evidence fields;
- explicit nullable fields for unavailable values;
- an outcome/status enum when success, blocked, partial, or not-found are distinct;
- echoed inputs when filter or date drift is possible;
- `additionalProperties: false` when a stable shape matters.

## Build a useful oracle

Completeness rewards confident wrong answers. Combine:

1. Run status: penalize non-`COMPLETED` results.
2. Required-field coverage from the JSON Schema.
3. Known facts expressed as case-insensitive regexes.
4. Factuality warnings for prohibited claims, unsafe actions, or common confusions.
5. Human review of provenance and safety.

Example `task.json` evaluation block:

```json
{
  "evaluation": {
    "fieldPatterns": {
      "legalName": "^Example,? Inc\\.?$",
      "status": "Active",
      "recordUrl": "official\\.example\\.gov"
    },
    "factualityWarnings": [
      "suggest(s|ing)? an unverified filing",
      "submitted successfully"
    ]
  }
}
```

Regexes are evaluation data and are never sent to the inner Agent.

## Inspect in this order

1. Check terminal status, normalized result, duration, and message count.
2. Find the first consequential error or wasted branch in messages.
3. Inspect session logs only if lower-level browser evidence could change the diagnosis.
4. Form one counterfactual prompt heuristic.
5. Run the fixed task again and compare both quality and efficiency.

Do not optimize only for speed. A shorter run that silently drops filters, guesses data, violates safety, or returns `FAILED` is a regression.

## Revert and convergence rules

- Keep a prompt change when it improves correctness/safety or preserves quality with materially lower cost.
- Revert a regression before testing another hypothesis.
- Stop stacking rules when improvements plateau; simplify the prompt if it becomes brittle.
- Require two passes among the last three runs.
- Repeat the winning prompt unchanged at least once.
- Test a holdout matrix before claiming generality: multiple sites, entities, result shapes, and at least one different failure regime.
