---
name: demo-video
description: Build polished product launch demo videos using Remotion. Covers storytelling structure, visual design, animation patterns, audio production, UI mocking, and common pitfalls. Use when creating a tech product demo video for Twitter/LinkedIn launch.
compatibility: "Requires Node.js 18+, Remotion, ffmpeg. Run from the video project directory."
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  openclaw:
    homepage: https://github.com/browserbase/skills
---

# Demo Video — Remotion Launch Video Skill

Build a polished 30–65 second product launch video with Remotion. Covers the full pipeline from storytelling to render.

## Setup

```bash
mkdir my-demo && cd my-demo
npm init -y
npm install remotion @remotion/cli react react-dom
npm install -D typescript @types/react @types/react-dom
mkdir -p src/scenes src/ui src/components public/audio/sfx out
```

`remotion.config.ts`:
```ts
import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("png");   // lossless — never use jpeg
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
```

`package.json` scripts:
```json
"dev":       "./node_modules/.bin/remotion studio src/Root.tsx",
"render":    "./node_modules/.bin/remotion render src/Root.tsx MyComp out/video.mp4 --image-format png --crf 14 --codec h264",
"render-hq": "./node_modules/.bin/remotion render src/Root.tsx MyComp out/video-hq.mp4 --image-format png --crf 8 --codec h264"
```

Always use `npm run render-hq` for the final Twitter upload — Twitter recompresses so give it the best source.

---

## Storytelling Structure (IDEA ENGINE)

Every great product demo follows this arc. Each scene = ONE idea only.

```
1. HOOK         — Punchy, visual, attention-grabbing. Show the problem, don't describe it.
2. REFRAME      — Challenge an assumption. "We've been solving the wrong problem."
3. SHIFT        — Introduce the capability. Don't name the product yet.
4. CONCRETIZE   — 1–2 real examples. Grounded, specific, not abstract claims.
5. IMPLICATION  — What does this mean for how people work?
6. RESOLUTION   — Clean, inevitable, not salesy. CTA feels earned.
```

**Rules:**
- Start VISUAL — open on the product failing/working, not a title card
- No filler, no hype words ("revolutionary", "introducing", "we built")
- Language: precise, calm, confident
- 1.5–3 seconds per scene
- Short sentences only

**Hook patterns that work:**
```
"Browser automation is broken."     ← problem statement
"Every run starts from scratch."    ← specificity
"The agent doesn't know what went wrong."  ← empathy
```

Use orange pill boxes on key words (Browserbase style):
```tsx
<span style={{ background: "#F03603", color: "white", padding: "2px 14px 4px", borderRadius: 4 }}>
  broken.
</span>
```

---

## Remotion Fundamentals

### The golden rules

**1. ALWAYS clamp interpolations — both sides**
```tsx
// ❌ WRONG — negative values at early frames cause slice/string bugs
const x = interpolate(frame, [30, 90], [0, 100]);

// ✅ CORRECT
const x = Math.max(0, interpolate(frame, [30, 90], [0, 100], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
}));
```

Without `extrapolateLeft: "clamp"`, at frame < startFrame, interpolate returns negative numbers. `string.slice(0, -5)` shows almost the full string. `array.slice(0, -3)` shows backwards content. This causes the "text appears then rewinds" bug.

**2. Always use `staticFile()` for audio/images**
```tsx
// ❌ WRONG — silent in studio
<Audio src="audio/bg.mp3" />

// ✅ CORRECT
import { staticFile } from "remotion";
<Audio src={staticFile("audio/bg.mp3")} />
```

**3. Audio Sequences need durationInFrames ≥ 30**
```tsx
// ❌ WRONG — crashes with "canvas width is zero" error
<Sequence from={frame} durationInFrames={2}>
  <Audio src={staticFile("click.mp3")} />
</Sequence>

// ✅ CORRECT
<Sequence from={frame} durationInFrames={30}>
  <Audio src={staticFile("click.mp3")} />
</Sequence>
```

**4. Scene overlaps for cross-fades**
```tsx
const OVERLAP = 16; // frames of cross-fade

<Sequence from={SCENES.act1} durationInFrames={SCENES.act2 - SCENES.act1 + OVERLAP}>
  <Act1 />
</Sequence>
<Sequence from={SCENES.act2} durationInFrames={SCENES.act3 - SCENES.act2 + OVERLAP}>
  <Act2 />
</Sequence>
```

