---
name: pinterest-com-save-pin-q1vg2i
title: Save a Pinterest Pin to a Board
description: >-
  From a logged-in Pinterest account, search for a pin on a given topic and save
  it into a board (creating the board first if the account has none), returning
  the saved pin title/URL and board name.
website: pinterest.com
category: social
tags:
  - pinterest
  - social
  - bookmarking
  - authenticated
  - write
source: 'browserbase: agent-runtime 2026-06-08'
updated: '2026-06-08'
recommended_method: browser
alternative_methods:
  - method: browser
    rationale: >-
      Pinterest exposes no usable public/anonymous API for saving a pin to a
      board — the internal save endpoints require a logged-in, CSRF-tokened,
      bot-checked session. The authenticated UI is the only reliable surface;
      verified+proxied stealth recommended.
verified: true
proxies: true
---
# Save a Pinterest Pin to a Board

## Purpose

From an **already-authenticated** Pinterest account, search for a pin on a given topic and save (Pin) one matching result into a board — creating the board first if the account has none. Returns the saved pin's title and canonical URL plus the destination board name. This is an account/auth-gated, **write** action (it adds a pin to one of the user's boards); it does not purchase, follow, or message anyone. Pinterest exposes no usable public/anonymous API for this, so it must be driven through a logged-in stealth browser session.

## When to Use

