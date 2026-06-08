# pitch-prep

A Claude Code skill that preps you for a sales meeting. Give it **what you're selling** and **who you're selling to**; it researches both — *browsing the prospect's live site* for concrete hooks — proposes **3 ranked demo concepts** for you to pick from, then expands your pick into a tailored, **self-contained HTML demo brief** that opens in your browser.

It's product-agnostic: works whether you're selling an API, a SaaS app, or a browser-automation tool.

## Why it's good

- **Browser-first research.** It doesn't theorize from the company name — it walks the prospect's real money path, mines review sites, and grabs hiring/competitor signals, capturing **screenshots** as evidence.
- **Uses the full web-data stack.** Search to *find* pages → Fetch to *read* them cheaply → Browse to *walk* flows and capture screenshots / get past anti-bot. (Browserbase's `browse cloud search`, `browse cloud fetch`, and cloud browser sessions; falls back to Claude's `WebSearch`/`WebFetch`.)
- **One sharp wedge, not a feature dump.** Every brief connects one concrete prospect pain to one product capability, with a single named "wow" moment — and every claim is sourced to a URL.
- **A sendable artifact.** Output is a self-contained HTML file (screenshots embedded) that auto-opens and can be forwarded as-is.

## Prerequisites

- **Claude Code.**
- **The `browser` skill** (Browserbase cloud browser automation) for the research spine. The Search/Fetch/Browse commands use the [`@browserbasehq/browse-cli`](https://www.npmjs.com/package/@browserbasehq/browse-cli) with a `BROWSERBASE_API_KEY` set.
- Without Browserbase configured, it degrades to Claude's built-in `WebSearch` / `WebFetch` (no screenshots, no anti-bot).
- `python3` (for `embed_images.py`).

## Install

Drop the folder where Claude Code discovers skills (e.g. symlink into `~/.claude/skills/`):

```bash
ln -s "$(pwd)/pitch-prep" ~/.claude/skills/pitch-prep
```

Then invoke it:

```
/pitch-prep <product + URL> <prospect + domain>
# e.g. /pitch-prep Browserbase browserbase.com  →  Chorus chorus.com
```

## What you get

1. **Scope check**, then a tight **capability sheet** for the product.
2. A **browser crawl** of the prospect → sourced hooks + screenshots.
3. **3 ranked demo concepts** — you pick one (mandatory checkpoint).
4. A **self-contained HTML brief** (`demo-brief-<prospect>-portable.html`) that auto-opens: TL;DR, screenshot evidence, the wedge, beat-by-beat storyline, reproducible flow, talking points, prospect-specific objections, success criteria.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill: workflow, the bar for a good brief, the research stack, guardrails. |
| `brief-template.md` | Section structure for the brief. |
| `brief.css` | Styling for the HTML brief (override `--accent` for a light brand touch). |
| `embed_images.py` | Inlines + compresses screenshots into the HTML and auto-opens it (`--no-open` to suppress). |

## Scope

`pitch-prep` stops at the **brief** — it does not build or run the live demo (that's a product-specific layer), and it does not auto-generate a fully branded slide deck (a planned optional extension). The brief is designed to be the clean input to those next steps.

## License

MIT.
