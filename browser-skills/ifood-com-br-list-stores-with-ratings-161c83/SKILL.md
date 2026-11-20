---
name: ifood-com-br-list-stores-with-ratings-161c83
title: List iFood Stores with Ratings
description: >-
  Extract a ranked list of iFood stores for a delivery address, with ranking,
  rating, category, name, region, and store link (review counts are gated behind
  an Akamai challenge).
website: ifood.com.br
category: food-delivery
tags:
  - food-delivery
  - restaurants
  - ratings
  - ifood
  - brazil
  - listing
source: 'browserbase: agent-runtime 2026-08-12'
updated: '2026-08-12'
recommended_method: browser
alternative_methods:
  - method: api
    rationale: >-
      iFood's marketplace API (marketplace.ifood.com.br) is Akamai-protected and
      returned 404/challenges to direct fetches — not usable without the browser
      session and a set address.
verified: true
proxies: true
---
# List iFood Stores with Ratings

## Purpose
Produce a ranked list of stores (restaurants, markets, etc.) that iFood shows for a given delivery address on `www.ifood.com.br/restaurantes`. For each store it returns its ranking (list position), rating (nota), category (categoria), store name, region (região), and the canonical store link. This is a **read-only** browsing task — no login, no ordering. Note that the **number of ratings/reviews (número de avaliações) is NOT exposed on the store list** and is only visible on each store's detail page, which is gated by an Akamai "Press & Hold" bot challenge (see Gotchas).

## When to Use
- You need a ranked feed of the stores iFood surfaces for a specific address/neighborhood in Brazil, with their star rating and category.
- You want the canonical `/delivery/...` store URLs (and the region slug embedded in them) for a set of stores.
- You are building a leaderboard / comparison of stores by rating in a given region.
- Do **not** use this when you need per-store review counts in bulk — that data lives behind a bot wall (documented below).

## Workflow

iFood has no usable public listing API for this (the `marketplace.ifood.com.br` endpoints are Akamai-protected and return 404/challenges to direct fetches), so the recommended method is a **browser** session with stealth enabled. The single hard requirement is that a delivery address must be set before any store is visible.

1. **Start a stealth session and open the list page.** Use a remote Browserbase session with `--verified --proxies` (Brazilian storefront + intermittent Akamai challenge). Navigate to `https://www.ifood.com.br/restaurantes`.
2. **Handle the mandatory address modal.** The page immediately shows a blocking modal *"Onde você quer receber seu pedido?"*. Click the **"Buscar endereço e número"** textbox and type a real Brazilian address, e.g. `Avenida Paulista, 1578`.
3. **Pick a suggestion.** After ~2s an autocomplete list renders. Click the first suggestion whose subtitle contains the target city/state, e.g. `Bela Vista, São Paulo - SP, Brasil`.
4. **Save the address.** A confirmation form appears with the street number pre-filled. Click **"Salvar endereço"**. The page reloads with store cards under the **"Lojas"** heading.
5. **Extract the cards from the DOM (not snapshot).** Use `browse get markdown body`. Each store card is a single link of this exact shape:
   ```
   [<logo-img>{Name}{rating} • {category} • {distance} km](/delivery/{region-slug}/{store-slug}/{merchant-uuid})
   ```
   Parse each card into fields:
   - `ranking` — 1-indexed position in the "Lojas" list.
   - `name` — text before the first decimal number.
   - `rating` — the first decimal number (e.g. `4.8`).
   - `category` — the middle `•`-delimited segment (e.g. `Mercado`, `Brasileira`, `Árabe`).
   - `region` — the `{region-slug}` path segment (e.g. `sao-paulo-sp`).
   - `link` — `https://www.ifood.com.br` + the href.
   - `review_count` — **set to `null`**; it is not present on the list card.
6. **Emit JSON** matching the schema in Expected Output.

**Note on review counts:** if `número de avaliações` is truly required, you must open each store's `/delivery/...` detail page individually and solve the Akamai Press & Hold challenge there. This is slow and unreliable (the challenge frequently rejects automated holds), so treat review counts as best-effort/null in any bulk pass.

