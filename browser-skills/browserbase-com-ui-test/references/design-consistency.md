# Design Consistency

Check whether changed UI is visually consistent with the rest of the app. This catches "it works but looks wrong" — mismatched spacing, colors, border radii, component styles.

### If `references/design-system.md` exists

The user has documented their design tokens and conventions. Use it as ground truth. (See `references/design-system.example.md` for the expected format.)

```bash
# Read the design system
cat references/design-system.md
# or: cat .claude/skills/ui-test/references/design-system.md

# Then screenshot the changed page and check against documented patterns
browse screenshot
# Compare: does spacing match the grid? Are colors from the palette? Correct font weights?
```

Flag any deviation from the documented system as a `STEP_FAIL`:
```
STEP_FAIL|design-spacing|design system specifies 8px grid → new modal uses 6px gap
STEP_FAIL|design-button|design system: destructive buttons use outline style → new delete button uses filled red
```

### If no design system exists — learn from the app

Before testing the changed page, screenshot 2-3 **unchanged** pages to establish a baseline:

```bash
# Step 1: Capture baseline from existing pages
browse open http://localhost:3000/
browse screenshot
# Note: spacing rhythm, border radii, font sizes, button styles, color palette

browse open http://localhost:3000/settings  # or any other established page
browse screenshot
# Note: same patterns — confirm consistency

# Step 2: Now visit the changed page
browse open http://localhost:3000/changed-page
browse screenshot
# Compare against baseline: does it match the established patterns?
```

Look for:
- **Spacing rhythm** — does the new UI use the same gaps/padding as existing pages?
- **Border radius** — rounded-sm vs rounded-md vs rounded-lg consistency
- **Button styles** — same primary/secondary/destructive patterns?
- **Typography** — same heading sizes, font weights, body text size?
- **Color usage** — same palette? Same semantic colors (red=error, green=success)?
- **Component patterns** — if other pages use inline confirms, does the new page use a modal instead?

Report as structured findings:
```
STEP_PASS|design-consistency|new sidebar uses same border-l, bg-white, and shadow pattern as existing sidebar on /sessions
STEP_FAIL|design-inconsistency|existing pages use rounded-lg on cards → new component uses rounded-sm
```

Design consistency is a **visual judgment** — the weakest assertion type. Always be specific about what you're comparing (which page, which element, which property).
