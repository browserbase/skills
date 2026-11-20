---
name: mercadolibre-com-ar-search-compare-monitor-n9hgxe
title: 'MercadoLibre Argentina Search, Compare, and Monitor'
description: >-
  Browse MercadoLibre Argentina category pages, capture product cards (price
  ARS, installments, shipping, MercadoLíder tier, sponsorship), compare listings
  on landed cost and seller trust, and diff a saved listing for
  price/stock/shipping/reputation changes. Read-only. Documents the
  gz/account-verification anti-bot gate that blocks search and product-detail
  pages from anonymous browser sessions.
website: mercadolibre.com.ar
category: marketplace
tags:
  - marketplace
  - ecommerce
  - argentina
  - comparison
  - monitoring
  - anti-bot
  - read-only
source: 'browserbase: agent-runtime 2026-05-20'
updated: '2026-05-20'
recommended_method: hybrid
alternative_methods: []
verified: true
proxies: true
---
# MercadoLibre Argentina — Search, Compare, and Monitor

## Purpose

Research products on MercadoLibre Argentina (`mercadolibre.com.ar`): keyword search, category browsing, listing inspection, side-by-side comparison across sellers, and longitudinal monitoring of a saved listing for price / stock / shipping / seller-reputation changes. Returns structured product, seller, and shipping data in ARS. **Read-only — never adds to cart, never books a purchase, never contacts a seller.** Strict country lock: all queries hit `mercadolibre.com.ar`; if the user asks for another market, branch to a sibling skill, do not mix MLA with MLB/MLM/MCO/etc.

## When to Use

- "Find me the cheapest iPhone 15 128GB in Argentina with envío gratis and 12 cuotas sin interés."
- "Compare these three Smart TV listings: which has the highest seller MercadoLíder rating?"
- "Watch this `articulo.mercadolibre.com.ar/MLA-12345...` URL daily — alert me if price drops > 5%, stock changes, or shipping cost moves."
- "Browse the Celulares y Teléfonos category, filter to Samsung Galaxy A-series with envío Full."
- "Open `/p/MLA######` (catalog product) and rank the 20+ seller offers by total landed cost (price + shipping)."

## Workflow

MercadoLibre's web surface (`mercadolibre.com.ar`) is gated by a multi-tier anti-bot system from automation IPs. **There is no anonymous browser path to search results, individual listings (`articulo.`), or catalog product detail pages (`/p/MLA######`)** — every direct request to those URL patterns server-side redirects to `https://www.mercadolibre.com.ar/gz/account-verification?go=...` which forces login or registration before the target page renders. The walls observed across 4 iterations (verified+proxies, verified-only, with `_bm_skipml=true` bypass cookie set, with cookies accepted, internal click vs direct URL) are reproducible — only homepage / `/ofertas` / `/c/{category-slug}` pages render without the gate.

The two practical paths:

**A. Authenticated browser session (recommended for general use).** Log in once, persist cookies on the session, then all of `/p/MLA######`, `articulo.mercadolibre.com.ar/MLA-...`, and `listado.mercadolibre.com.ar/{query}` become reachable. This is the path a human user takes daily — it is the only browser-only path that unlocks the full surface.

