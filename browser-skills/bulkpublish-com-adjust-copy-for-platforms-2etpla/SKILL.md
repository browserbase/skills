---
name: bulkpublish-com-adjust-copy-for-platforms-2etpla
title: Adjust Copy For Platforms And Publish With BulkPublish
description: >-
  Take one piece of source copy and produce platform-tailored variants (length,
  truncation-safe lead, hashtags, line breaks) for Facebook, Instagram, X,
  TikTok, YouTube, Threads, Bluesky, Pinterest, LinkedIn, Google Business, and
  Mastodon — then publish through BulkPublish's Multi-Platform Composer.
website: bulkpublish.com
category: social-media
tags:
  - social-media
  - publishing
  - scheduling
  - copywriting
  - multi-platform
  - composer
  - bulkpublish
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      Per-platform free tool pages
      (app.bulkpublish.com/tools/caption-length-checker-online-free,
      /tools/{platform}-character-counter-free,
      /tools/{platform}-line-breaker-free) are deterministic helper surfaces
      that need no auth and no anti-bot — use them to compute and validate
      variants client-side.
  - method: browser
    rationale: >-
      The Multi-Platform Composer at app.bulkpublish.com is the only path to
      actually publish across all connected channels in one action. Requires
      authenticated session; no public JSON API for the composer was discovered,
      and API docs are gated behind login (Pro+ tier).
  - method: api
    rationale: >-
      BulkPublish advertises API access (5 keys on Pro, 10 on Business) but the
      public-facing docs are gated; not used by this skill. If the operator has
      a key, it likely permits programmatic publishing once channels are
      connected, but variant-adjustment math is still a client-side text
      operation against the limits table in this SKILL.
verified: true
proxies: true
---
# Adjust Copy For Platforms And Publish With BulkPublish

## Purpose

Take a single piece of source copy and produce platform-tailored variants (length, truncation-safe lead, hashtag handling, line breaks) for every social network BulkPublish supports — Facebook, Instagram, X (Twitter), TikTok, YouTube, Threads, Bluesky, Pinterest, LinkedIn, Google Business Profile, and Mastodon — then publish or schedule them through BulkPublish's Multi-Platform Composer at `app.bulkpublish.com`. The skill has two distinct surfaces:

1. **Public, no-auth surface** at `app.bulkpublish.com/tools/*` — caption length checker + per-platform character counters. Use these to *prepare* the platform-specific variants. Anyone can use these without an account.
2. **Authenticated app** at `app.bulkpublish.com` (Multi-Platform Composer) — required to actually *publish*. The composer keeps per-platform copy variants and pushes them to each connected channel in one click.

This skill is read+write on the user's own BulkPublish account; it does **not** publish to third-party social platforms directly — BulkPublish does, on the user's behalf, using channels the user has previously connected via OAuth.

## When to Use

- A marketer hands you one long-form announcement and wants 11 platform-tailored variants ready to schedule.
- A creator wants the same post to land on Instagram (caption 2,200), X (post 280), and LinkedIn (post 3,000) without manually trimming for each.
- An agent that already drafts copy needs to validate per-platform character limits and "See more" truncation points before publishing.
- Bulk-scheduling a campaign of multiple posts where each post needs minor per-platform adjustments (e.g., link-in-bio for Instagram vs. inline URL for X).
- Re-purposing a long-form blog excerpt as a Mastodon toot (500), Bluesky post (300), Threads post (500), and X post (280) with the first sentence guaranteed visible before truncation.

## Workflow

**Recommended method is hybrid: prepare with the free tools (no auth, no anti-bot), then publish with the authenticated Multi-Platform Composer.** Most of the platform-adaptation work is determinate text manipulation and can be done client-side once you know the limits — BulkPublish's free tools just confirm the math. The only step that *requires* BulkPublish is the actual cross-platform publishing/scheduling.

### Step 1 — Adjust copy per platform (no-auth)

Open `https://app.bulkpublish.com/tools/caption-length-checker-online-free` and paste the source copy into the textarea (a11y ref `textbox: Paste your caption text here...`). The page renders a live per-platform preview showing exactly where each network truncates with "See more" / "...more" / "Show more" and flags any platform where the post would be over-limit. No login, no API key, no anti-bot.

