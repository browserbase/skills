---
name: bookbarker-com-request-author-interview-iggp1b
title: Book Barker Author Interview Booking
description: >-
  Book a paid author-interview promotional package on bookbarker.com via
  WooCommerce add-to-cart URL deep-link (one of three tiers: Starter $99 /
  Advanced $119 / Premium $129), then drive the WooCommerce checkout form to the
  populated state. Stops before payment submission; post-purchase Q&A
  questionnaire is out of scope.
website: bookbarker.com
category: author-marketing
tags:
  - author-marketing
  - book-promotion
  - woocommerce
  - interview
  - indie-authors
  - checkout
  - stripe
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      The WooCommerce add-to-cart URL
      (/?add-to-cart=1898&variation_id=XXXX&quantity=1) is a plain GET that sets
      a session cookie and works without JS. Useful as a quick-add shortcut, but
      the checkout itself (Stripe Elements + hCaptcha + reCAPTCHA + terms
      checkbox) requires a real browser to complete.
  - method: browser
    rationale: >-
      Pure-browser flow works too — navigate to
      /promote-your-book-with-author-interview/, click a pricing-table 'Book
      Now' button, fill checkout. Slower than the URL deep-link but lets the
      user see the tier comparison page in context.
  - method: api
    rationale: >-
      No public WooCommerce REST API or GraphQL endpoint is exposed for guest
      checkout. WP REST endpoints are admin-auth-gated. Don't waste time looking
      for one.
verified: true
proxies: true
---
# Book Barker Author Interview Booking

## Purpose

Book a paid author-interview promotional package on bookbarker.com to publish a featured interview, gain homepage placement, and receive multi-day social-media promotion across Book Barker's channels (Twitter/X, LinkedIn, Pinterest, Facebook). The site sells three one-time tiers (Starter $99 / Advanced $119 / Premium $129) as variations of a single WooCommerce product (id `1898`). This skill takes the agent from tier selection through the Stripe-backed checkout page; **the final "Place order" click and any post-purchase intake of bio / cover image / Q&A answers happen out-of-band and are out of scope.** Read-only up to checkout — the skill does not submit a paid order on behalf of the user.

## When to Use

- An indie or self-published author wants to promote a launching, recently-released, or backlist title via a featured Q&A interview on bookbarker.com.
- The user asks to "book / schedule / arrange / request an author interview on Book Barker" and wants the cheapest path that adds the right package tier directly to cart.
- The user asks which tier to pick: surface Starter (1-day) vs Advanced (3-day) vs Premium (7-day) social/homepage exposure and let them choose.
- The user has a pre-purchase question (turnaround, content policy, custom request) — point them at the Fluent Forms contact form on `/contact/`, not the cart.
- **Do not use** if the user wants a free guest-post / blog feature — Book Barker's author-interview product is paid-only; there is no free editorial submission queue.

## Workflow

The fastest path uses a WooCommerce add-to-cart URL deep-link to skip the product page entirely — pick the variation, then drive only the billing form in the browser.

1. **Pick the tier.** Map the user's goal to the variation_id (all are one-time charges, no subscription):

   | Tier | Price | `variation_id` | Social promotion | Homepage feature |
   |---|---|---|---|---|
   | Starter | $99 | `1899` | 1 day (3 posts total) | 1 day |
   | Advanced | $119 | `1900` | 3 days (3 posts/day) | 3 days |
   | Premium | $129 | `1901` | 7 days (3 posts/day) | 7 days |

   All three tiers also include: interview published on the bookbarker.com site, and permanent listing in the interview archive.

2. **Add the chosen tier directly to cart** by GET-loading the WooCommerce add-to-cart URL — no clicking the pricing-table "Book Now" buttons required:

   ```
   https://bookbarker.com/?add-to-cart=1898&variation_id=<1899|1900|1901>&quantity=1
   ```

   The site 302-redirects to `/cart/` and renders a "{product} has been added to your cart" flash banner. Confirm the cart contains exactly one line item titled `Author Interview – Promote Your Book on Book Barker` with the matching Package Tier attribute and price.

3. **Proceed to checkout** by navigating to `https://bookbarker.com/checkout/` (or clicking the "Proceed to Checkout" button in the cart).

