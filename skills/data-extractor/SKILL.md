---
name: data-extractor
description: "Extract structured data from websites into JSON using the browse CLI. Use when the user wants to scrape pages, extract fields from listings or tables, handle pagination, or build data extraction pipelines. The agent decides what to extract — the CLI provides deterministic primitives."
license: MIT
allowed-tools: Bash
metadata:
  openclaw:
    requires:
      bins:
        - browse
    install:
      - kind: node
        package: "@browserbasehq/browse-cli"
        bins:
          - browse
    homepage: https://github.com/browserbase/skills
---

# Structured Data Extraction

Extract structured data (JSON) from websites using the `browse` CLI. This skill teaches patterns for single-page extraction, list scraping, pagination, search-then-extract pipelines, and authenticated extraction.

**How it works**: The `browse` CLI provides deterministic primitives — navigate, read text, evaluate JavaScript, click, scroll. You (the agent) are the intelligence: you read the page structure via `browse snapshot`, decide which selectors to use, and compose commands into extraction workflows.

## Setup Check

```bash
which browse || npm install -g @browserbasehq/browse-cli
```

For protected sites (Cloudflare, bot detection), set your Browserbase API key:

```bash
export BROWSERBASE_API_KEY="your_api_key"  # from https://browserbase.com/settings
browse env remote                           # switch to Browserbase stealth mode
```

## When to Use This Skill

| Use Case | data-extractor | browser | fetch |
|----------|---------------|---------|-------|
| Extract structured fields from a page | **Yes** | Possible but no guidance | No (no JS) |
| Scrape a list of items with pagination | **Yes** | Possible but no guidance | No |
| Simple page navigation / form filling | No | **Yes** | No |
| Fetch static HTML/JSON without rendering | No | Overkill | **Yes** |
| Web search for finding URLs | No | No | No (use `search`) |

**Rule of thumb**: Use this skill when the goal is structured JSON output from web pages. Use `browser` for general navigation and interaction. Use `fetch` for static content. Use `search` to find URLs.

## Core Extraction Patterns

### Pattern 1: Single-Page Extract

Extract specific fields from one URL (product page, article, profile).

```bash
browse open https://example.com/product/123
browse snapshot                              # understand page structure

# Single eval to extract all fields as JSON
browse eval "JSON.stringify({
  name: document.querySelector('h1')?.textContent?.trim(),
  price: document.querySelector('.price')?.textContent?.trim(),
  rating: document.querySelector('.rating')?.textContent?.trim()
})"

browse stop
```

For just one or two fields, `browse get text` is simpler:

```bash
browse get text "h1"                         # returns the heading text
browse get text ".price"                     # returns the price text
```

### Pattern 2: List-Page Extract

Extract repeating items (job cards, search results, table rows).

```bash
browse open https://example.com/jobs
browse wait selector ".job-card"
browse snapshot                              # find the repeating container

# Extract all items as a JSON array
browse eval "JSON.stringify(
  Array.from(document.querySelectorAll('.job-card')).map(card => ({
    title: card.querySelector('.title')?.textContent?.trim(),
    company: card.querySelector('.company')?.textContent?.trim(),
    location: card.querySelector('.location')?.textContent?.trim()
  }))
)"

browse stop
```

### Pattern 3: Paginated Extract

Extract data across multiple pages.

```bash
browse open https://example.com/results

# Extract from page 1
browse eval "JSON.stringify(
  Array.from(document.querySelectorAll('.result')).map(r => ({
    title: r.querySelector('h3')?.textContent?.trim(),
    url: r.querySelector('a')?.href
  }))
)"

# Navigate to page 2
browse snapshot                              # find Next button ref
browse click @0-12                           # click Next
browse wait load                             # wait for new page

# Extract from page 2 (same eval expression)
# ...

# Continue until:
# - No Next button found in snapshot
# - Reached page limit
# - Data is identical to previous page
```

**Critical**: Re-run `browse snapshot` after every navigation. Element refs change when the page updates.

### Pattern 4: Search-then-Extract

Search or filter, then extract results.

