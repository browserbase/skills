---
name: framer-com-navigate-community-ixor9n
title: Navigate the Framer Community
description: >-
  Navigate the Framer Community hub (framer.com/community) and move from it to
  any destination — Feed, Hype, Marketplace, Gallery, Members, Contests, a post,
  or a creator profile — returning the section URL map and the destination's
  identity. Read-only.
website: framer.com
category: navigation
tags:
  - framer
  - community
  - navigation
  - no-code
  - creators
  - feed
source: 'browserbase: agent-runtime 2026-06-20'
updated: '2026-06-20'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      Sections are server-rendered Next.js pages that return HTTP 200 over plain
      HTTP (browse cloud fetch), so static section/post content can be scraped
      without a full browser. A browser is still preferred for the real-time
      Feed and for resolving handle/post-ID links to their canonical URLs after
      redirects.
verified: false
proxies: false
---
# Navigate the Framer Community

## Purpose

Navigate the Framer Community hub (`framer.com/community/`) and move from it to any of its destinations — the Feed, Hype, Marketplace, Gallery, Members, Contests, an individual post, or a creator profile — returning the community's navigation map plus the identity (title, URL, handle) of whatever destination you land on. Read-only: this skill never logs in, posts, likes, follows, or comments.

## When to Use

- You need the canonical URL map of the Framer Community sections (Feed / Hype / Marketplace / Gallery / Members / Contests) to drive further navigation.
- You want to open the latest Feed posts and jump to the authoring creator's profile.
- You need to resolve a creator handle to their canonical profile URL, or a post ID to its page.
- Any time another skill needs a reliable "land me on section/post/creator X inside Framer Community" primitive.

## Workflow

Framer Community is a server-rendered Next.js app with **no anti-bot and no login wall** for read access (the one exception is *Activity* — see gotchas). The fastest, most reliable path is to **navigate directly to the known deep-link URLs below — you do not need to click through the nav** to reach a section. Use the browser only to (a) enumerate the *dynamic* Feed/creator content, which changes every few minutes, and (b) resolve handles/IDs to canonical URLs. A residential proxy and `--verified` stealth are **not** required (confirmed across two converged runs on a bare session).

Canonical destination URLs (all return HTTP 200 on a bare session):

| Section | URL | Notes |
|---|---|---|
| Hub | `https://www.framer.com/community/` | 307-redirects to `/community/feed/` |
| Feed | `https://www.framer.com/community/feed/` | tabs: `?tab=for-you` (default), `?tab=following` (login-gated) |
| Hype | `https://www.framer.com/community/hype/` | |
| Activity | `https://www.framer.com/community/activity/` | **login-gated** — redirects to `login.framer.com` when logged out |
| Marketplace | `https://www.framer.com/community/marketplace/` | templates + plugins |
| Gallery | `https://www.framer.com/community/gallery/` | sites built with Framer |
| Members | `https://www.framer.com/community/members/` | |
| Contests | `https://www.framer.com/community/contests/` | redirects to the currently-active contest, e.g. `/community/contests/agents-hackathon/` |
| Post | `https://www.framer.com/community/posts/{postId}/` | `{postId}` is a ~22-char base62 id |
| Creator | `https://www.framer.com/@{handle}/` | canonical; `/community/creator/@{handle}/` 307-redirects here |

Recommended steps:

1. **Open the hub** and confirm the redirect:
   ```
   browse open https://www.framer.com/community/ --remote
   browse get url        # → https://www.framer.com/community/feed/
   ```
2. **Dismiss the cookie banner** if present — there is an "Okay" button (a `[ref]` in the snapshot). It can sit over feed content, so clear it before clicking feed items.
3. **Read the left-hand navigation** to harvest the section map. `browse snapshot` returns a clean accessibility tree (~215 refs); the section links live under two headings — `Explore` (Feed, Hype, Activity) and `Community` (Marketplace, Gallery, Members, Contests). The snapshot ref→URL table gives you each href directly. Alternatively just use the static table above.
4. **To navigate to a section**, prefer `browse open <section-url> --remote` (deep-link) over clicking — it's one step and avoids the cookie overlay.
5. **To reach a creator from the Feed**: extract the Feed via `browse get markdown body` (cleanly renders author name, handle, post text, timestamp, like/comment counts). The first post is the newest (reverse-chronological). Click the author's name/avatar, then `browse get url` — it resolves to `https://www.framer.com/@{handle}/`. You can also skip the click and open `https://www.framer.com/@{handle}/` directly once you have the handle.
6. **To open a post**: `browse open https://www.framer.com/community/posts/{postId}/ --remote`. The post URL is in the Feed snapshot's ref table (the post-card link).
7. **Extract the destination identity** with `browse get title` + `browse get url` (titles follow `"{Name} (@{handle}) – Framer Community"` for creators and `"Post by {Name} – Framer Community"` for posts), and emit the JSON in Expected Output.