4. **Collect billing details from the user and fill the WooCommerce checkout form.** Required fields:
   - Email address
   - First name, Last name
   - Country / Region (defaults to `United States (US)`; combobox)
   - Street address
   - Town / City
   - State (combobox; defaults to `Florida` — change to user's state)
   - ZIP Code
   - Acceptance checkbox: *"I have read and agreed to the website terms and conditions, including the Editorial Discretion Policy on inappropriate or disallowed book content."* (required — book content must comply with their editorial policy)

   Optional fields:
   - Apartment / suite
   - Phone
   - Order notes — useful for a one-line note like "Interview for `<book title>`, launch date `<date>`"
   - "Create an account?" checkbox — opt-in only

5. **Stop at the populated checkout page.** Take a screenshot and present a summary to the user (line item, billing details, total). **Do not click "Place order"** — the user must enter their own payment info into the Stripe Elements iframe (Card / US bank account / Cash App Pay) and submit. The page is bot-protected by invisible hCaptcha + reCAPTCHA, so silent automated submission is unreliable anyway.

6. **Explain the post-purchase intake.** Interview content — author bio, headshot, book cover, link to retailer, and the user's answers to Book Barker's Q&A questionnaire — is **not** collected at checkout. Book Barker emails the questionnaire after the order is paid (typical for this type of WooCommerce service product). Tell the user to watch their inbox at the email they entered into checkout and to be ready to submit a 200–400 word bio, a hi-res cover JPG/PNG, and an author headshot.

### Pre-purchase inquiry fallback

If the user has questions before paying (custom-tier request, faster turnaround, eligibility of their book under the Editorial Discretion Policy), the contact form at `https://bookbarker.com/contact/` is a Fluent Forms widget (`form_id=1`) with these fields: `names[first_name]`, `names[last_name]`, `email`, `subject`, `message`. **It is gated by Cloudflare Turnstile** (`0x4AAAAAAB1aaFdVdwQQ_2oi`), so it requires a real browser to solve — do not attempt a raw POST.

## Site-Specific Gotchas

- **WooCommerce add-to-cart URL is the universal shortcut.** It works without any session cookie, JS, or POST — a plain GET to `/?add-to-cart=1898&variation_id=XXXX&quantity=1` sets the cart cookie and 302-redirects to `/cart/`. This is the single most useful affordance — skip the pricing-table buttons and the product-page variation dropdown entirely.
- **Product ID `1898` is the only author-interview product.** All three tiers are *variations* of the same product, not three separate products. Do not look for `/product/author-interview-starter/` etc — they don't exist. The canonical product slug is `/product/author-interview-promote-your-book/`.
- **There is a sibling product** at `/product/cover-reveal-interview-promote-your-book/` (Cover Reveal Interview, $119 advanced tier shown in cart upsell). Do not confuse the two — the author-interview slug is the one for general author Q&A; cover-reveal is for unveiling a book cover before launch.
- **Tier defaults can mislead.** When the cart upsell or related-products module shows "Cover Reveal Interview — $119", that's the *Advanced* tier of the cover-reveal product, not the author-interview. Always verify the cart's line-item title includes "Author Interview" before proceeding to checkout.
- **State combobox defaults to Florida** (the site's own state). Override unless the user actually lives in FL.
- **Checkout is bot-walled.** Stripe Elements live-mode (`pk_live_51QVfVx…`), invisible hCaptcha, and Google reCAPTCHA iframes all load on the checkout page. Even if you could synthesize a perfect form submit, the captchas will fail without a real user gesture. **Stop at the populated form — the human must press Place order.**
- **Editorial Discretion Policy is real and binding.** The required terms checkbox links to `/terms-of-service/#editorial-discretion`. Book Barker reserves the right to refuse to publish content deemed inappropriate. If the user's book is in a sensitive genre (explicit, hate-content adjacent, etc.), tell them to use the contact form to pre-clear *before* paying — refund policy is at `/refund-and-returns-policy/`.
- **No free / unpaid path exists.** Author interviews on bookbarker.com are exclusively a paid service. There is no editor's pitch inbox, no "submit to be considered", no free guest-post queue. If the user is shopping for a free interview placement, this is not the right site.
- **Site stack is Hostinger + LiteSpeed + Cloudflare.** No Akamai, no aggressive WAF. Residential proxies and `--verified` were used during validation but the site responded cleanly to a vanilla Browserbase session as well — `--proxies` is precautionary, not required.
- **Account creation is optional, not required.** The "Create an account?" checkbox at checkout is opt-in. Users can complete the purchase as a guest with just an email + billing info.

## Expected Output

The skill returns a JSON envelope describing the cart-loaded state and the checkout-ready form. Two outcome shapes:

### Outcome A — `checkout_ready` (happy path)

```json
{
  "status": "checkout_ready",
  "product": {
    "id": 1898,
    "name": "Author Interview – Promote Your Book on Book Barker",
    "variation_id": 1899,
    "tier": "Starter",
    "price_usd": 99.00,
    "includes": [
      "One-time charge (no subscription)",
      "Interview published on Book Barker website",
      "Permanent interview-archive listing",
      "1-day social-media promotion (3 posts total)",
      "1-day homepage feature"
    ]
  },
  "cart_url": "https://bookbarker.com/cart/",
  "checkout_url": "https://bookbarker.com/checkout/",
  "add_to_cart_shortcut": "https://bookbarker.com/?add-to-cart=1898&variation_id=1899&quantity=1",
  "billing_fields_required": [
    "email", "first_name", "last_name", "country", "street_address",
    "city", "state", "zip", "terms_accepted"
  ],
  "payment_methods": ["card", "us_bank_account", "cash_app_pay"],
  "captcha": ["invisible_hcaptcha", "recaptcha"],
  "next_step": "User must enter payment info into Stripe Elements and click \"Place order\". Post-purchase, Book Barker emails a Q&A questionnaire for the interview content (bio, cover, headshot, answers).",
  "total_usd": 99.00
}
```

### Outcome B — `inquiry_required` (use contact form, not cart)

Returned when the user is not ready to pay and wants to ask a pre-purchase question (custom tier, editorial-policy pre-clearance, turnaround).

```json
{
  "status": "inquiry_required",
  "contact_form_url": "https://bookbarker.com/contact/",
  "form_id": "fluentform_1",
  "fields": {
    "names[first_name]": "<user first name>",
    "names[last_name]": "<user last name>",
    "email": "<user email>",
    "subject": "<short subject>",
    "message": "<inquiry body>"
  },
  "captcha": "cloudflare_turnstile",
  "captcha_sitekey": "0x4AAAAAAB1aaFdVdwQQ_2oi",
  "next_step": "Real browser required to solve Turnstile and submit. Book Barker typically responds via email within 1-2 business days."
}
```
