---
name: saintjavelin-com-create-visitor-routing-skill-ukomyn
title: Saint Javelin Visitor & Cause-Commerce Router
description: >-
  Routes any saintjavelin.com visitor to the best next action (buy, gift,
  Made-in-Ukraine, impact proof, donate, email signup, share, return for drops)
  using intent rules and repeat-game trust principles, separating stable brand
  facts from dynamic facts needing live checks.
website: saintjavelin.com
category: cause-commerce
tags:
  - ecommerce
  - ukraine
  - routing
  - recommendation
  - shopify
  - cause-marketing
  - personalization
source: 'browserbase: agent-runtime 2026-06-03'
updated: '2026-06-03'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      Shopify products.json/collections.json endpoints are open and reliable for
      stable catalog/brand facts with no anti-bot friction.
  - method: browser
    rationale: >-
      Needed to confirm dynamic facts (live price, currency, stock, active
      sale/drop) that vary by region and time; a proxies-only session renders
      the storefront with no captcha/verified needed.
verified: false
proxies: true
---
# Saint Javelin Visitor & Cause-Commerce Router

## Purpose
This skill helps an AI agent (or a human concierge) route any visitor to **saintjavelin.com** toward the single best next action for *that visitor* — buy a relevant product, pick a gift, prioritize a Made-in-Ukraine item, read impact proof, donate directly, join email/SMS, share the cause, or come back for a drop — in a way that is simultaneously useful to the visitor, economically good for Saint Javelin, and credible to the mission of supporting Ukraine. It is a read-only routing/recommendation playbook: it never completes checkout, never invents urgency, scarcity, or impact figures, and it separates **stable brand facts** (safe to assert) from **dynamic facts** (price, stock, shipping, promos, drops, campaigns) that must be confirmed live before they are quoted.

## When to Use
- A **first-time shopper** lands on the site and asks "what is this / what should I get?"
- A **Ukraine supporter** wants to help but is unsure what to buy.
- A **diaspora / cultural-pride buyer** wants Tryzub, Vyshyvanka, or Ukrainian-identity items.
- A **gift buyer** needs something for a giftee, possibly by budget or occasion.
- A **collector** wants limited drops, recycled war-parts, prints, or numbered/seasonal pieces.
- A **Made-in-Ukraine supporter** wants to maximize money flowing to Ukrainian makers.
- A **gear buyer** wants functional apparel/EDC (backpack, fleece, thermals, Defender line).
- A **donation-first visitor** wants to give money, not buy merch.
- A **skeptical visitor** asks "is this legit / where does the money actually go?"
- A **repeat customer** returns and wants what's new or restocked.
- A **creator / media / partner / wholesale** contact wants press, collabs, or B2B.
- An agent is building a reply, comparison, or shortlist and needs ranked, fit-aware picks.

## Workflow

Recommended method is **hybrid**: pull *stable* catalog/brand facts from Shopify's open JSON endpoints (fast, no rendering, no anti-bot friction), and confirm *dynamic* facts (price, stock, sale %, shipping, active drops/campaigns) against the **live localized storefront** because they change constantly and vary by region. A pure browser flow also works (see *Browser fallback*) but is slower and unnecessary for stable facts.

### Step 0 — Load stable brand facts (assert freely)
These were verified and rarely change. Use them to establish trust and context:

