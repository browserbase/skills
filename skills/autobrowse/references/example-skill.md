# <Portal Name> Navigation Skill

## Site-Specific Knowledge

Brief description of what kind of site this is and any quirks worth knowing upfront.

| Field | Selector | Notes |
|-------|----------|-------|
| Email | `#email` | Clears on focus — use fill not type |
| Password | `#password` | |
| Submit | `button[type="submit"]` | Disabled until form valid |

**Success indicator:** Page contains "Thank you" or URL changes to `/confirmation`

---

## Fast Path

If the site supports URL parameters to skip steps, document them here:

```
https://example.com/pay?amount=10.00&ref=INV-123
```

---

## Execution Steps

### Step 1: Navigate

```
browse open "https://example.com/login"
browse wait load
browse snapshot
```

### Step 2: Fill the form

Use CSS selectors directly — faster than refs when IDs are stable:

```
browse fill "#email" "user@example.com"
browse fill "#password" "secret"
```

### Step 3: Submit

```
browse click "button[type='submit']"
browse wait selector ".confirmation-message"
browse snapshot
```

---

## Timing Rules

- After clicking Submit: wait 3s for spinner to clear before snapshotting
- Dropdown options appear ~500ms after focus — snapshot before clicking
- If page seems stuck after 10s: reload and retry from Step 1

---

## Failure Recovery

- **"Invalid credentials"** on first attempt → likely bot detection, retry with `--env remote`
- **Spinner stuck > 10s** → page hung, `browse reload` and retry
- **Field not found** → site may have updated DOM, take a screenshot and re-discover selector
- **CAPTCHA appears** → switch to `--env remote` for automatic solving
