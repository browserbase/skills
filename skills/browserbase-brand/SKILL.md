---
name: browserbase-brand
description: Apply Browserbase brand styling to any asset you generate — web pages, slide decks, video, illustrations, code snippets, social graphics, or docs. Use whenever the user asks for something "in Browserbase style / on-brand / for Browserbase" or is generating collateral (marketing site, landing page, OG image, video, deck, blog hero) for Browserbase. Loads the Browserbase color tokens, logo rules, voice, and do/don't list so the output looks like it came from the Browserbase design team rather than a generic AI default.
---

Use this skill any time you are producing a visual or written asset that should read as "from Browserbase." 

## Identity & positioning

Full positioning detail — brand idea, mission, product archetypes, positioning statements, messaging ladder, taglines, and value props — lives in `references/positioning.md`. Read it when writing copy or building brand narratives.

**Quick reference:**
- **Brand idea**: Unlock the Impossible.
- **Tagline**: Give your agents access to the whole web.
- **Category**: Browser infrastructure for AI agents. Not "scraping." Not "RPA."
- Signature color: `#FF4500` Red

When writing copy, position Browserbase as the place that makes ambitious web automation possible. Avoid scraping-era vocabulary.

## Voice & tone

**Goal:** Inspire more people to take on ambitious automation on the web.

### Voice attributes

| Trait | Can be | Should NOT be |
|---|---|---|
| **Open** | Warm, welcoming, curious, approachable | Arrogant, snarky, passive, over-accommodating |
| **Grounded** | Steady, calm, clear, credible | Hype-y, smug, boring, tedious |
| **Insightful** | Perceptive, bold (when making a claim), direct, purposeful | Clever, cryptic, sarcastic, dramatic |

**Open** — language feels welcoming and easy to approach. Make complex topics feel simple.
**Grounded** — steady and trustworthy. Express ambition in a way that feels earned. Not performative.
**Insightful** — clear thinking in complex situations. Helps people understand what's actually happening. Use when explaining the "why," not just the "what."

### Tone

Overall tone: **conversational and confident.**

Tone is not about saying different things — it's choosing the right words for the right context. Adjust based on: who you're talking to (founder, developer, newcomer), what (big idea, technical detail, sensitive issue), and where (website, social, Slack).

**Tone 2x2 (Energetic/Composed × Functional/Expressive):**

| | Functional | Expressive |
|---|---|---|
| **Energetic** | Onboarding, next steps, PLG moments. Clear + encouraging, direct + enthusiastic. *"Run this script to create your first session"* | Social, events, launches. Upbeat, lightly playful, confident without hype. *"We taught the browser a new trick"* |
| **Composed** | Docs, error messages, technical accuracy-first contexts (default). Calm, neutral, focused. *"Requires an active authentication token"* | Most brand writing, company narrative, website hero. Assured, big ideas in plain language. *"Build beyond the web's limits"* |

### Sentence-level rules

- **Sentence case everywhere.** Headings, buttons, nav, OG titles, slide titles, video captions. Never Title Case. Never ALL CAPS except intentional display moments.
- **Developer-forward.** Say what it does. Drop adjectives like "powerful," "seamless," "revolutionary," "cutting-edge," "robust."
- **Short, declarative sentences.** Technical precision > cleverness.
- **"Agents" is the subject.** Not "users," not "bots," not "scripts."
- **No emoji in product copy.** Fine in casual Slack/social, never in UI, docs, decks, or generated pages.
- **Write to both outcomes and concrete reality.** Pair ambition with evidence. Stays persuasive without hype.
- **Clarity is leadership.** Explain things simply. Remove friction. Say it out loud and check for anything that makes you stop and re-read.

## Colors

> "Our color palette draws inspiration from the bold, optimistic colors of the 1960s — an era of revolutionary thinking — and reimagines them through a modern, digitized lens. Browserbase Red serves as the primary tone to anchor the system."

### Primary palette

Use these first and most often. They make up the vast majority of visual language.

| Token | Hex | Use |
|---|---|---|
| `--bb-red` | `#FF4500` | Browserbase signature. CTAs, key highlights, logomark. One per viewport. |
| `--bb-black` | `#000000` | Primary text on light, primary background in dark mode. |
| `--bb-white` | `#FFFFFF` | Primary background in light mode, text on dark/red. |
| `--bb-grey` | `#C5D3E8` | Core grey. Interface/layout backgrounds, charts, diagrams. |

### Secondary palette