- **Origin:** Founded **Feb 16, 2022** by **Christian Borys** (Ukrainian-Polish-Canadian, former journalist) as a sticker fundraiser for Ukrainian orphans; after the **Feb 24, 2022** full-scale invasion it became a global symbol of support for Ukraine.
- **Mission:** "We are in business to **re-build Ukraine**." Aspires to be the **"Patagonia of Ukraine"** — a heritage outdoor/lifestyle brand built on Ukrainian craftsmanship, moving toward making **every item in Ukraine**.
- **Impact to date:** **$2M+ donated** from sales/profits (brand also cites **$2.3M+** in combined sales + direct contributions). Do **not** quote a more precise live total unless confirmed on-page.
- **Where money goes (beneficiaries named on /pages/where-to-donate):** Help Us Help (Canadian charity, $25M+ aid since 1993), Unite With Ukraine (#UniteWithUkraine), United24 (Ukraine's official fundraising platform), Ukrainian World Congress (est. 1967), Support Ukraine Now.
- **Made-in-Ukraine proof:** Recycled war-part collectibles are designed/made by Ukrainian veterans **Andriy & Mykhailo** (Lviv region). Buy-one-give-one campaigns have run (e.g. **"259 fleeces donated"** via Gen.Ukrainian + AZOV Care Social Fund). A **"Made in Kharkiv"** line exists.
- **Press:** NYT, BBC, CBC, Euronews, Task & Purpose, Toronto Life, BuzzFeed News, CTV (links live on /pages/in-the-media).
- **Disclaimer (always honor):** Saint Javelin is **NOT affiliated with Lockheed Martin or Raytheon**; products are not endorsements of those companies.
- **Contact:** help@saintjavelin.com. Platform: Shopify. Multi-region/currency (USD, CAD, EUR, etc.).

Key stable URLs:
- Impact stories: `/blogs/our-impact` (also the **IMPACT** top-nav item)
- Donate (off-site): `/pages/where-to-donate`
- Story: `/pages/about-us-our-story` · Media: `/pages/in-the-media` · FAQ/policies: `/pages/order-information-customer-faqs-policies`
- Stable JSON: `/products.json?limit=250`, `/collections.json?limit=250`, `/collections/<handle>/products.json`

### Step 1 — Classify visitor intent
Read the visitor's words, referral, and any budget/occasion/recipient signal. Map to one router row below. If ambiguous, default to **first-time shopper** and ask one clarifying question OR lead with Best Sellers + the impact story. Never stall.

### Step 2 — Apply the Visitor Router (primary action + backup)

| Visitor intent | Lead them to (collection/handle) | Primary CTA | Backup CTA |
|---|---|---|---|
| First-time shopper | `best-sellers`, `always-in-stock-products` | "Start with a best-seller" + 1-line impact framing | Read `/blogs/our-impact` |
| Supporter unsure what to buy | `made-in-ukraine-collection`, `best-sellers` | Pick a Made-in-Ukraine best-seller | Join email for drops |
| Diaspora / cultural pride | `embroidered`, `vyshyvanka-drop`, Tryzub items, `made-in-kharkiv` | Vyshyvanka / Tryzub apparel | Flags, patches, stickers |
| Gift buyer | `budget-gifts`, `gifts-for-ukrainians`, `gifts-that-give-back`, `bundles-and-sets` | Match budget → gift; suggest a bundle | Sticker/patch add-on |
| Collector | `recycled-war-parts`, `saint-javelin-day-made-from-shells`, Sasha Maslov prints | Limited recycled war-parts piece | Email for next drop |
| Made-in-Ukraine supporter | `made-in-ukraine-collection`, `recycled-war-parts`, `made-in-kharkiv` | Made-in-UA item (veteran-made) | Buy-one-give-one bundle |
| Gear buyer | EDC Mission Backpack, `defender-collection`, thermals/fleece | Functional flagship gear | Socks/accessories add-on |
| Donation-first | `/pages/where-to-donate` | Send to vetted charities (United24, Help Us Help, etc.) | If they also want a token: a $9 sticker |
| Skeptical visitor | `/blogs/our-impact`, `/pages/in-the-media`, `/pages/reviews` | Show impact stories + press | `/pages/where-to-donate` for full transparency |
| Repeat customer | `NEW`, current drop, `always-in-stock-products` | "What's new since last visit" | Restocked favorites |
| Creator / media / partner | help@saintjavelin.com, `/pages/in-the-media` | Direct to press/partnerships contact | — |

### Step 3 — Rank candidate products/pages
Score each candidate and surface the top 1–3. The most expensive item is **not** the default winner. Weighted criteria:

1. **Visitor fit** (does it match stated intent/recipient/budget?) — highest weight
2. **Usefulness** (will they actually wear/use/keep it?)
3. **Cause alignment** (Ukraine-themed, mission-relevant)
4. **Made-in-Ukraine support** (veteran/maker-made > print-on-demand) — tie-breaker up
5. **Giftability** (presentation, universality) — when intent is gift
6. **Conversion likelihood** (in stock, fair price, low decision friction)
7. **Repeat value** (does it build a returning relationship?)
8. **Trust proof** (has reviews / documented impact)
9. **Brand risk** (avoid items that could read as tasteless out of context)
10. **Live-check need** (penalize items whose price/stock you can't currently confirm)

Practical entry-price ladder (confirm live; varies by region/sale): **stickers ~$9**, sticker packs $15–21, patches $20–47, socks $39, bamboo tees $71–89, hoodies/sweaters $116–186, recycled war-parts collectibles $82–206, EDC backpack ~$180, vyshyvanka ~$246, gift bundles $171–202. Lead budget-sensitive and donation-curious visitors to the **low rungs** — a $9 sticker that converts and recruits a repeat supporter beats pushing a $200 item that doesn't.

### Step 4 — Impact-proof routing (for skeptics & cause-motivated buyers)
When trust or "where does the money go" is the blocker, route in this order: `/blogs/our-impact` (concrete stories: $25k for veterans, 259 fleeces donated, the veterans behind recycled war-parts) → `/pages/about-us-our-story` (the $2M+ / mission narrative) → `/pages/in-the-media` (third-party press) → `/pages/where-to-donate` (full transparency, including the option to skip merch and give directly). Cite only impact facts present on-page; never inflate.

### Step 5 — Transaction optimization (ethical, repeat-game)
- Recommend the **best-fit** item first, then one *relevant* add-on (sticker/patch/socks) — genuine basket-building, not a hard upsell.
- Surface bundles only when they genuinely save money or solve a gift need.
- Capture email/SMS via the standing **"Sign up & get 10% off"** offer when the visitor is interested but not ready — this is the highest-leverage repeat-relationship move.
- Mention real, on-page promos only. **Never fabricate** a sale %, countdown, "only N left," or a fake donation match.
- For donation-first visitors, do not force a purchase; pointing them to `/pages/where-to-donate` is a win for the mission and builds long-term trust.

### Step 6 — Live-check checklist (confirm before quoting any dynamic fact)
Always re-verify these on the **localized live page** (region changes them):
- [ ] **Price** and currency (USD/CAD/EUR auto-switch by geo)
- [ ] **Sale/discount** (BFCM, "5th Anniversary", blowout %s rotate; tags like `bfcm-blowout-25-off` are not promises)
- [ ] **Stock / availability** (use the on-collection **"In stock"** filter; `always-in-stock-products` is the safe-recommendation set)
- [ ] **Shipping origin/ETA** (`at-nova-poshta-warehouse` tag = ships from Ukraine; longer transit)
- [ ] **Active drop** (current homepage/NEW drop changes seasonally)
- [ ] **Live donation campaign** (buy-one-give-one offers are time-bound)
- [ ] **Size/variant** availability before recommending a specific size

### Game-theory framing (why these rules)
Treat every actor — Saint Javelin, the visitor, the AI agent, Ukrainian makers, veterans/NGOs, collaborators, competitors, and media — as players in a **repeated** game. Optimize for trust, repeat purchase, referrals, and mission credibility, not single-transaction extraction. Concretely: honest scarcity/price beats fake urgency (a caught lie ends the repeat game); recommending the *right* (often cheaper) item earns the next visit and a referral; routing a donation-first visitor to a charity instead of forcing merch protects the mission's reputation, which is the brand's core asset; surfacing real impact proof converts skeptics into evangelists. Avoid discount races with competitors — compete on authenticity and Made-in-Ukraine credibility, which are non-replicable.

### Success metrics (optimize toward these)
- **Conversion rate** — visitor → purchase or donation
- **AOV** — via genuine, relevant add-ons/bundles, not pressure
- **Repeat purchase rate** — returning supporters
- **Email/SMS capture rate** — list growth via the 10%-off offer
- **Referrals / shares** — cause-driven word of mouth
- **Impact engagement** — `/blogs/our-impact` and donate-page reads, especially for skeptics
- **Satisfaction / trust** — no buyer's remorse, accurate expectations on price/shipping/impact

### Browser fallback
If JSON endpoints are unavailable or you must confirm a rendered price/stock/promo: open `https://www.saintjavelin.com/` (it 301s to the `www`/localized `/en-us` host), accept the email popup, use top-nav **SHOP / COLLECTIONS / IMPACT**, open the relevant collection, toggle the **In stock** filter, and read the live price/variant block. A residential proxy session is sufficient; verified/stealth was **not** required.

## Site-Specific Gotchas
- **Shopify storefront, low anti-bot.** `products.json` / `collections.json` / `/collections/<handle>/products.json` are open and reliable for *stable* data. A `--proxies` Browserbase session renders the storefront with no captcha/verified needed.
- **Apex 301s to `www`, then 302s to a locale path** (`/pages/x` → `/en-us/pages/x`). Fetch the **localized** URL (e.g. `/en-us/pages/about-us-our-story`) or you get an empty 302 body.
- **Currency & price are geo-dependent** (USD/CAD/EUR auto-switch by IP). Never quote a price without noting region, and re-check live.
- **Sale tags are noise, not truth.** Product tags like `bfcm-blowout-30-off`, `5th-anniversary-sale`, `BFCM-BLOWOUT-2025` are merchandising labels; the *actual* discount must be read from the live price block, and many are expired/seasonal.
- **`at-nova-poshta-warehouse` tag = ships from Ukraine** (Nova Poshta) — set shipping-time expectations accordingly. `at-ecom-warehouse` / `always-in-stock-products` are faster, safer-to-promise picks.
- **Quick-search widget quirk:** some products show *"This product can only be purchased with a selling plan."* This is a Shopify selling-plan/pre-order/subscription artifact surfaced by the search overlay, **not** a sign the item is unavailable — verify on the product page.
- **Collections are heavily duplicated/seasonal** (`bundles`, `bundles-1`, `bundles-and-sets`, `bundles2024`; many `bfcm-*`, `defender-*`, `crimea-beach-*`). Prefer the canonical evergreen handles used in the router (`best-sellers`, `made-in-ukraine-collection`, `budget-gifts`, `recycled-war-parts`, `defender-collection`, `always-in-stock-products`).
- **Honor the Lockheed/Raytheon disclaimer** — never imply official military/defense-contractor endorsement.
- **Impact numbers:** assert "$2M+ donated" (brand also says $2.3M+ incl. direct donations). Do not invent a more precise/current figure; if a live page shows an updated total, prefer that.
- **Read-only:** do not add to cart, check out, apply codes, or submit forms. Stop at the recommendation / page-surfacing step.
- **Don't manufacture urgency or scarcity, run guilt tactics, or enter a discount race** — these break the repeat-game trust the brand depends on.

## Expected Output
A ranked routing recommendation object. Distinct outcome shapes below.

**Shape A — shopper routed to products**
```json
{
  "visitor_intent": "made_in_ukraine_supporter",
  "primary_action": "shop_collection",
  "destination": "https://www.saintjavelin.com/collections/made-in-ukraine-collection",
  "recommendations": [
    {"title": "Tractor Pulling Tank - Keychain (Recycled Artillery Shells)", "handle": "fpv-drone-keychain-recycled-artillery-shells", "made_in_ukraine": true, "veteran_made": true, "price_estimate": "~$117 (CONFIRM LIVE, varies by region)", "why": "Veteran-made, maximal cause alignment, collectible"},
    {"title": "Saint Javelin Olive Green Dad Hat", "made_in_ukraine": true, "price_estimate": "~$68 (CONFIRM LIVE)", "why": "Everyday-wearable Made-in-UA, broad appeal"}
  ],
  "add_on_suggestion": {"title": "Made in Ukraine Sticker", "price_estimate": "~$9"},
  "live_checks_required": ["price", "currency", "stock", "active_sale"],
  "trust_assets": ["/blogs/our-impact", "/pages/where-to-donate"]
}
```

**Shape B — skeptic routed to proof**
```json
{
  "visitor_intent": "skeptical_proof_seeker",
  "primary_action": "show_impact_proof",
  "destination": "https://www.saintjavelin.com/blogs/our-impact",
  "proof_points": ["$2M+ donated from sales", "Recycled war-parts made by Ukrainian veterans Andriy & Mykhailo", "259 fleeces donated (Gen.Ukrainian + AZOV Care)", "Press: NYT, BBC, CBC, Euronews"],
  "follow_up": ["/pages/about-us-our-story", "/pages/in-the-media", "/pages/where-to-donate"],
  "purchase_pressure": "none"
}
```

**Shape C — donation-first visitor**
```json
{
  "visitor_intent": "donation_first",
  "primary_action": "route_to_donate",
  "destination": "https://www.saintjavelin.com/pages/where-to-donate",
  "charities": ["United24", "Help Us Help", "Unite With Ukraine", "Ukrainian World Congress", "Support Ukraine Now"],
  "optional_merch": {"title": "Made in Ukraine Sticker", "price_estimate": "~$9", "note": "offer only if visitor also wants a token; do not force"},
  "email_capture": "offer 10% sign-up if interested in future drops"
}
```

**Shape D — gift buyer by budget**
```json
{
  "visitor_intent": "gift_buyer",
  "constraints": {"budget_usd": 50, "occasion": "birthday"},
  "primary_action": "shop_collection",
  "destination": "https://www.saintjavelin.com/collections/budget-gifts",
  "recommendations": [
    {"title": "TRYZUB Christmas Socks", "price_estimate": "~$39", "giftability": "high"},
    {"title": "Super 3 Sticker Pack", "price_estimate": "~$21", "giftability": "medium"}
  ],
  "live_checks_required": ["price", "stock", "shipping_eta"],
  "rationale": "Best-fit-within-budget chosen over most expensive item"
}
```
