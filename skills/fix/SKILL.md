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

```bash
stagehand fn errors <function-name>
stagehand fn logs <function-name>
```

## Debugging Workflow

### 1. Reproduce the Issue

Start a Browserbase session to see what's happening:

```bash
stagehand session create
stagehand session live  # Open in browser to watch
```

Navigate to the target URL:
```bash
stagehand goto <target-url>
```

### 2. Compare Expected vs Actual State

Take a snapshot of the current page:
```bash
stagehand snapshot
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
stagehand snapshot
# Look for similar elements with new selectors
stagehand eval "document.querySelector('.new-class')?.textContent"
```

**Fix**: Update selectors in the function code.

#### Timing Issues
Elements load slower than expected:
```bash
stagehand network on
stagehand goto <url>
stagehand network list
# Check if resources are slow to load
```

**Fix**: Add explicit waits or increase timeouts.

#### Authentication Expired
Session cookies no longer valid:
```bash
stagehand snapshot
# Look for login prompts
```

**Fix**: Re-authenticate or update auth flow. See `skills/auth/SKILL.md`.

#### Rate Limiting / Bot Detection
Site is blocking automated access:
```bash
stagehand network list
# Look for 403, 429 status codes
stagehand screenshot -o blocked.png
```

**Fix**: Add delays, use proxies, or contact site owner.

#### Site Redesign
Major structural changes:
```bash
stagehand snapshot
stagehand screenshot -o current.png
```

**Fix**: Rewrite affected portions of the automation.

### 4. Test the Fix

Make changes to the function code, then test:

```bash
# Test locally first
stagehand fn invoke <name> --local

# If local works, deploy
stagehand fn publish <entrypoint>

# Test in production
stagehand fn invoke <name>
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
| `stagehand session create` | Start debug session |
| `stagehand session live` | Open visual debugger |
| `stagehand goto <url>` | Navigate to target |
| `stagehand snapshot` | Inspect DOM structure |
| `stagehand screenshot` | Capture visual state |
| `stagehand network on` | Enable request capture |
| `stagehand network list` | View captured requests |
| `stagehand network show <id>` | Inspect specific request |
| `stagehand eval <js>` | Run diagnostic JS |
| `stagehand fn errors <name>` | View recent failures |
| `stagehand fn logs <name>` | View function logs |

## Example Debug Session

```
User: My price-monitor function stopped working yesterday

Claude: Let me investigate. First, let me check the recent errors:

> stagehand fn errors price-monitor

I see several failures with "Element not found: .price". Let me start a debug session:

> stagehand session create
> stagehand session live
> stagehand goto https://example.com/product/123

Opening in browser so you can watch. Let me check the page structure:

> stagehand snapshot

I can see the price element now uses a different class `.product-price` instead of `.price`. The site appears to have been redesigned.

Let me verify:
> stagehand eval "document.querySelector('.product-price')?.textContent"

Yes, that returns "$29.99". I'll update the selector in your function:

[edits price-monitor.ts to use '.product-price']

Testing locally:
> stagehand fn invoke price-monitor --local -p '{"productUrl": "https://example.com/product/123"}'

Works! Deploying fix:
> stagehand fn publish price-monitor.ts

The function should work now. Would you like me to commit this fix?
```
