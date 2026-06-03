---
name: find-browser-skills
description: Discovers pre-built browser-automation skills from the browse.sh catalog so an agent can reuse one instead of writing browser automation from scratch. Use when the user names a website or domain and a task ("get prices from amazon", "search airbnb listings", "track this flight", "scrape X from site Y"), asks "is there a browser skill for X", or wants to scrape/search/extract/monitor/automate a site. Also triggers when the user directs their agent to use this skill explicitly — "use my browse-skills finder to find a skill for X", "can you use your browser-skill finder to find us a way to do X on {site}", "check browse.sh for a skill that does X", or any "find us a browser/browse skill for…" request.
---

# Find Browser Skills

This skill helps you discover browser-automation skills from [browse.sh](https://browse.sh) — the open catalog of domain-specific web skills for agents.

## When to Use This Skill

Use this skill when the user:

- Names a website/domain **and** a task — "get prices from Amazon", "search Airbnb listings", "track this flight on FlightAware"
- Asks "is there a skill for {site}" or "can you automate {website}"
- Wants to scrape, search, extract, check, or monitor something on a specific site
- Is about to ask you to write browser automation by hand — check for a ready-made skill first
- Mentions browsing, scraping, or pulling structured data from a particular domain
- **Explicitly tells their agent to use this skill** — e.g. "use your browse-skills finder to find us a skill for {task} on {site}". This is the common case: the request comes from a user to their agent. Run the find flow below and report what you found (and how to run it), rather than just answering conversationally.

## What is browse.sh?

browse.sh is the open catalog of 500+ domain-specific browser skills for agents. Each skill is a tested recipe for one task on one site (e.g. "search Amazon products", "compare Kayak flights") that returns structured output.

**Agent discovery surfaces:**

- `https://browse.sh/llms.txt` — compact index, one line per skill (best for searching)
- `https://browse.sh/llms-full.txt` — the index plus the full SKILL.md body of every skill
- `https://browse.sh/skills/<domain>/<skill-id>.md` — an individual skill's full instructions

**Important:** browse.sh skills are **not installed** like npm packages. A skill `.md` is read as context to learn the inputs, outputs, and steps — then the task is executed with the `browse` CLI (see the `browser` skill). This skill's job is purely to *find and present* the right skill.

## How to Find a Skill

### Step 1: Identify the domain and task

From the request, pull out:

1. The **website/domain** (e.g. `amazon.com`, `airbnb.com`, `kayak.com`)
2. The **task** (search, extract, track, compare, monitor, fill…)

### Step 2: Search the catalog

Each catalog entry looks like this — the link target starts with the skill's own domain, followed by a description:

```
- [amazon.com/search-products-5170mf](https://browse.sh/skills/amazon.com/search-products-5170mf.md): Search Amazon.com for products with the full filter surface... Read-only.
```

The pieces are `domain/skill-id`, the skill's `.md` URL, a description, and a `Read-only` flag when the skill doesn't modify data. The catalog is small (~375 skills, ~150 KB), so pull it once and grep it as many ways as you need:

```bash
curl -s https://browse.sh/llms.txt > /tmp/browse_catalog.txt
```

**Search by the *task*, not by guessing the domain — and read every candidate.** Two failure modes make a one-shot grep unreliable:

- **You can't guess the domain.** Tasks live under non-obvious domains: jobs are under `indeed.com`, `linkedin.com`, `wellfound.com`, `greenhouse.com`; hotels under `booking.com`; food delivery under `doordash.com`. Grepping your first guess (`monster`, `hotels`, `grubhub`) silently misses real skills.
- **Loose substrings give false positives.** `grep -i "amazon"` also matches skills that merely *mention* Amazon in their description, and an unescaped dot (`x.com`) matches inside `fedex.com`/`stockx.com`. Never trust the first line.

So grep by a task/category keyword across the whole entry, list **all** matches, and choose by reading their descriptions:

```bash
grep -iE "job|hiring|career" /tmp/browse_catalog.txt | sed -E 's/\]\(.*//; s/^- \[//'
```

When you do know the exact domain, anchor to it (and escape the dot) for a precise hit:

```bash
grep -iE "^- \[amazon\.com" /tmp/browse_catalog.txt
```

If a keyword returns many hits, that's expected — narrow with a second term or pick the best 1–3 by description in Step 3. If it returns nothing under several keywords and domains, the skill genuinely isn't in the catalog (see "When No Skill Is Found").

### Step 3: Inspect the candidate pages — this is how you disambiguate

The one-line index is only a hint. Each skill's own page carries structured metadata the index doesn't, and it's the reliable way to pick the right skill from several keyword candidates:

```bash
curl -s https://browse.sh/skills/indeed.com/search-jobs-8yxl6y.md | head -40
```

Read the YAML frontmatter and the body:

- **`category` and `tags`** — the cleanest match signal (e.g. `category: jobs`, `tags: [jobs, recruiting, read-only]`). Use these to confirm a candidate fits, not the substring that matched your grep.
- **`description`** — fuller than the index line; states exactly what's returned.
- **`## When to Use`** — concrete example queries; check the user's request resembles one.
- **`verified`, `recommended_method`, `proxies`** — how it runs (a `verified: true` skill is battle-tested; `proxies: true` / `recommended_method: browser` tell you it needs a Browserbase verified+proxied session, which the `browser` skill handles).

Fetch the top 1–3 candidates this way and pick by `category`/`tags` + `When to Use`, not by index wording.

### Step 4: Present options to the user

Show the user, for each relevant match (pulled from the skill page in Step 3):

1. The skill name and what it does (from `description` / `Purpose`)
2. Its `category`, whether it's `Read-only`, and `verified` status
3. The browse.sh URL to learn more
4. A one-line pointer to running it (the `browser` skill / `browse` CLI — note if it needs a verified+proxied session)

Example response:

```
Found a browse.sh skill that fits! "amazon.com/search-products" searches Amazon
with the full filter surface (brand, rating, price, Prime, sort) and returns
structured JSON per product (ASIN, title, price, rating, image, /dp URL).

Details: https://browse.sh/skills/amazon.com/search-products-5170mf.md

To run it, use the `browser` skill (it drives the `browse` CLI) and follow the
steps in that skill file.
```

## Common Categories

When the domain isn't obvious, search by category keyword:

| Category            | Example domains / keywords                    |
| ------------------- | --------------------------------------------- |
| Shopping / commerce | amazon, ebay, walmart, etsy, product, price   |
| Travel              | airbnb, kayak, google flights, hotel, flight  |
| Real estate         | zillow, redfin, listing, rent                 |
| News / data         | news, traffic, weather, headlines             |
| Social / profiles   | linkedin, reddit, x, profile, posts           |
| Finance             | stock, ticker, crypto, exchange, rate         |

## Tips for Effective Searches

1. **Search by task, not domain.** A category keyword (`job`, `flight`, `hotel`, `review`) finds skills filed under domains you'd never guess. Only anchor to a domain when you're certain of it.
2. **Read all candidates; never trust the first line.** A keyword can return both the right skill and unrelated ones — pick by description, not by `head -1`.
3. **For a precise domain hit, anchor — don't just escape.** `x.com` matches inside `fedex.com`/`stockx.com`, and escaping the dot doesn't help (it's still a substring). Anchor to the start of the entry: `grep -iE "^- \[x\.com"`.
4. **Use a few synonyms** — `job|hiring|career`, `hotel|lodging|stay` — to cover wording differences.
5. **Use `llms-full.txt`** when you need full SKILL.md bodies to compare several candidates at once.
6. **Match the access flag** — prefer `Read-only` skills for scraping/extraction tasks.

## When No Skill Is Found

If no browse.sh skill matches:

1. Tell the user no ready-made browse.sh skill exists for that site/task.
2. Offer to do it directly with the general-purpose **`browser`** skill, which drives the `browse` CLI to navigate, extract, and interact with any page.

Example:

```
I searched browse.sh but didn't find a pre-built skill for that site.
I can still do it directly using the `browser` skill — want me to go ahead?
```
