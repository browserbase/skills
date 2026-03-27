# Browserbase Design System

Use this as ground truth when evaluating visual consistency of Browserbase UI.

## Brand Colors

```
brand-primary: #F03603   (Bright orange-red — main brand color)
brand-blue:    #4DA9E4   (Active/running states)
brand-yellow:  #F4BA41   (Warnings, highlights)
brand-purple:  #9C71F0   (Accents)
brand-pink:    #EC679B   (Accents)
brand-green:   #90C94D   (Success/completed)
brand-black:   #100D0D   (Text, hover states)
brand-gray:    #514F4F   (Borders, secondary text)
brand-white:   #F9F6F4   (Warm off-white backgrounds)
```

### Semantic Color Usage

| State | Color | Hex |
|-------|-------|-----|
| Success/Completed | brand-green | #90C94D |
| Running/Active | brand-blue | #4DA9E4 |
| Warning/Timed Out | brand-yellow | #F4BA41 |
| Error/Failed | brand-primary | #F03603 |
| Neutral | brand-gray | #514F4F |

### UI Elements

- **Primary actions**: brand-primary (#F03603)
- **Hover on primary**: brand-black (#100D0D)
- **Text on primary**: White (#FFFFFF)
- **Borders**: brand-gray (#514F4F) or gray-200 (#edebeb)
- **Backgrounds**: White (#FFFFFF) or brand-white (#F9F6F4)

## Typography

- **Body**: Inter 400/500/600/700 (Google Fonts)
- **Display/Brand**: PP Supply Sans (custom, loaded via woff2)
- **Code**: JetBrains Mono (monospace)
- **Body text size**: 14px (`text-sm`) is the standard
- **Labels**: 14px medium (`text-sm font-medium`)
- **Badges**: 12px semibold (`text-xs font-semibold`)

## Border Radius

Tiered system based on `--radius: 6px`:

| Token | Size | Usage |
|-------|------|-------|
| `rounded-none` | 0px | Brand-forward buttons (browserbase variant) |
| `rounded-[2px]` | 2px | Badges, small indicators |
| `rounded-sm` | 4px | **Most common** — buttons, inputs, cards |
| `rounded-md` | 6px | Medium containers |
| `rounded-lg` | 8px | Alerts, large modals |
| `rounded-full` | 100% | Status dots, avatars |

## Spacing

4px base unit. Common patterns:

- `p-2` / `px-2` / `py-2` — 8px
- `p-3` / `px-3` / `py-3` — 12px (very common)
- `p-4` / `px-4` / `py-4` — 16px (very common)
- `gap-2` — 8px, `gap-3` — 12px, `gap-4` — 16px

## Component Patterns

### Buttons

| Variant | Background | Hover | Border radius |
|---------|-----------|-------|---------------|
| `browserbase` | #F03603 | #100D0D | `rounded-none` |
| `default` | primary bg | darker | `rounded-sm` |
| `destructive` | red | darker red | `rounded-sm` |
| `outline` | transparent | gray-100 | `rounded-sm` |
| `ghost` | transparent | accent bg | `rounded-sm` |

**Sizes**: default=40px (h-10), sm=36px (h-9), lg=44px (h-11), icon=40x40

### Inputs

- Height: 40px (`h-10`)
- Border: `border border-brand-gray` (#514F4F)
- Radius: `rounded-sm` (4px)
- Padding: `px-3 py-2`
- Focus: `ring-2 ring-ring ring-offset-2`

### Badges

- Radius: `rounded-[2px]` (2px)
- Padding: `px-2.5 py-0.5`
- Font: `text-xs font-semibold`

### Cards

- Radius: `rounded-sm` (4px)
- Border: `border border-gray-200`
- Padding: `p-4`

### Status Dots

- Size: `h-2 w-2`
- Shape: `rounded-full`
- Color: matches semantic status colors above

## Focus States

All interactive elements:
```
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
```

## Disabled States

```
disabled:pointer-events-none
disabled:cursor-not-allowed
disabled:opacity-50
```

## Visual Principles

- **Borders over shadows** — Browserbase prefers borders for visual separation, not box-shadow
- **Sharp brand edges** — Brand-specific CTAs use `rounded-none` (sharp corners)
- **Warm neutrals** — Off-white (#F9F6F4) not pure white for backgrounds
- **Class-based dark mode** — `.dark` class on `<html>` element
- **4px spacing grid** — All spacing should be multiples of 4px
