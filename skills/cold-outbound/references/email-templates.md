# Cold Outbound — Email Templates Reference

## Email Structure

Every outbound email follows this structure:

**Subject line**: Specific, references their company or product. Never generic ("Quick question" is bad).
Example: "Thought on {Company}'s {specific feature/challenge}"

**Body** (100-150 words, 3-4 short paragraphs):

1. **Opening** (1-2 sentences): Reference something specific from their website — a feature they ship, a blog post, a recent launch, a job posting. Show you actually looked.

2. **Bridge** (2-3 sentences): Connect their situation to the sender's value prop. Use the confirmed pitch angle. Frame as "companies like yours" or "teams building X often need Y."

3. **Ask** (1 sentence): Soft CTA. "Would a 15-min call make sense to explore this?" Never "buy now" or "schedule a demo."

4. **Sign-off**: First name only. No title dumps.

## Personalization Signals

When enriching a company, look for these on their website to fuel personalization:

| Signal | Where to find | How to use |
|--------|---------------|------------|
| What they sell | Homepage hero, product page | Opening + bridge |
| Recent launches | Blog, changelog, press page | Opening hook |
| Hiring signals | Careers page, job boards | "I noticed you're scaling your X team" |
| Tech stack | Docs, job descriptions, GitHub | Bridge to technical pitch |
| Customer base | Case studies, logos section | "Working with companies like {their customer}" |
| Pain indicators | Pricing page (complexity), docs (workarounds) | Bridge to how you solve it |
| Growth signals | New markets, new features, funding news | Opening or bridge |

## Examples

### Example 1: SaaS company selling to e-commerce

**Context extracted**:
- Company: CartFlow
- Product: Checkout optimization for Shopify stores
- Recent: Launched A/B testing feature last month
- Stack: React, Node.js, Shopify API

**Sender pitch angle**: "We help companies automate browser-based testing and monitoring"

**Email**:
```
Subject: CartFlow's new A/B testing — monitoring at scale?

Hi Sarah,

Saw CartFlow just shipped A/B testing for checkout flows — congrats. That's a big surface area to keep reliable across Shopify's theme ecosystem.

Teams running checkout experiments at scale often hit a wall with monitoring — catching layout breaks, payment form regressions, or slow renders before customers do. We help companies like yours run automated browser checks across hundreds of store configurations without building the infra in-house.

Would a 15-min call make sense to see if this fits where CartFlow is headed?

Best,
Alex
```

### Example 2: Data analytics startup

**Context extracted**:
- Company: InsightPipe
- Product: Real-time analytics for marketing teams
- Recent: Hiring 3 data engineers
- Customers: Mid-market DTC brands

**Sender pitch angle**: "We provide reliable web data collection infrastructure"

**Email**:
```
Subject: InsightPipe's data pipeline — web sources?

Hi Marcus,

Noticed InsightPipe is scaling the data engineering team — makes sense given the push into real-time analytics for DTC brands.

A challenge we hear from analytics companies: reliably collecting web data (pricing, inventory, ad placements) at the frequency your customers need without getting blocked or managing proxy infrastructure. We handle the browser infrastructure side so your team can focus on the analytics layer.

Worth a quick chat to see if web data collection is on your roadmap?

Best,
Alex
```

### Example 3: AI company

**Context extracted**:
- Company: AgentKit
- Product: Framework for building AI agents
- Recent: Open-sourced their core library
- Stack: Python, LangChain

**Sender pitch angle**: "We give AI agents reliable browser access"

**Email**:
```
Subject: Browser access for AgentKit agents

Hi Priya,

AgentKit's agent framework is impressive — especially the open-source move. One pattern we see in agent builders: giving agents reliable browser access (navigating, extracting, filling forms) without the pain of managing headless Chrome at scale.

We provide managed browser infrastructure specifically for AI agents — handles anti-bot detection, session management, and scales with your users' workloads. Several agent frameworks have integrated us as their default browser layer.

Would it be useful to chat about how this could plug into AgentKit?

Best,
Alex
```

## Anti-Patterns

Avoid these in generated emails:

- **Generic opener**: "I came across your company and was impressed" — says nothing specific
- **Feature dump**: Listing 5+ features instead of connecting to their need
- **Multiple CTAs**: "Book a demo, check our docs, or reply here" — pick one
- **Over 200 words**: SDR emails get skimmed, not read
- **Mentioning competitors by name**: "Unlike {competitor}..." — unprofessional in cold outreach
- **Fake familiarity**: "Hope you're having a great week!" — transparent filler
- **Title/credential stuffing** in sign-off: "Alex Johnson, Senior Account Executive, ABC Corp, MBA, PMP" — just first name
- **Apologetic tone**: "Sorry to bother you" — undermines the value you're offering
