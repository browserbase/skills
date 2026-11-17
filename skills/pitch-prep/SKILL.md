---
name: pitch-prep
description: Prep for a sales meeting by deeply researching a product you're selling AND the prospect you're selling to — browsing the prospect's live site for concrete hooks — then proposing 3 ranked demo concepts to pick from, and expanding the chosen one into a tailored, demo-ready brief delivered as a self-contained HTML page. Use when the user says "prep for my [prospect] call", "pitch prep", "build a demo for [prospect]", "what should we demo to [prospect]", "tailor a demo to [customer]", or "research [prospect] for a pitch".
---

# Pitch Prep

## Overview

This skill turns *"we have a meeting with [prospect]"* into a **demo-ready brief**: a tight, opinionated document that says exactly what to demo, why it will land with *this specific prospect*, and how to walk it beat-by-beat.

It works for **any product** — the skill is given two things: **what you're selling** and **who you're selling to**. The value it adds is research + judgment, not code. (Actually generating/running the live demo is a separate, product-specific layer; this skill stops at the brief.)

The process is deliberately **human-in-the-loop on the one decision that matters**: after research, the skill proposes **3 ranked demo concepts** and the user picks one. Then it expands the chosen concept into the full brief. It does not silently pick a concept and run.

**The whole point is specificity.** A generic "show them how great the product is" brief is a failure. Every brief must be anchored to concrete things found on the prospect's actual site — their real checkout flow, their real job listings, their real pricing page, their real data. If the brief could have been written without visiting their site, it's wrong.

> **About paths in this skill:** this skill ships with three sibling files — `brief-template.md`, `brief.css`, and `embed_images.py`. They live in **this skill's base directory** (the path shown as *"Base directory for this skill:"* when the skill loads). Wherever the steps below say `$SKILL_DIR`, substitute that base directory. The skill has **no machine-specific paths** — it's portable across users.

## The bar for a good brief (read before producing anything)

A brief earns its place only if:

1. **It names real things.** Specific pages, flows, products, data, and pain points found on the prospect's *actual* site — with URLs. Not "their e-commerce experience" but "their checkout at shop.acme.com/cart, which forces account creation before showing shipping cost."
2. **The wedge is sharp.** It connects ONE concrete prospect pain/opportunity to ONE product capability. Demos that try to show everything show nothing.
3. **There's a single wow moment.** The one beat that makes them lean in. If you can't name it in a sentence, the concept isn't ready.
4. **It's runnable.** The flow is concrete enough that someone (or, later, an agent) could reproduce it step-by-step.
5. **It speaks their language.** Reference their industry, competitors, and the words *they* use on their own site — not the seller's internal jargon.

If research can't surface concrete hooks (thin site, no public surface), say so plainly and propose concepts against a **public vertical target** instead — but flag that it's a fallback.

## Inputs

The skill needs two things. If either is missing from the invocation, ask for it before doing anything else.

1. **The product** — what the user is selling. A name + URL is enough; the skill researches the rest. (e.g. "Browserbase — browserbase.com")
2. **The prospect** — who they're selling to. A company name + domain. (e.g. "Acme Corp — acme.com")

Optionally accept: known context about the deal (notes, the champion's role, a critical event, what they've already seen), a specific angle the user wants emphasized, or constraints (time-boxed demo, no-login, security-sensitive).

## Research stack — Search + Fetch + Browse (use the combo)

Research is **not** a single tool — it's three, used together. With Browserbase you have the full web-data stack via the `browse` CLI, and using all three *is itself part of the pitch* (the research run shows the product working):

| Tool | Command | Use it for |
|------|---------|-----------|
| **Search** | `browse cloud search "<query>" --num-results 10 --json` | Breadth — *find* the right pages fast (their pricing page, G2 reviews, funding news, competitor sites). Start here. |
| **Fetch** | `browse cloud fetch <url> --format markdown` (add `--proxies` for protected sites; `--format json --schema <…>` for structured extraction) | Depth-by-text — *pull* clean, token-efficient content from a known URL without spinning a full browser. Fast and cheap. |
| **Browse** | the `browser` skill (`browse open --remote …`, `snapshot`, `screenshot`) | Interactive depth — *walk* JS-heavy flows, click through their money path, and **capture screenshots**. The only tool that gets evidence images and reaches login/anti-bot walls. |

**The pattern:** Search to find → Fetch to read at scale → Browse for the interactive walk + screenshots. Reach for Browse whenever you need to *click, log in, get past bot detection, or capture a screenshot*; use Search/Fetch for everything else because they're faster. Generic fallback when Browserbase isn't configured: `WebSearch` / `WebFetch`.

## Workflow

### Step 1 — Confirm scope

Restate, in one line, what you understood: *"Building a tailored demo brief for **[prospect]**, selling **[product]**."* If product or prospect is missing or ambiguous, ask. Don't proceed on a guess.

### Step 2 — Research the product (build a capability sheet)

