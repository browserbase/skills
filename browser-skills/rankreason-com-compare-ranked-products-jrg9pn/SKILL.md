---
name: rankreason-com-compare-ranked-products-jrg9pn
title: Compare Ranked Products on RankReason
description: >-
  Research and recommend products with RankReason: locate the relevant editorial
  ranking, compare top-ranked products, explain why each was ranked, weigh pros
  and cons, and pick the best product for a user's specific requirements.
website: rankreason.com
category: shopping-research
tags:
  - shopping
  - product-research
  - rankings
  - comparison
  - recommendations
  - fetch
source: 'browserbase: agent-runtime 2026-06-02'
updated: '2026-06-02'
recommended_method: fetch
alternative_methods:
  - method: mcp
    rationale: >-
      In a WebMCP-capable browser the page exposes rankreason.search /
      get_ranking / get_product_review / get_article / get_agent_entrypoints /
      navigate tools for structured read-only access.
  - method: browser
    rationale: >-
      The rendered HTML pages mirror the Markdown but cost ~100x more turns; the
      homepage HTML sits behind Cloudflare (use proxies). Fallback only when the
      JSON/Markdown endpoints are unreachable.
verified: false
proxies: false
---
# Compare Ranked Products on RankReason

## Purpose

Research and recommend products using RankReason's source-led editorial rankings. Given a product category or buyer need, this skill finds the relevant ranking list, compares the top-ranked products, explains *why* each product earned its rank (weighted scoring criteria + reasoning), surfaces per-product pros/cons and "best for / not for" fit notes, and identifies the best product for a user's specific requirements. Read-only. RankReason is a static editorial site — it returns research, not live marketplace data (no live price, availability, ratings, review counts, stock, coupons, or seller info).

## When to Use

- "What's the best `<category>`?" — e.g. best air fryer, robot vacuum, portable power station, handheld game console, organic lipstick, gas grill, beach tent, air purifier.
- Comparing the top 2–3 ranked products in a category to pick one for a specific use case (small kitchen, family meals, RV backup power, quiet bedroom, etc.).
- Understanding *why* a product was ranked where it was — the weighted scoring breakdown and editorial reasoning.
- Pulling a single product's pros/cons, verified specs, owner-sentiment themes, and source citations.
- Finding a head-to-head comparison/explainer article between two specific products.

## Workflow

**Recommended method: HTTP fetch of static JSON + Markdown — no browser, no auth, no stealth, no proxy.** RankReason is purpose-built for AI agents: it advertises a discovery catalog and publishes reviewed Markdown dossiers and compact JSON indexes that are CDN-cached with `Access-Control-Allow-Origin: *`. The data endpoints returned `200` with full content on a **bare** `browse cloud fetch` (no `--proxies`, no `--verified`). Driving the rendered HTML UI works too but costs ~100× more turns and adds nothing — every fact on the HTML page is in the `.md` alternate. Lead with fetch; the browser flow is a documented fallback only.

1. **Bootstrap from the agent index.** Fetch `https://rankreason.com/data/agent-index.json`. This compact map is the single best starting point: it lists every `currentRankings` entry (title, `categorySlug`, `rankingSlug`, `period`, HTML `url`, and `markdownUrl`), the focused index URLs, Markdown URL conventions, content counts, and the site's data limitations.

2. **Locate the relevant ranking.**
   - If the user's category maps directly to a `currentRankings[]` entry, use its `markdownUrl`.
   - For broader lookup, fetch `https://rankreason.com/data/rankings-index.json` (full ranking list) or `https://rankreason.com/data/categories-index.json` (taxonomy: `categoryHubs` for browsing + `categories` product-class slugs used by ranking URLs).
   - Markdown convention: current ranking = `/rankings/<rankingSlug>.md`; archived ranking = `/rankings/<rankingSlug>/<period>.md` (`period` is `2026` annual or `2026-05` monthly).

3. **Read the ranking Markdown** at `https://rankreason.com/rankings/<rankingSlug>.md`. This is the core artifact and usually answers the whole question. It contains:
   - A **Methodology** table — scoring criteria with weights (e.g. Cooking performance 30%, Capacity 24%, …).
   - A **Ranked list** table — `Rank | Product | Score | Product dossier` (each dossier is a relative `/products/<slug>.md` link).
   - A **Ranking reasoning** section per product — a "why it ranks here", a short review, a buy/skip **Verdict**, and explicit "why it stays above #N" / "tradeoff versus #N" pairwise comparisons. This is the "understand why products were ranked" payload.

