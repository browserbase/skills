---
name: gathershot-com-collect-share-event-media-t8rj96
title: Gather Shot Event Photo & Video Collection
description: >-
  Summarize how Gather Shot lets event hosts collect and share guest photos and
  videos via QR code (no app), and how to set up an event — including supported
  event types, pricing tiers, plan limits, and the host + guest workflow.
website: gathershot.com
category: events
tags:
  - events
  - photo-sharing
  - qr-code
  - weddings
  - conferences
  - no-app
  - read-only
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: url-param
    rationale: >-
      All marketing/discovery pages (/, /pricing/, /faq/, /how-it-works/,
      /features/, /compare/) are static HTML served by Cloudflare with no
      anti-bot. A bare `browse cloud fetch <url>` (no --proxies, no --verified)
      returns the full body in one round-trip — ~100× cheaper than spinning a
      remote browser. Use this whenever the task is *describing* the offering.
      Reach for the browser only when you need to actually drive the
      `app.gathershot.com` SPA (event creation, dashboard, guest upload
      preview).
verified: true
proxies: true
---
# Gather Shot Event Photo & Video Collection

## Purpose

Answer the question "what is the best way to collect and share photos and videos at a wedding / party / corporate conference / live event?" by describing the **Gather Shot** offering at `gathershot.com` — a browser-based, QR-code-driven guest media collection platform — and returning the structured facts a user needs to decide whether to use it: supported event types, plan tiers + pricing, upload limits, host workflow, and the guest experience. Read-only — never submits the create-event form, never enters payment, never uploads media.

## When to Use

- A user asks "how can guests share photos at my event without making them download an app?"
- Anyone evaluating Gather Shot vs. competitors (GuestPix, Wedibox, POV, Kululu, GuestCam, Guestlense, Simple Booth, an Instagram hashtag, or a Google Drive link).
- A planner who needs the pricing breakdown (Basic vs. Pro), upload caps, co-host count, and storage period before committing.
- An assistant generating a one-paragraph summary or a feature checklist for a host researching event photo platforms.

## Workflow

The fastest path is a sequence of **bare HTTPS GETs** against the marketing site — no browser, no stealth, no residential proxy. `gathershot.com` sits behind Cloudflare but has no anti-bot, no rate limiting, no auth-walls on its public marketing pages, and the JSON-LD `<script type="application/ld+json">` block on `/` already contains the core organization/webapp description for free. Drive a real browser **only** if you need to interact with the React SPA at `app.gathershot.com` (event creation, host dashboard).

### Step 1 — Fetch the canonical pages

Use `browse cloud fetch <url>` without `--proxies` or `--verified`. Each call is ~1s and returns the full pre-rendered HTML body in the `content` field of the JSON envelope.

| URL | What you extract |
|---|---|
| `https://gathershot.com/` | Tagline, value props, JSON-LD organization block, primary CTAs. |
| `https://gathershot.com/how-it-works/` | The 5-step host flow: create gallery → brand → guests scan QR → moderate → download originals. |
| `https://gathershot.com/pricing/` | Basic ($59.99/event, 1000 uploads, 1 co-host) and Pro ($99.99/event, 5000 uploads, 10 co-hosts, scavenger hunt included). One-time fee, no subscription. |
| `https://gathershot.com/faq/` | App-store policy ("no — browser only"), gallery privacy default, ZIP export, consent capture, 60-day post-event upload window. |
| `https://gathershot.com/features/` | Full feature taxonomy: Effortless Collection, Flexible Schedules, Privacy & Security, Scavenger Hunts, Branded Event Pages, Live Slideshow, Smart Media Management, Team Collaboration, Guest Consent & Email Capture, Custom Guest Data. |
| `https://gathershot.com/compare/` | Comparison index — 8 competitor pages slug `/compare/gather-shot-vs-{competitor}/` where competitor ∈ `{guestcam, guestlense, guestpix, instagram-hashtag, kululu, pov, simple-booth, wedibox}`. |

The order above is also the order of decreasing answer value — stop fetching once you have what the user asked for. For a generic "what does it do + how much" question, `/` + `/pricing/` is enough.

### Step 2 — Parse and structure the response

Map facts onto the JSON shape in Expected Output. Key things to surface:

