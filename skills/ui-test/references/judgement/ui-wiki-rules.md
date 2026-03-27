# User Interface Wiki

**Version 3.0.0**
raphael-salaja
March 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when reviewing,
> generating, or refactoring UI code. Humans may also find it useful, but
> guidance here is optimized for automation and consistency by AI-assisted workflows.

---

## Abstract

Comprehensive UI/UX best practices guide for web interfaces, designed for AI agents and LLMs. Contains 152 rules across 12 categories, prioritized by impact from critical (animation principles, timing functions) to incremental (morphing icons, typography). Each rule includes detailed explanations and code examples comparing incorrect vs. correct implementations.

---

## Table of Contents

1. [Animation Principles](#1-animation-principles) — **CRITICAL**
   - 1.1 [User Animations Under 300ms](#11-user-animations-under-300ms)
   - 1.2 [Consistent Timing for Similar Elements](#12-consistent-timing-for-similar-elements)
   - 1.3 [No Entrance Animation on Context Menus](#13-no-entrance-animation-on-context-menus)
   - 1.4 [Exponential Ramps for Natural Decay](#14-exponential-ramps-for-natural-decay)
   - 1.5 [No Linear Easing for Motion](#15-no-linear-easing-for-motion)
   - 1.6 [Active State Scale Transform](#16-active-state-scale-transform)
   - 1.7 [Subtle Squash and Stretch](#17-subtle-squash-and-stretch)
   - 1.8 [Springs for Overshoot and Settle](#18-springs-for-overshoot-and-settle)
   - 1.9 [Stagger Under 50ms Per Item](#19-stagger-under-50ms-per-item)
   - 1.10 [Single Focal Point](#110-single-focal-point)
   - 1.11 [Dim Background for Focus](#111-dim-background-for-focus)
   - 1.12 [Z-Index Layering for Animated Elements](#112-z-index-layering-for-animated-elements)
2. [Timing Functions](#2-timing-functions) — **HIGH**
   - 2.1 [Springs for Gesture-Driven Motion](#21-springs-for-gesture-driven-motion)
   - 2.2 [Springs for Interruptible Motion](#22-springs-for-interruptible-motion)
   - 2.3 [Springs Preserve Input Velocity](#23-springs-preserve-input-velocity)
   - 2.4 [Balanced Spring Parameters](#24-balanced-spring-parameters)
   - 2.5 [Easing for System State Changes](#25-easing-for-system-state-changes)
   - 2.6 [Ease-Out for Entrances](#26-ease-out-for-entrances)
   - 2.7 [Ease-In for Exits](#27-ease-in-for-exits)
   - 2.8 [Ease-In-Out for View Transitions](#28-ease-in-out-for-view-transitions)
   - 2.9 [Linear Easing Only for Progress](#29-linear-easing-only-for-progress)
   - 2.10 [Press and Hover 120-180ms](#210-press-and-hover-120-180ms)
   - 2.11 [Small State Changes 180-260ms](#211-small-state-changes-180-260ms)
   - 2.12 [Max 300ms for User Actions](#212-max-300ms-for-user-actions)
   - 2.13 [Shorten Duration Before Adjusting Curve](#213-shorten-duration-before-adjusting-curve)
   - 2.14 [No Animation for High-Frequency Interactions](#214-no-animation-for-high-frequency-interactions)
   - 2.15 [No Animation for Keyboard Navigation](#215-no-animation-for-keyboard-navigation)
   - 2.16 [No Entrance Animation for Context Menus](#216-no-entrance-animation-for-context-menus)
3. [Exit Animations](#3-exit-animations) — **HIGH**
   - 3.1 [AnimatePresence Wrapper Required](#31-animatepresence-wrapper-required)
   - 3.2 [Exit Prop Required Inside AnimatePresence](#32-exit-prop-required-inside-animatepresence)
   - 3.3 [Unique Keys in AnimatePresence Lists](#33-unique-keys-in-animatepresence-lists)
   - 3.4 [Exit Mirrors Initial for Symmetry](#34-exit-mirrors-initial-for-symmetry)
   - 3.5 [useIsPresent in Child Component](#35-useispresent-in-child-component)
   - 3.6 [Call safeToRemove After Async Work](#36-call-safetoremove-after-async-work)
   - 3.7 [Disable Interactions on Exiting Elements](#37-disable-interactions-on-exiting-elements)
   - 3.8 [Mode "wait" Doubles Duration](#38-mode-wait-doubles-duration)
   - 3.9 [Mode "sync" Causes Layout Conflicts](#39-mode-sync-causes-layout-conflicts)
   - 3.10 [popLayout for List Reordering](#310-poplayout-for-list-reordering)
   - 3.11 [Propagate Prop for Nested AnimatePresence](#311-propagate-prop-for-nested-animatepresence)
   - 3.12 [Coordinated Parent-Child Exit Timing](#312-coordinated-parent-child-exit-timing)
4. [CSS Pseudo Elements](#4-css-pseudo-elements) — **MEDIUM**
   - 4.1 [Content Property Required for Pseudo-Elements](#41-content-property-required-for-pseudo-elements)
   - 4.2 [Pseudo-Elements Over DOM Nodes](#42-pseudo-elements-over-dom-nodes)
   - 4.3 [Position Relative Parent for Pseudo-Elements](#43-position-relative-parent-for-pseudo-elements)
   - 4.4 [Z-Index Layering for Pseudo-Elements](#44-z-index-layering-for-pseudo-elements)
   - 4.5 [Hit Target Expansion with Pseudo-Elements](#45-hit-target-expansion-with-pseudo-elements)
   - 4.6 [View Transition Name Required](#46-view-transition-name-required)
   - 4.7 [Unique View Transition Names](#47-unique-view-transition-names)
   - 4.8 [Clean Up View Transition Names](#48-clean-up-view-transition-names)
   - 4.9 [View Transitions Over JS Libraries](#49-view-transitions-over-js-libraries)
   - 4.10 [Style View Transition Pseudo-Elements](#410-style-view-transition-pseudo-elements)
   - 4.11 [Use ::backdrop for Dialog Backgrounds](#411-use-backdrop-for-dialog-backgrounds)
   - 4.12 [Use ::placeholder for Input Styling](#412-use-placeholder-for-input-styling)
   - 4.13 [Use ::selection for Text Styling](#413-use-selection-for-text-styling)
   - 4.14 [Use ::marker for Custom List Bullets](#414-use-marker-for-custom-list-bullets)
   - 4.15 [Use ::first-line for Typographic Treatments](#415-use-first-line-for-typographic-treatments)
5. [Audio Feedback](#5-audio-feedback) — **MEDIUM**
   - 5.1 [Visual Equivalent for Every Sound](#51-visual-equivalent-for-every-sound)
   - 5.2 [Toggle Setting to Disable Sounds](#52-toggle-setting-to-disable-sounds)
   - 5.3 [Respect prefers-reduced-motion for Sound](#53-respect-prefers-reduced-motion-for-sound)
   - 5.4 [Independent Volume Control](#54-independent-volume-control)
   - 5.5 [No Sound on High-Frequency Interactions](#55-no-sound-on-high-frequency-interactions)
   - 5.6 [Sound for Confirmations](#56-sound-for-confirmations)
   - 5.7 [Sound for Errors and Warnings](#57-sound-for-errors-and-warnings)
   - 5.8 [No Decorative Sound](#58-no-decorative-sound)
   - 5.9 [Informative Not Punishing Sound](#59-informative-not-punishing-sound)
   - 5.10 [Preload Audio Files](#510-preload-audio-files)
   - 5.11 [Subtle Default Volume](#511-subtle-default-volume)
   - 5.12 [Reset currentTime Before Replay](#512-reset-currenttime-before-replay)
   - 5.13 [Match Sound Weight to Action](#513-match-sound-weight-to-action)
   - 5.14 [Sound Duration Matches Action Duration](#514-sound-duration-matches-action-duration)
6. [Sound Synthesis](#6-sound-synthesis) — **MEDIUM**
   - 6.1 [Reuse Single AudioContext](#61-reuse-single-audiocontext)
   - 6.2 [Resume Suspended AudioContext](#62-resume-suspended-audiocontext)
   - 6.3 [Clean Up Audio Nodes After Playback](#63-clean-up-audio-nodes-after-playback)
   - 6.4 [Exponential Decay for Natural Sound](#64-exponential-decay-for-natural-sound)
   - 6.5 [No Zero Target for Exponential Ramps](#65-no-zero-target-for-exponential-ramps)
   - 6.6 [Set Initial Value Before Ramp](#66-set-initial-value-before-ramp)
   - 6.7 [Noise for Percussive Sounds](#67-noise-for-percussive-sounds)
   - 6.8 [Oscillators for Tonal Sounds](#68-oscillators-for-tonal-sounds)
   - 6.9 [Bandpass Filter for Sound Character](#69-bandpass-filter-for-sound-character)
   - 6.10 [Click Duration 5-15ms](#610-click-duration-5-15ms)
   - 6.11 [Click Filter 3000-6000Hz](#611-click-filter-3000-6000hz)
   - 6.12 [Gain Under 1.0](#612-gain-under-10)
   - 6.13 [Filter Q Value 2-5](#613-filter-q-value-2-5)
7. [Morphing Icons](#7-morphing-icons) — **LOW**
   - 7.1 [Icons Must Use Exactly Three Lines](#71-icons-must-use-exactly-three-lines)
   - 7.2 [Use Collapsed Constant for Unused Lines](#72-use-collapsed-constant-for-unused-lines)
   - 7.3 [Consistent ViewBox Size](#73-consistent-viewbox-size)
   - 7.4 [Shared Group for Rotational Variants](#74-shared-group-for-rotational-variants)
   - 7.5 [Spring Physics for Rotation](#75-spring-physics-for-rotation)
   - 7.6 [Reduced Motion Support for Icons](#76-reduced-motion-support-for-icons)
   - 7.7 [Instant Jump for Non-Grouped Icons](#77-instant-jump-for-non-grouped-icons)
   - 7.8 [Round Stroke Line Caps](#78-round-stroke-line-caps)
   - 7.9 [Aria Hidden on Icon SVGs](#79-aria-hidden-on-icon-svgs)
8. [Container Animation](#8-container-animation) — **MEDIUM**
   - 8.1 [Two-Div Pattern for Animated Bounds](#81-two-div-pattern-for-animated-bounds)
   - 8.2 [Guard Against Zero on Initial Render](#82-guard-against-zero-on-initial-render)
   - 8.3 [Use ResizeObserver for Measurement](#83-use-resizeobserver-for-measurement)
   - 8.4 [Overflow Hidden on Animated Container](#84-overflow-hidden-on-animated-container)
   - 8.5 [Use Animated Bounds Sparingly](#85-use-animated-bounds-sparingly)
   - 8.6 [Use Callback Ref for Measurement](#86-use-callback-ref-for-measurement)
   - 8.7 [Add Delay for Natural Container Transitions](#87-add-delay-for-natural-container-transitions)
9. [Laws of UX](#9-laws-of-ux) — **HIGH**
   - 9.1 [Size Interactive Targets for Easy Clicking](#91-size-interactive-targets-for-easy-clicking)
   - 9.2 [Expand Hit Areas with Invisible Padding](#92-expand-hit-areas-with-invisible-padding)
   - 9.3 [Minimize Choices to Reduce Decision Time](#93-minimize-choices-to-reduce-decision-time)
   - 9.4 [Chunk Data into Groups of 5-9](#94-chunk-data-into-groups-of-5-9)
   - 9.5 [Respond Within 400ms](#95-respond-within-400ms)
   - 9.6 [Fake Speed When Actual Speed Isn't Possible](#96-fake-speed-when-actual-speed-isnt-possible)
   - 9.7 [Accept Messy Input, Output Clean Data](#97-accept-messy-input-output-clean-data)
   - 9.8 [Show What Matters Now, Reveal Complexity Later](#98-show-what-matters-now-reveal-complexity-later)
   - 9.9 [Use Familiar UI Patterns](#99-use-familiar-ui-patterns)
   - 9.10 [Visual Polish Increases Perceived Usability](#910-visual-polish-increases-perceived-usability)
   - 9.11 [Group Related Elements Spatially](#911-group-related-elements-spatially)
   - 9.12 [Similar Elements Should Look Alike](#912-similar-elements-should-look-alike)
   - 9.13 [Use Boundaries to Group Related Content](#913-use-boundaries-to-group-related-content)
   - 9.14 [Make Important Elements Visually Distinct](#914-make-important-elements-visually-distinct)
   - 9.15 [Place Key Items First or Last](#915-place-key-items-first-or-last)
   - 9.16 [End Experiences with Clear Success States](#916-end-experiences-with-clear-success-states)
   - 9.17 [Move Complexity to the System](#917-move-complexity-to-the-system)
   - 9.18 [Show Progress Toward Completion](#918-show-progress-toward-completion)
   - 9.19 [Show Incomplete State to Drive Completion](#919-show-incomplete-state-to-drive-completion)
   - 9.20 [Simplify Complex Visuals into Clear Forms](#920-simplify-complex-visuals-into-clear-forms)
   - 9.21 [Prioritize the Critical 20% of Features](#921-prioritize-the-critical-20-of-features)
   - 9.22 [Minimize Extraneous Cognitive Load](#922-minimize-extraneous-cognitive-load)
   - 9.23 [Visually Connect Related Elements](#923-visually-connect-related-elements)
10. [Predictive Prefetching](#10-predictive-prefetching) — **MEDIUM**
    - 10.1 [Trajectory Prediction Over Hover Prefetching](#101-trajectory-prediction-over-hover-prefetching)
    - 10.2 [Prefetch by Intent, Not Viewport](#102-prefetch-by-intent-not-viewport)
    - 10.3 [Use hitSlop to Trigger Predictions Earlier](#103-use-hitslop-to-trigger-predictions-earlier)
    - 10.4 [Fall Back Gracefully on Touch Devices](#104-fall-back-gracefully-on-touch-devices)
    - 10.5 [Prefetch on Keyboard Navigation](#105-prefetch-on-keyboard-navigation)
    - 10.6 [Use Predictive Prefetching Selectively](#106-use-predictive-prefetching-selectively)
11. [Typography](#11-typography) — **MEDIUM**
    - 11.1 [Tabular Numbers for Data Display](#111-tabular-numbers-for-data-display)
    - 11.2 [Oldstyle Numbers for Body Text](#112-oldstyle-numbers-for-body-text)
    - 11.3 [Slashed Zero for Disambiguation](#113-slashed-zero-for-disambiguation)
    - 11.4 [Enable Contextual Alternates](#114-enable-contextual-alternates)
    - 11.5 [Use Disambiguation Stylistic Set for UI](#115-use-disambiguation-stylistic-set-for-ui)
    - 11.6 [Keep Optical Sizing Auto](#116-keep-optical-sizing-auto)
    - 11.7 [Use Antialiased Font Smoothing](#117-use-antialiased-font-smoothing)
    - 11.8 [Balance Headings with text-wrap](#118-balance-headings-with-text-wrap)
    - 11.9 [Offset Underlines from Descenders](#119-offset-underlines-from-descenders)
    - 11.10 [Disable Font Synthesis for Missing Styles](#1110-disable-font-synthesis-for-missing-styles)
    - 11.11 [Use font-display swap](#1111-use-font-display-swap)
    - 11.12 [Continuous Weight Values with Variable Fonts](#1112-continuous-weight-values-with-variable-fonts)
    - 11.13 [text-wrap pretty for Body Text](#1113-text-wrap-pretty-for-body-text)
    - 11.14 [Pair Justified Text with Hyphens](#1114-pair-justified-text-with-hyphens)
    - 11.15 [Add Letter Spacing to Uppercase Text](#1115-add-letter-spacing-to-uppercase-text)
    - 11.16 [Use Typographic Fractions](#1116-use-typographic-fractions)
12. [Visual Design](#12-visual-design) — **HIGH**
    - 12.1 [Concentric Border Radius for Nested Elements](#121-concentric-border-radius-for-nested-elements)
    - 12.2 [Layer Multiple Shadows for Realistic Depth](#122-layer-multiple-shadows-for-realistic-depth)
    - 12.3 [Consistent Shadow Direction Across UI](#123-consistent-shadow-direction-across-ui)
    - 12.4 [Use Neutral Colors for Shadows](#124-use-neutral-colors-for-shadows)
    - 12.5 [Shadow Size Indicates Elevation](#125-shadow-size-indicates-elevation)
    - 12.6 [Animate Shadows via Pseudo-Element Opacity](#126-animate-shadows-via-pseudo-element-opacity)
    - 12.7 [Use a Consistent Spacing Scale](#127-use-a-consistent-spacing-scale)
    - 12.8 [Use Semi-Transparent Borders](#128-use-semi-transparent-borders)
    - 12.9 [Full Shadow Anatomy on Buttons](#129-full-shadow-anatomy-on-buttons)

---

## 1. Animation Principles

**Impact:** CRITICAL — Disney's 12 principles adapted for web. Violations here produce the most noticeable quality issues.

### 1.1 User Animations Under 300ms

User-initiated animations must complete within 300ms.

**Incorrect (exceeds 300ms limit):**

```css
.button { transition: transform 400ms; }
```

**Correct (within 300ms):**

```css
.button { transition: transform 200ms; }
```

### 1.2 Consistent Timing for Similar Elements

Similar elements must use identical timing values.

**Incorrect (inconsistent timing):**

```css
.button-primary { transition: 200ms; }
.button-secondary { transition: 150ms; }
```

**Correct (consistent timing):**

```css
.button-primary { transition: 200ms; }
.button-secondary { transition: 200ms; }
```

### 1.3 No Entrance Animation on Context Menus

Context menus should not animate on entrance (exit only).

**Incorrect (animates entrance):**

```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
```

**Correct (exit only):**

```tsx
<motion.div exit={{ opacity: 0 }} />
```

### 1.4 Exponential Ramps for Natural Decay

Use exponential ramps, not linear, for natural decay.

**Incorrect (linear ramp):**

```ts
gain.gain.linearRampToValueAtTime(0, t + 0.05);
```

**Correct (exponential ramp):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

### 1.5 No Linear Easing for Motion

Linear easing should only be used for progress indicators, not motion.

**Incorrect (linear for motion):**

```css
.card { transition: transform 200ms linear; }
```

**Correct (linear for progress only):**

```css
.progress-bar { transition: width 100ms linear; }
```

### 1.6 Active State Scale Transform

Interactive elements must have active/pressed state with scale transform.

**Incorrect (no active state):**

```css
.button:hover { background: var(--gray-3); }
/* Missing :active state */
```

**Correct (active state present):**

```css
.button:active { transform: scale(0.98); }
```

### 1.7 Subtle Squash and Stretch

Squash/stretch deformation must be subtle (0.95-1.05 range).

**Incorrect (excessive deformation):**

```tsx
<motion.div whileTap={{ scale: 0.8 }} />
```

**Correct (subtle deformation):**

```tsx
<motion.div whileTap={{ scale: 0.98 }} />
```

### 1.8 Springs for Overshoot and Settle

Use springs (not easing) when overshoot-and-settle is needed.

**Incorrect (easing for bounce):**

```tsx
<motion.div transition={{ duration: 0.3, ease: "easeOut" }} />
```

**Correct (spring physics):**

```tsx
<motion.div transition={{ type: "spring", stiffness: 500, damping: 30 }} />
```

### 1.9 Stagger Under 50ms Per Item

Stagger delays must not exceed 50ms per item.

**Incorrect (excessive stagger):**

```tsx
transition={{ staggerChildren: 0.15 }}
```

**Correct (reasonable stagger):**

```tsx
transition={{ staggerChildren: 0.03 }}
```

### 1.10 Single Focal Point

Only one element should animate prominently at a time.

**Incorrect (competing animations):**

```tsx
<motion.div animate={{ scale: 1.1 }} />
<motion.div animate={{ scale: 1.1 }} />
```

### 1.11 Dim Background for Focus

Modal/dialog backgrounds should dim to direct focus.

**Incorrect (transparent overlay):**

```css
.overlay { background: transparent; }
```

**Correct (dimmed overlay):**

```css
.overlay { background: var(--black-a6); }
```

### 1.12 Z-Index Layering for Animated Elements

Animated elements must respect z-index layering.

**Incorrect (no z-index):**

```css
.tooltip { /* No z-index, may render behind other elements */ }
```

**Correct (explicit z-index):**

```css
.tooltip { z-index: 50; }
```

---

## 2. Timing Functions

**Impact:** HIGH — Choosing the right timing function based on whether motion is user-driven, system-driven, or high-frequency.

**Decision framework:** Is this motion reacting to the user, or is the system speaking?

| Motion Type | Best Choice | Why |
|-------------|-------------|-----|
| User-driven (drag, flick, gesture) | Spring | Survives interruption, preserves velocity |
| System-driven (state change, feedback) | Easing | Clear start/end, predictable timing |
| Time representation (progress, loading) | Linear | 1:1 relationship between time and progress |
| High-frequency (typing, fast toggles) | None | Animation adds noise, feels slower |

### 2.1 Springs for Gesture-Driven Motion

Gesture-driven motion (drag, flick, swipe) must use springs.

**Incorrect (easing for drag):**

```tsx
<motion.div
  drag="x"
  transition={{ duration: 0.3, ease: "easeOut" }}
/>
```

**Correct (spring for drag):**

```tsx
<motion.div
  drag="x"
  transition={{ type: "spring", stiffness: 500, damping: 30 }}
/>
```

### 2.2 Springs for Interruptible Motion

Motion that can be interrupted must use springs.

**Incorrect (easing for interruptible):**

```tsx
<motion.div
  animate={{ x: isOpen ? 200 : 0 }}
  transition={{ duration: 0.3 }}
/>
```

**Correct (spring for interruptible):**

```tsx
<motion.div
  animate={{ x: isOpen ? 200 : 0 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
/>
```

### 2.3 Springs Preserve Input Velocity

When velocity matters, use springs to preserve input energy.

**Incorrect (velocity ignored):**

```tsx
onDragEnd={(e, info) => {
  animate(target, { x: 0 }, { duration: 0.3 });
}}
```

**Correct (velocity preserved):**

```tsx
onDragEnd={(e, info) => {
  animate(target, { x: 0 }, {
    type: "spring",
    velocity: info.velocity.x,
  });
}}
```

### 2.4 Balanced Spring Parameters

Spring parameters must be balanced; avoid excessive oscillation.

**Incorrect (too bouncy):**

```tsx
transition={{
  type: "spring",
  stiffness: 1000,
  damping: 5,
}}
```

**Correct (balanced):**

```tsx
transition={{
  type: "spring",
  stiffness: 500,
  damping: 30,
}}
```

### 2.5 Easing for System State Changes

System-initiated state changes should use easing curves.

**Incorrect (spring for announcement):**

```tsx
<motion.div
  animate={{ y: 0 }}
  transition={{ type: "spring" }}
/>
```

**Correct (easing for announcement):**

```tsx
<motion.div
  animate={{ y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
/>
```

### 2.6 Ease-Out for Entrances

Entrances must use ease-out (arrive fast, settle gently).

**Incorrect (ease-in for entrance):**

```css
.modal-enter { animation-timing-function: ease-in; }
```

**Correct (ease-out for entrance):**

```css
.modal-enter { animation-timing-function: ease-out; }
```

### 2.7 Ease-In for Exits

Exits must use ease-in (build momentum before departure).

**Incorrect (ease-out for exit):**

```css
.modal-exit { animation-timing-function: ease-out; }
```

**Correct (ease-in for exit):**

```css
.modal-exit { animation-timing-function: ease-in; }
```

### 2.8 Ease-In-Out for View Transitions

View/mode transitions use ease-in-out for neutral attention.

**Correct:**

```css
.page-transition { animation-timing-function: ease-in-out; }
```

### 2.9 Linear Easing Only for Progress

Linear easing only for progress bars and time representation.

**Incorrect (linear for motion):**

```css
.card-slide { transition: transform 200ms linear; }
```

**Correct (linear for progress):**

```css
.progress-bar { transition: width 100ms linear; }
```

### 2.10 Press and Hover 120-180ms

Press and hover interactions should use 120-180ms duration.

**Incorrect (too slow):**

```css
.button:hover { transition: background-color 400ms; }
```

**Correct (appropriate duration):**

```css
.button:hover { transition: background-color 150ms; }
```

### 2.11 Small State Changes 180-260ms

Small state changes should use 180-260ms duration.

**Correct:**

```css
.toggle { transition: transform 200ms ease; }
```

### 2.12 Max 300ms for User Actions

User-initiated animations must not exceed 300ms.

**Incorrect (exceeds limit):**

```tsx
<motion.div transition={{ duration: 0.5 }} />
```

**Correct (within limit):**

```tsx
<motion.div transition={{ duration: 0.25 }} />
```

### 2.13 Shorten Duration Before Adjusting Curve

If animation feels slow, shorten duration before adjusting curve.

**Incorrect (adjusting curve instead):**

```css
.element { transition: 400ms cubic-bezier(0, 0.9, 0.1, 1); }
```

**Correct (shorter duration):**

```css
.element { transition: 200ms ease-out; }
```

### 2.14 No Animation for High-Frequency Interactions

High-frequency interactions should have no animation.

**Incorrect (animated on every keystroke):**

```tsx
function SearchInput() {
  return (
    <motion.div animate={{ scale: [1, 1.02, 1] }}>
      <input onChange={handleSearch} />
    </motion.div>
  );
}
```

**Correct (no animation):**

```tsx
function SearchInput() {
  return <input onChange={handleSearch} />;
}
```

### 2.15 No Animation for Keyboard Navigation

Keyboard navigation should be instant, no animation.

**Incorrect (animated focus):**

```tsx
function Menu() {
  return items.map(item => (
    <motion.li
      whileFocus={{ scale: 1.05 }}
      transition={{ duration: 0.2 }}
    />
  ));
}
```

**Correct (CSS focus-visible only):**

```tsx
function Menu() {
  return items.map(item => (
    <li className={styles.menuItem} />
  ));
}
```

### 2.16 No Entrance Animation for Context Menus

Context menus should not animate on entrance (exit only).

**Incorrect (entrance animation):**

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0 }}
/>
```

**Correct (exit only):**

```tsx
<motion.div exit={{ opacity: 0, scale: 0.95 }} />
```

**Quick reference:**

| Interaction | Timing | Type |
|-------------|--------|------|
| Drag release | Spring | `stiffness: 500, damping: 30` |
| Button press | 150ms | `ease` |
| Modal enter | 200ms | `ease-out` |
| Modal exit | 150ms | `ease-in` |
| Page transition | 250ms | `ease-in-out` |
| Progress bar | varies | `linear` |
| Typing feedback | 0ms | none |

---

## 3. Exit Animations

**Impact:** HIGH — Correct AnimatePresence usage prevents layout shifts, stale interactions, and orphaned elements.

### 3.1 AnimatePresence Wrapper Required

Conditional motion elements must be wrapped in AnimatePresence.

**Incorrect (no wrapper):**

```tsx
{isVisible && (
  <motion.div exit={{ opacity: 0 }} />
)}
```

**Correct (wrapped):**

```tsx
<AnimatePresence>
  {isVisible && (
    <motion.div exit={{ opacity: 0 }} />
  )}
</AnimatePresence>
```

### 3.2 Exit Prop Required Inside AnimatePresence

Elements inside AnimatePresence should have exit prop defined.

**Incorrect (missing exit):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
  )}
</AnimatePresence>
```

**Correct (exit defined):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    />
  )}
</AnimatePresence>
```

### 3.3 Unique Keys in AnimatePresence Lists

Dynamic lists inside AnimatePresence must have unique keys.

**Incorrect (index as key):**

```tsx
<AnimatePresence>
  {items.map((item, index) => (
    <motion.div key={index} exit={{ opacity: 0 }} />
  ))}
</AnimatePresence>
```

**Correct (stable unique key):**

```tsx
<AnimatePresence>
  {items.map((item) => (
    <motion.div key={item.id} exit={{ opacity: 0 }} />
  ))}
</AnimatePresence>
```

### 3.4 Exit Mirrors Initial for Symmetry

Exit animation should mirror initial for symmetry.

**Incorrect (asymmetric exit):**

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ scale: 0 }}
/>
```

**Correct (symmetric exit):**

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
/>
```

### 3.5 useIsPresent in Child Component

useIsPresent must be called from child of AnimatePresence, not parent.

**Incorrect (hook in parent):**

```tsx
function Parent() {
  const isPresent = useIsPresent();
  return (
    <AnimatePresence>
      {show && <Child />}
    </AnimatePresence>
  );
}
```

**Correct (hook in child):**

```tsx
function Child() {
  const isPresent = useIsPresent();
  return <motion.div data-exiting={!isPresent} />;
}
```

### 3.6 Call safeToRemove After Async Work

When using usePresence, always call safeToRemove after async work.

**Incorrect (missing safeToRemove):**

```tsx
function AsyncComponent() {
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    if (!isPresent) {
      cleanup();
    }
  }, [isPresent]);
}
```

**Correct (safeToRemove called):**

```tsx
function AsyncComponent() {
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    if (!isPresent) {
      cleanup().then(safeToRemove);
    }
  }, [isPresent, safeToRemove]);
}
```

### 3.7 Disable Interactions on Exiting Elements

Disable interactions on exiting elements using isPresent.

**Incorrect (clickable during exit):**

```tsx
function Card() {
  const isPresent = useIsPresent();
  return <button onClick={handleClick}>Click</button>;
}
```

**Correct (disabled during exit):**

```tsx
function Card() {
  const isPresent = useIsPresent();
  return (
    <button onClick={handleClick} disabled={!isPresent}>
      Click
    </button>
  );
}
```

### 3.8 Mode "wait" Doubles Duration

Mode "wait" nearly doubles animation duration; adjust timing accordingly.

**Incorrect (too slow with wait):**

```tsx
<AnimatePresence mode="wait">
  <motion.div transition={{ duration: 0.3 }} />
</AnimatePresence>
```

**Correct (halved timing):**

```tsx
<AnimatePresence mode="wait">
  <motion.div transition={{ duration: 0.15 }} />
</AnimatePresence>
```

### 3.9 Mode "sync" Causes Layout Conflicts

Mode "sync" causes layout conflicts; position exiting elements absolutely.

**Incorrect (sync with layout competition):**

```tsx
<AnimatePresence mode="sync">
  {items.map(item => (
    <motion.div exit={{ opacity: 0 }}>{item}</motion.div>
  ))}
</AnimatePresence>
```

**Correct (popLayout instead):**

```tsx
<AnimatePresence mode="popLayout">
  {items.map(item => (
    <motion.div exit={{ opacity: 0 }}>{item}</motion.div>
  ))}
</AnimatePresence>
```

### 3.10 popLayout for List Reordering

Use popLayout mode for list reordering animations.

**Incorrect (default mode causes shifts):**

```tsx
<AnimatePresence>
  {items.map(item => <ListItem key={item.id} />)}
</AnimatePresence>
```

**Correct (popLayout prevents shifts):**

```tsx
<AnimatePresence mode="popLayout">
  {items.map(item => <ListItem key={item.id} />)}
</AnimatePresence>
```

### 3.11 Propagate Prop for Nested AnimatePresence

Nested AnimatePresence must use propagate prop for coordinated exits.

**Incorrect (children vanish instantly):**

```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div exit={{ opacity: 0 }}>
      <AnimatePresence>
        {items.map(item => (
          <motion.div key={item.id} exit={{ scale: 0 }} />
        ))}
      </AnimatePresence>
    </motion.div>
  )}
</AnimatePresence>
```

**Correct (propagate on both):**

```tsx
<AnimatePresence propagate>
  {isOpen && (
    <motion.div exit={{ opacity: 0 }}>
      <AnimatePresence propagate>
        {items.map(item => (
          <motion.div key={item.id} exit={{ scale: 0 }} />
        ))}
      </AnimatePresence>
    </motion.div>
  )}
</AnimatePresence>
```

### 3.12 Coordinated Parent-Child Exit Timing

Parent and child exit durations should be coordinated.

**Incorrect (parent too fast):**

```tsx
<motion.div exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
  <motion.div exit={{ scale: 0 }} transition={{ duration: 0.5 }} />
</motion.div>
```

**Correct (coordinated timing):**

```tsx
<motion.div exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
  <motion.div exit={{ scale: 0 }} transition={{ duration: 0.15 }} />
</motion.div>
```

Reference: [Motion AnimatePresence Documentation](https://motion.dev/docs/react-animate-presence)

---

## 4. CSS Pseudo Elements

**Impact:** MEDIUM — Leveraging pseudo-elements and View Transitions to reduce DOM nodes and improve transitions.

### 4.1 Content Property Required for Pseudo-Elements

::before and ::after require content property to render.

**Incorrect (missing content):**

```css
.button::before {
  position: absolute;
  background: var(--gray-3);
}
```

**Correct (content set):**

```css
.button::before {
  content: "";
  position: absolute;
  background: var(--gray-3);
}
```

### 4.2 Pseudo-Elements Over DOM Nodes

Use pseudo-elements for decorative content instead of extra DOM nodes.

**Incorrect (extra DOM node):**

```tsx
<button className={styles.button}>
  <span className={styles.background} />
  Click me
</button>
```

**Correct (pseudo-element):**

```tsx
<button className={styles.button}>
  Click me
</button>
```

```css
.button::before {
  content: "";
  /* decorative background */
}
```

### 4.3 Position Relative Parent for Pseudo-Elements

Parent must have position: relative for absolute pseudo-elements.

**Incorrect (no position on parent):**

```css
.button::before {
  content: "";
  position: absolute;
  inset: 0;
}
/* .button has no position */
```

**Correct (parent positioned):**

```css
.button {
  position: relative;
}

.button::before {
  content: "";
  position: absolute;
  inset: 0;
}
```

### 4.4 Z-Index Layering for Pseudo-Elements

Pseudo-elements need z-index to layer correctly with content.

**Incorrect (covers button text):**

```css
.button::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--gray-3);
}
```

**Correct (layered behind):**

```css
.button {
  position: relative;
  z-index: 1;
}

.button::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--gray-3);
  z-index: -1;
}
```

### 4.5 Hit Target Expansion with Pseudo-Elements

Use negative inset values to expand hit targets without extra markup.

**Incorrect (wrapper for hit target):**

```tsx
<div className={styles.wrapper}>
  <a className={styles.link}>Link</a>
</div>
```

**Correct (pseudo-element expansion):**

```css
.link {
  position: relative;
}

.link::before {
  content: "";
  position: absolute;
  inset: -8px -12px;
}
```

### 4.6 View Transition Name Required

Elements participating in view transitions need view-transition-name.

**Incorrect (no transition name):**

```ts
document.startViewTransition(() => {
  targetImg.src = newSrc;
});
```

**Correct (transition name assigned):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  sourceImg.style.viewTransitionName = "";
  targetImg.style.viewTransitionName = "card";
});
```

### 4.7 Unique View Transition Names

Each view-transition-name must be unique on the page during transition.

**Incorrect (duplicate names):**

```css
.card {
  view-transition-name: card;
}
/* Multiple cards with same name */
```

**Correct (unique per element):**

```ts
element.style.viewTransitionName = `card-${id}`;
```

### 4.8 Clean Up View Transition Names

Remove view-transition-name after transition completes.

**Incorrect (stale name):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  targetImg.style.viewTransitionName = "card";
});
```

**Correct (name cleaned up):**

```ts
sourceImg.style.viewTransitionName = "card";
document.startViewTransition(() => {
  sourceImg.style.viewTransitionName = "";
  targetImg.style.viewTransitionName = "card";
});
```

### 4.9 View Transitions Over JS Libraries

Prefer View Transitions API over JavaScript animation libraries for page transitions.

**Incorrect (JS-based transition):**

```tsx
import { motion } from "motion/react";

function ImageLightbox() {
  return (
    <motion.img layoutId="hero" />
  );
}
```

**Correct (native View Transition):**

```ts
function openLightbox(img: HTMLImageElement) {
  img.style.viewTransitionName = "hero";
  document.startViewTransition(() => {
    // Native browser transition
  });
}
```

### 4.10 Style View Transition Pseudo-Elements

Style view transition pseudo-elements for custom animations.

**Incorrect (default crossfade only):**

```ts
document.startViewTransition(() => { /* ... */ });
```

**Correct (custom animation):**

```css
::view-transition-group(card) {
  animation-duration: 300ms;
  animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
}
```

### 4.11 Use ::backdrop for Dialog Backgrounds

Use ::backdrop pseudo-element for dialog/popover backgrounds.

**Incorrect (extra overlay node):**

```tsx
<>
  <div className={styles.overlay} onClick={close} />
  <dialog className={styles.dialog}>{children}</dialog>
</>
```

**Correct (native ::backdrop):**

```css
dialog::backdrop {
  background: var(--black-a6);
  backdrop-filter: blur(4px);
}
```

### 4.12 Use ::placeholder for Input Styling

Use ::placeholder for input placeholder styling, not wrapper elements.

**Incorrect (custom placeholder node):**

```tsx
<div className={styles.inputWrapper}>
  {!value && <span className={styles.placeholder}>Enter text...</span>}
  <input value={value} />
</div>
```

**Correct (native ::placeholder):**

```css
input::placeholder {
  color: var(--gray-9);
  opacity: 1;
}
```

### 4.13 Use ::selection for Text Styling

Use ::selection for text selection styling.

**Correct:**

```css
::selection {
  background: var(--blue-a5);
  color: var(--gray-12);
}
```

### 4.14 Use ::marker for Custom List Bullets

Use ::marker to style list bullets without extra elements or background-image hacks.

**Incorrect (background image hack):**

```css
li {
  list-style: none;
  background: url("bullet.svg") no-repeat 0 4px;
  padding-left: 20px;
}
```

**Correct (native ::marker):**

```css
li::marker {
  color: var(--gray-8);
  font-size: 0.8em;
}
```

### 4.15 Use ::first-line for Typographic Treatments

Use ::first-line for drop-cap-adjacent styling without JavaScript or hardcoded spans.

**Incorrect (manual span):**

```tsx
<p>
  <span className={styles["first-line"]}>The opening line</span>
  is styled differently from the rest.
</p>
```

**Correct (native ::first-line):**

```css
.article p:first-of-type::first-line {
  font-variant-caps: small-caps;
  font-weight: var(--font-weight-medium);
}
```

Reference: [MDN Pseudo-elements Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/Pseudo-elements), [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)

---

## 5. Audio Feedback

**Impact:** MEDIUM — When and how to use sound in UI, covering accessibility, appropriateness, and implementation.

### 5.1 Visual Equivalent for Every Sound

Every audio cue must have a visual equivalent; sound never replaces visual feedback.

**Incorrect (sound without visual):**

```tsx
function SubmitButton({ onClick }) {
  const handleClick = () => {
    playSound("success");
    onClick();
  };
}
```

**Correct (sound with visual):**

```tsx
function SubmitButton({ onClick }) {
  const [status, setStatus] = useState("idle");

  const handleClick = () => {
    playSound("success");
    setStatus("success");
    onClick();
  };

  return <button data-status={status}>Submit</button>;
}
```

### 5.2 Toggle Setting to Disable Sounds

Provide explicit toggle to disable sounds in settings.

**Incorrect (no way to disable):**

```tsx
function App() {
  return <SoundProvider>{children}</SoundProvider>;
}
```

**Correct (toggle available):**

```tsx
function App() {
  const { soundEnabled } = usePreferences();
  return (
    <SoundProvider enabled={soundEnabled}>
      {children}
    </SoundProvider>
  );
}
```

### 5.3 Respect prefers-reduced-motion for Sound

Respect prefers-reduced-motion as proxy for sound sensitivity.

**Incorrect (ignores preference):**

```tsx
function playSound(name: string) {
  audio.play();
}
```

**Correct (checks preference):**

```tsx
function playSound(name: string) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) return;
  audio.play();
}
```

### 5.4 Independent Volume Control

Allow volume adjustment independent of system volume.

**Incorrect (always full volume):**

```tsx
function playSound() {
  audio.volume = 1;
  audio.play();
}
```

**Correct (user-controlled volume):**

```tsx
function playSound() {
  const { volume } = usePreferences();
  audio.volume = volume;
  audio.play();
}
```

### 5.5 No Sound on High-Frequency Interactions

Do not add sound to high-frequency interactions (typing, keyboard navigation).

**Incorrect (sound on every keystroke):**

```tsx
function Input({ onChange }) {
  const handleChange = (e) => {
    playSound("keystroke");
    onChange(e);
  };
}
```

**Correct (no sound on typing):**

```tsx
function Input({ onChange }) {
  return <input onChange={onChange} />;
}
```

### 5.6 Sound for Confirmations

Sound is appropriate for confirmations: payments, uploads, form submissions.

**Correct:**

```tsx
async function handlePayment() {
  await processPayment();
  playSound("success");
  showConfirmation();
}
```

### 5.7 Sound for Errors and Warnings

Sound is appropriate for errors and warnings that can't be overlooked.

**Correct:**

```tsx
function handleError(error: Error) {
  playSound("error");
  showErrorToast(error.message);
}
```

### 5.8 No Decorative Sound

Do not add sound to decorative moments with no informational value.

**Incorrect (hover sound):**

```tsx
function Card({ onHover }) {
  return (
    <div onMouseEnter={() => playSound("hover")}>
      {children}
    </div>
  );
}
```

### 5.9 Informative Not Punishing Sound

Sound should inform, not punish; avoid harsh sounds for user mistakes.

**Incorrect (harsh buzzer):**

```tsx
function ValidationError() {
  playSound("loud-buzzer");
  return <span>Invalid input</span>;
}
```

**Correct (gentle alert):**

```tsx
function ValidationError() {
  playSound("gentle-alert");
  return <span>Invalid input</span>;
}
```

### 5.10 Preload Audio Files

Preload audio files to avoid playback delay.

**Incorrect (loads on demand):**

```tsx
function playSound(name: string) {
  const audio = new Audio(`/sounds/${name}.mp3`);
  audio.play();
}
```

**Correct (preloaded):**

```tsx
const sounds = {
  success: new Audio("/sounds/success.mp3"),
  error: new Audio("/sounds/error.mp3"),
};

Object.values(sounds).forEach(audio => audio.load());

function playSound(name: keyof typeof sounds) {
  sounds[name].currentTime = 0;
  sounds[name].play();
}
```

### 5.11 Subtle Default Volume

Default volume should be subtle, not loud.

**Incorrect (too loud):**

```tsx
const DEFAULT_VOLUME = 1.0;
```

**Correct (subtle):**

```tsx
const DEFAULT_VOLUME = 0.3;
```

### 5.12 Reset currentTime Before Replay

Reset audio currentTime before replay to allow rapid triggering.

**Incorrect (won't replay if playing):**

```tsx
function playSound() {
  audio.play();
}
```

**Correct (reset before play):**

```tsx
function playSound() {
  audio.currentTime = 0;
  audio.play();
}
```

### 5.13 Match Sound Weight to Action

Sound weight should match action importance.

**Incorrect (fanfare for toggle):**

```tsx
function handleToggle() {
  playSound("triumphant-fanfare");
  setEnabled(!enabled);
}
```

**Correct (weight matches action):**

```tsx
function handleToggle() {
  playSound("soft-click");
  setEnabled(!enabled);
}

function handlePurchase() {
  playSound("success-chime");
  completePurchase();
}
```

### 5.14 Sound Duration Matches Action Duration

Sound duration should match action duration.

**Incorrect (long sound for instant action):**

```tsx
function handleClick() {
  playSound("long-whoosh"); // 2000ms
}
```

**Correct (matched duration):**

```tsx
function handleClick() {
  playSound("click"); // 50ms
}

function handleUpload() {
  playSound("upload-progress"); // Matches upload duration
}
```

**Sound appropriateness matrix:**

| Interaction | Sound? | Reason |
|-------------|--------|--------|
| Payment success | Yes | Significant confirmation |
| Form submission | Yes | User needs assurance |
| Error state | Yes | Can't be overlooked |
| Notification | Yes | May not be looking at screen |
| Button click | Maybe | Only for significant buttons |
| Typing | No | Too frequent |
| Hover | No | Decorative only |
| Scroll | No | Too frequent |
| Navigation | No | Keyboard nav would be noisy |

Reference: [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

---

## 6. Sound Synthesis

**Impact:** MEDIUM — Web Audio API best practices for procedural sound generation.

### 6.1 Reuse Single AudioContext

Reuse a single AudioContext instance; do not create new ones per sound.

**Incorrect (new context per call):**

```ts
function playSound() {
  const ctx = new AudioContext();
}
```

**Correct (singleton):**

```ts
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}
```

### 6.2 Resume Suspended AudioContext

Check and resume suspended AudioContext before playing.

**Incorrect (plays without checking):**

```ts
function playSound() {
  const ctx = getAudioContext();
}
```

**Correct (resumes if suspended):**

```ts
function playSound() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}
```

### 6.3 Clean Up Audio Nodes After Playback

Disconnect and clean up audio nodes after playback.

**Incorrect (nodes remain connected):**

```ts
source.start();
```

**Correct (cleaned up on end):**

```ts
source.start();
source.onended = () => {
  source.disconnect();
  gain.disconnect();
};
```

### 6.4 Exponential Decay for Natural Sound

Use exponential ramps for natural decay, not linear.

**Incorrect (linear ramp):**

```ts
gain.gain.linearRampToValueAtTime(0, t + 0.05);
```

**Correct (exponential ramp):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

### 6.5 No Zero Target for Exponential Ramps

Exponential ramps cannot target 0; use 0.001 or similar small value.

**Incorrect (targets zero):**

```ts
gain.gain.exponentialRampToValueAtTime(0, t + 0.05);
```

**Correct (targets near-zero):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

### 6.6 Set Initial Value Before Ramp

Set initial value before ramping to avoid glitches.

**Incorrect (no initial value):**

```ts
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

**Correct (initial value set):**

```ts
gain.gain.setValueAtTime(0.3, t);
gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
```

### 6.7 Noise for Percussive Sounds

Use filtered noise for clicks/taps, not oscillators.

**Incorrect (oscillator for click):**

```ts
const osc = ctx.createOscillator();
osc.type = "sine";
```

**Correct (noise burst for click):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.008, ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) {
  data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 50);
}
```

### 6.8 Oscillators for Tonal Sounds

Use oscillators with pitch movement for tonal sounds (pops, confirmations).

**Incorrect (static frequency):**

```ts
osc.frequency.value = 400;
```

**Correct (pitch sweep):**

```ts
osc.frequency.setValueAtTime(400, t);
osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
```

### 6.9 Bandpass Filter for Sound Character

Apply bandpass filter to shape percussive sounds.

**Incorrect (raw noise):**

```ts
source.connect(gain).connect(ctx.destination);
```

**Correct (filtered noise):**

```ts
const filter = ctx.createBiquadFilter();
filter.type = "bandpass";
filter.frequency.value = 4000;
filter.Q.value = 3;
source.connect(filter).connect(gain).connect(ctx.destination);
```

### 6.10 Click Duration 5-15ms

Click/tap sounds should be 5-15ms duration.

**Incorrect (too long):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
```

**Correct (appropriate duration):**

```ts
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.008, ctx.sampleRate);
```

### 6.11 Click Filter 3000-6000Hz

Bandpass filter for clicks should be 3000-6000Hz.

**Incorrect (too low):**

```ts
filter.frequency.value = 500;
```

**Correct (crisp range):**

```ts
filter.frequency.value = 4000;
```

### 6.12 Gain Under 1.0

Gain values should not exceed 1.0 to prevent clipping.

**Incorrect (clipping):**

```ts
gain.gain.setValueAtTime(1.5, t);
```

**Correct (safe gain):**

```ts
gain.gain.setValueAtTime(0.3, t);
```

### 6.13 Filter Q Value 2-5

Filter Q for clicks should be 2-5 for focused but not harsh sound.

**Incorrect (too resonant):**

```ts
filter.Q.value = 15;
```

**Correct (balanced Q):**

```ts
filter.Q.value = 3;
```

**Parameter translation table:**

| User Says | Parameter Change |
|-----------|------------------|
| "too harsh" | Lower filter frequency, reduce Q |
| "too muffled" | Higher filter frequency |
| "too long" | Shorter duration, faster decay |
| "cuts off abruptly" | Use exponential decay |
| "more mechanical" | Higher Q, faster decay |
| "softer" | Lower gain, triangle wave |

Reference: [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

## 7. Morphing Icons

**Impact:** LOW — Building icon components that morph between any two icons through SVG line transformation.

**Core concept:** Every icon is composed of exactly three SVG lines. Icons that need fewer lines collapse the extras to invisible center points. This constraint enables seamless morphing between any two icons.

**Architecture:**

```ts
interface IconLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity?: number;
}

interface IconDefinition {
  lines: [IconLine, IconLine, IconLine];
  rotation?: number;
  group?: string;
}

const CENTER = 7;
const collapsed: IconLine = {
  x1: CENTER, y1: CENTER, x2: CENTER, y2: CENTER, opacity: 0,
};
```

### 7.1 Icons Must Use Exactly Three Lines

Every icon MUST use exactly 3 lines. No more, no fewer.

**Incorrect (only 2 lines):**

```ts
const checkIcon = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
  ],
};
```

**Correct (3 lines with collapsed):**

```ts
const checkIcon = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
    collapsed,
  ],
};
```

### 7.2 Use Collapsed Constant for Unused Lines

Unused lines must use the collapsed constant, not omission or null.

**Incorrect (null for unused):**

```ts
const minusIcon = {
  lines: [
    { x1: 2, y1: 7, x2: 12, y2: 7 },
    null,
    null,
  ],
};
```

**Correct (collapsed constant):**

```ts
const minusIcon = {
  lines: [
    { x1: 2, y1: 7, x2: 12, y2: 7 },
    collapsed,
    collapsed,
  ],
};
```

### 7.3 Consistent ViewBox Size

All icons must use the same viewBox (14x14 recommended).

**Incorrect (mixed scales):**

```ts
const icon1 = { lines: [{ x1: 2, y1: 7, x2: 12, y2: 7 }, ...] }; // 14x14
const icon2 = { lines: [{ x1: 4, y1: 14, x2: 24, y2: 14 }, ...] }; // 28x28
```

**Correct (consistent scale):**

```ts
const VIEWBOX_SIZE = 14;
const CENTER = 7;
```

### 7.4 Shared Group for Rotational Variants

Icons that are rotational variants MUST share the same group and base lines.

**Incorrect (different line definitions):**

```ts
const arrowRight = { lines: [{ x1: 2, y1: 7, x2: 12, y2: 7 }, ...] };
const arrowDown = { lines: [{ x1: 7, y1: 2, x2: 7, y2: 12 }, ...] };
```

**Correct (shared base lines):**

```ts
const arrowLines: [IconLine, IconLine, IconLine] = [
  { x1: 2, y1: 7, x2: 12, y2: 7 },
  { x1: 7.5, y1: 2.5, x2: 12, y2: 7 },
  { x1: 7.5, y1: 11.5, x2: 12, y2: 7 },
];

const icons = {
  "arrow-right": { lines: arrowLines, rotation: 0, group: "arrow" },
  "arrow-down": { lines: arrowLines, rotation: 90, group: "arrow" },
  "arrow-left": { lines: arrowLines, rotation: 180, group: "arrow" },
  "arrow-up": { lines: arrowLines, rotation: -90, group: "arrow" },
};
```

### 7.5 Spring Physics for Rotation

Rotation between grouped icons should use spring physics for natural motion.

**Incorrect (duration-based rotation):**

```tsx
<motion.g animate={{ rotate: rotation }} transition={{ duration: 0.3 }} />
```

**Correct (spring rotation):**

```tsx
const rotation = useSpring(definition.rotation ?? 0, activeTransition);

<motion.g style={{ rotate: rotation, transformOrigin: "center" }} />
```

### 7.6 Reduced Motion Support for Icons

Respect prefers-reduced-motion by disabling animations.

**Incorrect (always animates):**

```tsx
function MorphingIcon({ icon }: Props) {
  return <motion.line animate={...} transition={{ duration: 0.4 }} />;
}
```

**Correct (respects preference):**

```tsx
function MorphingIcon({ icon }: Props) {
  const reducedMotion = useReducedMotion() ?? false;
  const activeTransition = reducedMotion ? { duration: 0 } : transition;

  return <motion.line animate={...} transition={activeTransition} />;
}
```

### 7.7 Instant Jump for Non-Grouped Icons

When transitioning between icons NOT in the same group, rotation should jump instantly.

**Incorrect (always animates rotation):**

```tsx
useEffect(() => {
  rotation.set(definition.rotation ?? 0);
}, [definition]);
```

**Correct (jumps when not grouped):**

```tsx
useEffect(() => {
  if (shouldRotate) {
    rotation.set(definition.rotation ?? 0);
  } else {
    rotation.jump(definition.rotation ?? 0);
  }
}, [definition, shouldRotate]);
```

### 7.8 Round Stroke Line Caps

Lines should use strokeLinecap="round" for polished endpoints.

**Incorrect (butt caps):**

```tsx
<motion.line strokeLinecap="butt" />
```

**Correct (round caps):**

```tsx
<motion.line strokeLinecap="round" />
```

### 7.9 Aria Hidden on Icon SVGs

Icon SVGs should be aria-hidden since they're decorative.

**Incorrect (no aria attribute):**

```tsx
<svg width={size} height={size}>...</svg>
```

**Correct (aria-hidden):**

```tsx
<svg width={size} height={size} aria-hidden="true">...</svg>
```

**Common icon patterns:**

```ts
// Two-line icons (check, minus, chevron) — one collapsed line
const check = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
    collapsed,
  ],
};

// Three-line icons (menu, asterisk) — all lines used
const menu = {
  lines: [
    { x1: 2, y1: 3.5, x2: 12, y2: 3.5 },
    { x1: 2, y1: 7, x2: 12, y2: 7 },
    { x1: 2, y1: 10.5, x2: 12, y2: 10.5 },
  ],
};

// Point icons (more, grip) — zero-length lines as dots
const more = {
  lines: [
    { x1: 3, y1: 7, x2: 3, y2: 7 },
    { x1: 7, y1: 7, x2: 7, y2: 7 },
    { x1: 11, y1: 7, x2: 11, y2: 7 },
  ],
};
```

**Recommended transition:**

```ts
const defaultTransition: Transition = {
  ease: [0.19, 1, 0.22, 1],
  duration: 0.4,
};
```

Reference: [Motion useSpring](https://motion.dev/docs/react-use-spring), [SVG Line Element](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/line)

---

## 8. Container Animation

**Impact:** MEDIUM — Animating container width and height using a measure-and-animate pattern with ResizeObserver and Motion.

### 8.1 Two-Div Pattern for Animated Bounds

Use an outer animated div and an inner measured div. Never measure and animate the same element — it creates a feedback loop.

**Incorrect (measure and animate same element):**

```tsx
function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div ref={ref} animate={{ height: bounds.height }}>
      {children}
    </motion.div>
  );
}
```

**Correct (separate measure and animate targets):**

```tsx
function AnimatedContainer({ children }) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div animate={{ height: bounds.height }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}
```

### 8.2 Guard Against Zero on Initial Render

On initial render, measured bounds are 0. Guard against this to prevent animating from 0 to actual size.

**Incorrect (animates from 0 on mount):**

```tsx
<motion.div animate={{ width: bounds.width }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

**Correct (falls back to auto on first frame):**

```tsx
<motion.div animate={{ width: bounds.width > 0 ? bounds.width : "auto" }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

### 8.3 Use ResizeObserver for Measurement

Use ResizeObserver to track element dimensions. It fires on resize without causing layout thrashing.

**Incorrect (measuring on every render):**

```tsx
function useMeasure(ref) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setBounds({ width: rect.width, height: rect.height });
    }
  });
  return bounds;
}
```

**Correct (ResizeObserver):**

```tsx
function useMeasure() {
  const [element, setElement] = useState(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const ref = useCallback((node) => setElement(node), []);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, bounds];
}
```

### 8.4 Overflow Hidden on Animated Container

Set overflow: hidden on the animated outer container to clip content during size transitions.

**Incorrect (content overflows during animation):**

```tsx
<motion.div animate={{ height: bounds.height }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

**Correct (clipped during transition):**

```tsx
<motion.div animate={{ height: bounds.height }} style={{ overflow: "hidden" }}>
  <div ref={ref}>{children}</div>
</motion.div>
```

### 8.5 Use Animated Bounds Sparingly

Animated bounds is a subtle effect. Reserve it for interactive elements where size changes are meaningful.

**Good use cases:** loading state buttons, expandable sections, accordions, FAQs, content reveals.

**Bad use cases:** every container on the page, static layouts, elements that don't change size.

### 8.6 Use Callback Ref for Measurement

Use a callback ref (not useRef) for measurement hooks so the observer attaches when the DOM node is ready.

**Incorrect (useRef may be null on first effect):**

```tsx
const ref = useRef(null);
useEffect(() => {
  if (!ref.current) return;
  observer.observe(ref.current);
}, []);
```

**Correct (callback ref guarantees node):**

```tsx
const [element, setElement] = useState(null);
const ref = useCallback((node) => setElement(node), []);
useEffect(() => {
  if (!element) return;
  observer.observe(element);
  return () => observer.disconnect();
}, [element]);
```

### 8.7 Add Delay for Natural Container Transitions

Add a small delay so the transition feels like it's catching up to the content.

**Correct:**

```tsx
<motion.div
  animate={{ height: bounds.height }}
  transition={{ duration: 0.2, delay: 0.05 }}
  style={{ overflow: "hidden" }}
>
  <div ref={ref}>{children}</div>
</motion.div>
```

Reference: [ResizeObserver - MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver), [Motion Documentation](https://motion.dev)

---

## 9. Laws of UX

**Impact:** HIGH — Psychological principles behind interfaces that feel right. Violating these creates friction users can't articulate.

### 9.1 Size Interactive Targets for Easy Clicking

The bigger something is, the easier it is to click (Fitts's Law). Make interactive elements at least 32px.

**Incorrect (tiny click target):**

```css
.icon-button {
  width: 16px;
  height: 16px;
  padding: 0;
}
```

**Correct (comfortable target):**

```css
.icon-button {
  width: 32px;
  height: 32px;
  padding: 8px;
}
```

### 9.2 Expand Hit Areas with Invisible Padding

Use pseudo-elements or invisible padding to expand clickable areas beyond visible bounds.

**Incorrect (visible size equals hit area):**

```css
.link {
  font-size: 14px;
}
```

**Correct (expanded invisible hit area):**

```css
.link {
  position: relative;
}

.link::before {
  content: "";
  position: absolute;
  inset: -8px -12px;
}
```

### 9.3 Minimize Choices to Reduce Decision Time

Decision time increases logarithmically with the number of choices (Hick's Law). Use progressive disclosure.

**Incorrect (all options at once):**

```tsx
function Settings() {
  return (
    <div>
      {allSettings.map(setting => (
        <SettingRow key={setting.id} {...setting} />
      ))}
    </div>
  );
}
```

**Correct (progressive disclosure):**

```tsx
function Settings() {
  return (
    <div>
      {commonSettings.map(setting => (
        <SettingRow key={setting.id} {...setting} />
      ))}
      <details>
        <summary>Advanced</summary>
        {advancedSettings.map(setting => (
          <SettingRow key={setting.id} {...setting} />
        ))}
      </details>
    </div>
  );
}
```

### 9.4 Chunk Data into Groups of 5-9

Working memory holds about 7 items (Miller's Law). Group and chunk large data sets for scannability.

**Incorrect (raw unformatted data):**

```tsx
<span>4532015112830366</span>
```

**Correct (chunked for readability):**

```tsx
<span>4532 0151 1283 0366</span>
```

### 9.5 Respond Within 400ms

Interactions must respond within 400ms to feel instant (Doherty Threshold). Above this, users notice delay.

**Incorrect (no feedback during loading):**

```tsx
async function handleClick() {
  const data = await fetchData();
  setResult(data);
}
```

**Correct (immediate optimistic feedback):**

```tsx
async function handleClick() {
  setResult(optimisticData);
  const data = await fetchData();
  setResult(data);
}
```

### 9.6 Fake Speed When Actual Speed Isn't Possible

If you can't make something fast, make it feel fast with optimistic UI, skeletons, or progress indicators.

**Incorrect (blank screen during load):**

```tsx
function Page() {
  const { data, isLoading } = useFetch("/api/data");
  if (isLoading) return null;
  return <Content data={data} />;
}
```

**Correct (skeleton during load):**

```tsx
function Page() {
  const { data, isLoading } = useFetch("/api/data");
  if (isLoading) return <Skeleton />;
  return <Content data={data} />;
}
```

### 9.7 Accept Messy Input, Output Clean Data

Inputs should accept messy human data and normalize it (Postel's Law). Validate generously, format strictly.

**Incorrect (rigid format required):**

```tsx
function DateInput({ onChange }) {
  return (
    <input
      type="text"
      placeholder="YYYY-MM-DD"
      pattern="\d{4}-\d{2}-\d{2}"
      onChange={onChange}
    />
  );
}
```

**Correct (accepts multiple formats):**

```tsx
function DateInput({ onChange }) {
  function handleChange(e) {
    const parsed = parseFlexibleDate(e.target.value);
    if (parsed) onChange(parsed);
  }

  return (
    <input
      type="text"
      placeholder="Any date format"
      onChange={handleChange}
    />
  );
}
```

### 9.8 Show What Matters Now, Reveal Complexity Later

Don't overwhelm users with everything at once. Reveal complexity incrementally as needed.

**Incorrect (all controls visible):**

```tsx
function Editor() {
  return (
    <div>
      <BasicTools />
      <AdvancedTools />
      <ExpertTools />
      <DebugTools />
    </div>
  );
}
```

**Correct (progressive disclosure):**

```tsx
function Editor() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div>
      <BasicTools />
      {showAdvanced && <AdvancedTools />}
      <button onClick={() => setShowAdvanced(!showAdvanced)}>
        Toggle
      </button>
    </div>
  );
}
```

### 9.9 Use Familiar UI Patterns

Users spend most of their time on other sites. They expect yours to work the same way (Jakob's Law).

**Incorrect (custom unconventional navigation):**

```tsx
function Nav() {
  return (
    <nav>
      <button onClick={() => navigate("/")}>⬡</button>
      <button onClick={() => navigate("/search")}>⬢</button>
    </nav>
  );
}
```

**Correct (standard recognizable patterns):**

```tsx
function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/search">Search</Link>
    </nav>
  );
}
```

### 9.10 Visual Polish Increases Perceived Usability

Users perceive aesthetically pleasing design as more usable. Small visual details compound into trust.

**Incorrect (unstyled, raw elements):**

```css
.card {
  border: 1px solid black;
  padding: 10px;
}
```

**Correct (considered visual treatment):**

```css
.card {
  padding: 16px;
  background: var(--gray-2);
  border: 1px solid var(--gray-a4);
  border-radius: 12px;
  box-shadow: var(--shadow-1);
}
```

### 9.11 Group Related Elements Spatially

Elements near each other are perceived as related (Law of Proximity). Use spacing to create visual groups.

**Incorrect (uniform spacing between unrelated items):**

```css
.form label,
.form input,
.form .hint,
.form .divider {
  margin-bottom: 16px;
}
```

**Correct (tighter spacing within groups, larger between):**

```css
.form label {
  margin-bottom: 4px;
}

.form input {
  margin-bottom: 2px;
}

.form .hint {
  margin-bottom: 24px;
}
```

### 9.12 Similar Elements Should Look Alike

Elements that function the same should look the same (Law of Similarity). Visual consistency signals functional consistency.

**Incorrect (same function, different appearance):**

```css
.save-button {
  background: blue;
  border-radius: 8px;
}

.submit-button {
  background: green;
  border-radius: 0;
}
```

**Correct (same function, same appearance):**

```css
.primary-action {
  background: var(--gray-12);
  color: var(--gray-1);
  border-radius: 8px;
}
```

### 9.13 Use Boundaries to Group Related Content

Elements sharing a clearly defined boundary are perceived as a group (Law of Common Region).

**Incorrect (flat list with no visual grouping):**

```tsx
function Settings() {
  return (
    <div>
      <Toggle label="Dark mode" />
      <Toggle label="Notifications" />
      <Input label="Email" />
      <Input label="Password" />
    </div>
  );
}
```

**Correct (bounded sections):**

```tsx
function Settings() {
  return (
    <div>
      <section className={styles.group}>
        <h3>Appearance</h3>
        <Toggle label="Dark mode" />
      </section>
      <section className={styles.group}>
        <h3>Account</h3>
        <Input label="Email" />
        <Input label="Password" />
      </section>
    </div>
  );
}
```

### 9.14 Make Important Elements Visually Distinct

When multiple similar elements are present, the one that differs is most likely to be remembered (Von Restorff Effect).

**Incorrect (primary action blends in):**

```tsx
<div className={styles.actions}>
  <button className={styles.button}>Cancel</button>
  <button className={styles.button}>Delete Account</button>
</div>
```

**Correct (destructive action stands out):**

```tsx
<div className={styles.actions}>
  <button className={styles["button-secondary"]}>Cancel</button>
  <button className={styles["button-danger"]}>Delete Account</button>
</div>
```

### 9.15 Place Key Items First or Last

Users best remember the first and last items in a sequence (Serial Position Effect).

**Incorrect (important action buried in middle):**

```tsx
<nav>
  <Link href="/settings">Settings</Link>
  <Link href="/">Home</Link>
  <Link href="/about">About</Link>
</nav>
```

**Correct (key items at edges):**

```tsx
<nav>
  <Link href="/">Home</Link>
  <Link href="/about">About</Link>
  <Link href="/settings">Settings</Link>
</nav>
```

### 9.16 End Experiences with Clear Success States

People judge experiences by their peak moment and their end (Peak-End Rule). Invest in completion states.

**Incorrect (abrupt end after action):**

```tsx
async function handleSubmit() {
  await submitForm(data);
  router.push("/");
}
```

**Correct (satisfying completion state):**

```tsx
async function handleSubmit() {
  await submitForm(data);
  setStatus("success");
}

return status === "success" ? (
  <SuccessScreen message="You're all set." />
) : (
  <Form onSubmit={handleSubmit} />
);
```

### 9.17 Move Complexity to the System

Every system has irreducible complexity (Tesler's Law). The question is who handles it — the user or the system.

**Incorrect (complexity pushed to user):**

```tsx
<input
  type="text"
  placeholder="Enter date as YYYY-MM-DDTHH:mm:ss.sssZ"
/>
```

**Correct (system absorbs complexity):**

```tsx
<DatePicker
  onChange={(date) => setDate(date.toISOString())}
/>
```

### 9.18 Show Progress Toward Completion

People accelerate behavior as they approach a goal (Goal-Gradient Effect). Show how close they are.

**Incorrect (no sense of progress):**

```tsx
function Onboarding({ step }) {
  return <OnboardingStep step={step} />;
}
```

**Correct (progress visible):**

```tsx
function Onboarding({ step, totalSteps }) {
  return (
    <div>
      <ProgressBar value={step} max={totalSteps} />
      <span>Step {step} of {totalSteps}</span>
      <OnboardingStep step={step} />
    </div>
  );
}
```

### 9.19 Show Incomplete State to Drive Completion

People remember incomplete tasks better than completed ones (Zeigarnik Effect).

**Incorrect (no indication of incomplete profile):**

```tsx
function Dashboard() {
  return <DashboardContent />;
}
```

**Correct (incomplete state visible):**

```tsx
function Dashboard({ profile }) {
  return (
    <div>
      {!profile.isComplete && (
        <Banner>
          Complete your profile — {profile.completionPercent}% done
        </Banner>
      )}
      <DashboardContent />
    </div>
  );
}
```

### 9.20 Simplify Complex Visuals into Clear Forms

People interpret complex visuals as the simplest form possible (Law of Pragnanz). Reduce visual noise.

**Incorrect (visually noisy layout):**

```css
.card {
  border: 2px dashed red;
  background: linear-gradient(45deg, #f0f, #0ff);
  box-shadow: 5px 5px 0 black, 10px 10px 0 gray;
  outline: 3px dotted blue;
}
```

**Correct (clear, simple form):**

```css
.card {
  background: var(--gray-2);
  border: 1px solid var(--gray-a4);
  border-radius: 12px;
  box-shadow: var(--shadow-1);
}
```

### 9.21 Prioritize the Critical 20% of Features

80% of users use 20% of features (Pareto Principle). Optimize the critical path first.

**Incorrect (all features equally prominent):**

```tsx
function Toolbar() {
  return (
    <div>
      {allFeatures.map(f => <Button key={f.id}>{f.label}</Button>)}
    </div>
  );
}
```

**Correct (critical features prominent, rest accessible):**

```tsx
function Toolbar() {
  return (
    <div>
      {criticalFeatures.map(f => <Button key={f.id}>{f.label}</Button>)}
      <MoreMenu features={secondaryFeatures} />
    </div>
  );
}
```

### 9.22 Minimize Extraneous Cognitive Load

Remove anything that doesn't help the user complete their task. Decoration, redundant labels, and unnecessary options all add load.

**Incorrect (extraneous elements):**

```tsx
function DeleteDialog() {
  return (
    <dialog>
      <Icon name="warning" size={64} />
      <h2>Warning!</h2>
      <p>Are you absolutely sure you want to delete?</p>
      <p>This action is permanent and cannot be undone.</p>
      <p>All associated data will be lost forever.</p>
      <div>
        <button>Cancel</button>
        <button>Delete</button>
        <button>Learn More</button>
      </div>
    </dialog>
  );
}
```

**Correct (essential information only):**

```tsx
function DeleteDialog() {
  return (
    <dialog>
      <h2>Delete this item?</h2>
      <p>This can't be undone.</p>
      <div>
        <button>Cancel</button>
        <button>Delete</button>
      </div>
    </dialog>
  );
}
```

### 9.23 Visually Connect Related Elements

Elements that are visually connected (by lines, color, or frames) are perceived as more related (Law of Uniform Connectedness).

**Incorrect (steps with no visual connection):**

```tsx
function Steps({ current }) {
  return (
    <div>
      <span>Step 1</span>
      <span>Step 2</span>
      <span>Step 3</span>
    </div>
  );
}
```

**Correct (connected with a visual line):**

```tsx
function Steps({ current }) {
  return (
    <div className={styles.steps}>
      {steps.map((step, i) => (
        <div key={step.id} className={styles.step} data-active={i <= current}>
          <div className={styles.dot} />
          {i < steps.length - 1 && <div className={styles.connector} />}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
```

Reference: [Laws of UX](https://lawsofux.com/) by Jon Yablonski

---

## 10. Predictive Prefetching

**Impact:** MEDIUM — Loading content before the user clicks by analyzing cursor trajectory, reducing perceived latency by 100-200ms.

### 10.1 Trajectory Prediction Over Hover Prefetching

Hover prefetching starts too late. Trajectory prediction fires while the cursor is still in motion, reclaiming 100-200ms.

**Incorrect (waits for hover):**

```tsx
<Link
  href="/about"
  onMouseEnter={() => router.prefetch("/about")}
>
  About
</Link>
```

**Correct (trajectory-based):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch("/about"),
  hitSlop: 20,
  name: "about-link",
});

<Link ref={elementRef} href="/about">About</Link>
```

### 10.2 Prefetch by Intent, Not Viewport

Don't prefetch everything visible in the viewport. Prefetch based on user intent to avoid wasted bandwidth.

**Incorrect (prefetch all visible links):**

```tsx
<Link href="/page" prefetch={true}>Page</Link>
```

**Correct (intent-based prefetching):**

```tsx
<Link href="/page" prefetch={false}>Page</Link>
```

### 10.3 Use hitSlop to Trigger Predictions Earlier

Expand the invisible prediction area around elements with hitSlop to start loading sooner.

**Incorrect (tight prediction area):**

```tsx
const { elementRef } = useForesight({
  callback: () => prefetch(),
  hitSlop: 0,
});
```

**Correct (expanded prediction area):**

```tsx
const { elementRef } = useForesight({
  callback: () => prefetch(),
  hitSlop: 20,
});
```

### 10.4 Fall Back Gracefully on Touch Devices

Touch devices have no cursor. Fall back to viewport or touch-start strategies automatically.

**Incorrect (assumes cursor exists):**

```tsx
function PrefetchLink({ href, children }) {
  return (
    <Link
      href={href}
      onMouseMove={() => prefetch(href)}
    >
      {children}
    </Link>
  );
}
```

**Correct (device-aware strategy):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch(href),
  hitSlop: 20,
});
```

### 10.5 Prefetch on Keyboard Navigation

Monitor focus changes and prefetch when the user is a few tab stops away from a registered element.

**Correct (tab-aware prefetching):**

```tsx
const { elementRef } = useForesight({
  callback: () => router.prefetch("/settings"),
  name: "settings-link",
});
```

### 10.6 Use Predictive Prefetching Selectively

Predictive prefetching doesn't belong in every project. Use it where navigation latency is noticeable.

**Good use cases:** data-heavy dashboards, multi-page apps with slow API responses, e-commerce product pages.

**Bad use cases:** static sites with instant navigation, single-page apps with all data preloaded.

Reference: [ForesightJS](https://foresightjs.com), [Next.js Prefetching Docs](https://nextjs.org/docs/app/guides/prefetching)

---

## 11. Typography

**Impact:** MEDIUM — CSS font and text properties most developers overlook. The difference between typographically considered and not.

### 11.1 Tabular Numbers for Data Display

Use tabular-nums for any numeric data that should align in columns.

**Incorrect (proportional numbers misalign):**

```css
.price { font-variant-numeric: proportional-nums; }
```

**Correct (tabular numbers align):**

```css
.price { font-variant-numeric: tabular-nums; }
```

### 11.2 Oldstyle Numbers for Body Text

Use oldstyle-nums in body text so numbers blend with lowercase letters. Use lining-nums in tables and headings.

**Correct (prose):**

```css
.body-text { font-variant-numeric: oldstyle-nums; }
```

**Correct (data):**

```css
.data-table { font-variant-numeric: lining-nums tabular-nums; }
```

### 11.3 Slashed Zero for Disambiguation

Enable slashed zero in code-adjacent UIs so users never confuse 0 with O.

**Correct:**

```css
.code { font-variant-numeric: slashed-zero; }
```

### 11.4 Enable Contextual Alternates

Keep contextual alternates (calt) enabled. They adjust punctuation and glyph shapes based on surrounding characters.

**Correct (usually on by default — don't disable):**

```css
body { font-feature-settings: "calt" 1; }
```

### 11.5 Use Disambiguation Stylistic Set for UI

Enable ss02 (or your font's disambiguation set) in code-facing UIs to distinguish I, l, 1 and 0, O.

**Correct:**

```css
.code-ui { font-feature-settings: "ss02"; }
```

### 11.6 Keep Optical Sizing Auto

Leave font-optical-sizing at auto. The font adjusts glyph shapes for the current size — thicker strokes at small sizes, finer details at large sizes.

**Incorrect (forced off):**

```css
body { font-optical-sizing: none; }
```

**Correct (automatic adjustment):**

```css
body { font-optical-sizing: auto; }
```

### 11.7 Use Antialiased Font Smoothing

Set -webkit-font-smoothing: antialiased on retina displays. Default subpixel rendering looks thicker and fuzzier.

**Correct:**

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 11.8 Balance Headings with text-wrap

Use text-wrap: balance on headings to make lines roughly equal length instead of one long line and a short orphan.

**Incorrect (unbalanced heading):**

```css
h1 { /* default text-wrap */ }
```

**Correct (balanced):**

```css
h1 { text-wrap: balance; }
```

### 11.9 Offset Underlines from Descenders

Use text-underline-offset to push underlines below descenders so they look intentional.

**Incorrect (underline collides with descenders):**

```css
a { text-decoration: underline; }
```

**Correct (offset underline):**

```css
a {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-skip-ink: auto;
}
```

### 11.10 Disable Font Synthesis for Missing Styles

Set font-synthesis: none to prevent the browser from faking bold or italic. Browser-generated faux styles look terrible.

**Correct:**

```css
.icon-font,
.display-font {
  font-synthesis: none;
}
```

**Typography quick reference:**

| Property | Use Case | Value |
|----------|----------|-------|
| `font-variant-numeric: tabular-nums` | Data tables, pricing | Fixed-width digits |
| `font-variant-numeric: oldstyle-nums` | Body text | Blends with lowercase |
| `font-variant-numeric: slashed-zero` | Code UIs | Distinguishes 0 from O |
| `font-feature-settings: "ss02"` | Code UIs | Disambiguates I/l/1 |
| `font-optical-sizing: auto` | Everywhere | Size-adaptive glyphs |
| `-webkit-font-smoothing: antialiased` | Retina displays | Thinner, cleaner text |
| `text-wrap: balance` | Headings | Even line lengths |
| `text-underline-offset: 3px` | Links | Clear descender space |
| `font-synthesis: none` | Display/icon fonts | Prevents faux styles |

### 11.11 Use font-display swap

Set font-display: swap so text renders immediately with a fallback while the custom font loads.

**Correct:**

```css
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter.woff2") format("woff2");
  font-display: swap;
}
```

### 11.12 Continuous Weight Values with Variable Fonts

Variable fonts accept any integer from 100-900, not just standard stops.

**Correct (precise weight):**

```css
.medium { font-weight: 450; }
.semibold { font-weight: 550; }
```

### 11.13 text-wrap pretty for Body Text

Use text-wrap: pretty for body text to reduce orphans. Use balance for headings.

**Correct:**

```css
p { text-wrap: pretty; }
h1, h2, h3 { text-wrap: balance; }
```

### 11.14 Pair Justified Text with Hyphens

Justified text without hyphens creates rivers of whitespace.

**Incorrect (rivers):**

```css
.article { text-align: justify; }
```

**Correct (hyphenation prevents rivers):**

```css
.article {
  text-align: justify;
  hyphens: auto;
}
```

### 11.15 Add Letter Spacing to Uppercase Text

Uppercase and small-caps text needs positive letter-spacing to feel open and readable.

**Incorrect (tight uppercase):**

```css
.label {
  text-transform: uppercase;
  font-size: 12px;
}
```

**Correct (opened up):**

```css
.label {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}
```

### 11.16 Use Typographic Fractions

Enable diagonal-fractions to convert 1/2, 1/3 into proper typographic fractions.

**Correct:**

```css
.recipe { font-variant-numeric: diagonal-fractions; }
```

Reference: [Inter Typeface](https://rsms.me/inter/), [MDN font-feature-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings), [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)

---

## 12. Visual Design

**Impact:** HIGH — CSS design fundamentals that compound into visual polish. Small details that separate considered interfaces from default ones.

### 12.1 Concentric Border Radius for Nested Elements

When nesting rounded elements, inner radius must equal outer radius minus the gap. Same radius on both creates uneven curves.

**Incorrect (same radius on both):**

```css
.outer {
  border-radius: 16px;
  padding: 8px;
}

.inner {
  border-radius: 16px;
}
```

**Correct (concentric radius):**

```css
.outer {
  --padding: 8px;
  --inner-radius: 8px;

  border-radius: calc(var(--inner-radius) + var(--padding));
  padding: var(--padding);
}

.inner {
  border-radius: var(--inner-radius);
}
```

### 12.2 Layer Multiple Shadows for Realistic Depth

A single box-shadow looks flat. Layer multiple shadows with increasing blur and decreasing opacity to mimic real light.

**Incorrect (single flat shadow):**

```css
.card {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
```

**Correct (layered shadows):**

```css
.card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 4px 8px rgba(0, 0, 0, 0.04),
    0 12px 24px rgba(0, 0, 0, 0.03);
}
```

### 12.3 Consistent Shadow Direction Across UI

All shadows must share the same offset direction to imply a single light source. Mixed directions feel broken.

**Incorrect (conflicting light sources):**

```css
.card { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
.modal { box-shadow: 4px 0 8px rgba(0, 0, 0, 0.1); }
.tooltip { box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.1); }
```

**Correct (consistent top-down light):**

```css
.card { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }
.modal { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12); }
.tooltip { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
```

### 12.4 Use Neutral Colors for Shadows

Pure black shadows look harsh. Use deep neutrals or semi-transparent dark colors.

**Incorrect (pure black):**

```css
.card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
```

**Correct (neutral shadow):**

```css
.card {
  box-shadow: 0 4px 12px rgba(17, 24, 39, 0.08);
}
```

### 12.5 Shadow Size Indicates Elevation

Larger blur and offset means higher elevation. Use a consistent shadow scale.

**Correct (elevation scale):**

```css
:root {
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-3: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card { box-shadow: var(--shadow-1); }
.dropdown { box-shadow: var(--shadow-2); }
.modal { box-shadow: var(--shadow-3); }
```

### 12.6 Animate Shadows via Pseudo-Element Opacity

Transitioning box-shadow directly forces expensive repaints. Animate opacity on a pseudo-element instead.

**Incorrect (animating box-shadow):**

```css
.card {
  box-shadow: var(--shadow-1);
  transition: box-shadow 0.2s ease;
}
.card:hover {
  box-shadow: var(--shadow-3);
}
```

**Correct (pseudo-element opacity):**

```css
.card {
  position: relative;
  box-shadow: var(--shadow-1);
}
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--shadow-3);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
  z-index: -1;
}
.card:hover::after {
  opacity: 1;
}
```

### 12.7 Use a Consistent Spacing Scale

Don't use arbitrary pixel values. Define a scale and use it throughout.

**Incorrect (arbitrary values):**

```css
.header { padding: 17px; }
.card { margin-bottom: 13px; }
.section { gap: 22px; }
```

**Correct (consistent scale):**

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
}

.header { padding: var(--space-4); }
.card { margin-bottom: var(--space-3); }
.section { gap: var(--space-5); }
```

### 12.8 Use Semi-Transparent Borders

Semi-transparent borders adapt to any background color and create subtle, non-jarring separation.

**Incorrect (hardcoded border color):**

```css
.card {
  border: 1px solid #e5e5e5;
}
```

**Correct (alpha border):**

```css
.card {
  border: 1px solid var(--gray-a4);
}
```

### 12.9 Full Shadow Anatomy on Buttons

A polished button uses six layered techniques, not just a single box-shadow:

1. **Outer cut shadow** — 0.5px dark box-shadow to "cut" the button into the surface
2. **Inner ambient highlight** — 1px inset box-shadow on all sides for environmental light reflections
3. **Inner top highlight** — 1px inset top highlight for the primary light source from above
4. **Layered depth shadows** — At least 3 external shadows for natural lighting
5. **Text drop-shadow** — Drop-shadow on text/icons for better contrast against the button background
6. **Subtle gradient background** — If you can tell there's a gradient, it's too much

**Incorrect (flat button):**

```css
.button {
  background: var(--gray-12);
  color: var(--gray-1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

**Correct (full shadow anatomy):**

```css
.button {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--gray-12) 100%, white 4%),
    var(--gray-12)
  );
  color: var(--gray-1);
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 1px 2px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.06),
    0 4px 8px rgba(0, 0, 0, 0.03);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.15);
}
```

Reference: [Designing Beautiful Shadows in CSS](https://www.joshwcomeau.com/css/designing-shadows/), [Concentric Border Radius](https://jakub.kr/work/concentric-border-radius), [@PixelJanitor](https://threadreaderapp.com/thread/1623358514440859649)

---

## Output Format

When reviewing files, output findings as:

```
file:line - [rule-id] description of issue

Example:
components/modal/index.tsx:45 - [timing-under-300ms] Exit animation 400ms exceeds 300ms limit
components/button/styles.module.css:12 - [physics-active-state] Missing :active transform
components/drawer/index.tsx:23 - [spring-for-gestures] Drag interaction using easing instead of spring
```

## Summary Table

After findings, output a summary:

| Rule | Count | Severity |
|------|-------|----------|
| `timing-under-300ms` | 2 | HIGH |
| `physics-active-state` | 3 | MEDIUM |
| `exit-requires-wrapper` | 1 | HIGH |

## References

- [The Illusion of Life: Disney Animation](https://www.amazon.com/Illusion-Life-Disney-Animation/dp/0786860707)
- [Apple WWDC23: Animate with Springs](https://developer.apple.com/videos/play/wwdc2023/10158)
- [Motion Documentation](https://motion.dev)
- [The Beauty of Bezier Curves - Freya Holmer](https://www.youtube.com/watch?v=aVwxzDHniEw)
- [MDN Pseudo-elements Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/Pseudo-elements)
- [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)
- [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [SVG Line Element](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/line)
- [ResizeObserver - MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [Laws of UX](https://lawsofux.com/) by Jon Yablonski
- [ForesightJS](https://foresightjs.com)
- [Next.js Prefetching Docs](https://nextjs.org/docs/app/guides/prefetching)
- [Inter Typeface](https://rsms.me/inter/)
- [MDN font-feature-settings](https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings)
- [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)
- [Designing Beautiful Shadows in CSS - Josh W. Comeau](https://www.joshwcomeau.com/css/designing-shadows/)
- [Concentric Border Radius](https://jakub.kr/work/concentric-border-radius)
- [Nested Rounded Corners](https://www.ondrejkonecny.com/blog/nested-rounded-corners/)
- [MDN text-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap)
