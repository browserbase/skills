---
name: browserbase-fix
description: Guide Claude through debugging and fixing failing browser automations
---

# Fix Automation Skill

Guide Claude through debugging and fixing failing browser automations.

## When to Use

Use this skill when:
- A Browserbase Function is failing in production
- An automation stopped working (site changed)
- User reports errors from their automation
- CI/CD pipeline failures related to browser functions

## Context Sources

Before debugging, gather context from:

1. **Error messages** - What the user reported or CI logs show
2. **Function code** - The automation script itself
3. **Recent invocations** - Check for patterns in failures
4. **Function history** - When did it last work?

Check function logs via the Browserbase dashboard or API.

## Debugging Workflow

### 1. Reproduce the Issue

Start a browser session to see what's happening:

```bash
browse open <target-url>
```

### 2. Compare Expected vs Actual State

Take a snapshot of the current page:
```bash
browse snapshot
```

Compare with what the automation expects:
- Are the expected elements present?
- Have selectors changed?
- Is there a login wall or CAPTCHA?
- Has the page structure changed?

### 3. Common Failure Patterns

#### Selector Changes
The site updated their HTML:
```bash
browse snapshot
# Look for similar elements with new selectors
browse get text body
```

**Fix**: Update selectors in the function code.

#### Timing Issues
Elements load slower than expected:
```bash
browse network on
browse open <url>
browse network path
# Check if resources are slow to load
```

**Fix**: Add explicit waits or increase timeouts.

#### Authentication Expired
Session cookies no longer valid:
```bash
browse snapshot
# Look for login prompts
```

**Fix**: Re-authenticate or update auth flow. See `skills/auth/SKILL.md`.

#### Rate Limiting / Bot Detection
Site is blocking automated access:
```bash
browse network path
# Look for 403, 429 status codes in captured requests
browse screenshot blocked.png
```

**Fix**: Add delays, use proxies, or contact site owner.

#### Site Redesign
Major structural changes:
```bash
browse snapshot
browse screenshot current.png
```

**Fix**: Rewrite affected portions of the automation.

### 4. Test the Fix

Make changes to the function code, then test:

```bash
# Test locally first
pnpm bb dev index.ts
# Invoke via curl to test

# If local works, deploy
pnpm bb publish index.ts

# Test in production via API
```

### 5. Verify Fix is Complete

After fixing:
1. Run the function multiple times to ensure stability
2. Check that all expected data is returned
3. Verify edge cases still work

## Commit and Deploy

Once fixed, use git to commit changes:

```bash
git add <function-file>
git commit -m "fix(<function-name>): <description of fix>"
git push
```

If this is a PR workflow:
```bash
gh pr create --title "Fix <function-name>" --body "..."
```

## Diagnostic Commands Reference

| Command | Purpose |
|---------|---------|
| `browse open <url>` | Navigate to target |
| `browse snapshot` | Inspect DOM structure |
| `browse screenshot` | Capture visual state |
| `browse network on` | Enable request capture |
| `browse network path` | Get capture directory |
| `browse get text <selector>` | Extract text content |

## Example Debug Session

```
User: My price-monitor function stopped working yesterday

Claude: Let me investigate. First, let me start a debug session:

> browse open https://example.com/product/123

Let me check the page structure:

> browse snapshot

I can see the price element now uses a different class `.product-price` instead of `.price`. The site appears to have been redesigned.

Let me verify:
> browse get text .product-price

Yes, that returns "$29.99". I'll update the selector in your function:

[edits price-monitor.ts to use '.product-price']

Testing locally:
> pnpm bb dev index.ts
> curl -X POST http://127.0.0.1:14113/v1/functions/price-monitor/invoke -H "Content-Type: application/json" -d '{"params": {"productUrl": "https://example.com/product/123"}}'

Works! Deploying fix:
> pnpm bb publish index.ts

The function should work now. Would you like me to commit this fix?
```