Supporting actors — they enhance the scene but never replace the lead. Use for small accents, highlights, expressive moments. Never dominant surfaces or large fields.

| Token | Hex | Association |
|---|---|---|
| `--bb-magenta` | `#FF00FF` | Expressive accent |
| `--bb-pink` | `#FFC0CB` | Supporting accent |

### Grey scale

Use for interface/layout backgrounds, charts, diagrams.

| Token | Hex | Note |
|---|---|---|
| `--bb-grey-100` | `#F8FAFC` | |
| `--bb-grey-200` | `#F0F4F8` | |
| `--bb-grey-300` | `#E1E9F2` | |
| `--bb-grey-400` | `#D3DEED` | |
| `--bb-grey-500` | `#C5D3E8` | Core — same as `--bb-grey` |
| `--bb-grey-600` | `#98AFD3` | |
| `--bb-grey-700` | `#7591C0` | |
| `--bb-grey-800` | `#5A78AF` | |
| `--bb-grey-900` | `#46639F` | |

### Color rules

- Primary colors should dominate. Secondary colors are accents only.
- `#FF4500` is not a dominant field. One red element per viewport is almost always right; two is the ceiling.
- White text looks best on top of red. Black on red also passes AA at 14pt+.
- Pair warm and cool colors for a balanced palette. Avoid compositions that are only warm or only cool.
- Avoid "pastel-y" color pairings.
- Off-black (`#111`, `#1a1a1a`) is not a brand color — use true black.

Full CSS tokens: `references/brand-tokens.css`. JSON tokens: `references/brand-tokens.json`.

## Logos

Reference files from `assets/logos/` by relative path — do not hotlink Notion S3 URLs, they are signed and rotate.

> **NEVER modify the SVG files in `assets/logos/`.** They are provided by the design team and must be used as-is. Do not edit paths, colors, dimensions, or any attributes inside these files. If a variant you need doesn't exist, ask the design team — do not improvise a modified version.


| Lockup | File | When to use |
|---|---|---|
| **Logotype** — color | `assets/logos/browserbase-logo-color.svg` | Default lockup: nav, footer, OG images, slide title masters, email headers on light bg. |
| **Logotype** — white | `assets/logos/Browserbase-logo-white.svg` | On red backgrounds. |
| **Logomark** — color | `assets/logos/Browserbase-logomark-color.svg` | Favicons, avatars, square slots under ~64px, app icons. |
| **Logomark** — white | `assets/logos/Browserbase-logomark-white.svg` | Same, on red backgrounds. |
| **Mega-B** | `assets/logos/Browserbase-mega.svg` | Hero moments, large decorative placements, merch. Treat as illustration, not as a logo instance. |

Pick by background:

- Light background → color (default)
- Red background → all-white (never color-on-color)

**Clear space:** keep at least the width of the "B" in empty space around any lockup.
**Minimum size:** logomark ≥ 16px; logotype ≥ 96px wide. Below that, switch to logomark.
**Logo anatomy:** The symbol ("B" in squared container) communicates authority and industrial strength. The logotype is set in **PP Supply** — technical, solid, engineered character. Together they form an industrial system signaling durability, performance, and trust.

**Preferred logo contexts:**
- Full logo (symbol + logotype): website, video intros/outros, campaign key art, primary brand moments, first-touch
- Logotype alone: next to partner logos, horizontal co-branding, legibility-first contexts
- Symbol alone: avatars, app icons, product surfaces, brand-aware audiences, "by Browserbase" endorsements

**Alignment:** Default is left-aligned. Centered is acceptable for symbol and logotype only (best at small sizes). Top-right is sparingly acceptable for expressive layouts. Never right-align.

**Never:** stretch, skew, recolor outside official variants, drop-shadow, outline, gradient-fill, right-align.

## People

| File | Description |
|---|---|
| `assets/headshots/Paul-Headshot.jpg` | Paul Klein IV — Founder & CEO |

## Typography

Font files are checked in at `assets/Fonts/` (Grilli Type EULA applies — do not redistribute).

### Font roles

| Role | Font | Weight |
|---|---|---|
| **Headlines** | GT Planar | Medium |
| **Subheads** | GT Standard Mono | Regular |
| **Body copy** | Plain | Regular |
| **Buttons / UI labels** | GT Standard Mono | Regular |
| **Code / mono** | GT Standard Mono | Regular or Bold |

**Google Fonts fallbacks** (when licensed fonts unavailable): Work Sans Semibold (headlines), IBM Plex Sans Regular (body), IBM Plex Mono Regular (mono).

