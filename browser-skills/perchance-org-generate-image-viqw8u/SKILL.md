---
name: perchance-org-generate-image-viqw8u
title: Perchance AI Image Generation
description: >-
  Generate AI images from a text prompt on Perchance's free no-signup
  text-to-image generator, apply style/shape/batch options, wait for the batch,
  and extract per-image metadata (expanded prompt, guidance scale, seed) and
  inline image bytes; optionally save the best to the private gallery.
website: perchance.org
category: image-generation
tags:
  - image-generation
  - ai-art
  - text-to-image
  - perchance
  - bulk
  - creative
source: 'browserbase: agent-runtime 2026-06-30'
updated: '2026-06-30'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No documented public REST API or query-string deep-link triggers
      generation — the generator is an in-browser text-to-image-plugin running
      inside nested iframes, so driving the embedded UI is the only viable path.
verified: true
proxies: true
---
# Generate Images on Perchance AI Text-To-Image

## Purpose
Drive Perchance's free, no-signup AI Text-To-Image generator to produce images from a text prompt, apply the available style and rendering options, wait for the batch to finish, and extract each result's metadata (expanded prompt, guidance scale, per-image seed) and inline image bytes. Optionally save the best result(s) to the generator's private gallery. Useful for bulk/iterative image generation where you want full control over style, shape, batch size, and per-image seeds. This is a generation task — nothing is purchased and there is no account; it is free and unlimited.

## When to Use
- Generate one or more AI images from a natural-language prompt, free and without login.
- Bulk-generate a batch (4–32 images) and pick/save the best candidate(s).
- Exercise specific creative controls: art style preset, aspect ratio (shape), image count, and prompt modifiers (camera shot, color, effect, genre).
- Capture the exact generation parameters (expanded prompt, guidance scale, seed) for reproducibility or downstream analysis.

## Workflow
The recommended (and only viable) method is **browser**: the generator is powered by Perchance's in-browser `text-to-image-plugin` running inside nested iframes — there is no documented public REST API or query-string deep-link that triggers generation, so scripted browsing of the embedded UI is the correct path.

1. **Start a stealth remote session.** The `perchance.org` domain sits behind Cloudflare (the bare homepage returns HTTP 403). Create the session with `--verified --proxies` (i.e. `browse open … --remote` against a verified + residential-proxy session). Navigate to `https://perchance.org/ai-text-to-image-generator`. Wait ~3s, then confirm the page title is `AI Image Generator (free, no sign-up, unlimited)`.
2. **Snapshot to get cross-frame refs.** Run `browse snapshot`. It flattens the nested iframes via CDP and exposes stable refs in the `[1-*]` namespace (the generator lives inside `#outputIframeEl`, NOT on the top page). Key controls:
   - `[1-3]` — Description / prompt textbox (pre-filled with an example; just `browse fill` over it).
   - `[1-4]` — 🎨 Art Style `<select>` (default "Painted Anime"; 80+ options: Cinematic, Casual Photo, Digital Painting, Concept Art, "No style", Studio Ghibli, Pixel Art, Watercolor, Manga, …).
   - `[1-5]` — 🖼️ Shape `<select>`: Square (default) / Portrait / Landscape.
   - `[1-6]` — 🔢 How many? `<select>`: 4 (default) / 6 / 8 / 16 / 32 / 2.
   - `[1-9]` — "✨ generate" button.
   - Optional prompt-modifier selects that appear near the prompt: "Add shot…", "Add color…", "Add effect…", "Add genre…".
3. **Fill inputs.** `browse fill [1-3] "<prompt>"`. Optionally `browse select [1-4] "<Art Style>"`, `browse select [1-5] "<Shape>"`, `browse select [1-6] "<count>"` (pass the visible option label).
4. **Generate.** `browse click [1-9]`.
5. **Wait and poll for completion.** Each requested image renders in its own nested "Perchance Image Generation Embed" iframe. Snapshots first show placeholders ("Waiting…" / "Preparing…"); an image is finished only when its `image` node's accessible name contains a `seed=` value. Poll with `browse snapshot` every ~20s. Budget **30–90s per batch** — large batches (16/32) take longer. Do not stop after the first snapshot or you will capture only a partial batch.
6. **Extract results.** For each finished `image` node, parse its accessible name:
   `prompt=<expanded prompt + style keywords> negativePrompt=<…> guidanceScale=<n> seed=<n>`. The raw pixels are available as an inline `data:image/jpeg;base64,…` `src` on the embed's image element (there is no external CDN URL).
