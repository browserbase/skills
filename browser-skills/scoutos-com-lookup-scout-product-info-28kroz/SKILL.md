---
name: scoutos-com-lookup-scout-product-info-28kroz
title: 'Look Up Scout Product, Pricing, Integration, and Use-Case Info'
description: >-
  Read-only research skill that retrieves structured product, pricing,
  integration, customer, and use-case information from scoutos.com given a
  topic, and walks the Cal.com demo-booking modal and Clerk-hosted free-trial
  signup up to (but not including) form submission.
website: scoutos.com
category: research
tags:
  - ai-agents
  - research
  - pricing
  - integrations
  - use-cases
  - saas
  - marketing-site
source: 'browserbase: agent-runtime 2026-05-19'
updated: '2026-05-19'
recommended_method: hybrid
alternative_methods:
  - method: url-param
    rationale: >-
      All catalog content (pricing, integrations, customers, use-cases,
      products) is server-rendered HTML reachable directly by URL via the public
      sitemap.xml. For pure read-only fields, plain `browse cloud fetch` is the
      cheapest and fastest path.
  - method: browser
    rationale: >-
      Required ONLY for: (1) expanding the eight collapsed FAQ accordions on the
      homepage (JS click needed), (2) opening the Cal.com demo-booking modal
      that loads in a child iframe, and (3) interacting with the Clerk-hosted
      onboarding form at studio.scoutos.com/onboarding/step-1. A remote browser
      session is overkill for pricing/integration/customer reads.
  - method: api
    rationale: >-
      No public marketing/product API exists. docs.scoutos.com documents the
      workflow runtime API, not the marketing-site content. Confirmed dead-end —
      do not look for /api/products, /api/integrations, or a Sanity GraphQL
      endpoint.
verified: true
proxies: true
---
# Look Up Scout Product, Pricing, Integration, and Use-Case Info

## Purpose

Read-only research skill that retrieves structured product, pricing, integration, customer, and use-case information from **scoutos.com** given a topic (e.g. "RFP agent", "Salesforce integration", "enterprise pricing", "AI sales engineer"). Returns a JSON envelope containing feature descriptions, pricing tier details (plan name, price, included quotas, target user), supported integrations/connectors, named customer logos and testimonials, relevant use-case page URLs, and the canonical source URL for every field. Also drives the demo-booking Cal.com modal and the free-trial signup at `studio.scoutos.com/onboarding/step-1` **up to but not including form submission**, returning the captured form state. Nothing is purchased, scheduled, or submitted.

## When to Use

- A user asks "What does Scout cost?" / "Is there an enterprise tier?" / "Free trial limits?"
- A user asks whether Scout integrates with a specific tool (Salesforce, HubSpot, Slack, Notion, MCP, etc.).
- A user wants a feature breakdown of Scout Agents, Databases, or Workflows.
- A user names a use case ("RFP responses", "competitive intel", "AI sales engineer", "security questionnaire") and wants to know what Scout offers and the canonical landing page.
- A user wants customer logos, named testimonials, or case studies for social proof.
- A user wants to walk through the demo-booking or free-trial signup flow without actually scheduling or registering (e.g. to confirm field labels, see the calendar host, verify the Clerk identity provider).

## Workflow

Scoutos.com is a **Next.js + Sanity CMS** marketing site with **no anti-bot, no captcha, no login wall, and a public sitemap.xml**. Server-rendered HTML carries the full body content, so the cheapest, fastest path is **HTTP fetch with `browse cloud fetch`** for any read-only field. Open a remote browser **only** when you need to interact with elements (FAQ accordions that are collapsed by default, the Cal.com demo-booking modal, or the Clerk signup form fields on `studio.scoutos.com/onboarding/step-1`).

### 1. Resolve the topic to a canonical URL set

Start from the sitemap and the in-nav route map. Both work without a browser:

```bash
browse cloud fetch https://www.scoutos.com/sitemap-0.xml      # full URL inventory
browse cloud fetch https://www.scoutos.com/                   # nav links live in the HTML
```

The site's top-nav route map (canonical for the human-facing UI):