### Type scale

**Headlines** (GT Planar Medium, sentence case):

| Style | Size / Leading | Tracking |
|---|---|---|
| H1 | 112/112 | -3% |
| H2 | 88/88 | -3% |
| H3 | 64/64 | -2% |
| H4 | 48/56 | -2% |
| H5 | 36/40 | -2% |
| H6 | 24/32 | -1.5% |
| H7 | 20/24 | -1.5% |

**Body** (Plain — P1 Regular weight 400, P2–P4 Light weight 300):

| Style | Size / Leading | Tracking |
|---|---|---|
| Body P1 | 32/48 | 0 |
| Body P2 | 24/36 | 0 |
| Body P3 | 16/24 | +1px |
| Body P4 | 12/20 | +4px |

**Mono / subheads** (GT Standard Mono Regular, weight 400):

| Style | Size / Leading | Tracking |
|---|---|---|
| Mono P1 | 40/48 | -1px |
| Mono P2 | 32/40 | -1px |
| Mono P3 | 24/30 | -1px |
| Mono Eyebrow | 16/20 | -2px |
| Mono Eyebrow Caps | 14/18 | +5px |
| Mono Footnote | 12/18 | +6px |

### Typography rules

- Headlines use GT Planar Medium.
- Enable OpenType features `'ss05', 'ss14', 'ss03', 'dlig'` on GT Planar for intended letterform variants.
- GT Planar Italic and Retalic styles are for **expressive moments only** (stickers, merch, social graphics) — not for website, decks, or functional UI.
- Hierarchy must be obvious — headline, subhead, body should be clearly distinct in size and weight.
- Never allow ascenders and descenders to touch or create visual tension.
- Avoid tight tracking on body text.
- Never use Inter, Roboto, or Arial as a primary face.

## Messaging framework

See `references/positioning.md` for the full 4-level messaging ladder, all brand taglines, and value props.

## Imagery

Browserbase uses a **proprietary image tool** that processes photos into a bold, flat, posterized style — not pixel art, not halftone, not dithering. The result is bold, flat, graphic imagery made from uniform squares and circles on a grid.

**Style:**
- Posterized — no smooth gradients, flat color bands
- Bright, high-contrast source images work best. Avoid dark, low-contrast, or muddy source photos.
- Simple, clean graphic outlines. Avoid complex or detailed silhouettes.
- Uses brand palette colors (not photographic color)

**Two image styles:**
- **Full color** — uses brand palette colors, for social, hero images, merch, swag
- **Silhouette** — 2-color (B&W or limited palette), for icons, social, empty states, swag

**Image themes:** Epic Nature, Aggressive Nature, Nostalgic Tech — bold, powerful, high-contrast.

**Source image rules:** Must be licensed — use Unsplash, AI-generated, purchased stock, or photos you own. Transforming an image through the tool does not transfer rights.

**For generated assets:** Describe the imagery as "bold, flat, posterized photos with uniform geometric shapes in brand palette colors — not photographic gradients, not pixel art." The specific tool output cannot be replicated by agents; use the style description to guide art direction.

## Motion (Remotion / video)

The brand's motion language comes from three sources: generative imagery, grid/type dynamics, and logo animation.

### Logo / B mark motion

The B symbol is the richest motion element:
- **3D box** — the square container becomes a 3D cube, rotating or revealing
- **Mask/reveal** — the B silhouette acts as a wipe mask for scene transitions
- **Pixelation intro** — the B animates in through a pixel-dissolve/stamp effect
- **Stamped from metal** — the mark enters with weight, as if die-stamped, no bounce

The logotype wordmark can be built letter-by-letter or revealed through a horizontal wipe.

### Grid & type motion

- Grid lines and squares can animate as **looping backgrounds** or **scene transitions** — they expand, contract, or scan across the frame
- Use the grid as a structural reveal: type boxes (3-stacked outlines — composition width, type width, type height) can animate in sequentially
- Headlines in GT Planar can sweep from **regular → italic → retalic** for expressive transitions; reserve this for punchy moments, not sustained reading
- Eyebrow labels (GT Standard Mono Caps) can typewrite in character by character

### Generative / imagery motion

- The posterized image style can be **animated directly** — images can be processed as short videos through the imagery tool, preserving the posterized look in motion
- Custom geometric patterns (uniform squares/circles on grid) can scroll, pulse, or tile as ambient backgrounds
- Two-color (B&W) mode of the imagery style works well for looping texture overlays