Use the following table to budget the visible (above-the-fold) portion of each variant. The first column is the **hard post limit** — exceed it and the post fails to publish; the second is the **truncation point** — text past it is hidden behind a "See more" affordance in-feed.

| Platform | Hard post limit | Truncated at | Truncation marker |
|---|---|---|---|
| X (Twitter) — standard | 280 | — (full visible) | n/a — over-limit posts fail |
| X (Twitter) — Premium | 25,000 | — | n/a |
| Bluesky | 300 | — (full visible) | n/a — over-limit posts fail |
| Threads | 500 | — (full visible) | n/a |
| Mastodon | 500 | — (full visible) | n/a (instance-dependent, default 500) |
| Pinterest (pin description) | 500 | — | n/a |
| Google Business | 1,500 | — | n/a |
| Instagram (caption) | 2,200 | 125 | `...more` |
| TikTok (caption) | 2,200 | 150 | `more` |
| LinkedIn (post) | 3,000 | 140 | `...see more` |
| YouTube (description) | 5,000 | 100 | `Show more` (also title hard cap 100) |
| Facebook (post) | 63,206 | 477 | `See more` |

**Practical adaptation rules — apply in this order:**

1. **Lead with the hook in the first ~100 characters.** YouTube cuts off the description at 100, Instagram at 125, LinkedIn at 140, TikTok at 150 — your first sentence must work as a standalone teaser across all four.
2. **Generate the X/Bluesky variant first** (280/300 hard cap). If you can land the message in 280 chars, every other platform fits trivially. Strip URLs to a shortener if needed; drop hashtags to ≤2.
3. **Cross-platform hashtag handling**: Instagram allows up to 30 hashtags per post; X/Bluesky punish more than 2; LinkedIn convention is 3–5. Move hashtags to the bottom for Instagram (after a couple of blank lines) so they don't pollute the truncated preview; inline for X/Threads.
4. **Line breaks** — Instagram, Facebook, X, TikTok, YouTube, Threads, Bluesky, LinkedIn, Pinterest, Google Business, and Mastodon all eat raw double-newlines in their composers and collapse them. Use the per-platform line-breaker tools at `app.bulkpublish.com/tools/{platform}-line-breaker-free` to inject the right invisible character if line preservation matters; the composer accepts paste-through.
5. **YouTube has two limits, not one** — title 100, description 5,000. The skill is for descriptions/captions; if the source content is a video, copy adjustment must split into title-line + description-body.
6. **Pinterest needs a title** (100 chars) separate from the pin description (500). Both fields are exposed in the composer.
7. **URLs** — X, Bluesky, Threads, and Mastodon count the entire URL toward the character limit (no t.co-style auto-shortening on X anymore). Use a shortener (bit.ly, ow.ly) before pasting into the composer for short-limit platforms.

For platforms with multiple text fields (Facebook ad headline 40 / ad description 125, X bio 160 / DM 10,000, Pinterest pin title 100 / board name 50, YouTube title 100 / description 5,000, LinkedIn headline 220 / comment 1,250), use the per-platform character counter at `app.bulkpublish.com/tools/{platform}-character-counter-free` to validate each field individually before pasting into the composer.

### Step 2 — Publish with the Multi-Platform Composer (auth required)