- **Modality**: web-based, guests use phone browser via QR scan. No iOS/Android app, no account creation for guests, no logins for guests.
- **Event types supported** (from the `app.gathershot.com/events/new` dropdown — see Step 4 for how to discover them): Wedding, Elopement, Micro Wedding, Engagement Party, Rehearsal Dinner, Bachelor Party, Bachelorette Party, Birthday Party, Anniversary Party, Graduation Party, Baby Shower, Family Reunion, Conference, Workshop, Company Offsite, Game Day, Race, Community Event, Holiday Celebration, Trip.
- **Pricing**: one-time per-event fee, no subscription. Basic $59.99, Pro $99.99. Both include 1 year of storage.
- **Plan caps**: Basic = 1000 photos+videos, 1 co-host, scavenger hunt available as paid add-on. Pro = 5000 photos+videos, 10 co-hosts, scavenger hunt included.
- **Host control surface**: moderation queue (every upload is hidden until host approves), brand color + welcome message + custom URL slug, optional guest consent capture with version/timestamp audit trail, optional email verification, optional up-to-5 custom guest data fields, tag-based organization, full-resolution ZIP export (whole gallery or filtered by tag), live slideshow display, co-host invites.
- **Upload window**: configurable; can open before the event and stay open up to **60 days after**.

### Step 3 — Tell the host how to set it up (read-only narrative, no submission)

Do not submit the form yourself. Tell the user the steps:

1. Go to `https://app.gathershot.com/events/new` (no login required to reach the form).
2. Fill: **Event name**, **Event type** (dropdown — see list above), **Event date** (or toggle "TBD" in the date panel), **Email address**.
3. Click **Continue**. Form copy says "Start free. Upgrade later if needed." — the gallery is built before payment is taken; the plan is chosen later when you're ready to publish to guests.
4. From the onboarding checklist that follows: brand the gallery (color, headline, welcome message, custom URL slug → `gathershot.com/{slug}`), optionally enable guest consent + email verification + custom data fields, then publish.
5. Print or display the auto-generated QR code on signage / table cards / slides / badges. Guests scan with their phone camera, land on the branded upload page, pick media from their camera roll, tap upload.
6. Approve uploads from the host dashboard. Tag by session/moment. After the event, export ZIPs (whole gallery or filtered).

### Step 4 — (Optional) Drive the SPA to verify the form schema

The marketing pages do not advertise the event-type enum or the exact form fields; those live in the React app at `app.gathershot.com/events/new`. If you need to verify the current dropdown contents (Gather Shot may add event types), spin a remote browser session:

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$sid"
browse open https://app.gathershot.com/events/new --remote
# Click the "Choose event type" dropdown then read the rendered markdown:
browse get markdown body --remote
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

The event-type options appear inline in the markdown body after the dropdown is opened. `--proxies` + `--verified` are belt-and-suspenders here — the site is not anti-bot — but they make the session indistinguishable from a real visitor and cost nothing extra at this scale.

## Site-Specific Gotchas