**B. MercadoLibre Developer API (recommended for high-volume / programmatic use).** `https://api.mercadolibre.com/sites/MLA/...` covers search, item detail, seller reputation, and shipping cost — but requires a Bearer OAuth token (free, register an app at <https://developers.mercadolibre.com.ar/>; unauthenticated requests return `403 {"error":"forbidden"}`). For the read-only flows this skill targets, the developer-API path is faster, more stable, and not subject to the account-verification redirect.

Both paths are out of scope for an unauthenticated browser-only run; document the wall and stop at the gate rather than attempting credential/captcha workarounds.

### 1. Open a verified + residential-proxy session

```bash
SID=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
export BROWSE_SESSION="$SID"
```

Both `--verified` and `--proxies` are necessary for the working surfaces. Bare-IP sessions still hit the gate; verified-only also hits it; verified+proxies is the configuration with the highest probability of additional pages rendering and is the documented baseline. Do not omit either flag.

### 2. Land on the homepage and accept cookies

```bash
browse open "https://www.mercadolibre.com.ar/" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 1500 --remote --session "$SID"
browse snapshot --remote --session "$SID"
# Click the "Aceptar cookies" button (ref label is "button: Aceptar cookies",
# typically the last button in the snapshot — refs change per session).
browse click @<accept-cookies-ref> --remote --session "$SID"
```

Cookie acceptance writes `cookiesPreferencesNotLogged`, `hide-cookie-banner`, and `_d2id` which the rest of the site reads. Accepting does **not** unblock the account-verification gate but does prevent the cookie banner from overlaying every subsequent snapshot.

### 3. Discover by category, not by keyword search

The keyword search box submits to `https://listado.mercadolibre.com.ar/{slug}` which is gated. Instead, navigate by category:

```bash
browse open "https://www.mercadolibre.com.ar/c/celulares-y-telefonos" --remote --session "$SID"
browse wait load --remote --session "$SID"
browse wait timeout 2500 --remote --session "$SID"
browse snapshot --remote --session "$SID"
```

Known top-level category slugs (all under `https://www.mercadolibre.com.ar/c/<slug>`):
`celulares-y-telefonos`, `computacion`, `electrodomesticos`, `electronica-audio-y-video`, `tv-audio-y-video`, `moda`, `hogar-muebles-y-jardin`, `deportes-y-fitness`, `belleza-y-cuidado-personal`, `salud-y-equipamiento-medico`, `bebes`, `juegos-y-juguetes`, `herramientas`, `industrias-y-oficinas`, `accesorios-para-vehiculos`, `consolas-y-videojuegos`, `instrumentos-musicales`, `inmuebles`, `vehiculos`, `libros-revistas-y-comics`.

Category pages render product cards (title, ARS price, image, sponsorship flag, MercadoLíder badge, "Envío gratis" / "Envío Full" tags, installments string) but every product card link points into the gated `/p/MLA######` or `articulo.mercadolibre.com.ar/...` URL space, so the cards themselves are the highest-fidelity data this skill can extract anonymously.

### 4. Extract product cards from the category snapshot

Each card surfaces these attributes in the accessibility tree:
- **Title** — `heading: <product name>` element. Heading is canonical; the surrounding `link:` text often duplicates it.
- **Price (ARS)** — sibling `StaticText: $ 123.456` (Argentine peso, dot is thousands separator, no decimals on most cards; `$ 12.345,67` shape appears on cents-priced items).
- **Original price + discount %** — when on sale, a `StaticText: $ <higher>` strikethrough plus `StaticText: NN% OFF`.
- **Installments** — `StaticText: en 12 cuotas de $ X,XXX,XX sin interés` (or `con interés` if financing has interest).
- **Shipping** — `StaticText: Envío gratis` or `Envío Full`. Absence of either = paid shipping (cost not surfaced until product detail).
- **Sponsored flag** — `StaticText: Patrocinado` or `StaticText: Recomendado` adjacent to the title. Distinguish sponsored from organic before ranking.
- **Listing URL** — read the `link:` ref's URL from the snapshot `urlMap`. Save the `MLA######` or `MLAU######` id for monitoring (step 7).

URL ID-shape decode:
- `/p/MLA<digits>` — **catalog product page** (aggregates many sellers for one product; the price shown is the best-offer price).
- `/up/MLAU<digits>` — **universal product page** (fashion / size-variant catalog).
- `articulo.mercadolibre.com.ar/MLA-<digits>-<slug>_JM` — **individual seller listing** (one seller, one ASIN-equivalent).

The `MLA######` id behind a `/p/` URL and the `MLA-######` behind an `articulo.` URL are **different namespaces** — do not equate them.

### 5. Filter / refine within a category

Category pages don't expose a keyword filter, but they expose facet links into `listado.mercadolibre.com.ar/{category-path}/{filter-path}` URLs. **Those URLs are gated.** Anonymous filtering is therefore limited to whichever facets the category page renders inline (typically `Más vendidos`, `Ofertas`, `Envío Full`, brand carousels). To filter to a specific model or attribute, the realistic options are:

- **(A) authenticate**, then any `listado.` URL with `#applied_filter_id={facet}&applied_filter_name={name}&applied_value_id={value}` hash works.
- **(B) developer API**, which exposes `?category={MLA1055}&filter.BRAND={2503}&...` query syntax for any facet ID set discoverable via `GET /sites/MLA/categories/{MLA1055}/attributes`.

### 6. Open a listing for inspection

If the session is authenticated (path A), navigate to the captured `/p/MLA######` or `articulo.mercadolibre.com.ar/MLA-...` URL. On the resulting product detail page (PDP), the headings carry:

- **Title + condition** — `heading: <title>` and adjacent `StaticText: Nuevo | Usado | Reacondicionado`.
- **ARS price + installments** — primary price block, including "cuotas sin interés" if applicable.
- **Shipping section** — `Envío gratis a Capital Federal` / `Envío Full` / cost for paid; entrega-estimada date.
- **Stock** — `Stock disponible` (binary), or `Últimos X disponibles`.
- **Seller block** — seller name link to `mercadolibre.com.ar/perfil/<seller>`, MercadoLíder tier (Platinum / Gold / Silver / none), `Ventas concretadas` count, percentage of `Buenas calificaciones`. **Always extract MercadoLíder tier + concrete-sales count when ranking — it is the most predictive trust signal.**
- **Warranty** — `Garantía del vendedor: N días | meses` or `Garantía de fábrica`.
- **For `/p/MLA######` catalog pages**: a `Comparar precios de X publicaciones` section that lists every seller offering this catalog product with their own price, shipping, and reputation. This is the canonical surface for cross-seller comparison — do not re-derive it by separately opening each seller's `articulo.` URL.

If the session is unauthenticated, stop at the category card and emit a `requires_login: true` flag on the listing record rather than attempting to load the PDP.

### 7. Compare listings

Build a normalized record per listing:

```json
{
  "id": "MLA1040287808",
  "url": "https://www.mercadolibre.com.ar/.../p/MLA1040287808",
  "title": "Apple iPhone 15 128 GB Negro",
  "condition": "nuevo",
  "price_ars": 1899000,
  "original_price_ars": 2200000,
  "discount_pct": 14,
  "installments": { "count": 12, "amount_ars": 158250, "interest_free": true },
  "shipping": { "free": true, "is_full": true, "cost_ars": null, "estimated_delivery": "mañana" },
  "stock": { "available": true, "qty_message": "Stock disponible" },
  "seller": {
    "name": "Apple Store Oficial",
    "mercadolider_tier": "platinum",
    "official_store": true,
    "sales_concretadas": 50000,
    "buenas_calificaciones_pct": 99
  },
  "warranty": { "type": "fabricante", "duration_months": 12 },
  "sponsored": false,
  "captured_at": "2026-05-20T18:34:00Z"
}
```

Rank by a composite that combines `price_ars + shipping.cost_ars` (total landed cost), then break ties on seller trust: `mercadolider_tier ∈ {platinum > gold > silver > none}`, then `official_store`, then `sales_concretadas`, then `buenas_calificaciones_pct`. Penalize `sponsored: true` cards in the ranking unless the user explicitly asked for "best deal overall regardless of origin" — sponsored placement does not correlate with the lowest landed cost. **Do not declare two listings the same product unless every one of `{title-normalized, model, storage/size variant, color, condition}` matches**; MercadoLibre's catalog routinely surfaces near-identical SKUs with different `MLA######` ids (e.g., distinct color variants of the same iPhone model).

### 8. Monitor a listing for change

Persist the step-7 record keyed by `id`. On each subsequent run:

1. Re-open the saved URL via path A (authenticated) or path B (developer API). If anonymous and the URL is in the gated space, the record stays stale — flag `monitor_unavailable: "anonymous_blocked"` and stop.
2. Re-extract the same fields.
3. Diff and emit only **meaningful** changes:
   - `price_ars` delta ≥ 1% (or any change crossing a user-supplied threshold)
   - `stock.available` flip (in-stock → out-of-stock or vice versa)
   - `shipping.free` flip, or `shipping.cost_ars` delta ≥ 5%
   - `seller.mercadolider_tier` change
   - `seller.buenas_calificaciones_pct` drop ≥ 2 points
   - Listing returning a 404 / "Esta publicación ya no está disponible" → emit `removed: true`
   - Listing edited (title, condition, or photo set changed) → emit `edited: true` with the diff
4. Suppress changes that are below threshold or that revert within the same poll cycle.

Do **not** count sponsored-vs-organic placement changes as listing edits — those are advertising-driven and not editorial.

### Browser fallback (anonymous, restricted scope)

When neither authenticated browsing nor a developer-API token is available, the skill operates in a degraded mode:

- ✅ Browse `/c/<category-slug>` pages and read product cards (title, ARS price, installments, shipping flag, MercadoLíder badge, sponsorship). 50–60 cards per top-level category page.
- ✅ Browse `/ofertas` for current promotions (cards have the same shape as category cards).
- ✅ Capture each card's `MLA######` / `MLAU######` id for later authenticated re-fetch.
- ❌ Open `/p/MLA######` PDPs (gated).
- ❌ Open `articulo.mercadolibre.com.ar/MLA-...` listings (gated).
- ❌ Submit keyword search via header search box (gated; redirects to login wall).
- ❌ Click into facet/filter chips on category pages (most of those targets are on `listado.` and gated).

Return partial records with `requires_login_for_detail: true` for any field that needs the PDP. Do not invent fields you couldn't read.

## Site-Specific Gotchas

- **Anti-bot wall: `gz/account-verification` redirect.** Every request to `listado.mercadolibre.com.ar/*`, `articulo.mercadolibre.com.ar/MLA-*`, and `www.mercadolibre.com.ar/{slug}/p/MLA*` (or `/p/MLA*` slug-less) from an automation IP server-side 302s to `https://www.mercadolibre.com.ar/gz/account-verification?go=<encoded-target>&tid=<uuid>`, which renders a login/register choice — there is no "continue as guest" option. The wall fires regardless of: `--verified`, `--proxies`, both flags together, cookie acceptance, the `_bm_skipml=true` Anubis-bypass cookie, internal-click vs typed URL, or session warm-up. Verified during iters 1–4 (2026-05-20) across multiple residential-proxy IPs and one bare-IP session. **Do not waste turns trying to bypass.** The realistic exits are: authenticate (interactive login outside the skill's scope) or switch to the developer API (Bearer-token path under `api.mercadolibre.com`).
- **Working URL set is small.** Confirmed-anonymous-renderable: `/` (homepage), `/ofertas`, `/c/{category-slug}` (top-level only — most subcategory drills go to `listado.` and gate), `/ayuda`, `/privacidad`, `/glossary/{letter}/{page}`. Anything that returns a list of listings — search results, brand pages, deals-per-product — is on `listado.` and gated.
- **`api.mercadolibre.com` requires OAuth Bearer, even on read-only `GET /sites/MLA/search`.** Unauthenticated returns `403 {"message":"forbidden","error":"forbidden","status":403,"cause":[]}` with or without residential proxy. Tokens are free; obtain via app registration at `developers.mercadolibre.com.ar`. There is no anonymous public-data API as of 2026-05-20.
- **Anubis proof-of-work is a separate, secondary defense.** Direct HTTP fetch of `https://listado.mercadolibre.com.ar/<query>` (e.g., via `browse cloud fetch --proxies`) returns a JS micro-landing that runs SHA-256 PoW, sets `_bm_skipml=true`, and forwards to the actual results. **Setting `_bm_skipml=true` preemptively in a browser session does not bypass the account-verification gate** — they are layered. PoW-only bypass works for some scrape-via-curl flows but not for the surfaces this skill needs.
- **Search box submission and direct URL paste are equivalent (both gated).** Submitting "iphone 15" via the header `<input>` posts to `/listado.mercadolibre.com.ar/iphone-15` and immediately hits the same redirect. Whether you click `Buscar` or press `Enter` or paste the URL, the destination is the same.
- **Don't trust the `link:` text in product cards for the product title — read `heading:` instead.** Card link text is built from the URL slug (`escalera-articulada-black-decker-4x4-...`), which is SEO-mangled. The `heading:` element above it carries the proper "Escalera Articulada Black & Decker 4x4 16 Escalones..." string with original capitalization, accents, and brand punctuation.
- **`/p/MLA######` and `MLA-######` in `articulo.` URLs are NOT the same id.** The catalog ID lives in `/p/MLA<digits>` (one ID per catalog product); the listing ID lives in `articulo.mercadolibre.com.ar/MLA-<digits>-<slug>_JM` (one ID per seller offer). A single `/p/MLA1040287808` catalog product can aggregate dozens of distinct `MLA-######` seller listings. Track both separately.
- **`/up/MLAU######` exists for catalog products with size/color/material variants** (mostly fashion). Treat as a parent SKU; each `MLAU` rolls up multiple `MLA-######` listings, the same way `/p/MLA######` does.
- **"Capital Federal" is the default delivery destination** for unauthenticated sessions (visible in the header as "Enviar a Capital Federal"). Shipping cost and `Envío Full` eligibility are computed against that address. To query a different province (Córdoba, Mendoza, etc.), the user must change the location via the header button — and that change does not persist across sessions without login.
- **Sponsored cards are not always flagged.** Most carry a visible `Patrocinado` or `Recomendado` text, but some "splinter" carousel slots (`c_id=/splinter/...` in URL params) are sponsored without an inline badge. The most reliable sponsorship signal is the URL itself: any product URL with `?pdp_filters=deal%3AMLA<dealid>` or `polycard_client=offers` in the query string was reached via a paid placement.
- **Prices are ARS, format `$ <thousands-with-dots>,<cents>` or `$ <thousands-with-dots>`.** Parse `$ 1.899.000` as `1899000`. ARS is volatile vs USD — don't auto-convert to USD without a same-day FX rate the user supplied, and surface the ARS value as primary.
- **Installments string carries financing intent.** `12 cuotas sin interés` = financed at 0% by MercadoCredito/issuer; `12 cuotas con interés` = card APR applies. Total cost ≠ `installment_amount * count` when `con interés` — for `con interés` you cannot compute true total without the issuer APR. Treat `con interés` totals as `unknown_with_floor: price_ars`.
- **The home-page typeahead suggestions can navigate without hitting the search wall — sometimes.** Clicking a typeahead suggestion goes to either a category landing (works) or a `listado.` URL (gated). Behavior depends on the suggestion type (category-keyword vs free-text). Not a reliable bypass.
- **"Hola! Para continuar, ingresa a tu cuenta" gate page has stable layout.** When you land there (URL contains `/gz/account-verification?go=...`), the snapshot has exactly: an "Soy nuevo" registration link, a "Ya tengo cuenta" login link, the `trace-id`, and a cookie banner. Detect this signature programmatically and bail out of the current navigation step rather than retrying — retries do not help.
- **`browse fill <ref> <value>` submits the form before the typeahead dropdown surfaces.** Use `browse click @<combobox>` → `browse type "<text>"` → wait → `browse press Enter` if you need to interact with the search box (e.g., for typeahead-suggestion-driven category navigation).
- **No country selector switch.** Despite MercadoLibre having sibling marketplaces (`.com.br`, `.com.mx`, `.com.co`, etc.), this skill is locked to `mercadolibre.com.ar`. If the user explicitly requests another country, defer to a sibling-country skill — do not blend results across marketplaces.

## Expected Output

The skill produces three distinct output shapes depending on whether the underlying surface was reachable anonymously or required login.

### Anonymous category-browse result (degraded mode, no login)

```json
{
  "mode": "anonymous_category_browse",
  "category": {
    "slug": "celulares-y-telefonos",
    "url": "https://www.mercadolibre.com.ar/c/celulares-y-telefonos",
    "name": "Celulares y Teléfonos"
  },
  "captured_at": "2026-05-20T18:34:00Z",
  "cards": [
    {
      "id": "MLA65091752",
      "id_type": "catalog",
      "url": "https://www.mercadolibre.com.ar/celular-motorola-moto-g06-1284gb-accesorio-de-regalo/p/MLA65091752",
      "title": "Celular Motorola Moto G06 128/4gb + Accesorio De Regalo Verde",
      "condition": "nuevo",
      "price_ars": 199999,
      "original_price_ars": 249999,
      "discount_pct": 20,
      "installments": { "count": 12, "amount_ars": 16666, "interest_free": true },
      "shipping": { "free": true, "is_full": true, "cost_ars": null },
      "sponsored": false,
      "requires_login_for_detail": true
    }
  ],
  "notes": "PDPs and listings gated by mercadolibre.com.ar/gz/account-verification — open each card's URL in an authenticated session or via api.mercadolibre.com (OAuth) for full detail."
}
```

### Authenticated listing detail (path A: logged-in browser)

```json
{
  "mode": "authenticated_listing_detail",
  "id": "MLA1040287808",
  "id_type": "catalog",
  "url": "https://www.mercadolibre.com.ar/apple-iphone-15-128-gb-negro-distribuidor-autorizado/p/MLA1040287808",
  "title": "Apple iPhone 15 128 GB Negro",
  "condition": "nuevo",
  "price_ars": 1899000,
  "original_price_ars": 2200000,
  "discount_pct": 14,
  "installments": { "count": 12, "amount_ars": 158250, "interest_free": true },
  "shipping": { "free": true, "is_full": true, "cost_ars": null, "estimated_delivery": "2026-05-22" },
  "stock": { "available": true, "qty_message": "Stock disponible" },
  "seller": {
    "name": "Apple Store Oficial",
    "url": "https://www.mercadolibre.com.ar/perfil/APPLE+STORE+OFICIAL",
    "mercadolider_tier": "platinum",
    "official_store": true,
    "sales_concretadas": 50000,
    "buenas_calificaciones_pct": 99
  },
  "warranty": { "type": "fabricante", "duration_months": 12 },
  "other_sellers_count": 23,
  "other_sellers_lowest_ars": 1849000,
  "captured_at": "2026-05-20T18:34:00Z"
}
```

### Comparison result (multiple listings)

```json
{
  "mode": "compare",
  "query_context": { "model": "iPhone 15 128GB", "condition": "nuevo", "destination": "Capital Federal" },
  "ranked": [
    { "id": "MLA1040287808", "price_ars": 1899000, "landed_cost_ars": 1899000, "seller_tier": "platinum", "rank": 1, "rank_rationale": "lowest landed cost + platinum seller + interest-free installments" },
    { "id": "MLA1018500855", "price_ars": 1929000, "landed_cost_ars": 1929000, "seller_tier": "gold",     "rank": 2, "rank_rationale": "+$30,000 vs #1; gold seller; same shipping" },
    { "id": "MLA-2891234567", "price_ars": 1849000, "landed_cost_ars": 1899000, "seller_tier": "none",     "rank": 3, "rank_rationale": "lower sticker but +$50k shipping; untrusted seller (no MercadoLíder)" }
  ],
  "captured_at": "2026-05-20T18:34:00Z"
}
```

### Monitor diff (subsequent run on a saved listing)

```json
{
  "mode": "monitor_diff",
  "id": "MLA1040287808",
  "url": "https://www.mercadolibre.com.ar/.../p/MLA1040287808",
  "previous_captured_at": "2026-05-19T18:34:00Z",
  "current_captured_at":  "2026-05-20T18:34:00Z",
  "changes": [
    { "field": "price_ars",                  "from": 1899000, "to": 1799000, "delta_pct": -5.3, "significance": "major" },
    { "field": "shipping.free",              "from": true,    "to": false,                    "significance": "major" },
    { "field": "seller.buenas_calificaciones_pct", "from": 99, "to": 97, "delta_pp": -2,        "significance": "moderate" }
  ],
  "removed": false,
  "edited": false
}
```

### Anti-bot block (when a target URL stays gated)

```json
{
  "mode": "blocked",
  "requested_url": "https://listado.mercadolibre.com.ar/iphone-15",
  "redirected_to": "https://www.mercadolibre.com.ar/gz/account-verification?go=...",
  "reason": "mercadolibre_account_verification_gate",
  "recommendation": "Provide an authenticated session (cookies from a prior login) or switch to api.mercadolibre.com with an OAuth Bearer token."
}
```
