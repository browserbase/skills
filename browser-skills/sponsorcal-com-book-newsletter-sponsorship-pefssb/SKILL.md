---
name: sponsorcal-com-book-newsletter-sponsorship-pefssb
title: SponsorCal Newsletter Sponsorship Booking
description: >-
  Drive a sponsor through a SponsorCal booking page — enumerate ad-slot
  inventory and pricing, pick an available issue date, hand off to Stripe
  Connect Checkout, then submit assets (headline, body, URL, logo) at the
  tokenized post-payment URL and track booking status through approval and
  revisions. Read-only on payment + final asset submission unless caller has
  explicitly authorized them.
website: sponsorcal.com
category: advertising
tags:
  - newsletters
  - sponsorship
  - advertising
  - stripe
  - booking
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      SponsorCal has no public API and no marketplace directory. Internal /api/*
      endpoints (including the Stripe Checkout Session creation call) are
      robots-disallowed and only respond to in-page session/token state. Each
      booking page at sponsorcal.com/{slug} is a fully client-rendered Next.js
      surface. The post-payment asset-submission + status-tracking page lives at
      a tokenized /booking/{token} URL delivered by email — there is no way to
      reach it without going through Stripe Checkout first.
verified: true
proxies: true
---
# SponsorCal Newsletter Sponsorship Booking

## Purpose

Walk a sponsor through a SponsorCal booking page for a specific newsletter — view live ad-slot inventory and pricing, pick an available issue date, drive to Stripe Connect Checkout for payment, then submit the post-purchase sponsorship assets (headline, body copy, click-through URL, logo) and report back the booking's status, asset deadline, and what happens next (approval, revisions, payout). Read-only on the marketplace surface itself; the human / caller is the actor for Stripe Checkout and asset upload — the agent's job is to drive the page, extract the available inventory, and surface the correct URLs / state at each hand-off boundary, **not** to enter card numbers or submit final assets autonomously.

## When to Use

- A user has a SponsorCal booking-page URL (`sponsorcal.com/{newsletter-slug}`) for a newsletter they want to sponsor and wants to see what dates are open at what price.
- Comparing slot availability and pricing across multiple newsletters that all run on SponsorCal.
- After a sponsor has paid, has the post-checkout `/booking/{token}` link from their confirmation email, and needs help filling out the asset-submission form.
- Checking the current state of a sponsor's booking — paid / awaiting assets / submitted / approved / revisions-requested / published — from the same tokenized booking link.
- Any sponsor-side workflow on SponsorCal. Creator-side flows (signup, dashboard, payout, Stripe Connect onboarding) are a different skill — those are gated behind `/login` + NextAuth.

## Workflow

SponsorCal has **no public API and no marketplace directory**. The only sponsor-facing surface is the per-newsletter booking page at `sponsorcal.com/{newsletter-slug}`, which is a fully JS-rendered Next.js page; all internal endpoints under `/api/*` are robots-disallowed and gated on session/token state from inside that page (verified: `/api/auth/session` is the only `/api/*` call fired on a cold page load and it returns `{}` for anonymous visitors). The booking page itself is the only honest path — there is no faster URL-param or API shortcut. Stealth + residential proxy is **not** required (the site is on Vercel, no anti-bot, served straight from CDN with `X-Vercel-Cache: HIT`), but `--verified --proxies` adds no friction and is a safe default.

You **must** be given (or have already obtained) the exact newsletter slug. Slugs are creator-chosen at signup, are not listed anywhere on `sponsorcal.com`, are excluded from the public `sitemap.xml`, and are `Disallow: /booking/` in `robots.txt` — they will not appear in search-engine results. Guessing slugs returns a 404 page with title `404 – Page Not Found | SponsorCal` and body `# 404\n\nPage not found`.

### 1. Land on the booking page

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"

browse open "https://sponsorcal.com/{slug}" --remote
browse get url --remote                # confirm not redirected to /404
browse snapshot --remote
```

If the title or body indicates `404 – Page Not Found`, return `{ "success": false, "reason": "newsletter_not_found", "slug": "{slug}" }` and stop. There is no recovery path — the slug is wrong and the marketplace cannot be searched.

### 2. Extract the sponsorship-options list

Each booking page renders a **Sponsorship Options** section as a stack of `button` elements. Each button's accessible name concatenates four fields: `{name} {description} {price} {N} slot(s) per issue`. Example labels observed on the homepage demo widget (which uses the same component as real booking pages):

- `Featured Sponsor Top placement in the newsletter with logo and short copy $750.00 1 slot per issue`
- `Classifieds Text-only mention in the jobs section $250.00 3 slots per issue`

The slot type names (`Featured Sponsor`, `Classifieds`, `Primary`, `Classified`, `Dedicated Send`, etc.), descriptions, prices, and per-issue capacities are **all creator-defined** — do not assume any specific labels. Parse them out of each button's accessible name with a regex like `^(.+?)\s+(.+?)\s+\$([\d,.]+)\s+(\d+)\s+slots?\s+per\s+issue$`.

Click the desired option button. The page re-renders the right-hand **Booking Summary** card to show:

- `Slot` — the selected option name
- `Issue Date` — `Select a date` (until a date is picked)
- `Asset Deadline` — `—` (until a date is picked)
- `Available` — `{remaining} of {capacity}` for the selected option globally (not date-specific yet)
- `Total` — the option price
- A disabled CTA: `Complete selection above` with subtext `You'll be redirected to Stripe to complete payment`

### 3. Walk the calendar and pick a date

The calendar is a month-grid of `button` elements labelled `1` through `31`. Critical decoding rules:

- **Greyed-out leading/trailing days** (e.g. `26 27 28 29 30` shown at the very top of a May grid) are previous-month padding — they are `StaticText`, not `button`. Iterate `button` refs only.
- **Past dates and full / unavailable dates** appear as `button`s in the snapshot tree but are visually disabled and clicking them does nothing (the Booking Summary state does not advance). The accessibility tree does not always expose `disabled`; the reliable signal is that clicking does not change the `Issue Date` text in the summary card.
- **Available dates** update the Booking Summary on click: `Issue Date` becomes the selected date and `Asset Deadline` gets populated automatically (asset-deadline = `issue_date - N days`, with `N` defined per-creator at setup, surfaced server-side — typically 2–3 days).
- The `‹` / `›` arrows above the month label (`May 2026`) advance the visible month. Inventory commonly extends 4–8 weeks ahead but is creator-configurable.

After clicking a date that *does* advance state, the Booking Summary CTA changes from `Complete selection above` to a labelled, enabled checkout button (text varies; observed `Continue to checkout` / `Complete booking`). Capacity holds are placed **at this moment**, not at payment — see the gotcha below.

### 4. Drive to Stripe Connect Checkout (hand-off boundary)

Click the now-enabled checkout button. SponsorCal calls an internal endpoint (under the robots-disallowed `/api/*` namespace) that creates a Stripe Checkout Session and `302`s the browser to `https://checkout.stripe.com/c/pay/cs_live_...` (or `cs_test_...` for creators in Stripe test mode). This is the boundary of what the agent should do autonomously — **stop here**.

Read out `browse get url --remote` to confirm the redirect landed on `checkout.stripe.com`, snapshot the page once for the caller's record, and return:

```json
{
  "success": true,
  "stage": "stripe_checkout",
  "checkout_url": "https://checkout.stripe.com/c/pay/...",
  "amount_due_usd": 750.00,
  "newsletter_slug": "{slug}",
  "slot_name": "Featured Sponsor",
  "issue_date": "2026-06-09",
  "asset_deadline": "2026-06-06",
  "hold_expires_at_iso": "<now + 10 min>"
}
```

Do **not** fill the Stripe payment form. The user / caller completes Stripe Checkout manually. Stripe's success redirect is configured by SponsorCal to `sponsorcal.com/booking/{token}` — once the sponsor completes payment, they land back on that page (sometimes also delivered as a "Booking confirmed" email containing the same `/booking/{token}` link).

### 5. Asset submission (post-payment, tokenized URL)

After Stripe redirects back to `sponsorcal.com/booking/{token}`, the page renders the asset-submission form. The same URL is the long-lived "booking status" page — it is the sponsor's only entry point because **sponsors never create accounts** (no login, no password reset for sponsors; only creators have NextAuth credentials on `/login`). Keep this URL safe; if it is lost, the sponsor must ask the creator to re-send the booking-confirmation email.

The form fields, in order observed on SponsorCal's marketing copy for the asset pipeline (confirmed labels: "headline, copy, URL, and logo upload"):

| Field | Type | Notes |
|---|---|---|
| `Headline` | text | Short — typically capped around 60–90 chars. Creator-defined limit. |
| `Body copy` | textarea | Newsletter ad body. Creator-defined character limit (some slots are text-only with a hard cap; Featured slots allow longer copy). |
| `Click-through URL` | url | Must be a valid `https://` URL. This is the destination the newsletter ad will link to. |
| `Logo` | file upload | PNG / JPG / SVG. Some slot types (e.g. text-only `Classifieds`) hide this field. |

Submit the form. Status transitions to `submitted`, the creator is notified, and the page now shows the booking in `awaiting_approval` state.

**Do not autonomously submit assets unless the caller has explicitly provided final-form values for all four fields.** If any field is uncertain, pause and report the form's current state with the field labels + validation hints back to the caller for confirmation.

### 6. Track status and handle approval / revisions

The `/booking/{token}` page is also the long-lived status page. Re-opening it surfaces one of:

- `awaiting_payment` — Stripe Checkout not yet completed (hold still active until 10-minute expiry).
- `paid` — payment cleared; asset submission form shown.
- `submitted` — assets uploaded; awaiting creator review.
- `revisions_requested` — creator pushed back; form is re-opened with the creator's note(s) and the previously-submitted values pre-filled. Re-submit to advance back to `submitted`.
- `approved` — creator approved; will run on the issue date.
- `published` — creator marked the ad as published, with an archive URL (the permanent link to the issue containing the ad). Payout timer (7-day dispute buffer) starts from this `publishedAt` timestamp.
- `payout_released` — 7 days after `published`; sponsor sees a delivery confirmation + (for Beehiiv/Kit-verified creators only) a performance follow-up with the issue's verified open rate.
- `cancelled_refunded` / `dispute_open` — terminal / hold states for refunds and Stripe disputes.

In parallel, SponsorCal emails the sponsor at the address used in Stripe Checkout: booking confirmation immediately, asset-deadline reminders **3 days** and **1 day** before the deadline (automated, no manual trigger), an overdue alert if the deadline passes with no submission, a delivery confirmation when the creator marks `published`, and a performance summary ~48 hours after publication (verified-engagement creators only). Every email contains a rebook CTA that links back to `sponsorcal.com/{newsletter-slug}`.

Return the booking record with status + the next-action hint:

```json
{
  "success": true,
  "stage": "status_check",
  "booking_token_url": "https://sponsorcal.com/booking/{token}",
  "status": "submitted",
  "newsletter_slug": "{slug}",
  "slot_name": "Featured Sponsor",
  "issue_date": "2026-06-09",
  "asset_deadline": "2026-06-06",
  "next_action": "Wait for creator approval. Watch inbox for revisions_requested or approved email.",
  "submitted_assets": {
    "headline": "...",
    "body": "...",
    "click_url": "https://...",
    "logo_filename": "logo.png"
  }
}
```

## Site-Specific Gotchas

- **No way to search for or enumerate newsletter slugs.** SponsorCal is not a marketplace — it is per-creator booking-page infrastructure. The slug must be supplied by the caller. The home page (`sponsorcal.com/`), the `sitemap.xml`, and the `/blog/*` URLs do not contain a directory. Guessing returns a 404. **If the user does not have the slug, the answer is "ask the creator for their SponsorCal link" — do not invent one.**
- **`robots.txt` disallows the entire sponsor-facing journey after step 1.** `Disallow: /api/`, `Disallow: /dashboard/`, `Disallow: /assets`, `Disallow: /booking/`, `Disallow: /login`, `Disallow: /signup`, `Disallow: /forgot-password`, `Disallow: /reset-password`, `Disallow: /verify-email`. Search crawlers will never index a booking-page slug, a `/booking/{token}` page, or an `/assets/{token}` page. Do not try to discover these via search; they are delivered only by email after the relevant action.
- **Capacity hold = 10 minutes from the moment a date is clicked, not from payment.** Verified from the `/features` page copy: *"Capacity hold placed at checkout start, not on payment. No race conditions… Abandoned checkouts release capacity automatically after 10 minutes."* If the sponsor sits on the Stripe page for >10 min, the slot is released and re-purchasable by anyone else. Confirm the hold-expiry timestamp the moment the date is clicked.
- **Stripe Checkout is the boundary.** Browse.sh skills are read-only on payments — never fill Stripe card forms. The agent's job is to navigate to Stripe and surface the URL + parsed summary. The caller types card details.
- **Sponsors have no account.** The post-payment journey (asset submission, status tracking, revisions) all lives at the tokenized URL `sponsorcal.com/booking/{token}`. There is no sponsor login, no password reset, no sponsor dashboard. If the URL is lost, the only recovery is asking the creator (who can see the booking in their `/dashboard/` and re-send the confirmation email). `/login`, `/signup`, `/forgot-password`, `/reset-password` are all **creator-only** — sponsors should never end up on those pages.
- **Slot names and prices are not standardized.** `Featured Sponsor`, `Classifieds`, `Primary`, `Secondary`, `Dedicated Send`, `Job board listing` — every creator defines their own labels, prices (in their locked currency), and per-issue capacities. Parse the button accessibility text per-page; do not hard-code any names or amounts.
- **Currency is locked per-creator and not switchable by the sponsor.** Booking-page creator sets one of `USD / GBP / EUR / AUD / CAD` at signup; copy on `/signup` says *"Currency is locked after signup."* All slot prices and the Stripe Checkout `amount` are denominated in that currency. If the sponsor wants a different currency, that is impossible on this booking page.
- **"Verified" engagement data only exists for Beehiiv and Kit newsletters.** Per `/features`: *"On Mailchimp, Substack, or any other platform: stats cannot be verified. The Verified badge will not appear."* If you scrape the booking page for "subscribers" / "open rate" stats, do not present an unverified number as verified — the absence of a Verified badge means the creator self-reported (or did not report) those numbers.
- **The calendar has no per-date "available" attribute exposed in the a11y tree.** Past dates, fully-booked dates, and creator-blacklisted dates are all rendered as `button` elements that look identical in the snapshot to available dates. The only reliable detector is *click + observe Booking Summary change*: if `Issue Date` did not update from `Select a date` after the click, that date is unavailable. The visible disabled-styling (greyed cells, reduced opacity) maps onto a CSS class, not an a11y property.
- **The homepage `sponsorcal.com/` shows an *illustrative* widget that is not wired to a backend.** Clicking the option works (it updates the summary card client-side), but the calendar clicks **do not** populate the `Issue Date` field — the widget is a marketing demo. Do not use the homepage to validate end-to-end flow; you need a real newsletter slug to exercise capacity holds, asset deadlines, or checkout. Confirmed observation 2026-05-19: clicking `May 28` (`ref @0-307`) and `May 29` (`ref @0-309`) on the homepage demo leaves `Issue Date: Select a date` and the CTA at `Complete selection above`.
- **Asset deadline defaults vary per creator.** The `/features` page says *"Set to days before your issue date. Enforced automatically. Visible to the sponsor from the moment they book."* Common settings observed: 2–3 days before issue. Read the deadline from the Booking Summary card after picking the date; do not compute it.
- **Reminder cadence is hard-coded** at the platform level: `3 days out` and `1 day out` before the asset deadline (plus an overdue alert). This is not creator-configurable and is the reliable signal for "next thing the sponsor will hear from SponsorCal."
- **Payout flow is creator-side**, not sponsor-side. From the sponsor's perspective the relevant transitions after `published` are: receive delivery confirmation email immediately, receive performance follow-up email ~48h later (only if creator's platform supports verification — Beehiiv or Kit), 7-day window where a dispute can still be raised in Stripe. The 7-day payout timer is internal to the creator + Stripe Connect; sponsor sees no payout UI.
- **Platform fee is 5% (creator-side) + Stripe processing (~2.9% + $0.30).** The sponsor's `Total` in the Booking Summary is the full slot price — the 5% is taken from the creator's payout, not added to the sponsor's bill. Do not mistake the platform fee for sponsor-visible markup.
- **Stack: Next.js on Vercel, NextAuth (creator login), Stripe Connect, no anti-bot.** `Server: Vercel`, `X-Vercel-Cache: HIT` on the home page; the only `/api/*` call on a cold load is `GET /api/auth/session → 200 {}`. Bare `browse cloud fetch` works without proxies; `--verified --proxies` is overkill but harmless.

## Expected Output

Five distinct outcome shapes, one per terminal stage of the flow:

```json
// 1. Slug not found
{
  "success": false,
  "reason": "newsletter_not_found",
  "slug": "the-pragmatic-engineer"
}
```

```json
// 2. Pre-payment: inventory enumerated (no date selected yet)
{
  "success": true,
  "stage": "inventory",
  "newsletter_slug": "{slug}",
  "newsletter_name": "...",
  "verified": false,
  "subscribers_reported": null,
  "open_rate_reported": null,
  "currency": "USD",
  "options": [
    {
      "name": "Featured Sponsor",
      "description": "Top placement in the newsletter with logo and short copy",
      "price": 750.00,
      "slots_per_issue": 1
    },
    {
      "name": "Classifieds",
      "description": "Text-only mention in the jobs section",
      "price": 250.00,
      "slots_per_issue": 3
    }
  ],
  "available_dates_sampled": [
    { "iso_date": "2026-06-02", "option": "Featured Sponsor", "remaining": 1 },
    { "iso_date": "2026-06-09", "option": "Featured Sponsor", "remaining": 1 }
  ]
}
```

```json
// 3. Date selected, hold placed, redirected to Stripe (HAND-OFF — do not pay autonomously)
{
  "success": true,
  "stage": "stripe_checkout",
  "newsletter_slug": "{slug}",
  "slot_name": "Featured Sponsor",
  "issue_date": "2026-06-09",
  "asset_deadline": "2026-06-06",
  "amount_due": 750.00,
  "currency": "USD",
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_...",
  "hold_expires_at_iso": "2026-06-09T12:34:56Z",
  "next_action": "Caller must complete Stripe Checkout. Slot hold releases at hold_expires_at_iso."
}
```

```json
// 4. Post-payment: status check from tokenized booking URL
{
  "success": true,
  "stage": "status_check",
  "booking_token_url": "https://sponsorcal.com/booking/{token}",
  "status": "paid | submitted | revisions_requested | approved | published | payout_released | cancelled_refunded | dispute_open",
  "newsletter_slug": "{slug}",
  "slot_name": "Featured Sponsor",
  "issue_date": "2026-06-09",
  "asset_deadline": "2026-06-06",
  "submitted_assets": {
    "headline": "...",
    "body": "...",
    "click_url": "https://...",
    "logo_filename": "logo.png"
  },
  "revision_notes": null,
  "archive_url": null,
  "next_action": "..."
}
```

```json
// 5. User has no slug — cannot proceed
{
  "success": false,
  "reason": "missing_newsletter_slug",
  "hint": "SponsorCal has no public directory. Ask the creator for their sponsorcal.com/{slug} link."
}
```