- **Product**: `/product/agents`, `/product/databases`, `/product/workflows`
- **Use cases**: `/use-cases/ai-sales-engineer`, `/use-cases/competitor-intel-agent`, `/use-cases/rfp-agent`, `/use-cases/ai-meeting-prep`, `/use-cases/security-questionnaire-agent`
- **Resources**: `/academy`, `/webinars`, `/blog`, `/integrations`, `https://docs.scoutos.com`, `/changelog`
- **Company**: `/customers`, `/partners`
- **Pricing**: `/pricing`
- **Customer stories**: `/customers/{slug}` (current slugs: `dagster`, `quipli`, `statsig`, `wide-awake`)
- **Integration detail**: `/integrations/{slug}` (see Site-Specific Gotchas for the full slug list)
- **Sign up (free trial)**: `https://studio.scoutos.com/onboarding/step-1`
- **Log in**: `https://studio.scoutos.com/sign-in`

Topic → URL heuristics:
- "RFP", "RFP agent", "RFP response" → `/use-cases/rfp-agent`
- "AI sales engineer", "SE bot" → `/use-cases/ai-sales-engineer`
- "Competitive intel", "battle card" → `/use-cases/competitor-intel-agent`
- "Meeting prep" → `/use-cases/ai-meeting-prep`
- "Security questionnaire", "SOC2", "vendor questionnaire" → `/use-cases/security-questionnaire-agent`
- "Agents", "AI agent platform" → `/product/agents`
- "Databases", "vector store", "knowledge base storage" → `/product/databases`
- "Workflows", "no-code workflows", "AI workflow" → `/product/workflows`
- "Pricing", "free tier", "enterprise pricing", "cost" → `/pricing`
- "Customers", "case studies", "logos" → `/customers` + `/customers/{slug}`
- "{Vendor} integration" (Salesforce, HubSpot, Slack, Notion, MCP, Linear, GitHub, Google Drive, Airtable, Attio, Pipedrive, etc.) → `/integrations/{slug}`
- "Government", "public sector", "FedRAMP" → `/solutions/public-sector`

### 2. Fetch the resolved pages and parse fields

For each canonical URL, fetch the HTML and extract the requested fields. The page bodies render server-side, so a single `browse cloud fetch` per URL is enough. If you want clean Markdown instead of raw HTML, open the URL in a remote browser session and call `browse get markdown body --remote` — but only do this when the HTML→markdown delta matters (e.g. parsing nested testimonial card markup).

Field-extraction map per page:

| Topic field | Source URL | What to parse |
|---|---|---|
| Pricing tiers | `/pricing` | `### Free to try` / `### Scale` sections — plan name, price ("$0/month" vs "Custom"), CTA URL, bullet list of inclusions |
| Pricing feature matrix | `/pricing` | Trailing comparison table — Workflow Invocations, Storage, Logs window, Seats, No Code Builder, Embeddable Copilots, Slack Agents, Revision History, Environments, Crawler Static IP, Python SDK, TypeScript SDK, Community Support, Shared Slack Channel, Dedicated Support, Accelerated Onboarding, GitHub Login, Google Login |
| Integration list | `/integrations` (+ `/integrations/page/2`) | Each `<li>` carries: name, one-sentence description, `/integrations/{slug}` deeplink, Sanity-hosted logo URL |
| Integration categories | `/integrations/category/agent-tools`, `/integrations/category/workflow-blocks` | Same list shape; an integration can appear in both (e.g. HubSpot, Linear) |
| Customer logos / stories | `/customers` | `/customers/{slug}` deeplinks, segment tags ("SaaS", "Technology", "Health"), pull-quote per logo |
| Testimonials | `/pricing` (carousel), `/` (carousel) | Quote + name + role/title + customer-website URL |
| Use-case features | `/use-cases/{slug}` | h2 (problem framing) + h3 (feature list) + paragraphs (descriptions) |
| Product features | `/product/{agents\|databases\|workflows}` | Same shape as use-case pages |
| FAQ Q&A | `/` (homepage) | Each `<h3>` is a question; answer is hidden behind a collapsed accordion. To read the answers programmatically you **must open a remote browser and click each FAQ button** (see Site-Specific Gotchas) |

### 3. (Optional) Demo-booking flow