### Video composition rules

- **Background default**: white — not grey, not a color field. Use black only when explicitly requested.
- **Accent**: one red (`#FF4500`) element per scene.
- **Text**: sentence case always. Display sizes use GT Planar Medium.
- **Safe zones**: leave generous margins — the brand reads as confident, not packed. Match the grid system: content lives inside clear structural zones.
- **Outro / end card**: Mega-B on black is the canonical video closer. The B mark can animate as stamped/pixelated entrance.
- **No gradients** — backgrounds are flat. No glow effects, no glass morphism, no motion blur on text.
- **Timing feel**: measured and confident. Not snappy/bouncy. Easing should be ease-out or linear, not spring physics.


## Grids & shapes

Grid elements are "creativity within constraints" — structural, intelligent, never chaotic.

**Elements:** squares, rectangles, linework (lines, rectangles, squares, occasional circles/pills).

**Colors on grids:** White, grey (`#C5D3E8`), and red most often. Secondary palette colors should be very subtle and understated — too much color = chaos.

**Three uses:**
1. **Highlight headlines** — 3-stacked boxes (composition outline + type-width box + type-height box) draw the eye to a headline
2. **Ground the composition** — create distinct "zones" that anchor content
3. **Pattern/texture** — fill empty areas with understated geometric rhythm

**Rules:**
- Grid should feel intelligent, understated, mathematical. Too much = chaos.
- Don't put bright colors behind type — legibility first.
- Use more padding between text and backing shapes when the background is busy.
- The grid should never compete with the primary message.

## Charts & diagrams

**Style:** Flat, graphic, technical — not illustrative. Design-forward, not chart-library default.

**Primaries to use:** simple geometric shapes, brand logo elements, linework/grids, brand colors as data categories, brand imagery (low pixel density) as texture.

**Data visualization:**
- **Waffle/dot grid charts** over pie charts — uniform squares or circles on a grid, each colored by brand palette colors
- **Bar charts** — geometric shapes, linework, GT Planar/Mono type labels, brand color fills
- **Large stat callouts** — single number in GT Planar, small mono label below, no decorative chart wrapper needed
- Use brand palette for data categories — avoid non-brand colors in chart series
- Keep it simple and easy to understand at a glance; flat and graphic, not illustrative

## Layout & composition

- Generous negative space. The brand reads as confident and technical, not dense.
- Left-aligned text is the default. Center-alignment only for a single hero line or centered type treatment.
- Thin borders (`1px` or `0.5px` at 2x) over heavy separators.
- Corners: sharp (0px radius) by default. Pills (`999px`, `--bb-radius-pill`) for labels and tags only.
- Imagery is posterized brand-palette photos — not stock photography, not abstract AI swirls, not purple nebula gradients.

## Do / Don't quick reference

**Do**
- Use `#FF4500` as a single accent against black or white.
- Use sentence case everywhere.
- Keep typography tight and confident; generous whitespace.
- Frame copy around agents and the web.
- Drop the wordmark in standard positions (top-left nav, footer).

**Don't**
- Don't use purple gradients, neon, pastels, or multi-color rainbows.
- Don't use Title Case headings or ALL CAPS body.
- Don't stretch, recolor, or modify the logo SVG files in any way.
- Don't write marketing-speak ("powerful," "seamless," "next-gen").
- Don't put red as a full-page background under body copy.
- Don't introduce tertiary brand colors.

## How to apply this skill

When generating an asset:

1. **Read the brand tokens.** Before writing any CSS or code, open `references/brand-tokens.css` and paste the `:root` block into the target project (or use the JSON equivalent for non-CSS tooling).
2. **Pick a mode.** Default is **light** (`#FFFFFF` background, `#000000` text). Only use dark (`#000000` background, `#FFFFFF` text) when the user explicitly asks for it. State which mode you chose in your first reply to the user.
3. **Place the wordmark.** Nav or header gets the logotype in the variant matching the mode.
4. **Use red sparingly.** One `#FF4500` element per viewport is almost always right — a CTA, one key highlight, or a decorative Mega-B. Secondary palette colors (product signatures, grey scale) are fine as supporting elements but should never compete with red for attention.
5. **Write in sentence case with developer-forward voice.** Run a quick pass to strip marketing adjectives.
6. **Verify.** Before reporting the asset as complete, check: sentence case? One-accent red? Correct logo variant for the background? No banned colors or fonts?