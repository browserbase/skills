---
name: designfinder-asid-org-scrape-designer-firm-data-quktyw
title: Scrape ASID Design Finder Designer & Firm Contacts
description: >-
  Enumerate the ASID Design Finder Designers & Firms directory and extract each
  listing's name, contact person, email, phone (when published), and website.
website: designfinder.asid.org
category: data-scraping
tags:
  - directory
  - scraping
  - contact-data
  - interior-design
  - asid
  - lead-generation
source: 'browserbase: agent-runtime 2026-08-23'
updated: '2026-08-23'
recommended_method: hybrid
alternative_methods:
  - method: browser
    rationale: >-
      Full browser could do both steps, but the detail pages are server-rendered
      so plain HTTP fetch is far cheaper for the bulk of the work; only the
      search grid needs JS.
  - method: api
    rationale: >-
      The same-origin POST /AdvancedSearch/SearchCompanyList endpoint returns
      200 from the page context but only yields the ~6 featured listings for
      anonymous users regardless of paging params — confirmed unusable for full
      enumeration.
verified: false
proxies: false
---
# Scrape Designer & Firm Contact Data from ASID Design Finder

## Purpose
Enumerate the "Designers & Firms" listings on the ASID Design Finder directory (`designfinder.asid.org`) and extract, for each listing, the display name, the primary contact person's name, email address, phone number (when published), and website. This is a **read-only** scraping task: it browses the public directory and parses public listing pages. No login, form submission, or contact-request action is performed.

## When to Use
- You need a structured dataset of interior designers / design firms listed on ASID Design Finder (name, contact person, email, phone, website).
- You want to enrich a single known firm/designer with its public contact details (fetch one `/listing/{slug}` page).
- You are building a lead list or directory mirror of ASID member designers and firms.

## Workflow

The optimal method is a **hybrid**: use a browser only for the JS-rendered search grid (enumeration), then use cheap plain-HTTP fetches of the server-rendered `/listing/{slug}` pages for the actual contact-data extraction. Do **not** try to scrape contact fields from the search grid — the cards do not contain email/phone/website; those only exist on the detail pages.

### Step 1 — Enumerate listing slugs (browser, infinite scroll)
1. Open a remote session (a bare session is sufficient — see Gotchas) and navigate to:
   `https://designfinder.asid.org/search?ListingType=Designers%20%26%20Firms&View=List`
2. Wait ~5s for the client-side search to render (the initial server HTML contains **zero** listing links — results are injected by `/js/advancedsearch/advancedsearch.js`).
3. The result grid uses infinite scroll. Press `End` (or scroll to bottom), wait ~2.5s, and repeat. Each batch appends more cards. Track progress via the `#spanResultCount` element — it equals the number of loaded cards.
4. Collect slugs from the card click handlers, not from `href`s (cards navigate via JS, not anchors):
   ```js
   const slugs = new Set();
   document.querySelectorAll('[onclick*="/listing/"]').forEach(el => {
     const m = (el.getAttribute('onclick')||'').match(/\/listing\/([a-z0-9-]+)/);
     if (m) slugs.add(m[1]);
   });
   ```
   Each card's onclick is `TrackPageClickAndRedirect(event, '<companyId>', 'AdvancedSearchListViewListing', '', '/listing/<slug>', 'AdvancedSearchListView')`.
5. Stop scrolling when `#spanResultCount` (and the collected slug set) stops growing across two consecutive scrolls — that is the full result set.

### Step 2 — Fetch each listing detail page (plain HTTP)
For each slug, fetch `https://designfinder.asid.org/listing/{slug}`. These pages are **fully server-rendered** and can be retrieved with a lightweight HTTP fetch (e.g. `browse cloud fetch <url> --proxies`) — no browser/JS needed.

### Step 3 — Parse contact fields from the detail HTML
From each listing page's HTML extract:
- **Display name** — from the JSON-LD `Organization` block: `@graph[0].name` (e.g. `"Cindy Trimble, ASID"`).
- **Contact person** — from hidden inputs (order of `name`/`value` attributes varies, match both directions):
  - `CompanyModel.Contact.Firstname`
  - `CompanyModel.Contact.Lastname`
- **Email** — hidden input `CompanyModel.Contact.EmailAddress`.
- **Company ID** — hidden input `CompanyModel.CompanyId` (stable GUID, useful as a primary key).
- **Website** — from the `CompanyWebsite('<companyId>','<url>')` onclick handler, or fall back to JSON-LD `sameAs`. May be absent (some listings publish no website).
- **Phone** — from the JSON-LD `Organization.telephone` field. **Only present when the firm published one** (frequently `null`). There are no `tel:` links on the page.
- **Address** (bonus) — JSON-LD `Organization.address.streetAddress`.

Reference extraction (Python-style regex on the raw HTML body):
```python
name  = jsonld["@graph"][0].get("name")
first = re.search(r'name="CompanyModel\.Contact\.Firstname"[^>]*value="([^"]*)"', html) or \
        re.search(r'value="([^"]*)"[^>]*name="CompanyModel\.Contact\.Firstname"', html)
email = re.search(r'name="CompanyModel\.Contact\.EmailAddress"[^>]*value="([^"]*)"', html)
web   = re.search(r"CompanyWebsite\('[^']*','([^']*)'\)", html)  # else jsonld sameAs
phone = jsonld["@graph"][0].get("telephone")                      # often null
```