## Site-Specific Gotchas

- **`/community/` 307-redirects to `/community/feed/`** — treat the Feed as the hub landing page.
- **Creator canonical URL is `framer.com/@{handle}/`, NOT `framer.com/community/creator/@{handle}/`.** The `/community/creator/@{handle}/` form works but 307-redirects; always read the resolved URL after navigation rather than assuming the path you requested.
- **`Activity` is login-gated.** When logged out, the nav "Activity" link points at `https://login.framer.com/?origin=framer-web&redirect=...%2Fcommunity%2Factivity%2F`, and opening `/community/activity/` bounces to the login page. Don't expect content there in an unauthenticated session. The `?tab=following` Feed tab is similarly login-gated.
- **`Contests` redirects to the active contest slug.** `/community/contests/` resolved to `/community/contests/agents-hackathon/` during testing; the slug will change as contests rotate, so read the resolved URL/title rather than hardcoding it.
- **The Feed is real-time and dynamic.** The "first/latest post" (and the "Suggested for you" sidebar) changes every few minutes — across two runs the top post went from `@rajeshuiux` to `@themeflow`. Never treat a specific post/creator as stable; only the *section structure and URL patterns* are stable.
- **Cookie consent overlay.** A "We use cookies…" banner with an "Okay" button can intercept clicks on feed cards. Dismiss it first (or navigate by deep-link URL to avoid the issue entirely).
- **Don't confuse `framer.com/community` with `framer.community`.** `www.framer.community` is a *separate* Circle.so-hosted discussion forum; this skill targets the first-party `framer.com/community/` hub (Feed/Marketplace/Gallery/Members/Contests). The Marketplace recently merged into this community hub (per Framer's 2026-06 blog post).
- **No anti-bot / no proxy / no stealth needed.** All sections returned HTTP 200 on a plain Browserbase session (no `--proxies`, no `--verified`) across multiple runs. Snapshots return a real a11y tree (~215 refs) — this is a normal DOM site, not a canvas app, so `browse snapshot` / `browse get markdown body` both work well.
- **Search exists in-nav.** A "Search community" combobox sits at the top of the left nav for finding posts/creators by keyword if you don't already have a handle or post ID.

## Expected Output

A navigation map plus the identity of the destination you landed on. `navigated_to.type` is one of `creator_profile | post | section | login_required`.

```json
{
  "success": true,
  "start_url": "https://www.framer.com/community/feed/",
  "sections": [
    { "label": "Feed",        "url": "https://www.framer.com/community/feed/" },
    { "label": "Hype",        "url": "https://www.framer.com/community/hype/" },
    { "label": "Activity",    "url": "https://www.framer.com/community/activity/", "login_required": true },
    { "label": "Marketplace", "url": "https://www.framer.com/community/marketplace/" },
    { "label": "Gallery",     "url": "https://www.framer.com/community/gallery/" },
    { "label": "Members",     "url": "https://www.framer.com/community/members/" },
    { "label": "Contests",    "url": "https://www.framer.com/community/contests/" }
  ],
  "navigated_to": {
    "type": "creator_profile",
    "creator_name": "Rajesh Godhaniya",
    "handle": "rajeshuiux",
    "url": "https://www.framer.com/@rajeshuiux/",
    "title": "Rajesh Godhaniya (@rajeshuiux) – Framer Community"
  },
  "error_reasoning": null
}
```

Other `navigated_to` shapes:

```json
{ "type": "post",
  "post_id": "Sn5C23dnEFLsGdT7RVNJ8v",
  "author_name": "Rajesh Godhaniya",
  "handle": "rajeshuiux",
  "url": "https://www.framer.com/community/posts/Sn5C23dnEFLsGdT7RVNJ8v/",
  "title": "Post by Rajesh Godhaniya – Framer Community" }
```

```json
{ "type": "section",
  "label": "Contests",
  "requested_url": "https://www.framer.com/community/contests/",
  "url": "https://www.framer.com/community/contests/agents-hackathon/",
  "title": "Agents Hackathon – Framer Community" }
```

```json
{ "type": "login_required",
  "label": "Activity",
  "requested_url": "https://www.framer.com/community/activity/",
  "url": "https://login.framer.com/?origin=framer-web&redirect=https%3A%2F%2Fwww.framer.com%2Fcommunity%2Factivity%2F" }
```

Failure shape:

```json
{ "success": false, "start_url": "https://www.framer.com/community/feed/", "sections": [], "navigated_to": null, "error_reasoning": "extracted error text" }
```