Goal: know the product well enough to map its strengths onto the prospect's needs. Keep it tight — you need the *demoable edges*, not a full teardown.

- Use **Search → Fetch**: `browse cloud search "<product> positioning / customers / benchmarks"` to find the right pages, then `browse cloud fetch <url>` to pull the product site + docs as clean markdown. (Browse isn't usually needed here — the product's own marketing is rarely bot-walled.)
- Produce a short internal **capability sheet**: the product's 2–4 genuinely differentiated capabilities, each with (a) what it does, (b) the kind of pain it removes, (c) the most visceral way to *show* it (not tell). Note proof points (named customers, benchmarks) you can reference.
- Don't pad. Four sharp capabilities beat twelve features.

### Step 3 — Research the prospect with the browser (this is the spine of the skill)

This is the step that makes or breaks the brief — and it is **browser-first by design**. Two reasons: (1) a real browser sees JS-rendered product surfaces, walks interactive flows, and reaches bot-walled review sites that `WebFetch` simply can't; (2) **this skill is itself a showcase of browser-based prospecting** — the research run should demonstrate the value of doing this with a cloud browser.

Use the **Search + Fetch + Browse combo** (see "Research stack" above): `browse cloud search` to find the hooks (reviews, funding, competitors), `browse cloud fetch` to read pages cheaply, and the **`browser` skill** (Browserbase cloud sessions) for the interactive walk — clicking the money path, getting past anti-bot/login walls, and **capturing screenshots**. Browse is non-negotiable for anything you need to *click, log into, or screenshot*; that's the depth fetch can't give, and it's where the product showcases itself.

