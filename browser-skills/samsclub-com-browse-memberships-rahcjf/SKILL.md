---
name: samsclub-com-browse-memberships-rahcjf
title: Sam's Club Membership Browser
description: >-
  Return Sam's Club's consumer membership tiers (Club, Plus) with standard
  annual prices, current promo first-year prices, promo window dates, and the
  full per-tier benefits list. Read-only; never joins or enters payment info.
website: samsclub.com
category: retail
tags:
  - retail
  - memberships
  - pricing
  - warehouse-club
  - read-only
  - samsclub
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: api
    rationale: >-
      There is no dedicated tier-listing API endpoint on Sam's Club's developer
      portal. The /join page is server-rendered with all tier names, prices,
      benefits, and promo copy embedded as inline JSON, so an HTTP GET on that
      URL is functionally an API and is the recommended path.
  - method: browser
    rationale: >-
      Browser fallback works but is ~100× slower and can surface a 'Press &
      Hold' CAPTCHA overlay on initial load. The overlay is cosmetic — `browse
      get text body` reads the populated DOM through it — so the browser path is
      still functional, just unnecessary when HTTP fetch succeeds.
verified: true
proxies: true
---
# Sam's Club Membership Browser

## Purpose

Return the consumer membership tiers Sam's Club currently sells — `Club` and `Plus` — along with each tier's standard annual price, current promotional first-year price (when a promo is running), promo window dates, and the full benefits list for each tier. Read-only; never clicks "Join", never enters payment info, never creates an account. The output is a single JSON object listing both tiers and the active promo window (if any).

## When to Use

- A research / monitoring agent comparing warehouse-club memberships (Sam's Club vs. Costco vs. BJ's).
- A budget-tracking agent surfacing the user's renewal cost vs. the cheapest current new-member promo.
- A price-tracking agent watching for promo windows ("Save $35 on Club / $65 on Plus" / etc.) and alerting when a new promo opens or the headline savings change.
- Any flow that needs the tier list + benefits without booking. Joining is a separate flow that requires payment + a household member's identity — out of scope here.

## Workflow

The `https://www.samsclub.com/join` page is **fully server-rendered**: the membership tier names, prices, benefits, and promo copy are all embedded as inline JSON inside the response HTML. An HTTP `GET` of this single URL is the recommended path — no JS execution, no auth, no cookies, no anti-bot challenge on the HTTP layer. The interactive browser flow does occasionally surface a "Press & Hold" CAPTCHA overlay, but the underlying DOM populates regardless and `browse get text body` reads cleanly through it — so the browser fallback is still functional, just slower.

### 1. HTTP fetch (recommended)

```
GET https://www.samsclub.com/join
```

No headers required beyond a default User-Agent. Returns ~120 KB of HTML on a 200 status in ≤ 1 s. From any agent runtime that can do outbound HTTPS, plain `curl` / `fetch` / `requests` works. From a Browserbase-only sandbox, use `browse cloud fetch "https://www.samsclub.com/join"` — `--proxies` is **not required**; the URL is not geo-locked or IP-throttled at the HTTP layer.

### 2. Extract the four numeric prices

The HTML contains two distinct price-bearing JSON blocks per tier. Grep / regex on these exact tokens:

| Marker | Meaning |
|---|---|
| `"price":"$50/year","title":"Club"` | Club standard annual (renewal) price |
| `"price":"$110/year","title":"Plus"` | Plus standard annual (renewal) price |
| `<s>$60</s><br><b>$25/first year</b>` (also as `<s>$60</s><br><b>$25/first year`) | Club promo: struck-through "was" + first-year promo price |
| `<s>$120</s><br><b>$55/first year</b>` (likewise unicode-escaped variant) | Plus promo: struck-through "was" + first-year promo price |

Both the literal `<s>…</s>` HTML form and the unicode-escaped `<s>` form appear in the same response (the HTML version in rendered markup, the unicode form inside the JSON-config block). Match either.

Headline promo savings copy:

```
For a Limited Time: Save $65 on Plus or $35 on Club
```

→ `Save $35 on Club` ⇒ Club savings = $35, `Save $65 on Plus` ⇒ Plus savings = $65. Cross-check that `was_price − promo_price` equals the headline savings (`$60 − $25 = $35`, `$120 − $55 = $65`). If they don't match, the promo has changed since this skill was authored — emit what you found and flag the mismatch in `error_reasoning`.

### 3. Extract the benefits list

Each benefit row is rendered inside a `benefits-comparison-grid` block. Look for repeated objects of the shape:

