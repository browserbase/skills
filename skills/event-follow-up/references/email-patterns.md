# Email Patterns — Follow-Up + Sales-Readiness Rubric

This skill exists because generic post-event follow-up emails ("Great meeting you at the event!") get ignored. Every email this skill produces must reference a SPECIFIC finding from research — recent activity, a public talk, a hiring move, a product launch — and tie it to the user's product wedge.

## Contents
- [Sales-Readiness Rubric](#sales-readiness-rubric-4-buckets) — the 4 buckets (HOT / WARM / NURTURE / COLD)
- [Calibrating Sales-Readiness](#calibrating-sales-readiness) — healthy distributions + failure modes
- [Email Structure](#email-structure-4-6-sentences) — the 5-6 sentence skeleton
- [Examples](#example-hot--greg-brockman--openai) — HOT / WARM / NURTURE
- [Subject Line Patterns](#subject-line-patterns)
- [Anti-hallucination rules](#anti-hallucination-rules-for-email-drafting)

## Sales-Readiness Rubric (4 buckets)

Each enriched attendee gets exactly one bucket. The rubric is biased toward NURTURE — most attendees are not ready for a sales conversation tomorrow, and routing every name to sales burns rep time.

### 🔥 HOT — book a meeting this week

ALL of:
- Senior at an ICP-fit company (`icp_fit_score >= 7`): VP / Director / Head of / Cofounder / Chief / Lead
- AND at least ONE buying signal in the last 90 days:
  - Public talk / podcast about a problem the user's product solves
  - Hiring for roles directly relevant to the user's product (job posts mentioning the user's category)
  - Recent funding round, product launch, or expansion announcement
  - Direct mention of the user's product or category on their site, blog, or social
- AND not already an existing customer (per user profile's `existing_customers`)

CTA: "Worth a 20-min call this week? I want to walk you through how X helps with Y."

### 🌡️ WARM — qualify in nurture sequence

EITHER:
- Senior at ICP-fit company with no recent buying signal — they fit the buyer profile but aren't visibly in-market. Drop into a nurture sequence with relevant content.
- Mid-level (Manager / Senior Engineer / Senior PM) at ICP-fit company with a buying signal.

CTA: "Sharing a case study on how a similar team used X — open to a quick chat after you've read it?"

### 🌱 NURTURE — educational content only

EITHER:
- IC (engineer / analyst / individual contributor) at ICP-fit company
- OR mid-level at adjacent (`icp_fit_score 4-6`) company
- OR senior at adjacent company with no buying signal

CTA: "Drop you in the dev newsletter — quarterly tips on X." or "Wrote up a piece on Y, thought you'd find it useful."

### ❄️ COLD — no follow-up email

ANY of:
- Outside ICP entirely (`icp_fit_score < 4`)
- Already an existing customer per the user profile
- Suspected spam / public-mail domain with no company match
- Title is a clear non-buyer / non-influencer at this stage (intern, recruiter, partnerships-only at non-ICP)

For COLD records, write `email_subject: ""` and `email_body: ""` — the skill compiles them into the report so the user knows they were considered, but no email is drafted.

## Calibrating Sales-Readiness

A healthy distribution at a typical SaaS booth:
- HOT: 5-15% of enriched attendees
- WARM: 15-30%
- NURTURE: 35-55%
- COLD: 10-30%

Failure modes to flag back to the user:
- **All HOT (>40%)** — the rubric is too lenient OR the ICP is too narrow (everyone who passed the ICP filter looks senior). Tighten the buying-signal requirement.
- **All COLD (>50%)** — the ICP description is too narrow or the threshold is too high. Lower `--icp-threshold` and re-run.
- **Zero HOT** — either no enriched person had a recent buying signal, or the rubric is being mis-applied. Spot-check 3 random people.

## Email Structure (4-6 sentences)

Every drafted email follows this skeleton:

```
[1 sentence: event reference + their attendance — concrete, NOT "great to meet you"]
[1 sentence: the specific signal you found in research — quote/paraphrase the finding, with confidence]
[1 sentence: the wedge — connect their signal to the user's product]
[1 sentence: short proof point or social proof (existing customer, similar team's outcome, specific feature)]
[1 sentence: CTA matching the sales-readiness bucket]
[Optional 6th sentence: low-pressure off-ramp — "no worries if not the right time"]
```

### Example (HOT — Greg Brockman / OpenAI)

> Subject: ChatGPT Agent + browser infra at Sessions
>
> Greg — caught your Sessions panel on agent reliability and the "agents are bottlenecked on the browser" framing was exactly the conversation we keep having with teams shipping CUA-style products. Browserbase runs the cloud-browser layer that several ChatGPT-Agent-competitor products are built on — managed Chrome, stealth, captcha-solving, session recording. Worth a 20-min walkthrough this week before you scope your next quarter? Happy to send the durability deck ahead of time.

### Example (WARM — mid-level at ICP fit)

> Subject: Quick read on Replit Agent + headless browsers
>
> Adam — saw your team at Sessions and the Replit Agent demo on the Stripe stage was the cleanest "agent that actually ships an app" I've seen all conference. Wrote up a short piece on how teams we work with handle the browser layer when their generated apps need to test against a real Stripe checkout — link below. Open to a 15-min chat next week if any of it lands?

### Example (NURTURE — IC at ICP fit)

> Subject: Browser-infra primer for AI builders
>
> Hey — saw you at Sessions and we share a few mutual builders in the agent space. Pulling together a quarterly digest of what's working in cloud-browser infra for AI agents (latency tricks, captcha patterns, session-replay use cases) — happy to add you. Reply with anything you'd want covered.

## Subject Line Patterns

Subject lines that get opens (verified across SDR sequences):
- `{Specific thing they did} + {your wedge}` — "ChatGPT Agent + browser infra at Sessions"
- `Quick read on {their product} + {your category}` — "Quick read on Replit Agent + headless browsers"
- `{Their company} + {one-line value prop}` — "Ramp + agent receipts: 20-min?"
- Question subjects only when the question is specific and answerable

Avoid:
- "Following up on Sessions" — vague, generic, deletable
- "Did you have a chance to..." — assumes a prior thread that didn't exist
- ALL CAPS, emojis in subject (flagged by enterprise filters)

## Anti-hallucination rules for email drafting

- Every email body MUST quote or paraphrase a SPECIFIC finding (talk title, podcast episode, blog post, GitHub repo, hiring signal, product launch). If no finding exists, fall back to event-context (their attendance + track if known) — never fabricate one.
- NEVER claim the target is an "existing customer" unless their company is in the user profile's `existing_customers` array.
- NEVER reference details from the research that didn't actually appear in `bb search` results — if uncertain, generalize.
- If the user profile's `existing_customers` includes the target's company, draft an EXPANSION email (different framing — congratulations on growth, sharing a new feature, intro to a different team) — NOT a net-new sales pitch.