4. **Drill into product dossiers** for the contenders you're comparing: `https://rankreason.com/products/<productSlug>.md`. Each dossier has: rank + score backlink, short review, verdict, full review, **Score breakdown** table (per-criterion score + weight), **Pros**, **Cons**, **Best for**, **Not for**, **Verified facts** (with confidence levels), synthesis/owner-sentiment themes, and a cited **Source list**. Use `data/products-index.json` to look a product up by name/brand and see all its `rankingAppearances` (position + score per ranking).

5. **Check for a head-to-head article.** For "X vs Y" questions, fetch `https://rankreason.com/data/articles-index.json` first — it lists comparison/explainer articles with `relatedProductSlugs` and `markdownUrl` (`/articles/<articleSlug>.md`). Use it before falling back to rankings + product pages.

6. **Synthesize the recommendation.** Map the user's stated requirements to the scoring criteria and each product's "Best for / Not for" notes. The #1 rank is the best all-around pick, but the reasoning section explicitly calls out when a lower-ranked product is the better fit for a narrower need (e.g. single-basket simplicity, small footprint, budget). Cite the RankReason Markdown/HTML URLs you used, and explicitly note that live price/availability require a separate retailer check.

### Browser fallback

Only if the JSON/Markdown endpoints are unreachable. Open a remote session (the homepage HTML sits behind Cloudflare, so use `--proxies` for the rendered UI) and navigate:
- `https://rankreason.com/rankings/` — index of all rankings.
- `https://rankreason.com/rankings/<rankingSlug>/` — ranking detail (same content as the `.md`).
- `https://rankreason.com/products/<productSlug>/` — product dossier.
Each HTML page exposes a `rel="alternate"` Markdown link and also serves Markdown when requested with `Accept: text/markdown`. There is also an optional WebMCP layer: in a WebMCP-capable browser the page exposes tools `rankreason.search`, `rankreason.get_ranking`, `rankreason.get_product_review`, `rankreason.get_article`, `rankreason.get_agent_entrypoints`, and `rankreason.navigate` for structured read-only access.

## Site-Specific Gotchas

- **The data endpoints have no anti-bot.** Despite the homepage sitting behind Cloudflare (the host probe flagged `likelyNeedsProxies: true` for `/`), every `/data/*.json` and `/rankings|products|articles/*.md` endpoint returns `200` on a bare fetch with `Access-Control-Allow-Origin: *` and `Cache-Control: public`. Do not waste a proxy/verified session on the fetch path — it is unnecessary. Proxies are only relevant for the browser-rendered HTML fallback.
- **Start with `agent-index.json`, not `search-index.json`.** The agent index is the compact, intended entrypoint. `search-index.json` is a broad UI-oriented page index that can be large — fetch it only for open-ended site-wide search when the focused indexes don't answer the task.
- **No live marketplace data — by design.** RankReason explicitly does NOT publish live price, availability, ratings, review counts, seller/offer details, shipping, coupons, badges, or promotions. Never infer these from RankReason content. If the user needs them, say a live retailer check is required.
- **Affiliate links never decide rankings** — rankings are source-led editorial. Treat scores/reasoning as the authority, not any outbound retail links.
- **Two-layer taxonomy.** `categoryHubs` (e.g. "Home & Living", "Kitchen & Dining") are editorial/navigation parents. `categories` (product-class slugs like `air-fryers`, `robot-vacuums`, `organic-lipstick`) are what ranking URLs, product `categoryIds`, and Markdown manifests actually use. Map a user's category to the product-class slug, not the hub.
- **"Ranking angles" live in the slug/title, not the taxonomy.** Intents like "for small kitchens" or "without titanium dioxide" are encoded in the ranking slug/title and reasoning text, not as separate category slugs.
- **Catalog is small and dated.** At capture time (May–June 2026) there were 8 current/published rankings, 8 product-class categories, 9 category hubs, 80 reviewed products, and 1 article. Each ranking carries an explicit `period` (e.g. `2026-05`) and `Published`/`Updated` dates — surface the date so the user knows the recency. If a category isn't covered, say so rather than improvising.
- **Prefer Markdown over HTML.** When `markdownUrl` is present in an index it is the cleanest, lowest-token source. Fall back to HTML (or `Accept: text/markdown`) only when reviewed Markdown isn't published for a target.
- **Pairwise reasoning is embedded.** The ranking `.md` includes "Why it stays above #N" and "Tradeoff versus #N" lines per product — use these for the head-to-head comparison rather than re-deriving from raw scores.

