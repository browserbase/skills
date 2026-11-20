---
name: letterboxd-com-add-to-watchlist-k0iqqu
title: Letterboxd Add Film to Watchlist
description: >-
  From an authenticated Letterboxd session, search a film by title, disambiguate
  by year, and add it to the user's watchlist. Returns title, year, and
  confirmation. Browser-only — no public write API; signup is hCaptcha-walled so
  users bring their own session via cookie-sync.
website: letterboxd.com
category: entertainment
tags:
  - movies
  - watchlist
  - letterboxd
  - cloudflare
  - hcaptcha
  - authenticated
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      No usable public write API. The watchlist toggle is an internal AJAX POST
      bound to the page __csrf token and session cookie; it is not a
      documented/replayable endpoint. Drive the UI control instead.
verified: true
proxies: true
---
# Add a Film to Your Letterboxd Watchlist

## Purpose

From an **already-authenticated** Letterboxd session, search for a film by title, open the correct film page (disambiguating by release year), and add it to the signed-in user's watchlist. Returns the matched film's title, year, and confirmation that the watchlist toggle flipped to its "added" state. This is a **write** action (it mutates the user's watchlist) but it is non-destructive and reversible (the same control removes the film). It is **not** a purchase or payment of any kind.

There is **no public write API** for the watchlist — the toggle is an internal, CSRF-guarded, session-bound AJAX POST. A browser session is the only reliable surface, so this skill is browser-driven.

## When to Use

- "Add *The Matrix* to my Letterboxd watchlist."
- A "save this film for later" action triggered from another agent that resolved a title.
- Bulk-queueing several films a user wants to watch (run once per title).
- Any flow where the user is logged in to Letterboxd (cookies present) and wants a film saved to *Watchlist* — **not** logged (watched), liked, or rated. Those are separate controls.

## Workflow

**Prerequisite — authenticated session.** This skill operates on the user's **own** logged-in account. Supply the user's Letterboxd session cookies (see `cookie-sync`) on a stealth browser session. Do **not** attempt to create an account programmatically — Letterboxd's sign-up is hCaptcha-gated (see Gotchas). The watchlist controls described below are rendered **only** when the session is authenticated; on a logged-out session the film page shows a "Sign in to log, rate or review" prompt and the actions panel is absent.

Use a **stealth session** (`--verified --proxies`). Letterboxd fronts pages with a **Cloudflare "Performing security verification" interstitial (Turnstile)** on the first hit; a verified session clears it automatically in ~5–10s (see Gotchas).

1. **Open a verified, proxied session and warm up.**
   ```bash
   sid=$(browse cloud sessions create --keep-alive --verified --proxies \
     | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
   export BROWSE_SESSION="$sid"
   browse open "https://letterboxd.com/" --remote
   browse wait timeout 8000 --remote   # let the Cloudflare Turnstile interstitial clear
   ```
   (Inject the user's session cookies onto this session before proceeding — `cookie-sync`.)

2. **Search for the film by title.** Use the films-scoped search URL — it returns only films (no members/lists/reviews noise):
   ```bash
   browse open "https://letterboxd.com/search/films/$(printf %s "the matrix" | jq -sRr @uri)/" --remote
   browse wait timeout 3000 --remote
   ```
   The general endpoint `https://letterboxd.com/search/<url-encoded query>/` also works but mixes in non-film results. Results live in `ul.results`; each film link is `.film-title-wrapper a` (or `.headline-2 a`) and its `href` is the canonical film slug, e.g. `/film/the-matrix/`. The result label includes the year, e.g. `The Matrix (1999)`.

3. **Pick the right result by title + year.** Match on both. Letterboxd disambiguates same-title films with a year-suffixed slug: `/film/the-matrix/` (1999) vs `/film/the-matrix-2004/` (2004). Choose the `href` whose adjacent year matches the requested year; if no year was requested, prefer the top result.

4. **Open the film page.**
   ```bash
   browse open "https://letterboxd.com/film/the-matrix/" --remote
   browse wait timeout 3000 --remote
   ```
   Extract the title from `h1.headline-1.primaryname` and the year from `.releaseyear a` (or any `a[href*="/films/year/"]`). Verify these match the request before mutating anything.

5. **Add to watchlist via the actions panel.** On an authenticated film page, the right-hand **actions panel** exposes three toggles — *watched* (eye), *like* (heart), and **watchlist**. Locate the watchlist control by its **accessible name / title text** (it reads roughly *"Add this film to your watchlist"*) rather than a brittle CSS class, then click it:
   ```bash
   browse snapshot --remote            # find the ref whose accessible name contains "watchlist"
   browse click @<ref-for-watchlist> --remote
   browse wait timeout 1500 --remote   # the toggle is an AJAX POST — no full navigation
   ```
   If the control already reads *"Remove … from your watchlist"* / shows a filled/active icon, the film is **already** on the watchlist — treat as success (idempotent), do not click (clicking would remove it).

6. **Confirm.** The toggle is an in-page AJAX action; confirm by **either**:
   - the control's accessible name flipping to *"Remove this film from your watchlist"* (its active/added state), **or**
   - loading the watchlist page and checking the film appears:
     ```bash
     browse open "https://letterboxd.com/<username>/watchlist/" --remote
     browse wait timeout 3000 --remote
     # film poster with the matched slug should be present in the grid
     ```
   Prefer the watchlist-page check when you need hard confirmation — the in-page state flip alone is sufficient for the common case.

7. **Release the session.**
   ```bash
   browse cloud sessions update "$sid" --status REQUEST_RELEASE
   ```

**Never** click *Watch* (log/watched), *Like*, *Rate*, or *Review* — those are adjacent controls in the same panel and are not the watchlist. Adding to a watchlist is the only mutation this skill performs.

## Site-Specific Gotchas

- **Stealth is required.** Run with `--verified --proxies`. Letterboxd serves a **Cloudflare "Performing security verification" (Turnstile)** interstitial (`RootWebArea: Just a moment…`) on the first navigation from a fresh session. A verified session clears it automatically — `browse wait timeout 8000` after the first `open` is enough; the page then resolves to the real `Letterboxd • Social film discovery` content. A bare (non-verified) session can get stuck on this interstitial.
- **The watchlist control only exists when logged in.** On a logged-out session the film page contains **no** `watchlist` markup at all (verified: 0 occurrences of "watchlist" in the logged-out film-page HTML) — only a "Sign in to log, rate or review" prompt. There is nothing to click without a valid session. Provide the user's cookies via `cookie-sync` first.
- **No public write API — and the internal one is session/CSRF-bound.** The watchlist toggle fires an internal AJAX POST guarded by the page's `__csrf` token and the session cookie. There is no documented, reusable public endpoint; do not try to reconstruct or replay it out-of-band. Drive the UI toggle instead. (Read-only data like film metadata is available via the public pages and TMDB, but **writing** to a watchlist has no public API.)
- **Account creation is hard-walled by hCaptcha — do not automate signup.** The `create-account` modal (`https://letterboxd.com/create-account/`, which redirects to `/?register=true`) is protected by an hCaptcha "I am human" checkbox that escalates to an image grid; the `token` hidden field stays empty and the form silently no-ops until solved. A verified Browserbase session did **not** auto-solve the image challenge within 60s. This is irrelevant to the skill in practice because users bring their own authenticated session (cookie-sync) — but it means you cannot bootstrap a throwaway test account here. Don't burn iterations trying.
- **Duplicate hidden forms.** The homepage/film pages embed **many** copies of the sign-up/sign-in forms (one is spawned per film-poster hover widget, ~20 instances). Selectors like `input[name="emailAddress"]` match all of them; only one is on-screen. If you ever must interact with these, filter by a non-zero `getBoundingClientRect()` (the on-screen instance), not by `offsetParent` (the modal uses fixed positioning, so `offsetParent` is `null` even when visible).
- **Field names, if you ever touch auth forms:** the real signup inputs are `emailAddress`, `username`, `password`, `termsAndAge`, `acceptPrivacyPolicy` (not `email` / `termsAccepted`). The sign-in form is `.signin-form` with `username` + `password`.
- **Same-title disambiguation is year-based.** Slugs append a year/qualifier on collisions (`/film/the-matrix/` vs `/film/the-matrix-2004/`, `/film/inception/` vs `/film/inception-1980/`). Always match the year, not just the title.
- **Watchlist add is AJAX, not a navigation.** After clicking, the URL does not change; confirm via the control's state flip or by loading `/{username}/watchlist/`. Don't wait for a page load that never comes.
- **Idempotency.** If the film is already on the watchlist, the control shows the "Remove…" state. Re-clicking *removes* it. Check state before clicking and treat already-present as success.

## Expected Output

```json
// Added successfully
{
  "success": true,
  "film_title": "The Matrix",
  "year": 1999,
  "film_slug": "/film/the-matrix/",
  "added_to_watchlist": true,
  "already_present": false,
  "watchlist_confirmation": "Watchlist control flipped to 'Remove this film from your watchlist'; film present at /<username>/watchlist/",
  "error_reasoning": null
}

// Already on the watchlist (idempotent no-op)
{
  "success": true,
  "film_title": "The Matrix",
  "year": 1999,
  "film_slug": "/film/the-matrix/",
  "added_to_watchlist": true,
  "already_present": true,
  "watchlist_confirmation": "Control already in 'Remove…' state; not re-clicked",
  "error_reasoning": null
}

// Not authenticated — no watchlist control rendered
{
  "success": false,
  "film_title": "The Matrix",
  "year": 1999,
  "added_to_watchlist": false,
  "error_reasoning": "No authenticated session: film page shows 'Sign in to log, rate or review' and no watchlist control. Supply user cookies via cookie-sync."
}

// Film not found / ambiguous title
{
  "success": false,
  "film_title": null,
  "year": null,
  "added_to_watchlist": false,
  "error_reasoning": "No film result matched the requested title/year on /search/films/<query>/."
}
```