- "Find a pin about {topic} and save it to my {board} board."
- A curation/mood-board agent collecting inspiration pins into a named board.
- "Save the first good {topic} result to Pinterest" (auto-create the board if it doesn't exist).
- Any flow that needs a pin persisted into a specific Pinterest board and a confirmation (pin title + URL + board name) returned.

## Workflow

This task is **browser-only**. Pinterest's content is behind an authenticated session, and there is no public REST/GraphQL endpoint an agent can call anonymously to save a pin to a board (the internal `/resource/.../create/` endpoints require a logged-in session, CSRF token, and bot-checked headers). Drive the logged-in UI.

**Prerequisite — an authenticated session.** Run this skill with the user's own Pinterest account (e.g. via `cookie-sync`), or log in with their credentials. A stealth Browserbase session is required: create with `--verified --proxies`. A bare session is more likely to trip Pinterest's bot checks.

### 1. Ensure you are logged in

If you already have the user's session cookies, just `browse open https://www.pinterest.com/` and confirm the home feed (top search box + "Create" button / profile avatar in the header).

If logging in with credentials:
1. `browse open https://www.pinterest.com/login/`
2. `browse snapshot` — locate the Email and Password inputs.
3. **The login form is React-controlled — `browse fill` reports success but the value does NOT register.** Use click + type: `browse click <email-ref>` then `browse type <email>`; `browse click <password-ref>` then `browse type <password>`.
4. `browse snapshot` to verify both fields are populated, then click **"Log in"** once.
5. If Pinterest challenges with an emailed verification code (new device/IP), read it from the user's inbox and enter it.
6. First-time accounts may land in interest onboarding ("What's your name?", pick interests). Click through minimally (a few interest tiles + "Done"/"Next") to reach the feed.

### 2. Ensure the destination board exists

Clicking the bare red **"Save"** button on a board-less account silently dumps the pin into **"Profile"** (the default unsorted bucket) — that is NOT a board and will not satisfy the task. Guarantee the board exists first:

1. Open your profile (click the header avatar / "Your profile", or `browse open https://www.pinterest.com/<username>/`). The Boards tab lists your boards.
2. `browse snapshot`. If the target board (e.g. "Inspiration") already exists → note `board_created=false` and skip to step 3.
3. Otherwise click **"Create a board"**, `browse click <name-field>`, `browse type <BoardName>`, then click **"Create"**. Dismiss any "add pins / Done" follow-up. Note `board_created=true`.

### 3. Search for the pin

Use the search deep-link (faster and more reliable than typing into the search box):

```
browse open "https://www.pinterest.com/search/pins/?q=<URL-encoded topic>"
browse wait load
browse snapshot
```

A pin grid renders. Click the first relevant pin link to open its closeup (`/pin/<id>/`). Read the title from the heading and the canonical URL via `browse get url` — it is `https://www.pinterest.com/pin/<id>/`.

### 4. Save the pin into the board (use the destination selector, NOT the bare Save)

On the pin closeup (and on each search-result pin card), next to the red **"Save"** button there is a **board-destination selector** — a button labeled `Select a board to save to: <destination>` (it defaults to "Profile"). This is the reliable path to a specific board:

1. Click the **`Select a board to save to: …`** button. A "Save" popover/dialog opens listing **"Save to board"** with your boards (e.g. `Inspiration save`, `Profile save`), a board-filter searchbox, board suggestions, and a **"Create board"** button.
2. Click the entry for your target board (e.g. **"Inspiration save"**). To create a board on the fly instead, click **"Create board"** in this dialog.
3. Confirm success: a toast **"Saved to {board}"** appears and the pin shows a link to that board (`/<username>/<board-slug>/`).

### 5. Return the result

Emit the JSON in **Expected Output** with the pin title, `/pin/<id>/` URL, board name, and whether you created the board.

## Site-Specific Gotchas

- **No usable public API — browser only.** Saving a pin requires a logged-in, CSRF-tokened, bot-checked session. Don't waste time looking for an anonymous REST/GraphQL save endpoint.
- **Use the board-destination selector, never the bare red "Save".** The plain "Save" button auto-saves to **"Profile"** (the default bucket), shows a "Saved to Profile" toast, and gives no board picker on a board-less account. The reliable picker is the `Select a board to save to: <dest>` button beside Save → opens a "Save to board" dialog with your boards + "Create board".
- **The "Saved" button does NOT reliably reopen the board picker.** After a save-to-Profile, re-clicking the flipped "Saved"/board-name button often just toggles save state instead of opening the picker (and is flaky in the accessibility tree). Don't rely on it — use the destination selector on a pin you haven't saved yet, or create the board first.
- **Create the board BEFORE saving.** A board-less account has no clean way to pick a board from the bare Save flow. Create it via the profile page's "Create a board" button; once at least one board exists, the destination selector lists it.
- **Login/signup forms are React-controlled.** `browse fill` reports `filled:true` but the value silently fails to register (the form then complains "Don't forget to add your email/password"). Always `browse click <field>` then `browse type <value>` for text inputs. (The only input where `fill` works is a native `input[type="date"]`.)
- **The inline signup form on the homepage body does not submit under automation** (its Continue button never navigates). If you ever must register, use the **"Sign up" button in the header** which opens a working modal — but registration is out of scope for this skill (run it with an existing account).
- **Onboarding can be bypassed.** After auth, navigating straight to the search deep-link usually skips interest-onboarding; if it bounces you back, click a few interest tiles + "Done" then retry the deep-link.
- **Proxied page loads are slow** (10–30s for some navigations). Always `browse wait load` (and a short `browse wait timeout` for popovers) before snapshotting.
- **Stealth recommended.** Sessions ran with `--verified --proxies`; Pinterest is bot-sensitive on the auth/registration surface (a registration submit produced an "Oops! Something went wrong" server error under a non-stealth/rapid-fill flow). Read-only navigation of the logged-in feed itself loaded fine.
- **`browse` CLI prints an "Update available: 0.7.2 -> 0.8.3" notice on stderr.** It is harmless noise, not an error — never retry a command because of it.

## Expected Output

```json
{
  "success": true,
  "search_topic": "cozy reading nook ideas",
  "pin_title": "Cozy Reading Corner Aesthetic | Warm Light Book Nook Ideas",
  "pin_url": "https://www.pinterest.com/pin/1147432811338574291/",
  "board_name": "Inspiration",
  "board_created": false,
  "error_reasoning": null
}
```

Outcome shapes:

```json
// Saved, board already existed
{ "success": true, "board_name": "Inspiration", "board_created": false, "pin_title": "...", "pin_url": "https://www.pinterest.com/pin/<id>/", "error_reasoning": null }

// Saved, board was created on the fly
{ "success": true, "board_name": "Inspiration", "board_created": true, "pin_title": "...", "pin_url": "https://www.pinterest.com/pin/<id>/", "error_reasoning": null }

// Not logged in / session expired
{ "success": false, "error_reasoning": "not authenticated — no valid Pinterest session" }

// No matching pins for the topic
{ "success": false, "search_topic": "...", "error_reasoning": "no pins found for topic" }
```
