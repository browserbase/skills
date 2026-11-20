# Adversarial Test Patterns

Use these patterns to try to break features. Apply them to every interactive element you test.

### Forms — try to break them

```bash
# Empty submission
browse snapshot                          # BEFORE: note form fields
browse click @submit-ref                 # ACT: submit empty
browse snapshot                          # AFTER: error messages should appear

# Long input (500+ chars)
browse fill "#name" "aaaa....(500 chars)"
browse snapshot                          # Check: does layout break? Is text truncated?

# Special characters
browse fill "#name" "<script>alert('xss')</script>"
browse fill "#email" "'; DROP TABLE users;--"
browse snapshot                          # Check: input sanitized? No raw HTML rendered?

# Rapid submit
browse click @submit-ref
browse click @submit-ref                 # Click twice immediately
browse snapshot                          # Check: only one submission processed?
```

### Modals — test the full lifecycle

```bash
browse snapshot                          # BEFORE: no dialog in tree

# Open
browse click @trigger-ref
browse snapshot                          # AFTER: dialog element should appear
# ASSERT: dialog role exists in tree

# Escape to close
browse press Escape
browse snapshot                          # AFTER: dialog should be gone
# ASSERT: dialog role removed from tree

# Re-open and cancel
browse click @trigger-ref
browse snapshot                          # dialog present
browse click @cancel-ref
browse snapshot                          # dialog gone

# Re-open and confirm
browse click @trigger-ref
browse snapshot                          # dialog present
browse click @confirm-ref
browse snapshot                          # dialog gone + side effect occurred
```

### Navigation — verify routing works

```bash
browse snapshot                          # BEFORE: note current URL and content
browse click @nav-link-ref               # ACT: click a navigation link
browse wait load
browse get url                           # Check URL changed
browse snapshot                          # AFTER: content matches the destination
# Compare: different heading, different page content

# Back button
browse back
browse get url                           # Should return to original URL
browse snapshot                          # Content matches original page
```

### Error states — find missing ones

```bash
# Navigate to a page with no data
browse open http://localhost:3000/items
browse snapshot
# Check: is there a designed empty state with a message and CTA?
# Or just blank space?

# Navigate to a non-existent route
browse open http://localhost:3000/does-not-exist
browse snapshot
# Check: 404 page? Or blank/error?

# Submit invalid data and check error recovery
browse fill "#field" "invalid"
browse click @submit-ref
browse snapshot
# Check: is the error message helpful? Does it tell you what's wrong?
# Check: is the user's input preserved? Or was the form cleared?
```

### Keyboard accessibility — can you use it without a mouse?

```bash
browse open http://localhost:3000/page
browse wait load

# Tab through all interactive elements
browse press Tab
browse eval "JSON.stringify({tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0,40), role: document.activeElement?.getAttribute('role')})"
# Repeat Tab + eval until activeElement returns to BODY
# Check: every interactive element reachable? Focus ring visible? Order logical?

# Try activating elements via keyboard
browse press Enter                       # Should activate focused button
browse snapshot                          # Verify the action happened
```