When the request includes "walk through the demo-booking flow":

```bash
sid=$(browse cloud sessions create --keep-alive --proxies --verified | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
export BROWSE_SESSION="$sid"
browse open https://www.scoutos.com/ --remote
browse snapshot --remote   # locate the "Book a 15-min demo" button ref
browse click @<ref-for-Book-a-15-min-demo> --remote
sleep 3                    # Cal.com modal mounts into a child iframe
browse snapshot --remote   # the modal is a Cal.com embed; iframe URL is
                           # https://app.cal.com/connorhardy/30min/embed?...
```

The modal is an iframe-embedded Cal.com event titled **"Scout Chat (30 Min)"** hosted by `connorhardy`. Despite the button reading *"15-min"*, the underlying Cal.com slot is **30 minutes long** — capture this honestly in the returned `demo` object. Return the available date buttons and time slots from the iframe accessibility tree; do **not** click any time slot or fill the booking form.

### 4. (Optional) Free-trial signup flow

```bash
browse open https://studio.scoutos.com/onboarding/step-1 --remote
browse snapshot --remote
# Page is Clerk-hosted. Use the fresh refs from the snapshot:
browse fill @<email-textbox-ref>    "user@example.com" --remote
browse fill @<password-textbox-ref> "<password>"        --remote
# DO NOT click Continue. DO NOT toggle the ToS checkbox.
browse screenshot --remote --path /tmp/onboarding-filled.png
```

Captured form state to return:
- `email` (string), `password` (string, mask when echoing back),
- `tos_accepted` (boolean — `false` unless the user explicitly asked you to toggle the checkbox),
- `provider_buttons_available`: `["GitHub", "Google", "Email + Password"]`,
- `identity_provider`: `"Clerk"` (constant for this page).

The form is gated by a Clerk widget; submission triggers email verification and would create a real workspace. Stop at the filled-but-not-submitted state.

## Site-Specific Gotchas

- **No anti-bot — bare HTTP works.** Five consecutive `browse cloud fetch` calls with no `--proxies` returned 200 OK. There is no Cloudflare, Akamai, or captcha gate. `robots.txt` is permissive (`Allow: /`). You generally do **not** need a remote browser session for read-only fields; reserve it for FAQ accordion expansion, the Cal.com modal, and the Clerk signup form.
- **Two route prefixes for the same content: `/use-cases/{slug}` vs `/solutions/{slug}`.** The top nav advertises `/use-cases/...` (the human-facing path), but the sitemap-0.xml uses `/solutions/...` (the legacy path). Both return 200 for the same content (e.g. `/use-cases/rfp-agent` and `/solutions/rfp-agent` both work). **Prefer `/use-cases/{slug}` as the canonical user-facing URL** — that's what the site nav uses today. The `/solutions/...` URLs are still live but not surfaced in the chrome. Note: a few sitemap-only slugs (`/solutions/ai-chatbot`, `/solutions/scout-for-shopify`, `/solutions/public-sector`, `/solutions/knowledge-base`, etc.) are **not** mirrored under `/use-cases/...` — they only exist under `/solutions/...`. Treat `/solutions/...` as the superset and `/use-cases/...` as the curated subset.
- **`/use-cases` (no slug) is a 404.** There is no index page at `/use-cases`. Use the sitemap or the nav menu for discovery.
- **Pricing has only TWO tiers, not three.** Don't fabricate a "Pro" or "Team" plan. The plan menu is exactly:
  - **Free to try** — `$0/month`, 1 seat, 200 agent messages, 3 active workflows, 50 workflow runs, 1 GB storage, 2 integrations, 1 hour of logs, community support. CTA → `https://studio.scoutos.com/onboarding/step-1`.
  - **Scale** — `Custom` (contact sales). Dedicated support with SLA, unlimited seats, custom limits across the board, pay by invoice, custom integrations, white-glove agent build. CTA → opens the Cal.com modal.
  No mid-tier exists. The FAQ confirms: *"Scout's pricing scales with your usage — not seat count. … To get a custom quote, schedule a demo and we'll talk pricing to your team size and needs."*