### Step 4 — Emit output
Emit one JSON object per listing (see Expected Output). Use `companyId` as a dedupe key.

## Site-Specific Gotchas
- **Search grid is client-rendered; detail pages are not.** A raw fetch of `/search?...` returns 0 listing links. A raw fetch of `/listing/{slug}` returns everything. Only spend a browser on Step 1.
- **Cards link via JS, not anchors.** There are no `<a href="/listing/...">` in the grid. Extract slugs from `[onclick*="/listing/"]` handlers (`TrackPageClickAndRedirect(...)`). A naive anchor/`href` scrape yields nothing.
- **Don't rely on the `POST /AdvancedSearch/SearchCompanyList` (or `SearchCompanyCard`) endpoint for enumeration.** It is same-origin and returns 200 when called from the page context (`browse eval` + `fetch`), but with the public/anonymous filter state it returns only the ~6 **featured** listings regardless of `offset`, `limit`, `total`, or `SortBy`. Confirmed dead-end for full enumeration — use infinite scroll on the grid instead.
- **Phone is optional data.** JSON-LD `telephone` is populated for some firms (e.g. Layered Dimensions → `214-206-9599`) and `null` for many others (e.g. Cindy Trimble, Barbara Eberlein). It is the only phone source — there are no `tel:` links, and the `#txtPhoneNumber` input on the page is a *user* contact-form field, not the firm's number. Treat missing phone as expected, not an error.
- **Website is optional too.** Some listings (e.g. `barbara-eberlein`) publish no website; `CompanyWebsite(...)` will be absent and JSON-LD `sameAs` missing → return `null`.
- **Hidden-input attribute order varies.** `value=` sometimes precedes `name=`. Match both orderings (see regex above) or you'll silently drop fields.
- **`#spanResultCount` is the loaded count, not a fixed total.** It increases as you scroll; the hidden `searchTotal` field shows a placeholder cap of `10000`. Terminate scrolling on convergence (count stops growing), not on any advertised total.
- **Anti-bot: none observed.** Homepage probe returned 200 with no bot protection. A bare remote browser session (no `--verified`, no `--proxies`) successfully rendered the grid and scrolled through 126+ results. Residential proxies (`--proxies`) were used on the detail-page fetches out of habit and are a safe default for high-volume fetching, but were **not required**. Platform: InsightGuide / Higher Logic directory (backend `api.prod-us-1.app.insightguide.com`; org GUID `0c6b6f4f-d365-4ead-b2af-f8b191195a6e`) — the same recipe applies to sibling directories on that platform.
- **Assumption made:** "designers & firms" was interpreted as the directory's own `ListingType=Designers & Firms` facet (its default listing type), excluding the separate Products/Projects/Resources content types.

## Expected Output
One object per listing. `null` for any field not published.

```json
[
  {
    "slug": "cindy-trimble",
    "listing_url": "https://designfinder.asid.org/listing/cindy-trimble",
    "company_id": "94773622-dce1-4ed9-8c1f-a76e4dc42d6a",
    "name": "Cindy Trimble, ASID",
    "contact_first_name": "Cindy",
    "contact_last_name": "Trimble",
    "email": "cindy@studiotrimble.com",
    "phone": null,
    "website": "http://www.studiotrimble.com",
    "address": "PO Box 1169, Blue Ridge, Georgia, 30513-0020, United States"
  },
  {
    "slug": "layered-dimensions-interior-design",
    "listing_url": "https://designfinder.asid.org/listing/layered-dimensions-interior-design",
    "company_id": "cb160f0a-f68f-444b-9ea9-e2800483f052",
    "name": "Layered Dimensions Interior Design",
    "contact_first_name": "Melissa",
    "contact_last_name": "Alamilla",
    "email": "melissa@layereddimensionsid.com",
    "phone": "214-206-9599",
    "website": "https://www.layereddimensionsid.com/",
    "address": "6600 Lyndon B Johnson Fwy, 195, Dallas, TX 75240-6507, USA"
  },
  {
    "slug": "barbara-eberlein",
    "listing_url": "https://designfinder.asid.org/listing/barbara-eberlein",
    "company_id": "be003052-cd9b-4aac-9161-eb906939445e",
    "name": "Barbara Eberlein, ASID",
    "contact_first_name": "Barbara",
    "contact_last_name": "Eberlein",
    "email": "info@eberlein.com",
    "phone": null,
    "website": null,
    "address": "1834 Delancey Pl, Philadelphia, Pennsylvania, 19103-6607, United States"
  }
]
```

Field schema:
```json
{
  "slug": "string (URL slug, stable)",
  "listing_url": "string",
  "company_id": "string (GUID, primary key)",
  "name": "string (listing display name)",
  "contact_first_name": "string | null",
  "contact_last_name": "string | null",
  "email": "string | null",
  "phone": "string | null (present only when firm published one)",
  "website": "string | null",
  "address": "string | null"
}
```
