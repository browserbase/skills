# Data Extraction Reference

Pattern reference for extracting structured data from websites using the `browse` CLI.

## Table of Contents

- [Extraction Commands Quick Reference](#extraction-commands-quick-reference)
- [Pattern Reference](#pattern-reference)
- [Selector Strategies](#selector-strategies)
- [Output Formats](#output-formats)
- [Rate Limiting & Politeness](#rate-limiting--politeness)
- [Error Reference](#error-reference)

---

## Extraction Commands Quick Reference

These `browse` commands are the building blocks for extraction workflows:

| Command | Extraction Use | Example |
|---------|---------------|---------|
| `browse snapshot` | Discover page structure and element refs | `browse snapshot` |
| `browse snapshot --compact` | Quick overview without ref maps | `browse snapshot --compact` |
| `browse get text <selector>` | Extract text from a single element | `browse get text ".price"` |
| `browse get html <selector>` | Extract HTML preserving structure | `browse get html "table"` |
| `browse eval <js>` | Extract multiple fields as JSON | `browse eval "JSON.stringify({...})"` |
| `browse wait selector <sel>` | Wait for data to load before extracting | `browse wait selector ".results"` |
| `browse wait load` | Wait for page navigation to complete | `browse wait load` |
| `browse scroll <x> <y> <dX> <dY>` | Trigger lazy-loaded content | `browse scroll 0 0 0 1000` |
| `browse click <ref>` | Click pagination or navigation elements | `browse click @0-12` |
| `browse fill <selector> <value>` | Fill search/filter inputs | `browse fill "#search" "query"` |

For the full CLI reference, see the [browser skill REFERENCE.md](../browser/REFERENCE.md).

---

## Pattern Reference

### Pattern 1: Single-Page Extract

**When to use**: Extract specific fields from one URL (product page, article, profile).

**Input**: URL + list of fields to extract.

**Output**: JSON object with named fields.

**Algorithm**:
1. `browse open <url>` — navigate to the page
2. `browse snapshot` — read the page structure, understand what elements exist
3. Choose extraction method:
   - **Few fields**: `browse get text <selector>` for each field
   - **Many fields**: Single `browse eval "JSON.stringify({...})"` call
4. Return structured JSON object

**Termination**: Single page, completes after extraction.

---

### Pattern 2: List-Page Extract

**When to use**: Page has repeating items (job cards, search results, table rows, product grids).

**Input**: URL + description of repeating item structure.

**Output**: JSON array of objects.

**Algorithm**:
1. `browse open <url>` — navigate to the list page
2. `browse snapshot` — identify the repeating container selector
3. `browse eval` with `document.querySelectorAll` + `.map()` to extract all items:
   ```bash
   browse eval "JSON.stringify(Array.from(document.querySelectorAll('.item')).map(el => ({
     title: el.querySelector('.title')?.textContent?.trim(),
     price: el.querySelector('.price')?.textContent?.trim()
   })))"
   ```
4. Parse and return the JSON array

**Termination**: Single page, completes after extraction.

---

### Pattern 3: Paginated Extract

**When to use**: Data spans multiple pages (next button, page numbers, infinite scroll).

**Input**: URL + fields + page limit (optional).

**Output**: JSON array of all items across pages.

**Algorithm**:
1. `browse open <url>` — navigate to first page
2. Extract items from current page (Pattern 2)
3. `browse snapshot` — find the "Next" button or pagination element ref
4. Check termination conditions (see below)
5. `browse click <next-ref>` — click next page
6. `browse wait load` or `browse wait selector <item-selector>` — wait for new content
7. Repeat from step 2

**Termination conditions** (check any):
- No "Next" button found in snapshot
- Reached the specified page limit
- Extracted data is identical to previous page (duplicate detection)
- Page URL hasn't changed after clicking next

**For infinite scroll** (variant):
- Replace steps 3-6 with: `browse scroll 0 0 0 2000` to trigger loading
- `browse wait selector <new-item-selector>` — wait for new items
- Compare item count before/after scroll to detect end

---

### Pattern 4: Search-then-Extract

**When to use**: Need to search or filter before extracting results.

**Input**: URL + search query + fields to extract.

**Output**: JSON array of matching items.

**Algorithm**:
1. `browse open <url>` — navigate to the page with search
2. `browse snapshot` — find the search input
3. `browse fill "#search" "<query>"` — enter search term (auto-submits with Enter)
4. `browse wait selector "<results-selector>"` — wait for results to load
5. Extract results using Pattern 2 or Pattern 3

**Alternative**: Use the `search` skill to find URLs first, then extract from each:
1. Use Browserbase Search API to find relevant URLs
2. Loop through each URL, applying Pattern 1

---

### Pattern 5: Authenticated Extract

**When to use**: Data is behind a login (CRM dashboards, admin panels, member areas).

**Input**: Context ID (pre-authenticated) + URL + fields to extract.

**Output**: JSON object or array.

**Prerequisites**: Use the `cookie-sync` skill to sync browser cookies to a Browserbase context first.

**Algorithm**:
1. `browse open <url> --context-id <id> --persist` — open with authenticated context
2. Verify authentication (check for login prompts vs. expected content)
3. Extract using any pattern above (1-4)
4. `browse stop` — session ends, context persists for next use

---

## Selector Strategies

### Finding Selectors via Snapshot

Always start with `browse snapshot` to understand page structure:

```bash
browse snapshot          # full tree with refs
browse snapshot --compact  # compact tree, no ref maps
```

The snapshot returns an accessibility tree with element refs like `@0-3`, `@0-12`. Use these refs directly in `browse click` and `browse get text`.

### Common Selector Patterns

| Page Element | CSS Selector Pattern | Notes |
|-------------|---------------------|-------|
| Table rows | `table tr`, `tbody tr` | Skip `thead tr` for data only |
| Table cells | `td`, `td:nth-child(N)` | Use nth-child for specific columns |
| Card layouts | `.card`, `.item`, `[class*="card"]` | Look for repeating class patterns |
| List items | `li`, `.list-item`, `ul > li` | Direct children avoid nested lists |
| Data attributes | `[data-testid="product"]` | Most reliable if available |
| Links | `a[href]` | Filter by href pattern if needed |
| Headings | `h1`, `h2`, `.title` | Multiple heading levels |

### When to Use Refs vs CSS Selectors

- **Use `@refs`** (from snapshot): for `browse click` on dynamic elements where CSS selectors might match multiple elements
- **Use CSS selectors**: for `browse get text`, `browse eval`, and `browse fill` where you need specific targeting
- **Use XPath**: for complex traversal (parent/sibling navigation) — pass directly as selector string

---

## Output Formats

### Standard JSON Output Convention

Extraction results should be structured as:

**Single item**:
```json
{
  "title": "Product Name",
  "price": "$29.99",
  "description": "A great product"
}
```

**Multiple items**:
```json
[
  {"title": "Item 1", "price": "$10"},
  {"title": "Item 2", "price": "$20"}
]
```

### Handling Missing Fields

Use optional chaining (`?.`) and nullish coalescing in `browse eval` expressions:

```bash
browse eval "JSON.stringify({
  title: document.querySelector('.title')?.textContent?.trim() ?? null,
  price: document.querySelector('.price')?.textContent?.trim() ?? null
})"
```

Fields that don't exist on the page return `null` instead of throwing errors.

### Using `--json` Flag

Add `--json` to any `browse` command for machine-parseable output:

```bash
browse --json get text ".price"    # Returns: {"text":"$29.99"}
browse --json eval "1 + 1"         # Returns: {"result":2}
```

---

## Rate Limiting & Politeness

- **Between page navigations**: The agent should add `browse wait load` after every `browse click` or `browse open` to ensure content is ready.
- **Large extraction jobs**: Consider limiting to 10-20 pages per run. Break larger jobs into batches.
- **Concurrent sessions**: Use `--session <name>` to run multiple extractions in parallel, each with its own browser instance.
- **Remote mode**: Browserbase handles proxy rotation and rate limiting automatically in remote mode.

---

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| Empty text from `get text` | Page hasn't finished loading | Add `browse wait selector "<target>"` before extraction |
| `browse eval` returns `undefined` | Expression doesn't return a value | Wrap in `JSON.stringify()` |
| Cloudflare / bot detection page | Site has anti-bot protection | Switch to `browse env remote` for stealth mode |
| Stale refs after clicking next | Refs change on every page update | Re-run `browse snapshot` after each navigation |
| Pagination infinite loop | Next button always exists or data repeats | Check for duplicate data; set a page limit |
| `get text` returns wrong element | Multiple elements match selector | Use a more specific selector or `browse snapshot` to find the right ref |
| Timeout on `wait selector` | Element doesn't exist or has different selector | Check selector with `browse eval "document.querySelector('<sel>')"` first |
| JS-rendered content missing | Content loads via API after page load | Use `browse open <url> --wait networkidle` or add explicit `browse wait selector` |

---

## See Also

- [SKILL.md](SKILL.md) — Overview and extraction patterns
- [EXAMPLES.md](EXAMPLES.md) — Working extraction examples
- [Browser Skill](../browser/SKILL.md) — General browser automation
- [Fetch Skill](../fetch/SKILL.md) — Simple HTTP content retrieval
- [Search Skill](../search/SKILL.md) — Web search for finding URLs
- [Cookie Sync Skill](../cookie-sync/SKILL.md) — Authentication setup for Browserbase contexts
