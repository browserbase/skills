# The Geometry of Luck — Meta-Evaluation Lens for UI

Adapted from soleio's decision-making framework grounded in Assembly Theory. Use this lens to evaluate whether a UI will **thrive in its ecology** — not just whether it works today, but whether it persists, compounds, and integrates.

This is a **judgment call**, not a deterministic check. Apply it after functional and craft quality testing is complete. Use it sparingly — for overall page/flow evaluation, not individual buttons.

---

## The Seven Facets (applied to UI)

### 1. Solvency — Can this UI sustain itself?

Does the interface maintain its pattern against entropy? A UI that requires constant developer intervention to stay functional (hardcoded dates, manual content updates, brittle layout assumptions) is insolvent.

| Check | UI Translation |
|-------|---------------|
| Dissipation rate | How fast does this UI degrade without developer input? (stale data, broken links, outdated copy) |
| Gradient source | What keeps users returning? (utility, habit, delight) |
| Renewal dynamics | Does the content/data refresh naturally, or does it go stale? |
| Surplus capacity | Does the UI handle edge cases gracefully, or does it only work on the happy path? |

### 2. Gradient Coupling — Is it connected to real user need?

Does the UI tap into actual user demand, or is it a solution looking for a problem? Features with no gradient coupling are dead weight.

| Check | UI Translation |
|-------|---------------|
| Connection | Does this page/feature address an active user need? |
| Reach | Does it serve multiple user types or contexts? |
| Resilience | If the primary use case disappears, does this UI still have purpose? |

### 3. Structural Compatibility — Can users actually adopt it?

Low reconstruction cost = users can figure it out without a manual. High compatibility means the UI follows conventions users already know.

| Check | UI Translation |
|-------|---------------|
| Prerequisites | Does the user need training to use this? |
| Interface fit | Does it follow platform conventions (Jakob's Law)? |
| Value density | How much capability per unit of learning curve? |

### 4. Niche Construction — Does usage create more usage?

Does the UI create conditions that demand its own continued existence? Features that generate data, habits, or workflows that depend on them are niche-constructing.

| Check | UI Translation |
|-------|---------------|
| Demand generation | Does using this feature make users want to use it more? |
| Infrastructure | Does it create data/state that makes leaving costly? |
| Compounding | Does the UI get more useful the more it's used? |

### 5. Circulation — Does value flow through and back?

Does the interface enable throughput that returns? One-way flows (data in, nothing back) are accumulation without circulation.

| Check | UI Translation |
|-------|---------------|
| Flow direction | Does the user get feedback proportional to their input? |
| Return paths | Can output from this UI feed back into other parts of the app? |
| Bottlenecks | Where does the user flow stall? That's the fragility point. |

### 6. Integration — How connected is it to the rest of the app?

A page that exists in isolation is fragile. A page deeply woven into the app's navigation, data model, and user mental model is resilient.

| Check | UI Translation |
|-------|---------------|
| Connection density | How many other pages/features link to or depend on this one? |
| Cross-system coupling | Does it connect different domains (data, settings, actions)? |
| Bottleneck risk | If this page broke, what else would break? |

### 7. Path Sensitivity — Is the timing right?

Is this UI appearing at the right moment in the user's journey? A settings page shown during onboarding is path-insensitive. A contextual action shown at the moment of need is path-aware.

| Check | UI Translation |
|-------|---------------|
| Precursors | Does the user have the context they need when they arrive here? |
| Integration readiness | Has the user built enough mental model to use this? |
| Window | Is this the right moment in the user's workflow? |

---

## Failure Modes in UI

| Pattern | Signature | UI Example |
|---------|-----------|------------|
| Flash in the pan | High compatibility, no niche construction | Trendy animation that adds no utility |
| Cult classic | High craft, low compatibility | Beautiful custom component nobody understands |
| Institutional zombie | Strong niche construction, depleted gradients | Legacy admin panel everyone hates but can't replace |
| Premature artifact | Strong everywhere except path sensitivity | Feature shipped before users need it |
| Pooled fortune | High throughput, stalled circulation | Dashboard that shows data but offers no actions |

---

## How to Report

When applying the luck lens, report as structured observations — not pass/fail:

```
LUCK|solvency|strong — content refreshes via API, no hardcoded dates, empty states handled
LUCK|gradient-coupling|weak — this settings page serves <1% of users, low return traffic
LUCK|compatibility|strong — follows standard dashboard conventions, no learning curve
LUCK|circulation|concern — user creates reports here but can't share or export them
```

Only include facets where you have a genuine observation. Don't force all seven.