The composer lives inside `app.bulkpublish.com` after login. The user must already have a BulkPublish account and at least one channel per target platform connected (one-time OAuth setup, outside this skill's scope).

1. Navigate to `https://app.bulkpublish.com/login`. Fill `textbox: Email` and `textbox: Password`; click `button: Sign In`. Google SSO is available at `button: Sign in with Google` — defer to whichever auth method the user has configured.
2. The composer entry point is the dashboard's "New post" / "Compose" CTA. From there:
   - **Select channels**: one channel per target platform, multi-select.
   - **Paste base copy**: this is what gets sent to platforms whose variant box you leave blank.
   - **Toggle per-platform overrides** for any platform that needs the variant you prepared in Step 1. The composer exposes a side-by-side editor with the platform's character count and a live preview card.
   - **Attach media** (image/video) — uploaded to BulkPublish's media library first (Free plan: 100 MB cap; Pro: 2 GB; Business: 10 GB).
   - **Schedule or publish now**. Free plan caps scheduled posts at 1; Pro 30/day; Business 50/day. Free plan also caps posting at 3 posts/day total across all platforms.
3. Confirm. BulkPublish enqueues per-channel publishes; the dashboard shows per-platform status (queued / publishing / posted / failed) within ~60s for most networks.

### Plan gotcha — X requires Pro

The Free tier (`$0`) supports all platforms **except X (Twitter)**. To publish to X via BulkPublish, the user must be on Pro ($13.99/mo) or Business ($39.99/mo). If the user is on Free and the target set includes X, BulkPublish will surface a checkout-required modal at the publish step.

### Browser fallback for the composer

If automating the composer end-to-end, drive `app.bulkpublish.com` with a logged-in Browserbase session (the site has no aggressive anti-bot — bare `--verified` proxies are unnecessary on free tools; the authenticated app behaves like a normal SaaS dashboard). Persist a Browserbase context after first login to skip re-auth in subsequent runs.

## Site-Specific Gotchas

- **Two surfaces, not one.** `bulkpublish.com` is the marketing site (Astro, static, `noindex,nofollow`, ETag-cacheable). `app.bulkpublish.com` is the actual app (Astro + Sentry instrumented, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`). The free tools live on the **app** subdomain (`app.bulkpublish.com/tools/...`), not the marketing subdomain — naïve URL guessing puts you on 404s.
- **All free tools are public, no auth, no rate limit observed.** Caption length checker, character counters, line breakers, image-size checkers, thread makers, grid maker, carousel splitter, feed planner, UTM builder, engagement calculator, aspect ratio calculator, follower growth calculator, CPM/CPC calculator, hashtag counter — all reachable cookieless. Use them as deterministic helpers; don't try to script the full app for prep work.
- **The Caption Length Checker is the canonical "adjust for platforms" surface.** It shows seven platforms (Instagram, Facebook, LinkedIn, X, TikTok, Threads, YouTube) side-by-side with live truncation marks. The full eleven-platform set is not on this page — for Bluesky/Pinterest/Google Business/Mastodon, fall through to the per-platform character counter pages.
- **Per-platform character counters expose secondary limits.** E.g., the X counter shows post 280, Premium post 25,000, bio 160, DM 10,000 — not just the headline number. When the user's copy needs to land in a non-primary field (bio rewrite, ad headline), don't trust the "primary limit" label alone; read the secondary-limit grid on the same page.
- **"Multi-Platform Composer" requires auth and a connected channel per platform.** The marketing page lists "Multi-Platform Composer" as a top feature but there is no anonymous demo — the composer URL redirects to `/login`. Bring credentials or expect to surface a "log in to continue" wall.
- **Free plan blocks X publishing.** All other platforms work on Free; X is paywalled to Pro/Business. The composer doesn't gray out X — it lets you select the channel and only blocks at the publish-button step with a checkout modal.
- **Free plan post-volume caps are aggressive**: 3 posts/day total, 1 scheduled post in the queue. For agentic bulk workflows assume Pro tier minimum.
- **Login page has Google SSO + email/password.** Refs after a fresh load: email `textbox: Email`, password `textbox: Password`, `button: Sign In`, `button: Sign in with Google`. No reCAPTCHA observed at the login step. Persist a Browserbase context to skip re-auth.
- **Site is Sentry-instrumented.** Every app page injects `meta name="sentry-trace"` — agent runs may surface in the operator's Sentry dashboard. Identify your runs with a stable user-agent or session label if the operator cares.
- **Line breaks are eaten by composer paste-through.** When pasting copy that uses double-newline paragraph breaks, BulkPublish's composer (like Instagram and several others) collapses them on publish. Run the platform-specific line-breaker tool at `/tools/{platform}-line-breaker-free` first if line preservation matters; it injects an invisible character (zero-width space variants) that the receiving platform respects.
- **No public API for "adjust copy for X platform" as a single endpoint.** BulkPublish offers API access (Pro: 5 keys, Business: 10), but the docs are gated behind login and the free-tools surface does not expose a JSON API — they are HTML+JS-rendered text pages. Don't waste time hunting for `/api/v1/adjust` — the deterministic adjustment is a client-side text operation parameterized by the limits table above.
- **Title at YouTube and Pinterest is a separate field from body copy.** The skill must produce a `{title, body}` tuple for those two platforms, not a single string. Other platforms take a single text field.

## Expected Output

The skill output is a per-platform variant set plus a publish-status report. Two distinct shapes depending on whether the user wanted "just adjust" (no publish) or "adjust and publish":

```json
// Shape A — adjust only (no auth, no publish)
{
  "success": true,
  "source_copy": "Big news this week — we are launching ...",
  "source_length": 486,
  "variants": {
    "x_twitter": {
      "text": "Big news: BulkPublish now lets you compose once + post everywhere. Try it free → bit.ly/abc",
      "length": 91,
      "limit": 280,
      "over_limit": false,
      "first_125_visible": "Big news: BulkPublish now lets you compose once + post everywhere. Try it free → bit.ly/abc"
    },
    "instagram": {
      "text": "Big news this week — we are launching ... \n\n#socialmedia #marketing",
      "length": 510,
      "limit": 2200,
      "truncated_at": 125,
      "hook_within_125": true
    },
    "linkedin":  { "text": "...", "length": 612, "limit": 3000, "truncated_at": 140, "hook_within_140": true },
    "facebook":  { "text": "...", "length": 486, "limit": 63206, "truncated_at": 477, "hook_within_477": true },
    "tiktok":    { "text": "...", "length": 198, "limit": 2200, "truncated_at": 150 },
    "youtube":   { "title": "Compose Once, Publish Everywhere", "title_length": 33, "title_limit": 100,
                   "description": "...", "description_length": 486, "description_limit": 5000 },
    "threads":   { "text": "...", "length": 312, "limit": 500 },
    "bluesky":   { "text": "...", "length": 287, "limit": 300, "over_limit": false },
    "pinterest": { "title": "Bulk publish across 11 platforms", "title_length": 32, "title_limit": 100,
                   "description": "...", "description_length": 312, "description_limit": 500 },
    "google_business": { "text": "...", "length": 612, "limit": 1500 },
    "mastodon":  { "text": "...", "length": 312, "limit": 500 }
  }
}

// Shape B — adjust + publish (requires authenticated session)
{
  "success": true,
  "published": true,
  "scheduled_at": null,
  "post_ids": {
    "facebook": "fb_8e3a...",
    "instagram": "ig_22b1...",
    "x_twitter": "x_7f01...",
    "linkedin": "li_5d92...",
    "tiktok": null,
    "youtube": null,
    "threads": "th_b045...",
    "bluesky": "bs_1a2c...",
    "pinterest": "pi_9e88...",
    "google_business": "gbp_44...",
    "mastodon": "ma_3f12..."
  },
  "channel_results": [
    {"platform": "x_twitter", "status": "posted", "url": "https://x.com/user/status/...", "at": "2026-05-19T22:39:47Z"},
    {"platform": "tiktok",    "status": "skipped", "reason": "no_channel_connected"},
    {"platform": "youtube",   "status": "failed",  "reason": "video_required_for_youtube"}
  ],
  "warnings": [
    "X channel requires Pro plan — upgraded at checkout",
    "Instagram caption truncated at 125 in feed preview"
  ]
}

// Shape C — auth blocker (publish attempt without login)
{
  "success": false,
  "reason": "auth_required",
  "next_action": "navigate_to_login",
  "prepared_variants": { "...same shape as Shape A.variants..." }
}

// Shape D — plan blocker (X selected on Free)
{
  "success": false,
  "reason": "plan_upgrade_required",
  "blocked_platforms": ["x_twitter"],
  "current_plan": "free",
  "required_plan": "pro",
  "checkout_url": "https://app.bulkpublish.com/checkout/pro-monthly",
  "prepared_variants": { "..." }
}
```