```bash
browse open https://example.com
browse fill "#search" "wireless headphones"  # fills and presses Enter
browse wait selector ".search-results"       # wait for results

# Extract search results
browse eval "JSON.stringify(
  Array.from(document.querySelectorAll('.result-item')).map(item => ({
    name: item.querySelector('.name')?.textContent?.trim(),
    price: item.querySelector('.price')?.textContent?.trim(),
    url: item.querySelector('a')?.href
  }))
)"
```

Can also chain with the `search` skill: use Browserbase Search API to find URLs, then `browse open` each to extract content.

### Pattern 5: Authenticated Extract

Extract from pages behind a login.

```bash
# Prerequisite: sync cookies with cookie-sync skill to create a context
browse open https://crm.example.com/dashboard --context-id ctx_abc123 --persist
browse wait selector ".dashboard-data"

# Extract data (same patterns as above)
browse eval "JSON.stringify({...})"

browse stop
# Context persists for future sessions
```

## The `browse eval` Technique

This is the core extraction primitive. `browse eval` runs JavaScript in the page and returns the result.

**Always wrap in `JSON.stringify`** — without it, objects return as `[object Object]`:

```bash
# Bad: returns "[object Object]"
browse eval "document.querySelector('.data')"

# Good: returns structured JSON
browse eval "JSON.stringify({
  title: document.querySelector('h1')?.textContent?.trim()
})"
```

**Multi-statement expressions** use an IIFE:

```bash
browse eval "JSON.stringify((() => {
  const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent?.trim());
  return Array.from(document.querySelectorAll('tbody tr')).map(row => {
    const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
})())"
```

## Handling Dynamic Content

**Lazy loading**: Scroll to trigger content loading, then extract.

```bash
browse scroll 0 0 0 2000                     # scroll down 2000px
browse wait selector ".lazy-item:nth-child(20)"  # wait for items to appear
```

**SPAs / JavaScript-heavy pages**: Wait for network activity to settle.

```bash
browse open https://spa.example.com --wait networkidle
```

**Specific element**: Wait for a known element before extracting.

```bash
browse wait selector ".data-loaded"
browse eval "JSON.stringify({...})"
```

## Output Formatting

Structure extraction results as JSON:

- **Single item**: `{ "field": "value", ... }`
- **Multiple items**: `[ { "field": "value" }, ... ]`
- **Missing fields**: Use `?.` and `?? null` to return `null` instead of crashing

Define the expected fields before extracting. After extraction, verify the output has the expected shape.

## Best Practices

1. **Always `browse snapshot` before extracting** — understand the page structure first.
2. **Prefer a single `browse eval` over multiple `browse get text` calls** — fewer round-trips, more reliable.
3. **Use `--json` flag** for machine-parseable output from any `browse` command.
4. **Add `browse wait selector` on dynamic pages** — don't extract before content loads.
5. **Use remote mode for protected sites** — `browse env remote` enables Browserbase stealth.
6. **Set page limits for pagination** — avoid runaway extraction loops (10-20 pages max per run).
7. **Re-snapshot after every navigation** — refs change on page updates.
8. **Handle missing fields** — use `?.` optional chaining and `?? null` in eval expressions.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `browse get text` returns empty | Page hasn't loaded. Add `browse wait selector "<target>"` before extracting. |
| `browse eval` returns `undefined` | Expression doesn't return a value. Wrap in `JSON.stringify()`. |
| Cloudflare / "Checking your browser" | Switch to remote mode: `browse stop && browse env remote && browse open <url>` |
| Stale refs after clicking Next | Re-run `browse snapshot` after every page navigation. |
| Pagination loops forever | Track extracted data for duplicates. Set a max page count. |
| Wrong element selected | Use a more specific CSS selector, or use `@ref` from `browse snapshot`. |
| Content loads after page load | Use `browse open <url> --wait networkidle` or explicit `browse wait selector`. |

## See Also

For detailed examples, see [EXAMPLES.md](EXAMPLES.md).
For the pattern and command reference, see [REFERENCE.md](REFERENCE.md).

Related skills:
- [Browser Skill](../browser/SKILL.md) — General browser navigation and interaction
- [Fetch Skill](../fetch/SKILL.md) — Simple HTTP content retrieval (no JS rendering)
- [Search Skill](../search/SKILL.md) — Web search for finding URLs before extraction
- [Cookie Sync Skill](../cookie-sync/SKILL.md) — Set up authenticated Browserbase contexts
