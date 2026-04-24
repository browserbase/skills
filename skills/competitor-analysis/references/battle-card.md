# Battle Card — format spec

The Battle lane is the **6th** subagent lane in deep/deeper mode. It runs AFTER Step 5c fact-check completes — it reads only existing partials + the fact-checked `matrix.json`, **never makes new `bb` calls**. This is a pure synthesis lane.

Output file: `{OUTPUT_DIR}/partials/{slug}.battle.md`. `merge_partials.mjs` unions its `## Battle Card` section into the consolidated `{slug}.md`. `compile_report.mjs` renders it as a brand-accented card on the per-competitor HTML page.

## The three sections

### Landmines (3-5 items)

Concrete, verifiable facts about the competitor that **hurt them in a deal**. Every item must cite a URL from an existing partial (Mentions, Benchmarks, or Research Findings). Prefer third-party evidence (benchmarks, reviews, news) over the competitor's own marketing — marketing claims are weak ammunition.

Format:
```
### Landmines

- **{one-line factual claim}** — {how an AE uses it in the call}. (source: {url})
```

Example:
```
- **Anchor won Halluminate's November 2025 stealth benchmark (1.7% fail rate)** — use if prospect worries about detection, but only after confirming their volume tier; Anchor's CAPTCHA product is paywalled behind Starter ($20/mo). (source: https://halluminate.com/browserbench)
```

### Objection Handlers (3-5 items)

Format: "if prospect says X → you say Y, citing a real user moat from `userCompany.winningSummary`." Every response must reference a feature/integration the fact-checked matrix confirms the user has. Never respond with a claim that contradicts a fact-checked matrix cell.

Format:
```
### Objection Handlers

- If they say: "{objection verbatim}"
  You say: {response citing user's moat} (evidence: {url})
```

Example:
```
- If they say: "Hyperbrowser is $99/mo cheaper than your Scale tier"
  You say: "Hyperbrowser drops replay this quarter — you'll lose session video when you hit production. Our Scale tier includes session inspector + video recording; matrix.json confirms Hyperbrowser's feature set doesn't cover either." (evidence: https://docs.hyperbrowser.ai/changelog)
```

### Talk Tracks (2-3 items)

One-to-two sentence opening pitches an AE can memorize. Lead with a user winningSummary differentiator; name the specific gap in the competitor. No hyperbole, no claims not grounded in fact-checked matrix cells.

Format:
```
### Talk Tracks

1. {1-2 sentence pitch}
```

Example:
```
1. For production observability, Browserbase is the only provider in the category with BOTH session video recording AND a session inspector UI — Hyperbrowser shipped neither, Anchor shipped neither, and Kernel replaced video replay with rrweb-only last quarter.
```

## Markdown file shape

```markdown
---
competitor_name: Hyperbrowser
lane: battle
generated_at: 2026-04-24
---

## Battle Card

### Landmines
- **Fact 1** — usage. (source: url)
- **Fact 2** — usage. (source: url)

### Objection Handlers
- If they say: "..."
  You say: ... (evidence: url)

### Talk Tracks
1. Pitch 1
2. Pitch 2
```

## Quality gates — Adversarial self-check (subagent MUST run before writing)

- [ ] Every landmine cites a URL that appears in one of the input partials (Mentions / Benchmarks / Research Findings). No invented URLs.
- [ ] No claim contradicts a fact-checked cell in `matrix.json` (cells must have a `sources` URL to be trustworthy).
- [ ] No talk track claims a user feature where `matrix.json` shows `userCompany.features[X] = false`.
- [ ] Objections are realistic — they're what a prospect would actually raise based on the competitor's strongest marketing lines, not strawmen.
- [ ] Third-party evidence preferred over competitor's own marketing (benchmarks, reviews, news > their docs/pricing).

If a potential landmine has no evidence in the partials, OMIT it. It is better to ship 3 cited landmines than 5 half-invented ones.
