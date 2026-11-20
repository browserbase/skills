---
name: vecros-com-explore-gps-denied-navigation-bkcj4o
title: 'Explore Vecros GPS-Denied Navigation, Drones & Modules'
description: >-
  Render the Vecros React SPA to extract a structured overview of its GPS-denied
  navigation tech, the Athera/Jasper drones, the JETPIX autonomy stack, Vecros
  Cloud, and the Jetcore hardware modules (via the store.vecros.com Shopify JSON
  API). Read-only.
website: vecros.com
category: research
tags:
  - drones
  - robotics
  - autonomy
  - gps-denied
  - navigation
  - research
source: 'browserbase: agent-runtime 2026-06-07'
updated: '2026-06-07'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      vecros.com is a client-rendered React SPA — curl/fetch return only an
      empty <div id="root"> shell, so the marketing/product/autonomy pages MUST
      be rendered in a real browser with a 2-3s hydration wait.
  - method: api
    rationale: >-
      Hardware modules live on a separate Shopify store;
      store.vecros.com/products.json is an auth-free, fast JSON catalog
      (handle/title/variants/price) — use it instead of scraping product HTML.
verified: false
proxies: false
---
# Explore Vecros GPS-Denied Navigation, Drones, Autonomy & Modules

## Purpose

Produce a structured overview of [Vecros](https://vecros.com)' GPS-denied (a.k.a. GPS-independent / "jamming-proof") navigation offering: the drones that use it (Athera, Jasper), the JETPIX autonomy stack that powers it, the Vecros Cloud (VCS) platform, and the hardware compute/flight-control modules sold on the separate `store.vecros.com` Shopify store. Read-only — this skill only navigates and extracts; it never submits forms, requests demos, or adds anything to a cart.

## When to Use

- Building a competitive/landscape brief on GPS-denied or "Level-4 autonomy" drone vendors.
- Extracting Athera / Jasper drone specs (flight time, range, onboard compute, payloads, position accuracy) and feature lists.
- Cataloging the JETPIX autonomy capabilities (vision-aided navigation, obstacle avoidance, tracking modes, onboard CV).
- Enumerating Vecros' purchasable hardware modules/boards (Jetcore flight controller, carrier boards, accessories) and prices.
- Any task that would otherwise scrape Vecros marketing pages — render the SPA, but get the module catalog from the Shopify JSON API.

## Workflow

`vecros.com` is a client-rendered **React SPA**: a plain `curl` / `browse cloud fetch` returns only the empty `<div id="root">` shell with zero content. You **must** render it in a real browser. The hardware modules, however, live on a **separate Shopify store** (`store.vecros.com`) that exposes a clean, auth-free JSON API — use that instead of scraping product HTML. This is the recommended **hybrid** path; the all-browser fallback for modules is at the end.

No stealth is required: the pre-run probe reported no anti-bot, and a plain remote session (no `--verified`, no `--proxies`) renders every page and returns the Shopify JSON in two independent runs.

1. **Start a remote session.**
   ```
   browse stop
   browse open https://vecros.com/ --remote
   browse wait timeout 2000
   browse get text body
   ```
   The homepage nav confirms the product set: Athera, Jasper, Jetcore, Jetcore-FC. **Always `browse wait timeout 2000` (2–3s) after every `browse open`** — the SPA hydrates asynchronously and `get text body` returns empty if you read too early.

2. **Athera — outdoor GPS-denied flagship drone.**
   ```
   browse open https://vecros.com/products/athera --remote
   browse wait timeout 2000
   browse get text body
   ```
   Extract the description ("India's 1st Spatial AI Drone … mission-grade autonomy deployment system"), feature bullets, and the spec block: max flight time **35 min**, position accuracy **5 cm** (no GPS), transmission/BVLOS range **10 km**, onboard compute **NVIDIA Xavier NX (40 TOPS)**, **4G BVLOS** comms, **360° obstacle avoidance**, configurable payloads (10× optical-zoom, RGB+thermal, RGB AI cameras).

3. **JETPIX — the autonomy stack.**
   ```
   browse open https://vecros.com/JETPIX-autonomy --remote
   browse wait timeout 2000
   browse get text body
   ```
   Note the **non-standard path**: it is `/JETPIX-autonomy` (capitalized, no `/products/` prefix). Extract the "Perception Made Simple" positioning and capabilities: vision-aided (GPS-independent) navigation, 4-direction obstacle avoidance, Active Track, Point of Interest, Return to Home, and onboard computer vision (Object Detection, Semantic Segmentation, Object Recognition, Landmark Detection).

4. **Jasper — indoor GPS-denied drone (optional).** Linked from the homepage nav. Navigate to `/products/jasper` the same way for the warehouse/enclosed-space platform if indoor coverage is needed. (Not listed in sitemap.xml — see gotchas.)

5. **Vecros Cloud (VCS).**
   ```
   browse open https://vecros.com/products/vecros-cloud --remote
   browse wait timeout 2000
   browse get text body
   ```
   Capture the platform summary (VCS Drive, VCS Fleet, VCS Inspect / 3D digital twin, VCS wPilot web piloting).

6. **Hardware modules — Shopify JSON API (no scraping).**
   ```
   browse open https://store.vecros.com/products.json?limit=50 --remote
   browse wait timeout 1000
   browse get text body
   ```
   Returns the full product catalog as JSON — `products[].handle`, `.title`, `.variants[].price`, `.variants[].title`. ~14 products today. The flagship compute/flight-control modules are `jetcore-flight-controller-board` (JETCORE-FC, flight control + edge AI on one board, Xavier NX / Orin NX options) and `jetcore-carrier-board` (JETCORE, "Made in India" Jetson carrier board); the rest are expansion boards, cables, cooling, and storage accessories. `products.json` is the **canonical machine-readable source** — `limit` accepts up to 250; paginate with `&page=N` if the catalog grows.

7. **Synthesize** the structured JSON in Expected Output. Stop here — read-only.

### Browser fallback (modules)

If `store.vecros.com/products.json` is ever blocked or rate-limited (not observed — it was open and fast in testing), render `https://store.vecros.com/collections/all --remote`, wait, and read the product cards (title + price) from `browse get text body`, then open individual `/products/<handle>` pages for full descriptions/variants.

## Site-Specific Gotchas

- **`vecros.com` is a React SPA — `curl` / `browse cloud fetch` return an empty shell.** The response is `<!doctype html>…<div id="root"></div>` + a `main.<hash>.js` bundle and nothing else. You must render in a real browser (`browse open --remote`). This is the single most important thing to know about this site.
- **Always wait after `browse open`.** `browse wait timeout 2000` (2–3s) before `get text body`/`snapshot`; the SPA hydrates async and reads too-early come back empty.
- **No anti-bot.** Pre-run probe: none detected (HTTP 200, Fastly-cached). A plain remote session — **no `--verified`, no `--proxies`** — renders every page and returns the Shopify JSON cleanly across two runs. Don't waste budget on stealth here.
- **`get text body` includes inline CSS noise.** The SPA injects `@keyframes …` style blocks into the rendered text; ignore the CSS and read the marketing copy that follows it.
- **JETPIX lives at a non-standard URL: `/JETPIX-autonomy`** — capitalized, and NOT under `/products/`. Guessing `/products/jetpix` will 404 to the SPA's catch-all.
- **Hardware modules are on a SEPARATE domain.** `store.vecros.com` is a Shopify storefront, distinct from the `vecros.com` marketing SPA. Don't look for a `/store` or `/shop` route on `vecros.com` — go straight to `store.vecros.com/products.json`.
- **sitemap.xml is incomplete.** `https://vecros.com/sitemap.xml` lists `/`, `/products/athera`, `/products/vecros-cloud`, `/JETPIX-autonomy`, the `/solution/*`, `/resources/*`, `/support/*` and `/about-us/team` pages — but **not** Jasper or the Jetcore product pages, which are only reachable via the homepage nav. Don't treat the sitemap as the full page inventory.
- **A cookie-consent banner ("We value your privacy" / I accept · I decline) overlays the bottom of every page.** It does NOT block `get text body` extraction and can be ignored for read-only work; it may obscure the bottom of full-page screenshots.
- **Shopify `products.json` is the canonical module catalog** — auth-free, fast, structured. `limit` up to 250, `?page=N` for pagination. Prefer it over rendering store HTML.

## Expected Output

```json
{
  "success": true,
  "company": "Vecros",
  "gps_denied_navigation": {
    "summary": "Vecros builds GPS-denied / 'jamming-proof' autonomous drones and autonomy modules that fuse LiDAR + RGB + thermal + IMU with onboard Spatial AI and vision-aided navigation to fly, map, and avoid obstacles without GPS or radio-nav — marketed as India's first Level-4 autonomy drone system, in indoor and outdoor environments.",
    "enabling_tech": [
      "Spatial AI (onboard real-time inference)",
      "Multi-sensor fusion: LiDAR + RGB + thermal + IMU",
      "JETPIX vision-aided / visual-inertial navigation",
      "Edge AI — no cloud dependency",
      "Live spatial mapping (SLAM-style)",
      "360° / 4-direction obstacle avoidance",
      "5 cm position accuracy without GPS",
      "4G BVLOS link"
    ]
  },
  "drones": [
    {
      "name": "Athera",
      "url": "https://vecros.com/products/athera",
      "environment": "outdoor",
      "description": "India's 1st Spatial AI Drone — mission-grade outdoor autonomy deployment system for ports, construction zones, perimeters and defense.",
      "key_features": [
        "GPS-denied operation",
        "360° obstacle avoidance",
        "Waypoint flying, auto take-off & landing, intelligent following",
        "40 TOPS onboard AI (NVIDIA Xavier NX)",
        "AI on edge (no cloud)",
        "AI high-speed tracking, terrain follow, quick mission"
      ],
      "specs": {
        "flight_time": "35 min max",
        "position_accuracy": "5 cm",
        "range": "10 km (BVLOS transmission)",
        "onboard_compute": "NVIDIA Xavier NX — 40 TOPS",
        "comms": "4G BVLOS",
        "payload": "Configurable: 10x optical zoom (20 MP/4K), RGB+thermal (uncooled VOx, 160x120), or RGB AI (8 MP)"
      }
    },
    {
      "name": "Jasper",
      "url": "https://vecros.com/products/jasper",
      "environment": "indoor",
      "description": "Indoor GPS-denied autonomy platform that self-navigates enclosed, cluttered spaces (warehouses) to map and monitor without disrupting operations.",
      "key_features": [
        "Indoor GPS-denied autonomous flight",
        "Self-navigation through enclosed/cluttered spaces",
        "Autonomous mapping & monitoring"
      ],
      "specs": {"flight_time": null, "payload": null, "range": null}
    }
  ],
  "autonomy": {
    "name": "JETPIX",
    "url": "https://vecros.com/JETPIX-autonomy",
    "description": "Vecros's autonomy stack ('Perception Made Simple') with vision-aided navigation enabling GPS-independent, fail-safe path planning for drones and other robots.",
    "capabilities": [
      "Vision-aided (GPS-independent) navigation",
      "4-direction obstacle avoidance (front/back/left/right)",
      "Active Track", "Point of Interest", "Return to Home",
      "Onboard computer vision: Object Detection, Semantic Segmentation, Object Recognition, Landmark Detection"
    ]
  },
  "cloud": {
    "name": "Vecros Cloud (VCS)",
    "url": "https://vecros.com/products/vecros-cloud",
    "description": "Connected-device cloud platform unifying fleet management, flight media storage, real-time inspection (3D digital twin) and web-based piloting: VCS Drive, VCS Fleet, VCS Inspect, VCS wPilot."
  },
  "modules": [
    {"handle": "jetcore-flight-controller-board", "title": "JETCORE-FC Flight Controller Board", "highlight": true, "type": "flight controller + edge AI compute"},
    {"handle": "jetcore-carrier-board", "title": "JETCORE carrier board", "highlight": true, "type": "Jetson carrier board"},
    {"handle": "jetcore-nvidia-nano-essential-pack", "title": "Jetcore + Nvidia Nano Dev Kit", "highlight": false, "type": "bundle"},
    {"handle": "vecros-bms-board-copy", "title": "VECROS Daughter Board", "highlight": false, "type": "expansion module"}
  ],
  "source": {
    "marketing_pages": "https://vecros.com (React SPA, rendered)",
    "module_catalog": "https://store.vecros.com/products.json"
  },
  "error_reasoning": null
}
```

On partial failure (e.g. a page didn't hydrate, or `products.json` was unreachable), still return the fields that succeeded and set `success: false` with `error_reasoning` naming the page/endpoint that failed.