Use overlap = 0 for clean cuts (more dramatic).

**5. Render from CLI, not Studio button**
The Studio render button ignores `remotion.config.ts` flags. Always use `npm run render-hq`.

---

## Visual Design — Browserbase Brand

```ts
const C = {
  bg:     "#F9F6F4",   // warm cream
  text:   "#100D0D",   // near-black
  orange: "#F03603",   // Browserbase orange — primary accent
  blue:   "#4DA9E4",   // secondary
  green:  "#4A9A32",
  red:    "#CC3A2E",
  sans:   "'Helvetica Neue', Arial, sans-serif",
  mono:   "'Menlo', 'Monaco', monospace",
};
```

**Typography rules:**
- Use bold sans-serif (`fontWeight: 800`) for all headlines — not serif
- Orange pill boxes on 1–2 key words per slide
- Monospace only for code/terminal content
- Captions: place NEAR the action, never fixed at page bottom

**Layout patterns:**
- Two-panel (browser left + code/editor right) — best for showing learning
- 50/50 split for before/after comparisons (use `width: "50%"` not flex ratios)
- Floating panels spring in from below with slight bounce

**Spring animation template:**
```tsx
import { spring, useVideoConfig } from "remotion";
const { fps } = useVideoConfig();
const s = spring({ frame, fps, config: { damping: 16, stiffness: 100 }, durationInFrames: 40 });

<div style={{
  opacity: s,
  transform: `translateY(${interpolate(s, [0,1], [30,0])}px)`,
}}>
```

---

## Building Accurate UI Mocks

The biggest quality difference is whether the UI mock matches the real product.

**Step 1: Extract reference frames**
```bash
ffmpeg -i reference_video.mp4 -vf "fps=2" /tmp/frames/frame_%04d.png
```
Then Read each frame image to study the exact layout, colors, typography.

**Step 2: Match colors exactly**
- Google Flights dark: `#202124` bg, `#3c4043` border, `#e8eaed` text, `#8ab4f8` blue
- Claude Code CLI: `#0D0D0D` bg, `#F03603` orange accents, `> ` prompt in green

**Step 3: Add realistic interaction elements**
- OS-style cursor (arrow pointer, not hand for general browsing)
- Cursor paths: use keyframe arrays with easing between points
- Error states: bottom-centered banner, human-readable language
- Never show technical error codes as the main message — translate: "Element @0-847 stale" → "The filter menu disappeared — the agent doesn't know why"

**Cursor movement template:**
```tsx
const CURSOR_PATH = [
  { f: 0,  x: 200, y: 100 },
  { f: 20, x: 350, y: 200 },
  ...
];

function lerp(a: number, b: number, t: number) {
  const e = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  return a + (b-a)*e;
}

function getCursor(frame: number) {
  for (let i = 0; i < CURSOR_PATH.length - 1; i++) {
    const cur = CURSOR_PATH[i], nxt = CURSOR_PATH[i+1];
    if (frame >= cur.f && frame < nxt.f) {
      const t = (frame - cur.f) / (nxt.f - cur.f);
      return { x: lerp(cur.x, nxt.x, t), y: lerp(cur.y, nxt.y, t) };
    }
  }
  return { x: CURSOR_PATH.at(-1)!.x, y: CURSOR_PATH.at(-1)!.y };
}
```

---

## Audio

### Background music
- Find royalty-free instrumental with beats on Pixabay (search "ambient tech minimal", "product launch commercial")
- Must be: beats-driven, no vocals, 60–90 seconds
- Copy to `public/audio/bg.mp3`
- Volume: 0.25–0.45 (underscore, not foreground)

**Vocal removal from existing track (if needed):**
```bash
# Side-channel extraction removes center-panned vocals, keeps stereo instruments/beats
ffmpeg -i input.mp3 \
  -af "pan=stereo|c0=0.707*c0-0.707*c1|c1=0.707*c1-0.707*c0,volume=3.5" \
  output.mp3
```

### Sound effects with ffmpeg