Run this **required checklist** every time, capturing **a screenshot + sourced hooks at each step** (screenshots are saved and embedded in the brief — they're free visual evidence once the browser is open):

1. **Walk the money path + screenshot it.** Actually click through their core flow — signup / onboarding / search / checkout / configurator / the AI feature you'll pitch against. Capture the exact screens and any friction. This is what turns "their signup has friction" into "*at step 3 (screenshot) they ask for X before showing Y*."
2. **Mine one review/sentiment source for real pain.** G2, Capterra, TrustRadius, Reddit, or app-store reviews — the richest hook source, and mostly bot-walled (a cloud browser gets in). The prospect's own users' top complaints *become the demo wedge*.
3. **Grab hiring + scale signals.** Their live careers page / LinkedIn jobs / eng blog — what roles, how many, what stack → what they're building and scaling right now.
4. **Grab the customer + competitor signal.** Who they serve (logos/case studies) and 1–2 competitors worth a "they already ship X" line.

Also run `browse cloud search` for hard context (funding, launches, headcount) that isn't on their site.

**Capture concrete hooks** as you go — exact URLs, the specific flow step, the specific friction. A hook is only a hook if it's *specific, verifiable, and ideally has a screenshot*. Keep the browser session/replay link — it goes in the brief as proof the research was real.

**Capturing screenshots — do it right (this matters):**
- **Viewport captures, NOT full-page.** Screenshot the *specific section that contains the hook* (the hero with the headline, the pricing tier, the friction step) — not the whole page. A full-page capture of a long marketing site embeds as an unreadable, blurry strip. A viewport shot of the hero is sharp and shows the exact quote you're citing.
- Save them to a per-prospect working dir: `/tmp/pitch-prep-<prospect>/` with descriptive names (`hero.png`, `pricing.png`).
- If using the Browserbase `browse` CLI (v0.8.x): use the **`--remote` flag** on `open`/`screenshot` (there is no `browse env remote` subcommand); the screenshot path is the **`-p` flag** with an **absolute path** (`browse screenshot -p /tmp/pitch-prep-<prospect>/hero.png`) — a positional path is ignored (prints base64), and a *relative* `-p` saves to the daemon's cwd, not your shell's; **omit `--full-page`** to get the viewport.
- **Wait for animations to settle** before capturing — many hero sections type/animate in. Wait ~4s after load (`browse wait timeout 4000`) then screenshot, or you'll catch a half-rendered headline.
- Aim for 1–4 screenshots total — the sharpest hooks, not every page.

If a surface is unreachable or near-empty, say so and move on; if the whole site is too thin for real hooks, switch to a public vertical target (Step 4 note).

### Step 4 — Synthesize 3 ranked demo concepts

Map the **capability sheet** (Step 2) against the **hooks** (Step 3). Produce **exactly 3 concepts**, ranked best-first. Each concept is short and decision-ready:

```
### Concept N — [punchy title]
- **Hook:** [the specific thing on their site this exploits — with URL]
- **Capability shown:** [which product strength it demonstrates]
- **The wow:** [the one beat that makes them lean in — one sentence]
- **What runs:** [what the live demo actually does — see the two demo media below]
- **Effort / risk:** [low/med/high — how reliably this demos live]
- **Why it ranks here:** [one sentence — why #1 beats #2]
```

**Two demo media — pick the right one for the product you're selling:**
- **Automation-medium demo** (product *acts on the web* — e.g. Browserbase, an RPA/agent tool): the demo runs *on the prospect's own public site/flow*. Risk = login walls, anti-bot, pages that change. "What runs" = their site.
- **Infra/API demo** (product *is consumed by* the prospect's product — e.g. an API, a data/research provider): the demo runs *the product on a prospect-realistic task*, and the prospect's site is the *research material / prompt frame*, not an automation target. "What runs" = a live API/product call on a task their users would actually run. Don't force-fit this into "automate their site."

Ranking criteria, in order: **(1)** sharpness of the wedge (does it hit a real, felt pain?), **(2)** strength of the wow moment, **(3)** how reliably it runs live. A flashy concept that needs a login, trips anti-bot, or is non-deterministic ranks below a solid one that runs clean.

Present the 3 concepts and **stop. Ask the user to pick one** (or blend/adjust). Do not expand a brief until they choose.

### Step 5 — Expand the chosen concept into the brief

Read `$SKILL_DIR/brief-template.md` and fill every section for the chosen concept. Rules:

- **Every claim about the prospect carries a URL** to where you found it.
- **Embed the screenshots** captured in Step 3 in the "What we saw" evidence section, and inline against the hooks they prove. Include the browser replay link.
- **The flow section is reproducible** — concrete steps, ideally no auth required. This is also the clean seam for a later agentic layer that actually runs the demo.
- **Talking points are in the seller's voice**, mapped to the prospect's pain — not feature recitation.
- **Objections are specific to this prospect** (their scale, their stack, their likely concerns), not boilerplate.
- Keep it skim-first. A busy AE/SE reads this on a phone before a call. Tight beats complete.

### Step 6 — Deliver (a self-contained HTML brief that auto-opens)

**The deliverable is a single self-contained HTML file that opens in the user's browser** — not bare markdown. A markdown brief with relative image paths (`![](hero.png)`) shows broken images the moment it's moved or sent; that's a failed deliverable. HTML with inlined images renders anywhere and is what people actually want to forward.

1. Write the brief content to `/tmp/pitch-prep-<prospect>/demo-brief-<prospect>.md` (markdown, following `brief-template.md`) — the readable source of record.
2. Author the HTML brief: a single `.html` in the same dir that inlines the CSS from `$SKILL_DIR/brief.css` into a `<style>` block, lays out the sections (TL;DR card, a "What we saw" evidence `grid` of `<figure>` screenshots with callouts, numbered `.beats` storyline, highlighted `.wow`, called-out `.stat` proof points), and references the screenshots by **local filename** (same dir).
3. Make it portable and open it — inline every image as base64 (compressed) and auto-open in the browser:
   ```bash
   python3 "$SKILL_DIR/embed_images.py" /tmp/pitch-prep-<prospect>/demo-brief-<prospect>.html
   # → writes demo-brief-<prospect>-portable.html (all images embedded) and opens it
   ```
   (Pass `--no-open` to suppress auto-open.)
4. Confirm the screenshots render sharp (if blurry, you used full-page captures — re-grab viewport shots per Step 3).
5. Light brand touch is fine (override `--accent` in the CSS with a prospect color); a **full branded slide deck is out of scope** (parked — see "does NOT do").

End by offering the obvious next steps: tweak a section, add a competitor teardown, or *"when you're ready, this brief is the input to actually building the live demo"* (the product-specific layer — out of scope here).

## What this skill does NOT do

- **Does not generate or run the actual demo.** It stops at the brief. Building/running a live demo is a product-specific layer (for browser-automation products like Browserbase, e.g. a demo-creation skill). Don't pretend the brief is a working demo.
- **Does not auto-pick the concept.** The 3-concepts → human-picks checkpoint is mandatory.
- **Does not write generic briefs.** If you couldn't find concrete hooks on their site, say so — don't paper over it with vague positioning.
- **Does not invent facts about the prospect.** Every prospect claim is sourced to a URL you actually fetched. No assumed funding, headcount, or features.
- **Does not log into or transact on the prospect's site.** Research is read-only against public surfaces.
- **Does not (yet) generate a branded slide deck / PDF.** The output is an HTML brief with embedded screenshots. A prospect-branded deck (extract their colors/fonts/logo via the browser, theme a deck to match) is a planned optional layer — deliberately kept out of the core path so the universal flow stays simple. Don't auto-build a deck unless asked.

## Tips

- **Crawl before you ideate.** The temptation is to brainstorm concepts from the company name. Resist it — the good concepts only appear *after* you've seen their actual money path.
- The product capability sheet is reusable across prospects for the same seller. If the user runs this repeatedly for the same product, you can reuse Step 2's output and re-do only Step 3+.
- When concepts are close, prefer the one that runs most reliably live — a demo that breaks mid-call is worse than a slightly less flashy one that lands.
- If the user gives deal context (champion role, critical event), weight concepts toward what *that buyer* cares about — an eng champion wants to see it work; a VP wants the business outcome.
- Default product is **not** assumed. Even if the user works at a known company, confirm the product unless they've stated it.