- **Homepage FAQ answers are NOT in the static HTML.** The eight `<h3>` questions on `/` render as collapsed accordions. To extract the answer text you must open a remote browser, `browse snapshot` to find each button ref, and `browse click @<ref>` to expand it — then re-read the markdown. Just reading the HTML gives you the questions only. The "How much does Scout cost?" answer is what's verifiable up front; the others (e.g. *"Who's NOT a good fit for Scout?"*) require clicks.
- **Two "Book a 15-min demo" buttons → 30-min Cal.com slot.** The label is misleading. Both buttons (hero CTA and footer CTA) trigger a Cal.com modal iframe at `https://app.cal.com/connorhardy/30min/embed` whose event is titled **"Scout Chat (30 Min)"** hosted by Connor Hardy. The "Get in touch" link in the nav has `href="#"` and dispatches the same modal via JS — it's not a real anchor.
- **`/onboarding/step-1` is on `studio.scoutos.com`, not `www.scoutos.com`.** Watch the host swap. The page is Clerk-hosted (logo URL is `img.clerk.com/...`). Form widgets are mounted by `<co-pilot>` and Clerk scripts, so refs change on every reload — always `browse snapshot` immediately before `browse fill`.
- **`browse fill` requires fresh refs after every navigation.** A `--remote` navigation invalidates all prior refs. If you see `Error: Unknown ref "1-672" - run browse snapshot first`, you skipped a snapshot. Re-snapshot, then re-fill.
- **Integration list is paginated.** `/integrations` shows 18; `/integrations/page/2` adds 2 more (statsig, twilio) — total 20 integrations as of capture. Confirmed slug set: `airtable`, `attio`, `discord`, `github`, `google-calendar`, `google-drive`, `google-search`, `http-request`, `hubspot`, `linear`, `mcp`, `notion-mcp`, `paypal`, `pipedrive`, `rectrac`, `salesforce`, `slack`, `square-up`, `statsig`, `twilio`. Re-check sitemap for new additions.
- **Three integrations have category overlap.** HubSpot, Linear, and Slack appear in BOTH `/integrations/category/agent-tools` and `/integrations/category/workflow-blocks`. Treat `category` as an array, not a single value.
- **Customer-story slugs are a tiny set.** Only four `/customers/{slug}` pages exist today: `dagster`, `quipli`, `statsig`, `wide-awake`. The homepage carousel mentions additional logos (Common Room, Hyper, Citibot, CaseStatus, Modal, Amplitude, SurrealDB, Case Status, Dig South, Deno, QXO) that are **logo-only** with no dedicated case-study page — return them as `logos`, not as `case_studies`.
- **Apex `scoutos.com` 308-redirects to `www.scoutos.com`.** Always use the `www.` host or follow redirects. Don't hardcode the apex.
- **Site is run on Vercel and uses Sanity CMS for image assets.** Logos and integration tile images are served from `cdn.sanity.io/images/0cfe0chk/production/...`. The `0cfe0chk` is the Sanity project ID and is stable; you may use it to recognize and de-duplicate logos across pages.
- **No public marketing/product JSON API.** There is no `/api/products`, no GraphQL endpoint, and no documented REST surface for marketing-page content. The product API (`docs.scoutos.com`) covers the *workflow runtime*, not the marketing catalog. Don't waste time fishing for a content API — fetch the HTML pages directly.
- **Read-only rules.** Never click a slot button inside the Cal.com modal, never click "Continue" on the onboarding form, never check the ToS checkbox unless the user explicitly asks, never click chat-widget "Send" if you open the "Open chat" button. The skill returns *the state of the form*, not a booking or a registration.

## Expected Output

The skill returns one JSON envelope per request. Shape depends on which subsections were requested, but the structure is consistent across calls. Source URLs are mandatory for every field for citation/audit.

### Generic envelope

```json
{
  "topic": "Salesforce integration",
  "captured_at": "2026-05-19T23:48:00Z",
  "summary": "Scout offers a first-party Salesforce integration positioned as a CRM hygiene + meeting-notes + prospect-search agent tool. Available on Free (subject to 2-integration cap) and Scale tiers.",
  "matched_section": "integrations",
  "fields": { /* one or more of the section-specific shapes below */ },
  "source_urls": [
    "https://www.scoutos.com/integrations/salesforce",
    "https://www.scoutos.com/integrations",
    "https://www.scoutos.com/pricing"
  ]
}
```

