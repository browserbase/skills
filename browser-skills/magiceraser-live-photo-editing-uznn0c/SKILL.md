---
name: magiceraser-live-photo-editing-uznn0c
title: Magic Eraser Photo Editing Capabilities
description: >-
  Summarize Magic Eraser's AI photo-editing tools (object removal, background
  removal, enhance, expand, fill, filters, text-to-image, design) and its
  availability on web, iOS, and Android.
website: magiceraser.live
category: photo-editing
tags:
  - photo-editing
  - ai-image
  - background-removal
  - object-removal
  - generative-ai
  - cross-platform
source: 'browserbase: agent-runtime 2026-07-13'
updated: '2026-07-13'
recommended_method: fetch
alternative_methods:
  - method: fetch
    rationale: >-
      The site publishes a canonical /llms.txt plus fully server-rendered HTML
      for every marketing/product/pricing page. A proxied HTTP fetch returns
      100% of the capability, platform, and pricing content with no JS execution
      needed — this is the fastest and most reliable path.
  - method: browser
    rationale: >-
      Only needed to capture rendered screenshots or to inspect the gated web
      editor (web.magiceraser.live), which requires account sign-in. Not
      necessary for summarizing capabilities.
verified: false
proxies: true
---
# Magic Eraser Photo Editing Capabilities

## Purpose
This skill collects and summarizes the photo-editing capabilities of **Magic Eraser** (`magiceraser.live`) — an AI-powered photo editing and lightweight design platform — and reports its availability across web, iOS, and Android. It returns a structured inventory of the eight AI tools, their documented workflows, platform support, and pricing tiers. It is **read-only**: it gathers marketing/product/pricing content and does not sign in, upload images, or run any edit.

## When to Use
- A user asks "what can Magic Eraser do?" or wants a feature/tool inventory of the platform.
- A user wants to know whether Magic Eraser is available on web, iOS, and/or Android (and how to get each).
- A user wants Magic Eraser's pricing tiers (Free vs. Premium) and what each unlocks.
- A user is comparing AI photo editors and needs an evidence-based capability summary of this one.
- You need the canonical URLs for each tool's product page (object removal, background remover, AI enhance/expand/fill/filter, AI create, design).

## Workflow

The optimal method is **`fetch` (proxied HTTP GET)**, not scripted browsing. Magic Eraser publishes a canonical machine-readable summary at `/llms.txt` and serves fully server-rendered HTML for every marketing, product, and pricing page. You do not need to execute JavaScript or drive a browser to summarize its capabilities. The apex domain sits behind Cloudflare and 308-redirects to a locale prefix, so send requests through residential proxies and target the locale path directly.

1. **Fetch the canonical summary first.** `GET https://magiceraser.live/llms.txt` (via `browse cloud fetch <url> --proxies`). This returns a curated, structured overview: primary pages, all eight core product pages with one-line descriptions, "Documented Capabilities" (per-tool workflow), and "Platform Notes." It is the single best source and explicitly warns that live pricing/limits must be verified at checkout.
2. **Fetch the homepage for the feature narrative + FAQ.** `GET https://magiceraser.live/en` (note: `/` 308-redirects to `/en`; a `lang` cookie is set). The server-rendered HTML contains the full feature list, the "What is Magic Eraser?" FAQ, object-removal / background-removal how-it-works answers, and the "What devices does Magic Eraser support?" answer. Strip `<script>`/`<style>` and tags to get clean text.
3. **Fetch the tools index for tool categorization.** `GET https://magiceraser.live/en/tools` groups the tools into three buckets: **Cleanup & background editing** (Remove Objects, Background Remover, AI Fill), **Enhancement & styling** (AI Enhance, AI Expand, AI Filter), **Creation & design workflows** (Design, AI Create).
4. **Fetch pricing.** `GET https://magiceraser.live/en/pricing` for the Free / Weekly / Yearly tiers and the Free-vs-Premium feature matrix. Treat prices as point-in-time and verify against checkout before citing as guaranteed.
5. **Resolve platform availability from the fetched content + store links.** Availability = web editor at `web.magiceraser.live`, iOS (App Store `id1619950778`), and Android (Google Play `com.duygiangdg.magiceraser`). These app-store URLs are linked in the site footer.
6. **Assemble the summary** into the JSON shape in Expected Output.

