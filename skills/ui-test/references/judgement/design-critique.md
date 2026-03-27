# Design Critique

A systematic interface critique skill based on Josh Puckett's methodology from Interface Craft. Analyzes UI screenshots or component code and delivers specific, actionable feedback organized by visual design, interface design, interaction consistency, and user context.

---

## When to Use

Trigger on: "critique", "review", "feedback", "audit", "what's wrong", "improve", "polish", "refine", "redesign", "analyze this UI", "look at this", or when the user pastes a screenshot/image for evaluation.

---

## Input Modes

### 1. Image / Screenshot (Primary)
The user pastes or attaches a screenshot. Read the image with the Read tool, then critique what you see.

### 2. File Path (Secondary)
The user provides a component file path. Read the file, mentally render the layout from the JSX/TSX, and critique the structural and stylistic decisions in the code. Note: you cannot see the rendered output, so focus on what's inferrable — layout structure, spacing patterns, color choices, typography, hierarchy, component organization, and interaction patterns.

### 3. Live URL (Tertiary)
The user provides a URL. Use WebFetch to retrieve the page content, then critique based on the markup and any screenshots the user provides.

---

## Critique Methodology

Follow this sequence. Do NOT skip steps or merge them. Each section should feel like its own focused lens.

### Step 0: Context

Before critiquing, briefly establish:
- **What is this?** (app type, screen purpose, target user)
- **What emotional context surrounds this task?** (stressful? casual? high-stakes? routine?)

This matters. A divorce filing app demands different care than a podcast player. Name the context so the critique respects it.

### Step 1: First Impressions

Spend one paragraph on gut reaction. What stands out? What feels off? What's the overall impression? Be honest and direct — not tentative.

This is the "noticing" step. The skill of seeing what's actually in front of you, not what you expect to see.

### Step 2: Visual Design

Audit these specific dimensions:

| Dimension | What to Look For |
| --- | --- |
| **Color intentionality** | Is every color used with purpose? Or are colors applied as decoration without meaning? Look for: too many background colors, competing accents, colors that don't establish hierarchy. |
| **Typographic hierarchy** | Is there a clear scale from most important to least? Count the distinct sizes/weights. Are headlines distinguished from body from labels? Is there unnecessary repetition of type styles? |
| **Shadow & stroke quality** | Are shadows crisp or muddy? Are strokes too prominent, competing with content? Do outlines/borders add structure or noise? |
| **Visual weight vs. importance** | Do the visually heaviest elements match what's semantically most important? Or do decorative elements steal attention from primary actions? |
| **Spacing & alignment** | Is spacing consistent? Are elements aligned to a clear grid? Is there excess padding pushing content away from where it should be? |
| **Icon consistency** | Are icons from the same family? Same weight/stroke width? Same optical size? Or is it a mix of styles? |

For each issue found, use this structure:
> **[Issue name]** — [Specific factual observation]. [Impact on user or experience]. [What it could be instead.]

Be precise. Count things. Quote text. Name colors. Measure relative sizes. "There are four distinct background colors competing for attention" is better than "too many colors."

### Step 3: Interface Design

Audit these dimensions:

| Dimension | What to Look For |
| --- | --- |
| **Focusing mechanism** | Is it clear where the user should look first? Is there a visual entry point? Or does everything compete for attention equally? |
| **Progressive disclosure** | Is complexity revealed gradually, or is everything dumped on the user at once? Are there 40 things on screen when 5 would suffice? |
| **Information density** | Is the density appropriate for the context? Data dashboards can be dense; onboarding should not be. |
| **Expectation setting** | Does the user know what will happen next? Is progress communicated? Is scope clear? |
| **Feedback & reward** | Does the interface acknowledge user actions? Are completed items celebrated or just checked off? Is there a sense of forward momentum? |
| **Redundancy** | Are labels, titles, or descriptions repeating information the user already knows? Can anything be removed without losing meaning? |

Frame issues as missed opportunities:
> "We're missing an opportunity to [reward progress / reduce cognitive load / set expectations / etc.]"

### Step 4: Consistency & Conventions

| Dimension | What to Look For |
| --- | --- |
| **Pattern consistency** | Are similar actions handled the same way throughout? Or do interaction patterns shift without reason? |
| **Platform conventions** | Does the design follow established platform patterns (iOS, Android, web)? Deviations should be intentional improvements, not accidents. |
| **Component reuse** | Are there elements that look like they should be the same component but aren't? Inconsistent card styles, button treatments, list items? |
| **Visual language cohesion** | Does the interface feel like one designer made it? Or does it feel assembled from different kits? |

### Step 5: User Context

This is where empathy meets analysis:

- **How does this design make the user feel?** Name the emotion. "Overwhelmed," "confused," "unsupported," "rushed."
- **What is the user's likely state of mind?** Anxious? Focused? Browsing casually? Under time pressure?
- **Does the interface respect that state?** Or does it add unnecessary cognitive burden?
- **What would "uncommon care" look like here?** What would surprise the user with thoughtfulness?

---

## Output Format

Structure the critique as:

```
## Context
[1-2 sentences on what this is and who it's for]

## First Impressions
[1 paragraph, direct and honest]

## Visual Design
[Each issue as: **Issue Name** — observation. Impact. Opportunity.]

## Interface Design
[Each issue framed as missed opportunities]

## Consistency & Conventions
[Pattern and convention issues]

## User Context
[Empathy-driven observations]

## Top Opportunities
[Ranked list of the 3-5 highest-impact changes, each in one sentence]
```

---

## Voice Rules

Follow these strictly. They define the critique style.

### BE:
- **Specific** — "There are six columns of data per row" not "there's a lot of data"
- **Decisive** — "This is overwhelming" not "this might feel overwhelming"
- **Factual first** — State what you see before judging it
- **Impact-aware** — Always connect the observation to how it affects the user
- **Constructive** — Every problem gets paired with an opportunity or direction
- **Quantitative** — Count elements, name colors, measure relative sizes

### DO NOT:
- **Hedge** — No "maybe," "perhaps," "it could be argued that"
- **Apologize** — No "unfortunately" or "sadly"
- **Be vague** — No "the design feels off" without saying exactly what and why
- **Prescribe without reasoning** — Never say "change X to Y" without explaining the why
- **Add praise padding** — Don't sandwich criticism with empty compliments. If something works well, say so specifically. But don't manufacture positivity.
- **Use jargon without explanation** — "Progressive disclosure" is fine. "The affordance signifiers lack semiotic clarity" is not.

### Tone Calibration
The voice is a senior designer reviewing work with a junior designer they respect. Direct, analytical, and honest — but rooted in wanting the work to be great. No cruelty, no condescension, but also no hand-holding. The goal is to make the designer *see* what you see.

---

## Severity Guide

Not all issues are equal. When listing issues, implicitly order by impact:

1. **Structural** — Problems with information architecture, missing functionality, wrong mental model. These change what the interface *is*.
2. **Behavioral** — Problems with how the interface responds, flows, or communicates. These change how the interface *feels*.
3. **Visual** — Problems with color, type, spacing, shadows. These change how the interface *looks*.

A structural issue (wrong mental model for a divorce app) matters more than a visual one (shadow is slightly muddy). Prioritize accordingly.

---

## Frameworks to Reference

These are the conceptual tools behind the critique. You don't need to name them explicitly, but they should inform your analysis:

### Noticing
The foundation. Most people glance; good designers see. Count the elements. Name the colors. Measure the spacing. The specificity of your observation is the quality of your critique.

### Industry Standards
Every popular app in a category sets an invisible bar. Users carry those expectations into every new app. A notes app is compared to Apple Notes, Bear, Notion. A dashboard is compared to Stripe, Linear, Vercel. If the design falls below the bar users already carry, it feels amateur — even if the user can't articulate why.

Ask: "What would [best-in-class app in this category] do here?"

### Facets of Quality
Quality isn't one thing. It's a collection of attributes. For any given interface, identify which 3-5 attributes matter most. Not every app needs to be "playful" — but every app needs to be clear about what it values and execute on those values consistently.

### Uncommon Care
The difference between good and great is often invisible to people who haven't seen great. Look for moments where the designer could have gone further — micro-interactions, empty states, error messages, transitions, loading states, edge cases. These are where "uncommon care" lives.

### Separation of Concerns
Visual design, interface design, and interaction design are different skills solving different problems. A beautiful interface can be unusable. A usable interface can be ugly. Critique each dimension on its own terms before synthesizing.

---

## Examples of Good Critique Language

**Visual:**
> **Muddy shadows** — The card shadows use a large blur radius with low opacity, creating a hazy, unfocused look rather than crisp depth. This makes the cards feel like they're floating in fog rather than sitting on a surface. Tighter, more directional shadows would give the layout a cleaner sense of elevation.

**Interface:**
> **No focusing mechanism** — All four content areas compete equally for attention. There's no visual entry point — no element says "start here." The user's eye bounces between the sidebar, the header stats, the chart, and the table with no clear priority. A stronger size or weight differential on the primary content area would give the layout a clear narrative.

**User context:**
> **Demoralizing progress display** — Showing "10 / 47 tasks complete" immediately communicates that 37 tasks remain. For a process that takes weeks and involves one of the most stressful experiences in a person's life, this is demoralizing. "Complete Phase 1 of 4" is psychologically very different — it frames the same progress as achievable milestones rather than an endless checklist.

**Opportunity:**
> We're missing a huge opportunity to reward progress. Completed steps could collapse or fade, making the remaining work feel smaller — not larger — as the user advances.