### Section-specific shapes (any subset may appear under `fields`)

```json
{
  "fields": {
    "pricing": {
      "tiers": [
        {
          "name": "Free to try",
          "price": "$0/month",
          "target": "Individual / evaluators",
          "cta_label": "Get Started",
          "cta_url": "https://studio.scoutos.com/onboarding/step-1",
          "quotas": {
            "seats": 1,
            "agent_messages_per_month": 200,
            "active_workflows": 3,
            "workflow_runs_per_month": 50,
            "storage_gb": 1,
            "integrations": 2,
            "logs_window": "1 hour"
          },
          "inclusions": [
            "Community Support",
            "API + SDK access (Python, TypeScript)",
            "No Code Builder",
            "Embeddable Copilots (—)"
          ],
          "source_url": "https://www.scoutos.com/pricing"
        },
        {
          "name": "Scale",
          "price": "Custom",
          "target": "Production / enterprise / regulated buyers",
          "cta_label": "Talk with a Scout Engineer",
          "cta_url": "https://app.cal.com/connorhardy/30min  (Cal.com modal)",
          "quotas": {
            "seats": "Unlimited",
            "agent_messages_per_month": "Custom",
            "active_workflows": "Custom",
            "workflow_runs_per_month": "Custom",
            "storage_gb": "Custom",
            "integrations": "Custom (request bespoke integrations)",
            "logs_window": "3 days"
          },
          "inclusions": [
            "Dedicated Support with SLA",
            "Shared Slack Channel",
            "Accelerated Onboarding",
            "Pay by Invoice",
            "Custom agent + workflow build by Scout team"
          ],
          "source_url": "https://www.scoutos.com/pricing"
        }
      ],
      "pricing_model_summary": "Usage-based, not seat-based. Platform access + white-glove support + all LLM costs bundled. Custom quote per workspace.",
      "note": "Only two plans publicly listed. No mid-tier."
    },

    "integration": {
      "name": "Salesforce",
      "slug": "salesforce",
      "categories": ["Agent Tools"],
      "description": "Clean up your CRM, summarize meeting notes, and search through prospects with Salesforce integration.",
      "logo_url": "https://cdn.sanity.io/images/0cfe0chk/production/052bfdf1eb1f276c383d22184ebc4aea01466ea6-24x24.svg",
      "detail_url": "https://www.scoutos.com/integrations/salesforce",
      "available_on_tiers": ["Free to try (counts against 2-integration cap)", "Scale"],
      "source_url": "https://www.scoutos.com/integrations/salesforce"
    },

    "use_case": {
      "name": "RFP Agent",
      "slug": "rfp-agent",
      "headline": "Cut Your RFP Response time by 75%",
      "canonical_url": "https://www.scoutos.com/use-cases/rfp-agent",
      "alias_url": "https://www.scoutos.com/solutions/rfp-agent",
      "features": [
        "Smart Document Analysis",
        "Intelligent Information Retrieval",
        "Context-Aware Responses",
        "Rapid Turnaround"
      ],
      "deploy_targets": ["Slack", "Google Drive / SharePoint", "CRM", "Direct upload"],
      "value_props": ["Always current information", "Audit trail", "Consistent quality", "Team collaboration"],
      "source_url": "https://www.scoutos.com/use-cases/rfp-agent"
    },

    "product_area": {
      "name": "Agents",
      "canonical_url": "https://www.scoutos.com/product/agents",
      "tagline": "The AI agent platform built for GTM teams",
      "capabilities": [
        "CRM auto-update after calls",
        "After-hours technical Q&A",
        "Competitive battle cards",
        "Pre-meeting prospect research",
        "Security questionnaire autofill"
      ],
      "build_flow": [
        "Start with plain English",
        "Define your toolkit",
        "Test before you launch",
        "Control access and visibility"
      ]
    },

    "customers": {
      "case_studies": [
        {
          "slug": "dagster",
          "url": "https://www.scoutos.com/customers/dagster",
          "segment": "Technology",
          "pull_quote": "Scout has made it easy for us to scale out our open-source support, while still maintaining a very high level of quality.",
          "quoted_person": "Pedram Navid, Head of Data Engineering at Dagster"
        },
        {
          "slug": "statsig",
          "url": "https://www.scoutos.com/customers/statsig",
          "segment": "Technology",
          "pull_quote": "Scout is an indispensable tool for our Engineering, DS and Sales teams to engage with our customers.",
          "quoted_person": "Vijaye Raji, CEO of Statsig"
        },
        { "slug": "quipli",     "url": "https://www.scoutos.com/customers/quipli",     "segment": "SaaS",       "quoted_person": "Kyle Clements, Founder & CEO of Quipli" },
        { "slug": "wide-awake", "url": "https://www.scoutos.com/customers/wide-awake", "segment": "Health",     "quoted_person": "Kubby, Founder at Wide Awake" }
      ],
      "logos_only": ["Modal", "Amplitude", "SurrealDB", "Case Status", "Dig South", "Deno", "Common Room", "QXO", "Citibot", "CaseStatus", "Hyper"],
      "testimonials_homepage": [
        { "quote": "Scout is an indispensable tool …", "name": "Vijaye Raji", "title": "CEO", "company": "Statsig", "company_url": "https://www.statsig.com/" },
        { "quote": "By handling 70% of internal FAQs …", "name": "Jacob Hurwitz", "title": "Engineering Manager", "company": "Common Room", "company_url": "https://www.commonroom.io/" }
      ],
      "source_url": "https://www.scoutos.com/customers"
    },

    "faq": [
      {
        "question": "How much does Scout cost?",
        "answer": "Scout's pricing scales with your usage — not seat count. Our simple pricing includes platform access, white-glove support, and all LLM costs, so there are no surprise bills. To get a custom quote, schedule a demo and we'll talk pricing to your team size and needs.",
        "source_url": "https://www.scoutos.com/#faq"
      }
    ],

    "demo": {
      "trigger_text": "Book a 15-min demo",
      "trigger_locations": ["Homepage hero", "Homepage footer CTA", "Pricing 'Talk with a Scout engineer' link", "Nav 'Get in touch' link"],
      "modal_provider": "Cal.com",
      "modal_url": "https://app.cal.com/connorhardy/30min/embed?layout=month_view&embedType=modal&embed=",
      "event_title_actual": "Scout Chat (30 Min)",
      "actual_duration_minutes": 30,
      "advertised_duration_minutes": 15,
      "host": "Connor Hardy",
      "meeting_provider": "Google Meet",
      "next_available_slots_sample": ["Wed May 20 2:00pm America/Los_Angeles"],
      "submitted": false
    },

    "free_trial_signup": {
      "url": "https://studio.scoutos.com/onboarding/step-1",
      "identity_provider": "Clerk",
      "available_providers": ["GitHub", "Google", "Email + Password"],
      "captured_form_state": {
        "email": "user@example.com",
        "password": "********",
        "tos_accepted": false
      },
      "next_button_label": "Continue",
      "submitted": false,
      "submission_consequence": "Would trigger Clerk email verification and create a real workspace; deliberately not invoked."
    }
  }
}
```

### Outcome shapes

| Shape | Trigger |
|---|---|
| `pricing` populated | Topic mentions price, cost, plan, free, enterprise, tier |
| `integration` populated | Topic names a vendor; slug resolved against `/integrations/{slug}` |
| `use_case` populated | Topic matches one of: rfp-agent, ai-sales-engineer, competitor-intel-agent, ai-meeting-prep, security-questionnaire-agent (or any `/solutions/{slug}` deep link) |
| `product_area` populated | Topic mentions agents, databases, or workflows |
| `customers` populated | Topic asks for logos, case studies, testimonials, or names a known customer |
| `faq` populated | Topic matches one of the eight homepage FAQ questions; requires FAQ accordion expansion |
| `demo` populated | Topic asks to walk through demo booking |
| `free_trial_signup` populated | Topic asks to walk through free-trial signup |
| `summary` only (no `fields`) | Topic does not resolve to any canonical page — return the topic, the nearest sitemap matches, and the apology |