### Browser fallback
Only needed to (a) capture rendered screenshots for a report/card, or (b) inspect the actual web editor. Steps:
1. Create a remote session **with `--proxies`** (`--verified` was NOT required in testing): `browse cloud sessions create --keep-alive --proxies`.
2. `browse open https://magiceraser.live/en --remote --session "$sid"`, `browse wait load`, `browse screenshot`.
3. To see the editor, `browse open https://web.magiceraser.live/` — it loads a template gallery behind an onboarding survey ("What do you mainly use the app for?") and is **sign-in gated**. Do not attempt to log in, upload, or edit — stop at the gated screen. All tool capabilities are already documented in the marketing/product pages, so the editor adds no summarization value.

## Site-Specific Gotchas
- **Apex 308-redirect + locale prefix.** `https://magiceraser.live/` returns `308` to `/en` and sets a `lang=en` cookie. Always fetch the locale path (`/en`, `/en/pricing`, `/en/product/...`) directly to avoid the redirect hop. 16 locales exist (`/en`, `/vi`, `/ja`, `/fr`, `/de`, `/es`, `/ko`, `/it`, `/zh`, `/pt`, `/ru`, `/th`, `/ar`, `/hi`, `/id`, `/tr`); `/en` is the preferred canonical for citations per `llms.txt`.
- **Cloudflare in front, but low friction.** The pre-run probe flagged `cloudflare` / `likelyNeedsProxies: true`, `likelyNeedsVerified: false`. In testing, a proxied fetch and a proxied (non-verified) browser session both loaded every page cleanly — **no CAPTCHA, no JS challenge, no 403**. Use `--proxies`; `--verified` is unnecessary.
- **`/llms.txt` is the shortcut — use it.** It is a purpose-built, agent-friendly summary. It also embeds an honest disclaimer: "Exact live prices, free limits, trial eligibility, per-feature gating, and credit costs are not guaranteed by this file and should be verified in the live app or checkout." Honor that — do not present pricing as guaranteed.
- **Two hosts.** The marketing site is `magiceraser.live`; the actual editor is a separate app at `web.magiceraser.live` (CSP `form-action` points there). The web editor is behind sign-in — don't expect to extract tool behavior from it without an account.
- **Pricing is inconsistent across pages.** The pricing page lists Free / Weekly ($4.99/wk) / Yearly ($29.99/yr) and says the yearly plan "Save 90% compared to weekly" in one place but "over 88%" in the FAQ on the same page. The homepage FAQ separately says Premium is sold "as a monthly or annual subscription through the App Store and Google Play." Report ranges/caveats rather than a single authoritative number, and note subscriptions are transacted via platform stores.
- **Marketing metrics are self-reported.** Homepage claims (10M+ users, 100M+ photos, 4.9 App Store rating, 559,700+ reviews) are footnoted as derived from public app-store listing signals — attribute them as vendor claims, not independently verified facts.
- **Testimonials are decorative.** The homepage testimonial names/handles repeat and read as sample content; don't cite them as real customers.
- **`autobrowse` is not runnable in this sandbox.** The pinned `evaluate.mjs` hard-requires a non-empty `ANTHROPIC_API_KEY`, which is intentionally blank here (auth flows through `ANTHROPIC_AUTH_TOKEN` + the gateway). Don't burn time trying to run the self-improving loop for this task; the `fetch` path is complete on its own. No `trace.json`/`strategy.md` was produced for this reason.