**Mouse click:**
```bash
ffmpeg -f lavfi \
  -i "aevalsrc='0.6*sin(2*PI*80*t)*exp(-t*60)+0.3*sin(2*PI*1200*t)*exp(-t*180)':s=44100:d=0.12:c=stereo" \
  -af "afade=in:st=0:d=0.001,afade=out:st=0.09:d=0.03,volume=2.0" \
  public/audio/sfx/click.mp3 -y
```

**Whoosh transition:**
```bash
ffmpeg -f lavfi -i "anoisesrc=d=0.6:c=white:a=0.5" \
  -af "bandpass=f=600:width_type=o:w=2,afade=in:st=0:d=0.05,afade=out:st=0.4:d=0.2,aecho=0.3:0.2:60:0.4,volume=1.5" \
  public/audio/sfx/whoosh.mp3 -y
```

### SFX layering in Root.tsx
```tsx
// Clicks during browser interactions
const CLICKS = [
  { frame: 148, vol: 0.65 },
  { frame: 200, vol: 0.60 },
  // ...
];

// Swoosh at every scene transition
const SWOOSHES = [
  { frame: SCENES.act2, vol: 0.55 },
  { frame: SCENES.act3, vol: 0.50 },
  // ...
];

// In component:
{CLICKS.map(({ frame, vol }, i) => (
  <Sequence key={`click-${i}`} from={frame} durationInFrames={30}>
    <Audio src={staticFile("audio/sfx/click.mp3")} volume={vol} />
  </Sequence>
))}
```

**What works:** Mouse clicks at every cursor action, whooshes at transitions
**What doesn't:** Typing sounds (too subtle), synthesized chords/chimes (sound childish)

---

## Content Authenticity

**Show real failures, not made-up ones.**

Before building the video, actually run the tool and observe:
- What specific errors occur?
- At which step does it get stuck?
- What's the exact wording of the failure?

Use those real failure descriptions verbatim in the video. Viewers can tell when errors are authentic vs invented.

**Ground benchmarks in reality:**
- Run the baseline (without skill): count actual turns, measure actual cost
- Run with skill: same metrics
- Use directional comparisons (fast/slow, cheap/expensive bars) rather than exact numbers in marketing videos

**Translate technical errors to human language:**
```
❌ "Element @0-847 stale — re-snapping"
✅ "Can't change the departure time — the slider isn't responding"

❌ "ArrowRight attempt 3/3 — value unchanged"
✅ "Pressing the arrow key but the time isn't moving"
```

---

## Common Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| Text appears then rewinds | `interpolate` without `extrapolateLeft: "clamp"` | Add both clamps + `Math.max(0, ...)` |
| Audio silent in Studio | String path instead of `staticFile()` | `src={staticFile("audio/bg.mp3")}` |
| Canvas width crash on audio | `durationInFrames` < 30 on Audio Sequence | Set `durationInFrames={30}` minimum |
| Blurry text in render | `setVideoImageFormat("jpeg")` | Switch to `"png"` |
| `setQuality is not a function` | API renamed | Use `setJpegQuality()` |
| Scene "leaking" into next | Sequence duration too long + overlapping visuals | Add proper fadeOut before sequence ends |
| Caption not noticed | Fixed at `bottom: 48px` | Place near the action being shown |

---

## Render Quality Cheat Sheet

```bash
# Draft preview (fast)
remotion render ... --crf 28

# Normal quality
remotion render ... --image-format png --crf 14 --codec h264

# Twitter/LinkedIn upload (master quality)
remotion render ... --image-format png --crf 8 --codec h264
```

CRF guide: 0 = lossless, 8 = near-lossless, 14 = excellent, 23 = default (too low for product demos)

---

## Reference Videos

Before building, extract and study competitor launch videos:
```bash
ffmpeg -i reference.mp4 -vf "fps=2" /tmp/frames/frame_%04d.png
# Then: Read each frame file to analyze design patterns
```

Anthropic's style: warm beige bg, ambient no-beat music, UI panels float in from edges, single serif statement per slide, product name reveals at end.

Browserbase's style: warm cream, bold sans-serif, orange pill highlights on key words, isometric 3D illustrations, orange primary CTA.