- **Two hostnames, two purposes.** `gathershot.com` is the static marketing site (Astro/CDN, fully pre-rendered, JSON-LD in `<head>`). `app.gathershot.com` is the React SPA where events are actually created and managed. The CSP on `gathershot.com` whitelists `app.gathershot.com` as a `connect-src` origin — that's the data-plane.
- **No anti-bot.** Cloudflare in front, but no captcha, no JS challenge, no Akamai. `browse cloud fetch` without `--proxies` or `--verified` returns 200 with the full body. Don't waste a residential-proxy session on `gathershot.com/*` marketing pages.
- **JSON-LD is gold.** `<script type="application/ld+json">` on `/` ships the canonical `Organization`, `WebSite`, and `WebApplication` schema.org blocks — including the description string "Gather Shot is a browser-based event photo sharing platform. Guests upload photos and videos to a shared gallery via QR code using their phone's web browser. No app download or install is required." Use this verbatim if the task wants a one-sentence pitch.
- **No public REST/JSON API for the catalog.** There is no documented endpoint to enumerate event types, pricing, or features as structured data — you have to parse HTML (or rely on the JSON-LD block). The event-type enum lives only in the React SPA's bundled JS; the easiest way to extract it is to open the dropdown in a real browser (Step 4 above) — that's why this skill is `browser`-recommended despite the static-fetch shortcut.
- **No app store presence.** Gather Shot is explicitly not on iOS App Store or Google Play (confirmed in the FAQ). If a user asks "what app should I install?", the answer is "none — it's browser-only on the guest side, and a web dashboard on the host side."
- **Pricing is per-event, not per-month.** No subscription. Each event is a separate purchase. Storage is 1 year *per event*. Don't describe Gather Shot as SaaS-style recurring.
- **"Free to start" caveat.** You can build the entire gallery — name, brand, QR code, settings — without paying. Payment is required before the gallery accepts guest uploads (or before publishing publicly; the exact wall isn't stated on the marketing pages). The CTA "Start free. Upgrade later if needed." is accurate but doesn't mean unlimited free uploads.
- **Read-only rule.** This skill must never click **Continue** on `/events/new` or finish any checkout flow. Describing the steps to the user is fine; submitting them is not. Take a screenshot of the form for evidence, then bail.
- **Vanity URL slug + QR code.** The guest-facing upload URL is `gathershot.com/{slug}` (e.g. `gathershot.com/jamie-riley` from the marketing mockups) or `gathershot.com/e/{slug}` (from the homepage hero copy — `gathershot.com/e/sarah-james`). Both patterns appear in marketing materials; the actual live pattern is set by the host when picking their custom URL. Do not invent a slug to "test" the guest experience — it will either 404 or hit a stranger's real event gallery.
- **Competitor pages are first-party SEO content.** `/compare/gather-shot-vs-{competitor}/` pages are written by Gather Shot. Useful for the structural comparison (and the competitor's own claimed positioning is summarized fairly), but expect Gather Shot to win on the bottom-line recommendation in every one. Treat as marketing-tinted, not third-party review.

## Expected Output

```json
{
  "product": "Gather Shot",
  "url": "https://gathershot.com",
  "tagline": "Collect event photos without asking anyone to download an app.",
  "modality": {
    "guest": "web-browser-only (QR scan → mobile browser upload page, no account, no app)",
    "host": "web dashboard at app.gathershot.com"
  },
  "supported_event_types": [
    "Wedding", "Elopement", "Micro Wedding",
    "Engagement Party", "Rehearsal Dinner",
    "Bachelor Party", "Bachelorette Party",
    "Birthday Party", "Anniversary Party", "Graduation Party",
    "Baby Shower", "Family Reunion",
    "Conference", "Workshop", "Company Offsite",
    "Game Day", "Race", "Community Event",
    "Holiday Celebration", "Trip"
  ],
  "pricing": {
    "model": "one-time per event (no subscription)",
    "plans": [
      {
        "name": "Basic",
        "price_usd": 59.99,
        "upload_cap": 1000,
        "cohosts": 1,
        "scavenger_hunt": "add-on",
        "storage_years": 1
      },
      {
        "name": "Pro",
        "price_usd": 99.99,
        "upload_cap": 5000,
        "cohosts": 10,
        "scavenger_hunt": "included",
        "storage_years": 1
      }
    ],
    "free_trial": "Gallery setup is free; payment required to accept guest uploads."
  },
  "host_features": [
    "moderation-before-publish (every upload hidden until approved)",
    "custom brand color, headline, welcome message",
    "custom URL slug (gathershot.com/{slug})",
    "QR code auto-generated",
    "live slideshow display on any TV/projector",
    "tag-based organization",
    "full-resolution ZIP export (whole gallery or filtered by tag)",
    "co-host invites (1 on Basic, up to 10 on Pro)",
    "optional guest consent capture with version + timestamp audit trail",
    "optional email verification",
    "up to 5 custom guest-gate data fields (text or dropdown)",
    "scavenger hunt — up to 15 prompts (Pro included, Basic add-on)",
    "upload window configurable: open before event, stay open up to 60 days after"
  ],
  "guest_features": [
    "no app download",
    "no account creation",
    "no login",
    "supports photos and videos",
    "works on any smartphone browser (iOS or Android)"
  ],
  "host_setup_steps": [
    "Visit https://app.gathershot.com/events/new (no login required to reach the form)",
    "Fill: event name, event type, event date (or TBD), email address",
    "Click Continue — gallery is created before payment",
    "Brand the gallery (color, headline, welcome message, URL slug)",
    "Optionally enable consent capture, email verification, custom guest data fields",
    "Choose plan (Basic or Pro) when ready to publish",
    "Print/display the auto-generated QR code at the event",
    "Approve uploads as they arrive; tag by session/moment",
    "After the event, export ZIPs at full resolution"
  ],
  "competitors_compared": [
    "GuestCam", "Guestlense", "GuestPix", "Instagram Hashtag",
    "Kululu", "POV", "Simple Booth", "Wedibox"
  ],
  "notable_constraints": [
    "Not available on iOS App Store or Google Play (browser-only)",
    "Per-event payment, not subscription — each event is a separate purchase",
    "Storage period is 1 year per event",
    "Scavenger hunt capped at 15 prompts",
    "Custom guest-gate fields capped at 5"
  ]
}
```

If the user only asked for a one-sentence pitch, return just the `tagline` + the `pricing.plans[].price_usd` summary. If they asked specifically about a competitor, also fetch `/compare/gather-shot-vs-{competitor}/` and include the comparison verdict.