## Expected Output
```json
{
  "product": "Magic Eraser",
  "vendor": "Creatix Technology",
  "site": "https://magiceraser.live",
  "tagline": "AI Photo Editor for Effortless Editing",
  "summary": "AI-powered, cross-platform photo editing and lightweight design tool for object removal, background removal, enhancement, generative fill/expand, creative filters, and text-to-image generation.",
  "tools": [
    { "name": "Remove Objects", "category": "cleanup", "description": "AI inpainting to erase people, text, wires, shadows, and clutter; reconstructs the area behind the removed object.", "url": "https://magiceraser.live/en/product/magic-eraser" },
    { "name": "Background Remover", "category": "cleanup", "description": "AI segmentation to cut out the subject; replace with color/image/gradient or keep transparent (PNG w/ alpha).", "url": "https://magiceraser.live/en/product/background-eraser" },
    { "name": "AI Fill", "category": "cleanup", "description": "Prompt-guided generative fill to replace selected areas and rebuild missing image parts.", "url": "https://magiceraser.live/en/product/ai-fill" },
    { "name": "AI Enhance", "category": "enhance", "description": "Improve sharpness, clarity, color, and facial detail; upscale image quality.", "url": "https://magiceraser.live/en/product/ai-enhance" },
    { "name": "AI Expand", "category": "enhance", "description": "Generative outpainting to extend image borders/canvas for new aspect ratios and layouts.", "url": "https://magiceraser.live/en/product/ai-expand" },
    { "name": "AI Filter", "category": "enhance", "description": "Apply creative AI-powered photo filters / styles in one tap.", "url": "https://magiceraser.live/en/product/ai-filter" },
    { "name": "AI Create", "category": "create", "description": "Text-to-image generation with selectable style/model/resolution options (web).", "url": "https://magiceraser.live/en/product/ai-create" },
    { "name": "Design", "category": "create", "description": "Template-driven editor for social graphics/banners/thumbnails with text, stickers, shapes, crop, resize, adjustments.", "url": "https://magiceraser.live/en/product/design" }
  ],
  "platforms": {
    "web": { "available": true, "editor_url": "https://web.magiceraser.live", "notes": "Browser-based upload/export; account sign-in; onboarding survey; no install." },
    "ios": { "available": true, "app_store_id": "1619950778", "url": "https://apps.apple.com/app/id1619950778", "devices": ["iPhone", "iPad"] },
    "android": { "available": true, "package": "com.duygiangdg.magiceraser", "url": "https://play.google.com/store/apps/details?id=com.duygiangdg.magiceraser" }
  },
  "pricing": {
    "free": { "price": "$0", "includes": ["basic editing tools", "limited AI filters", "unlimited exports", "mobile access", "watermark-free export after sign-in"], "notes": "Limited number of photos; AI Expand / AI Create / AI Fill not included on free tier per feature matrix." },
    "premium": [
      { "name": "Weekly", "price": "$4.99/week" },
      { "name": "Yearly", "price": "$29.99/year", "notes": "Marketed as best value; site states ~88-90% savings vs weekly (figure inconsistent across pages)." }
    ],
    "premium_unlocks": ["advanced editing tools", "unlimited AI filters", "unlimited AI Expand/Fill/Create", "high-resolution/4K exports", "no ads", "priority support"],
    "billing": "Subscriptions transacted via Apple App Store / Google Play; cancel anytime.",
    "disclaimer": "Prices are point-in-time; verify at checkout. Not guaranteed by /llms.txt."
  },
  "vendor_claims": { "users": "10M+", "photos_enhanced": "100M+", "app_store_rating": "4.9", "review_count": "559,700+", "note": "Self-reported from public app-store listing signals; not independently verified." },
  "source_method": "fetch",
  "sources": [
    "https://magiceraser.live/llms.txt",
    "https://magiceraser.live/en",
    "https://magiceraser.live/en/tools",
    "https://magiceraser.live/en/pricing"
  ]
}
```