7. **(Optional) Save the best.** Click the `🛡️💾` button beneath the chosen image to save it to the private gallery (viewable via the `🛡️ show private gallery` button). Pick based on prompt intent; do not blindly save all.
8. **Screenshot** the results grid as evidence.

## Site-Specific Gotchas
- **Cloudflare 403 on the domain.** A bare HTTP request to `perchance.org` returns 403. Use a stealth remote session (verified + residential proxies). In testing the generator subpage occasionally loaded on a plain Browserbase remote session too, but this is **not reliable** — keep stealth on to avoid intermittent challenges.
- **Nested iframes — three layers deep.** The generator is NOT on the top page. It lives in `#outputIframeEl` (a `*.perchance.org` subdomain iframe), and each result renders in a further-nested "Perchance Image Generation Embed" iframe. Use `browse snapshot` (which flattens frames via CDP into `[1-*]`, `[60-*]`, `[61-*]`… refs) rather than trying to read `iframe.contentDocument` (cross-origin → null).
- **Image bytes are inline base64, not URLs.** Finished images are `data:image/jpeg;base64,…` blobs painted into sandboxed embed canvases. There is no external/CDN image URL to grab. Capture the data URI from the `src`, or read the metadata from the `image` node's accessible name.
- **All generation metadata is in the accessibility name.** Each finished `image` node encodes `prompt=`, `negativePrompt=`, `guidanceScale=` (defaults to 7), and `seed=` (random per image). This is the most reliable structured output.
- **Selecting an art style mutates the expanded prompt.** Choosing e.g. "Cinematic" auto-appends keywords (75mm, Technicolor, Panavision, cinemascope, HDR, "world-class cinematic masterpiece", …) to the prompt visible in the image node name. Expected, not a bug.
- **Default batch is 4.** Leave "How many?" modest; 16/32 dramatically increase wait time. Partial-batch capture is the most common failure — poll until all requested images carry a `seed=`.
- **Ad iframes pollute the snapshot.** `ads.perchance.org`, doubleclick, pubmatic, etc. add dozens of irrelevant refs. Ignore everything outside the generator frames.
- **No login / no payment / unlimited & free.** No auth wall to clear; never attempt to log in.

## Expected Output
```json
{
  "success": true,
  "prompt": "a cozy cabin in a snowy pine forest at sunset, warm glowing windows",
  "style": "Cinematic",
  "settings": {
    "shape": "Square",
    "num_images": 4,
    "guidance_scale": 7,
    "negative_prompt": ""
  },
  "images": [
    {
      "seed": 121257895,
      "expanded_prompt": "a cozy cabin in a snowy pine forest at sunset, warm glowing windows, cinematic shot, dynamic lighting, 75mm, Technicolor, Panavision, cinemascope, sharp focus, fine details, 8k, HDR, ... cinematic color grading, depth of field.",
      "src": "data:image/jpeg;base64,/9j/4AAQSkZ...",
      "saved": false
    },
    {
      "seed": 272163316,
      "expanded_prompt": "a cozy cabin in a snowy pine forest at sunset, warm glowing windows, cinematic shot, ...",
      "src": "data:image/jpeg;base64,/9j/4AAQSkZ...",
      "saved": true
    }
  ],
  "image_count": 2,
  "error_reasoning": null
}
```

Failure / partial shapes:

```json
// Still rendering at capture time — poll longer
{ "success": true, "image_count": 2, "images": [ { "seed": null, "src": null, "alt": "Waiting... (not yet complete)" } ], "error_reasoning": null }

// Blocked by Cloudflare (no stealth)
{ "success": false, "image_count": 0, "images": [], "error_reasoning": "Cloudflare 403 / challenge page — recreate session with --verified --proxies" }
```
