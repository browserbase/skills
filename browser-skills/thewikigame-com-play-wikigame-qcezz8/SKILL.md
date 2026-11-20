---
name: thewikigame-com-play-wikigame-qcezz8
title: Play The Wiki Game
description: >-
  Play a live round of The Wiki Game: plan a short Wikipedia link-path from the
  round's Start article to its Goal with the Wikipedia API, then click through
  it in the browser within the 120s clock, returning the winning path, clicks,
  and score.
website: thewikigame.com
category: games
tags:
  - games
  - wikipedia
  - pathfinding
  - puzzle
  - navigation
source: 'browserbase: agent-runtime 2026-06-12'
updated: '2026-06-12'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      Pure greedy browsing (read the current article's iframe links, click the
      one most related to the goal, repeat) works without the API but is slower
      and less reliable at finding the shortest path inside the 120s limit.
  - method: api
    rationale: >-
      The Wikipedia API finds the optimal route, but cannot register a score —
      clicks must be executed on thewikigame.com in a browser, so the API alone
      cannot complete the task.
verified: false
proxies: false
---
# Play The Wiki Game

## Purpose

Play one live round of [The Wiki Game](https://www.thewikigame.com/play/): navigate from the round's **Start** Wikipedia article to its **Goal** article using only in-article links, within the 120-second clock, in as few clicks as possible. Returns the winning path, click count, score, and placement. The recommended approach is **hybrid**: compute a short route up front with the Wikipedia REST API (`prop=links` / `prop=linkshere`), then execute the clicks in the browser (the browser is mandatory — only clicks made on thewikigame.com register a score). Fewer clicks + faster finish = more points.

## When to Use

- You want an agent to autonomously play and win a round of The Wiki Game.
- You need to find and follow a short Wikipedia link-path between two given articles.
- Benchmarking link-graph pathfinding (bidirectional BFS) against a live, timed game.

## Workflow

The page is a thin React client. The Start article is rendered inside a **same-origin iframe** (its `className` contains `w-full h-screen`); its links are anchors with `href="./<Article_Name>"`. Clicking one routes the app to `/play/<Article_Name>` and reloads the iframe with that article. **Plan before you click** — the 120 s clock is tight, and each browser round-trip costs a second or two.

1. **Open the game.** `browse open https://www.thewikigame.com/play/ --remote`. No login is required — the site silently assigns an anonymous account (e.g. `BlackEel8889`).
2. **Dismiss consent.** If a "SP Consent Message" dialog is present, click its **OK** button (it sits in a child iframe).
3. **Read the round.** Extract the **Start** title, **Goal** title, and the "Round ends in N seconds" timer from the left sidebar. (`browse get markdown body` shows them as `Start<Title>` / `Goal<Title>`.) Rounds are **global and rotate every ~2–3 minutes** — if "New Round in Ns" / "Get Ready…" is showing, wait for it to start so you get a full clock.
4. **Plan the path with the Wikipedia API** (`browse cloud fetch`, no proxy needed). Do a bidirectional search:
   - Forward links of Start (namespace 0, paginate `plcontinue` to get all):
     `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=links&pllimit=500&plnamespace=0&titles=<Start>`
   - Articles that link **into** Goal (paginate `lhcontinue`):
     `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=linkshere&lhlimit=500&lhnamespace=0&titles=<Goal>`
   - If Goal ∈ Start's forward links → **1 click**. Else intersect the two sets → any common article gives a **2-click** path `Start → mid → Goal`. If empty, expand one more level from a few high-degree members of Start's forward set (countries, decades, broad topics like *Science*, *Plato*, *Cosmology* make excellent bridges).
   - **Paginate fully** — the 500-cap truncates alphabetically and hides most bridges if you don't.
5. **Click "Play Now"** to enter the Start article (`/play/<Start>`).
6. **Execute the path.** For each hop, find the anchor in the iframe and `.click()` it, then wait ~1.5 s and re-read the iframe's `contentDocument.title` to confirm arrival. Helper evals:
   ```js
   // list current article's outgoing article links
   (()=>{let f=[...document.querySelectorAll('iframe')].find(f=>(f.className||'').includes('w-full h-screen'));
    let d=f.contentDocument;
    return JSON.stringify([...d.querySelectorAll('a')].map(a=>a.getAttribute('href'))
      .filter(h=>h&&h.startsWith('./')).map(h=>decodeURIComponent(h.slice(2))));})()

   // click a specific target (e.g. ./Cosmology)
   (()=>{let f=[...document.querySelectorAll('iframe')].find(f=>(f.className||'').includes('w-full h-screen'));
    let d=f.contentDocument;let a=[...d.querySelectorAll('a')].find(a=>(a.getAttribute('href')||'')==='./Cosmology');
    if(!a)return 'NOLINK';a.click();return 'OK';})()
   ```
   Before each planned hop, confirm the link is actually present in the rendered iframe; if a planned intermediate is missing, pick another iframe link that the API says links to your next planned node.
7. **Detect the win.** When the current article's iframe title equals the Goal, the site overlays a result panel: *"Your winning path: A → B → Goal"* and *"<username> is 1st place! (N pts)"* with a **Keep Playing** button. Read the path, points, and placement from `document.body.innerText`.
8. **Record the score** into the output JSON (path, clicks, points, placement).

## Site-Specific Gotchas

- **The article lives in an iframe, not the top document.** `document.querySelectorAll('a')` on the page returns **0** anchors — there are dozens of ad iframes plus the one article iframe (`className` contains `w-full h-screen`, `contentDocument.title` = current article). Always reach into that iframe's `contentDocument`. It is same-origin, so JS can read and click its links directly.
- **Links are relative `./Article_Name` anchors** (underscores, URL-encoded). The Wikipedia API returns titles with spaces — normalize (`Article_Name` ↔ `Article Name`) when matching.
- **Rounds are global and rotate every ~2–3 min.** Every player gets the same Start/Goal. If the round rotates mid-plan, the sidebar Start/Goal change — re-read them and re-plan; never trust a plan for the previous round. Click **Play Now** right after a fresh round begins to get the full 120 s.
- **The 500-link API cap is alphabetical.** A single `prop=links` call returns only the first ~500 titles (often only up to "E…"). You will miss almost every useful bridge unless you paginate with `plcontinue`. Same for `linkshere`/`lhcontinue`.
- **High-degree hubs are the best bridges**: countries, regions, decades, and broad topic pages (e.g. *Science*, *Plato*, *Cosmology*, *Society*) link to and from huge numbers of articles, so they reliably yield 2-click paths. Verified live: `Research → Cosmology → Radiation` and `Poseidon → Plato → Society`, both 2 clicks, both 1st place at 900 pts.
- **Wikipedia API matches the rendered links well** because thewikigame renders the live article, but it is a *superset* (it includes redirects/links that may render differently). Always re-validate each hop against the live iframe link list before clicking.
- **No anti-bot, no proxy, no login required.** Anonymous account is auto-created; pre-run probe and live testing showed no bot protection. A plain remote browser session (no `--verified`, no `--proxies`) works. Heavy ad/consent iframes are present — ignore everything except the article iframe.
- **Scoring**: reaching the Goal awards points scaled by speed and click-efficiency (a clean 2-click finish scored 900 pts and 1st place in testing). Points and placement appear only on the post-win panel, which is replaced by the next round's "Creating New Round…" within seconds — read it immediately after the final click.

## Expected Output

```json
{
  "success": true,
  "start": "Poseidon",
  "goal": "Society",
  "path": ["Poseidon", "Plato", "Society"],
  "clicks": 2,
  "score": 900,
  "placement": 1,
  "time_remaining_seconds": 49,
  "error_reasoning": null
}
```

Failure shape (timer expired, round rotated mid-play, or no path found in time):

```json
{
  "success": false,
  "start": "Kofi Annan",
  "goal": "Southern Europe",
  "path": ["Kofi Annan", "Geneva"],
  "clicks": 1,
  "score": null,
  "placement": null,
  "time_remaining_seconds": 0,
  "error_reasoning": "Round rotated before reaching the goal; re-read Start/Goal and replan."
}
```