## Expected Output

A structured comparison/recommendation object. Shapes below cover the common outcomes.

Category ranking + recommendation:
```json
{
  "outcome": "ranking_found",
  "query": "best air fryer",
  "ranking": {
    "title": "Best Air Fryers for May 2026",
    "categorySlug": "air-fryers",
    "period": "2026-05",
    "published": "2026-05-26",
    "updated": "2026-05-26",
    "source_url": "https://rankreason.com/rankings/best-air-fryers.md",
    "scoring_criteria": [
      { "criterion": "Cooking performance", "weight": "30%" },
      { "criterion": "Capacity and versatility", "weight": "24%" },
      { "criterion": "Usability and maintenance", "weight": "20%" },
      { "criterion": "Owner satisfaction and reliability", "weight": "16%" },
      { "criterion": "Value and research confidence", "weight": "10%" }
    ]
  },
  "ranked_products": [
    {
      "rank": 1,
      "name": "Ninja Foodi 6-in-1 Smart 10-qt XL 2-Basket Air Fryer DZ550",
      "score": 91,
      "dossier_url": "https://rankreason.com/products/ninja-foodi-dz550.md",
      "why_ranked": "Combines high capacity, two-zone flexibility, cooking control, and stronger household-meal fit than other large models.",
      "verdict": "Buy it if you want one air fryer to handle family dinners. Skip it if counter space matters more than capacity.",
      "pros": ["Two independent 5-quart baskets", "Smart Finish and Match Cook help with full meals", "Built-in thermometer adds doneness control"],
      "cons": ["Large counter footprint", "Takes a little learning to time two baskets well"],
      "best_for": ["Families cooking proteins and sides together", "Meal-prep users who want two-zone control"],
      "not_for": ["Tiny kitchens with limited counter depth", "Buyers who only need a compact fries machine"]
    },
    {
      "rank": 2,
      "name": "COSORI TurboBlaze 6.0-Quart Air Fryer CAF-DC601-KUS",
      "score": 89,
      "dossier_url": "https://rankreason.com/products/cosori-turboblaze-caf-dc601-kus.md",
      "why_ranked": "Cleanest single-basket recommendation; roomy enough for normal dinners, hot enough for crisping, easier to live with than larger family fryers.",
      "tradeoff_vs_higher": "Behind the DZ550's broader two-zone dinner capability."
    }
  ],
  "recommendation": {
    "best_overall": "Ninja Foodi DZ550 (rank #1) — best all-around for full family meals.",
    "best_for_user_requirement": "If the requirement is a simple single-basket fryer for a small kitchen, the COSORI TurboBlaze (#2) is the better fit despite the lower rank.",
    "requirement_mapping": "User asked for 'one fryer for weeknight family dinners' -> matches DZ550 'Best for: families cooking proteins and sides together'."
  },
  "limitations": "RankReason does not publish live price, availability, ratings, or stock. Verify those with a retailer.",
  "citations": ["https://rankreason.com/rankings/best-air-fryers.md", "https://rankreason.com/products/ninja-foodi-dz550.md"]
}
```

Head-to-head comparison article available:
```json
{
  "outcome": "comparison_article_found",
  "query": "Ninja Foodi DZ550 vs Cosori TurboBlaze",
  "article": {
    "title": "Ninja Foodi DZ550 vs Cosori TurboBlaze: Which Air Fryer Should You Buy?",
    "kind": "comparison",
    "source_url": "https://rankreason.com/articles/ninja-foodi-dz550-vs-cosori-turboblaze-which-air-fryer-should-you-buy.md",
    "updated": "2026-06-02",
    "related_products": ["ninja-foodi-dz550", "cosori-turboblaze-caf-dc601-kus"],
    "summary": "Choose the DZ550 for a two-basket setup for larger meals; choose the TurboBlaze for a simpler six-quart basket for everyday cooking."
  }
}
```

Category not covered:
```json
{
  "outcome": "not_covered",
  "query": "best mechanical keyboard",
  "message": "RankReason has no published ranking for this category. Available product-class categories: air-purifiers, robot-vacuums, air-fryers, portable-power-stations, gas-barbecue-grills, handheld-game-consoles, organic-lipstick, beach-tents.",
  "checked": ["https://rankreason.com/data/agent-index.json", "https://rankreason.com/data/categories-index.json"]
}
```