```json
{
  "benefit": "Free Shipping on Orders Over $50",
  "clubBenefitEligibility": "false",
  "clubBenefitExtraDescription": "...",
  "plusBenefitEligibility": "true",
  "plusBenefitExtraDescription": "Plus members receive free shipping on eligible orders over $50."
}
```

`clubBenefitEligibility` / `plusBenefitEligibility` are stringified booleans (`"true"`/`"false"`) — parse accordingly. Standard rows observed:

| Benefit | Club | Plus |
|---|---|---|
| Instant Savings | ✓ | ✓ |
| Member Only Fuel Prices | ✓ | ✓ |
| 100% Satisfaction Guarantee | ✓ | ✓ |
| Scan & Go | ✓ | ✓ |
| Two Membership Cards | ✓ | ✓ |
| Free Curbside Pickup | ✓ | ✓ |
| Sam's Club Mastercard® | ✓ | ✓ |
| Bonus Offers | ✓ | ✓ (20% more Sam's Cash) |
| 2% Sam's Cash™ Back (in-club, up to $750/yr) | ✗ | ✓ |
| Free Shipping on Orders Over $50 | ✗ | ✓ |
| Free Delivery from Club on Orders Over $50 | ✗ ($12 fee) | ✓ |
| Early Shopping Hours (1 hr early in-club) | ✗ | ✓ |
| Pharmacy Savings ($0 on select generics) | ✗ | ✓ |
| Optical Savings (40% off second pair) | ✗ | ✓ |
| Tire & Battery Center Savings (50% off install) | ✗ | ✓ |

Do not hardcode this table — re-parse from the response each run. New benefits get added (e.g., the Mastercard cashback rates have rotated historically) and Plus-only rows occasionally migrate to all-tier as promotions expire.

### 4. Promo-window dates

Promo period appears in legal-disclaimer copy like "Must join as a new member between May 14, 2026 and June 15, 2026 …". Extract with a regex over the response body — `between ([A-Z][a-z]+ \d{1,2},? \d{4}) and ([A-Z][a-z]+ \d{1,2},? \d{4})`. If the promo has expired or no promo block is present, set `promo: null` in the output and use the standard prices ($50/$110) as the only price quoted per tier.

### Browser fallback

Use only when the HTTP path is unavailable (network restrictions in the calling runtime, or the inline JSON shape has changed and a structural re-render is needed for inspection):

```bash
sid=$(browse cloud sessions create --keep-alive --verified --proxies \
  | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(JSON.parse(s).id))")
browse open "https://www.samsclub.com/join" --remote --session "$sid"
browse wait load --remote --session "$sid"
browse wait timeout 3000 --remote --session "$sid"
# Don't snapshot — if the Press & Hold overlay is present, snapshot returns
# only 30 a11y refs (all on the overlay). Read the underlying DOM directly:
browse get text body --remote --session "$sid"
# Parse the returned text the same way as step 2 above — the prices,
# benefits table, and promo dates all appear in the rendered text even
# when the CAPTCHA overlay covers them visually.
browse cloud sessions update "$sid" --status REQUEST_RELEASE
```

Do **not** click the "Join Plus" / "Join Club" buttons. Do **not** "Press & Hold" the CAPTCHA — even if it grants navigation, the next page is a payment funnel. Read-only stops at the comparison table.

## Site-Specific Gotchas

- **Two price-shapes per tier in the same response, and they disagree.** The promo "was" price ($60 Club / $120 Plus) does not equal the standard renewal price ($50 Club / $110 Plus). Both numbers are real and both come from Sam's Club's own data. The $50 / $110 figures are the ongoing annual price tagged `"price":"$50/year","title":"Club"` (and the Plus equivalent) — these are the right numbers to surface as `annual_price_usd`. The $60 / $120 figures appear only inside the strike-through marketing card and represent Sam's "regular new-member rate" (likely the pre-promo MSRP). When a user asks "what does Sam's Club cost?", report $50 / $110 and call out the $25 / $55 promo as a discount off that, not off the $60 / $120 strike-through.
- **Promo dates are in disclaimer text, not in a dedicated field.** Sam's doesn't expose `promo_start_at` / `promo_end_at` as structured data. The only machine-readable form is the natural-language phrase "Must join as a new member between {start_date} and {end_date}" inside the fine-print block. Date-parse from that.
- **"Press & Hold" CAPTCHA appears on the browser path, never on the HTTP path.** Verified across two sessions — the first browser session (`--verified --proxies`) surfaced the "Robot or human?" press-and-hold modal on initial load; the second session loaded clean. The HTTP fetch never sees it. **The CAPTCHA overlay is purely cosmetic** — the underlying DOM populates fully under it, so `browse get text body` reads through it. `browse snapshot` does not — snapshot returns 30 refs all belonging to the overlay itself. Use `get text body`, `get html body`, or `get markdown body` to read through CAPTCHA states.
- **`browse snapshot` returns "Session not found" immediately after `browse open`** on this site. Always interleave `browse wait load` then `browse wait timeout 3000` before the first `snapshot`/`get` — the first second after navigation the CDP target is being swapped out from under the browse driver. The autobrowse iter-1 trace shows this clearly: `open` → `snapshot` returned `-32001 Session with given id not found`, but `open` → `wait load` → `snapshot` succeeded on the next turn.
- **`browse cloud fetch` works without `--proxies`.** Sam's Club is not blocking the Browserbase fetch egress, so the residential-proxy round-trip cost is wasted on this URL. Verified two consecutive 200 OK responses, ~118 KB, with `Akamai-Grn` headers present (so the CDN is in front but is letting the request through).
- **Direct `curl` from the browse.sh sandbox is firewall-blocked.** DNS resolution fails (`curl: (6) Could not resolve host: www.samsclub.com`). The sandbox only allows outbound HTTP via `browse cloud fetch` (which exits through Browserbase). This is a property of the **sandbox**, not the site — production agents on normal infra can `curl` the URL directly.
- **The page is geo-personalized but the data we care about is not.** Response cookies include `assortmentStoreId=<NNNN>` and a `locDataV3` blob that encodes the inferred user club / city (Atlanta GA or Dallas TX in our two fetches — depends on Browserbase egress IP). Membership prices and benefits do not vary by geography in any of the responses observed. Ignore the geo block.
- **No public membership API.** The Sam's Club Developer Portal exposes APIs for orders / shoppingcart / location, but does not have a "list membership tiers / prices" endpoint. The inline JSON inside `/join` is the canonical machine-readable surface for this data.
- **Walmart cookies are shared.** The response sets `AID` on `.walmart.com` and `ACID` on `.samsclub.com` — both are the Walmart inc. ad/identity cookies. If you're chaining HTTP fetches to walmart.com in the same session, expect cookie cross-pollination.
- **Sam's Mastercard cashback rates are inside the page text and change.** As of the converged run: 5% Sam's Cash on gas (first $6,000/yr), 3% dining, 1% other; Club members earn 1% in-club, Plus members earn 3% in-club. These numbers have rotated historically — always re-parse from the response, never hardcode.

## Expected Output

```json
{
  "success": true,
  "memberships": [
    {
      "tier": "Club",
      "annual_price_usd": 50,
      "regular_new_member_price_usd": 60,
      "promo_first_year_price_usd": 25,
      "promo_savings_usd": 35,
      "benefits": [
        "Instant Savings — limited-time discounts auto-applied in-club or online",
        "Member Only Fuel Prices",
        "100% Satisfaction Guarantee",
        "Scan & Go (in-app checkout, café orders, fuel)",
        "Two Membership Cards (one household member included)",
        "Free Curbside Pickup on eligible orders",
        "Sam's Club Mastercard® eligibility — 1% back at Sam's Club for Club tier",
        "Bonus Offers — Sam's Cash on dining, shopping & more outside the club"
      ],
      "join_button_label": "Join Club"
    },
    {
      "tier": "Plus",
      "annual_price_usd": 110,
      "regular_new_member_price_usd": 120,
      "promo_first_year_price_usd": 55,
      "promo_savings_usd": 65,
      "best_value": true,
      "benefits": [
        "All Club benefits",
        "2% Sam's Cash™ Back on in-club qualifying purchases (up to $750/year)",
        "Free Shipping on Orders Over $50",
        "Free Delivery from Club on Orders Over $50 (Club tier pays $12)",
        "Early Shopping Hours — up to 1 hour early in-club",
        "Pharmacy Savings — $0 on up to 10 select generic medications",
        "Optical Savings — 40% off second pair",
        "Tire & Battery Center — 50% off installation",
        "Bonus Offers — 20% more Sam's Cash than Club tier",
        "Sam's Club Mastercard® eligibility — 3% back at Sam's Club for Plus tier"
      ],
      "join_button_label": "Join Plus"
    }
  ],
  "active_promo": {
    "headline": "For a Limited Time: Save $65 on Plus or $35 on Club",
    "starts_on": "2026-05-14",
    "ends_on": "2026-06-15",
    "eligibility": "new members only"
  },
  "source_url": "https://www.samsclub.com/join",
  "captured_at": "2026-05-19",
  "error_reasoning": null
}
```

When no promo is active, set `active_promo: null` and omit `regular_new_member_price_usd` / `promo_first_year_price_usd` / `promo_savings_usd` from each tier (or set them to `null`). When parsing fails or the page shape has changed, set `success: false` and put the failure reason in `error_reasoning`.