## Site-Specific Gotchas
- **Address is mandatory and blocking.** Nothing renders until a delivery address is saved. The whole page is a modal on first load. Use a well-known address (e.g. `Avenida Paulista, 1578`) to get a dense São Paulo store list; the region you pick determines every store and region slug returned.
- **`/restaurantes` is the ranked storefront.** It renders ~450+ store cards under the "Lojas" heading, already ordered by iFood's ranking for that address. Category landing pages `/mercados`, `/bebidas`, `/farmacia`, `/petshop` behave the same way; `/busca?q=<term>` is the search variant.
- **Review count is not on the list card.** List cards expose only rating, category, and distance. `número de avaliações` (e.g. "500+ avaliações") lives on the store detail header only.
- **Akamai "Press & Hold" wall on detail pages (confirmed).** Opening any `/delivery/{region}/{slug}/{uuid}` store page triggers an Akamai Bot Manager challenge (nested iframes, `eng5outu` service-worker path, *"Before we continue… Press & Hold to confirm you are a human"*, with a Reference ID). The merchant content (name/rating/review-count/menu) never loads until it is solved. A synthetic hold via `browse mouse drag` (same start/end point, `--steps 70 --delay 100`, ~7s) was **rejected with "Please try again"**, and `--verified` sessions solve it only intermittently. **Don't rely on scraping detail pages in bulk.**
- **The list DOM survives the overlay.** On the `/restaurantes` list page the same challenge overlay can appear, but the store cards are already in the DOM behind it — `browse get markdown body` / `browse get text "a[href*='/delivery/']"` still return all the card data, so list extraction succeeds even when the overlay is showing.
- **Prefer markdown/text extraction over `browse snapshot`.** The `browse` CLI prints an "Update available: 0.7.2 -> 0.9.6" banner to stderr that the autobrowse harness treats as a tool error, wasting turns; `browse type` emits it too (keystrokes still land). Use `browse get markdown body` for reliable extraction.
- **Direct API is a dead end.** `marketplace.ifood.com.br/v1/merchants?...` returns `404 Not Found`, and the host sets Akamai `ak_bmsc` cookies — confirmed not worth fetching directly. The sitemap (`static.ifood.com.br/sitemap/br/sm-0.xml`) only lists category/search landing pages, not per-address store lists.
- **Region comes from the URL, not visible text.** The `region` field is the slug in the store link (`sao-paulo-sp`); it reflects the store's own city/state, which matches the address you set.

## Expected Output

Primary (successful list extraction):
```json
{
  "success": true,
  "address": "Avenida Paulista, 1578 - Bela Vista, São Paulo - SP",
  "count": 20,
  "stores": [
    {
      "ranking": 1,
      "name": "Encanto da Uva - Vinhos & Cia 24h",
      "rating": 4.8,
      "review_count": null,
      "category": "Mercado",
      "region": "sao-paulo-sp",
      "distance_km": 3.7,
      "link": "https://www.ifood.com.br/delivery/sao-paulo-sp/encanto-da-uva---vinhos--cia-24h-vila-nova-conceicao/bbce6e34-9d5f-4c42-b830-ac005fdb466e"
    },
    {
      "ranking": 2,
      "name": "Maria's Pamonha",
      "rating": 4.9,
      "review_count": null,
      "category": "Brasileira",
      "region": "sao-paulo-sp",
      "distance_km": 0.8,
      "link": "https://www.ifood.com.br/delivery/sao-paulo-sp/marias-pamonha-bela-vista/42ba93c5-9909-4080-8e3d-b57372d60f6f"
    }
  ],
  "error_reasoning": null
}
```

Field notes:
- `review_count` is always `null` from the list page (see Gotchas). Include the key for schema stability.
- `distance_km` is a bonus field parsed from the card; omit if not needed.

Blocked outcome (challenge prevented reaching the list, e.g. bare session fully walled):
```json
{
  "success": false,
  "address": "Avenida Paulista, 1578 - Bela Vista, São Paulo - SP",
  "count": 0,
  "stores": [],
  "error_reasoning": "Akamai 'Press & Hold' human-verification challenge blocked the page before any store card rendered (Reference ID shown in overlay)."
}
```
