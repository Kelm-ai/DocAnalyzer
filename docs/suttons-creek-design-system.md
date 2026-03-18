# Suttons Creek Compliance — Design System

**Date:** 2026-02-27
**Status:** Active
**Brand source:** Suttons Creek Brand Guide (v1, © 2025)
**Reference implementation:** _(to be established during Phase 1 rollout)_

---

## 1. Design Philosophy

This system is designed for **pharma device consultants and compliance professionals** who evaluate regulatory documents against industry frameworks. The aesthetic draws from Suttons Creek's brand identity — professional, technically sophisticated, and trustworthy — but dials it back from the marketing-forward brand guide to suit a daily-use tool.

**Guiding principles:**

- **Clinical precision, warm authority.** The SC teal and plum convey competence without coldness. The interface should feel like a well-organized consulting deliverable — clean, structured, and confident.
- **Brand as quiet signal.** SC Green appears on actions and navigation. SC Purple lives in headings and text. SC Yellow is a rare accent. Together they say "Suttons Creek" without painting the screen in brand colors.
- **Professional density.** Enough information to work efficiently without scrolling, but never cluttered. Tables for structured data, cards for summaries, modals for focused actions.
- **Clean and flat.** Minimal shadows, thin borders, restrained radius. The brand guide calls for "clean, sophisticated and technical" — this means border-driven layouts, not shadow-heavy material design.
- **One font, many weights.** Lato handles everything from light page titles to bold table headers, echoing the SC brand's all-Calibri approach.

---

## 2. Typography

### Font Stack

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| **All UI text** | Lato | 300, 400, 500, 600, 700 | ui-sans-serif, system-ui, sans-serif |

> **Note:** Lato is the closest Google Fonts match to Calibri — the same humanist sans-serif warmth, open counters, and professional readability. Lato Light (300) substitutes for Calibri Light (headings); Lato Regular (400) substitutes for Calibri (body).

**Google Fonts import:**
```
https://fonts.googleapis.com/css2?family=Lato:wght@300;400;500;600;700&display=swap
```

### Scale

| Element | Size | Weight | Tracking | Case | Color |
|---------|------|--------|----------|------|-------|
| Page title | 24px (`text-2xl`) | Light (300) | Normal | Uppercase | SC Purple (`#52315B`) |
| Section heading | 18px (`text-lg`) | Semibold (600) | Normal | Sentence | Foreground (`#2D1A33`) |
| Card title | 16px (`text-base`) | Semibold (600) | Normal | Sentence | Foreground |
| Body text | 14px (`text-sm`) | Regular (400) – Medium (500) | Normal | Sentence | Foreground |
| Table header | 12px (`text-xs`) | Semibold (600) | `tracking-wider` | Uppercase | Muted (`#6B7280`) |
| Label | 12px (`text-xs`) | Medium (500) | Normal | Sentence | Muted |
| Caption / helper | 12px (`text-xs`) | Regular (400) | Normal | Sentence | Light text (`#9CA3AF`) |
| Brand mark | 18px (`text-lg`) | Light (300) | `tracking-wide` | Title case | SC Green (`#00978F`) |

### Usage Rules

- Page titles use Lato Light (300), **uppercase**, in SC Purple — this mirrors the brand guide's "Calibri Light, ALL CAPS, Suttons Creek Purple" convention for page titles.
- Section headings and card titles use Lato Semibold (600) in the standard foreground color (deep plum-black). No uppercase.
- Navigation labels, buttons, table content, and form elements use Lato Regular–Semibold (400–600).
- The brand name `Suttons Creek Compliance` in the header uses Lato Light (300) with `tracking-wide`, colored SC Green.
- Table headers are the only body-level element that uses uppercase + `tracking-wider`.
- Body text color has a subtle plum undertone (deep plum-black `#2D1A33`) rather than pure black or neutral gray, connecting everyday reading to the SC Purple brand family.
- Use SC Green (`#00978F`) to highlight key headings or points within body copy (per brand guide: "you may use Suttons Creek Green to highlight headings and key points").

---

## 3. Color Palette

### Core Tokens

```typescript
const colors = {
  // Backgrounds
  bg:        '#F7F9F9',   // Page background — cool gray with faint teal warmth
  card:      '#FFFFFF',   // Card / table / header surfaces
  headerBg:  '#F0F6F6',   // Table header row background — very subtle teal tint
  inputBg:   '#F3F4F6',   // Input field backgrounds — neutral gray

  // Primary — SC Green (actions, brand, links)
  sc:        '#00978F',   // Primary action, brand color (buttons, active nav)
  scLt:      '#E8F5F4',   // Primary light background (pills, tags, active nav bg)
  scDk:      '#007A73',   // Accessible text variant (4.5:1+ contrast on white)
  scDeep:    '#005C57',   // Hover / pressed state for primary buttons

  // Brand — SC Purple (headings, authority)
  purple:    '#52315B',   // Page title color, heading accent
  purpleLt:  '#F4F0F5',   // Subtle purple-tinted background
  purpleDk:  '#2D1A33',   // Deep plum-black — body text foreground

  // Accent — SC Yellow (warnings only)
  gold:      '#FFC000',   // Warning/flagged accent, micro brand touches
  goldLt:    '#FFF8E1',   // Warning light background
  goldDk:    '#946000',   // Warning text (accessible on white/light bg)

  // Destructive — Red (errors, failures)
  red:       '#DC2626',   // Destructive actions, fail status
  redLt:     '#FEF2F2',   // Destructive light background
  redDk:     '#B91C1C',   // Hover / pressed state for destructive

  // Text
  text:      '#2D1A33',   // Primary text — deep plum-black
  textMuted: '#6B7280',   // Secondary text — descriptions, metadata
  textLight: '#9CA3AF',   // Tertiary text — placeholders, captions

  // Borders
  border:    '#E2E5E8',   // Standard borders — cards, inputs, dividers
}
```

### CSS Custom Properties

```css
:root {
  /* Surfaces */
  --background: hsl(170 10% 97%);
  --foreground: hsl(283 30% 15%);

  /* Primary — SC Green */
  --primary: hsl(177 100% 30%);
  --primary-foreground: hsl(0 0% 100%);

  /* Secondary — Neutral with plum warmth */
  --secondary: hsl(270 8% 95%);
  --secondary-foreground: hsl(283 30% 20%);

  /* Muted — Warm neutral */
  --muted: hsl(270 5% 95%);
  --muted-foreground: hsl(220 9% 46%);

  /* Accent — Teal highlight */
  --accent: hsl(177 30% 95%);
  --accent-foreground: hsl(177 100% 24%);

  /* Destructive — Standard red */
  --destructive: hsl(0 84% 60%);
  --destructive-foreground: hsl(0 0% 98%);

  /* Borders & Inputs */
  --border: hsl(210 10% 90%);
  --input: hsl(210 10% 90%);
  --ring: hsl(177 100% 30%);

  /* SC Brand tokens */
  --sc-green: #00978F;
  --sc-green-dark: #007A73;
  --sc-green-deep: #005C57;
  --sc-green-light: #E8F5F4;
  --sc-purple: #52315B;
  --sc-purple-dark: #2D1A33;
  --sc-purple-light: #F4F0F5;
  --sc-yellow: #FFC000;
  --sc-yellow-light: #FFF8E1;
  --sc-yellow-dark: #946000;
}
```

### Semantic Mapping

| Purpose | Color | Token |
|---------|-------|-------|
| Primary action (CTA button) | White text on SC Green bg | `sc` bg, white text |
| Primary action hover | White text on darkened green bg | `scDeep` bg |
| Secondary button | Muted text on white, border | `border` + `textMuted` text |
| Destructive action | Red text on white, or white on red bg | `red` |
| Page title text | SC Purple | `purple` |
| Body text | Deep plum-black | `purpleDk` |
| Link text | SC Green (dark variant for accessibility) | `scDk` |
| Active nav tab | SC Green text on green-tinted bg | `sc` text + `scLt` bg |
| Warning/flagged pill | Gold-dark text on gold-light bg | `goldDk` + `goldLt` |
| Pass status pill | Teal-green text on teal-light bg | `#0D7A6F` text + `#E6F5F3` bg |
| Fail status pill | Red text on red-light bg | `red` + `redLt` |
| N/A status pill | Muted text on light gray bg | `textMuted` + `#F3F4F6` bg |

### Status Colors

| Status | Dot / Icon | Text | Background | Notes |
|--------|-----------|------|------------|-------|
| Pass | `#0D9488` | `#0D7A6F` | `#E6F5F3` | Teal-shifted green, echoes SC Green family |
| Fail | `#DC2626` | `#DC2626` | `#FEF2F2` | Standard red, universal comprehension |
| Flagged | `#D4A017` | `#946000` | `#FFF8E1` | SC Yellow (toned down), natural warning mapping |
| N/A | `#9CA3AF` | `#6B7280` | `#F3F4F6` | Neutral gray, clearly inactive |

### Confidence Indicators

| Level | Text | Background |
|-------|------|------------|
| High | `#0D7A6F` | `#E6F5F3` |
| Medium | `#946000` | `#FFF8E1` |
| Low | `#6B7280` | `#F3F4F6` |

---

## 4. Spacing & Layout

### Page Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header — h-14, white bg, bottom border                 │
│  [Logo] Suttons Creek Compliance    [Upload] [FW] [Eval]│
├─────────────────────────────────────────────────────────┤
│  Main — container mx-auto, px-4, py-6, bg (#F7F9F9)    │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Title row — flex justify-between, mb-6             ││
│  │  "PAGE TITLE" (Lato Light, uppercase, SC Purple)    ││
│  ├─────────────────────────────────────────────────────┤│
│  │  Action bar / filters — mb-4                        ││
│  ├─────────────────────────────────────────────────────┤│
│  │  Content card — rounded-lg, shadow-sm, white bg     ││
│  │  border: 1px solid border                           ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Spacing Scale

Follows Tailwind defaults. Key recurring values:

| Context | Value |
|---------|-------|
| Page horizontal padding | `px-4` (16px) |
| Page vertical padding | `py-6` (24px) |
| Section gap | `mb-6` (24px) |
| Subsection gap | `mb-4` (16px) |
| Card inner padding | `p-6` (24px) |
| Table cell vertical | `py-3` (12px) |
| Table cell horizontal | `px-4` (16px) |
| Header height | `h-14` (56px) |
| Max content width | `container` (Tailwind default: 80rem) |

### Border Radius

| Element | Radius |
|---------|--------|
| Cards, content wrappers | `rounded-lg` (8px) |
| Buttons, inputs | `rounded-md` (6px) |
| Modals | `rounded-xl` (12px) |
| Badges, status pills | `rounded-full` |

---

## 5. Components

### Buttons

**Primary (SC Green):**
```
px-4 py-2 rounded-md text-sm font-medium text-white
background: sc (#00978F)
hover: scDeep (#005C57)
focus: ring-2 ring-sc/40 ring-offset-2
```

**Secondary / outline:**
```
px-4 py-2 rounded-md text-sm font-medium
border: 1px solid border (#E2E5E8)
color: textMuted (#6B7280)
hover: bg-secondary (#F3F4F6)
```

**Destructive:**
```
px-4 py-2 rounded-md text-sm font-medium text-white
background: red (#DC2626)
hover: redDk (#B91C1C)
```

**Ghost:**
```
px-4 py-2 rounded-md text-sm font-medium
background: transparent
color: textMuted (#6B7280)
hover: bg-accent (#F0F6F6)
```

**Disabled:** `opacity-50`, no pointer events.

### Inputs

```
w-full px-3 py-2 rounded-md text-sm
background: white
border: 1px solid border (#E2E5E8)
color: text (#2D1A33)
placeholder: textLight (#9CA3AF)
focus: ring-2 ring-sc/30 border-sc (#00978F)
```

**Labels:** `text-xs font-medium, color: textMuted, mb-1.5`

### Status Pills

Pill with a leading dot indicator:

```html
<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold">
  <span class="w-1.5 h-1.5 rounded-full" />
  Label
</span>
```

| Status | Dot | Text | Background |
|--------|-----|------|------------|
| Pass | `#0D9488` | `#0D7A6F` | `#E6F5F3` |
| Fail | `#DC2626` | `#DC2626` | `#FEF2F2` |
| Flagged | `#D4A017` | `#946000` | `#FFF8E1` |
| N/A | `#9CA3AF` | `#6B7280` | `#F3F4F6` |
| Active (framework) | `sc` | `scDk` | `scLt` |
| Inactive (framework) | `textLight` | `textMuted` | `#F3F4F6` |

### Search Bar

```
relative container, max-w-sm
SVG magnifying glass icon: absolute left-3, text-textLight, w-4 h-4
Input: pl-9 pr-4 py-2 rounded-md
background: white
border: 1px solid border
focus: ring-2 ring-sc/30
```

Result count shown inline to the right: `text-xs font-medium, color: textLight`

### Data Table

- **Wrapper:** `rounded-lg overflow-hidden shadow-sm`, white bg, `1px solid border`
- **Header row:** `background: headerBg (#F0F6F6)`, `border-bottom: 1px solid border`
- **Header cells:** `text-xs font-semibold uppercase tracking-wider`, color `textMuted`
- **Body rows:** `border-bottom: 1px solid` border at 50% opacity
- **Row hover:** background changes to `#F7F9F9`
- **Cell padding:** `py-3 px-4`

### Confirmation Dialog

Uses the existing `Modal` component. Styled overrides:

```
Modal content: rounded-xl, shadow-lg, white bg
Title: Lato Semibold (600), text-lg, color text (#2D1A33)
Description: Lato Regular (400), text-sm, color textMuted
Footer: gap-2, mt-4, flex justify-end
```

**Dialog actions:**
- Cancel: secondary button (border style)
- Confirm: primary button, colored by action type:
  - Destructive actions (delete): `red` background
  - Constructive actions (create, save): `sc` (SC Green) background

### Error Banner

```
px-4 py-3 rounded-md text-sm font-medium
background: redLt (#FEF2F2)
color: red (#DC2626)
border: 1px solid red at 20% opacity
Optional inline dismiss button (×) at right
```

### Warning Banner

```
px-4 py-3 rounded-md text-sm font-medium
background: goldLt (#FFF8E1)
color: goldDk (#946000)
border: 1px solid gold at 20% opacity
Icon: AlertTriangle in goldDk
```

### Loading State

Centered in the content area:
```
Spinning circle: w-5 h-5, border-2, sc color (#00978F), transparent top border
Text below: "Loading...", text-sm, textMuted
```

### Empty State

Centered in table body:
```
py-12, text-center
text-sm, color textLight
Contextual message, e.g.: "No evaluations found." or "No frameworks yet."
```

---

## 6. Navigation

### Header Structure

```
┌──────────────────────────────────────────────────────────────┐
│  [SC Logo]  Suttons Creek Compliance     Upload  FW  Eval  Docs │
│  placeholder  sc-green, Lato Light       ← nav tabs →           │
└──────────────────────────────────────────────────────────────┘
```

- **Logo:** Placeholder SVG (teal square with "SC" initials) + `Suttons Creek Compliance` in Lato Light (300), `text-lg`, `tracking-wide`, SC Green (`#00978F`)
- **Nav tabs:** Lato, `text-sm font-medium`, `px-3 py-1.5`
  - Active: SC Green text (`#00978F`), 2px bottom border in SC Green
  - Inactive: `textMuted` color (`#6B7280`), transparent border
  - Hover: SC Green text
- **Docs link:** Right-aligned, `text-sm`, `textMuted` color, BookOpen icon

Header sits on white background with a `1px solid border` bottom border.

**Optional brand accent:** A 2px top border across the full page width in SC Yellow (`#FFC000`). This is a subtle "branded app" pattern — barely noticeable but registers as Suttons Creek gold.

---

## 7. Interaction Patterns

### Confirm Before Acting

All destructive actions (delete framework, delete requirement) require a confirmation dialog. The dialog explains consequences clearly.

- **Delete actions:** Red confirm button
- **Create/save actions:** SC Green confirm button

### Inline Expandable Sections

Framework system prompts expand inline rather than opening a modal. Collapsible sections use a chevron toggle.

### Search Filtering

Client-side instant filtering on data tables. Search input above the table. Result count updates live.

### Relative Time

Timestamps displayed as relative time where meaningful:
- `Today`, `Yesterday`, `X days ago` (up to 30 days)
- After 30 days: `MMM D, YYYY` (e.g., "Jan 15, 2026")

### Upload Drag & Drop

Drop zone uses a dashed border in SC Green when active/hovering, with a light teal background (`scLt`). Idle state uses the standard border color with a subtle background.

---

## 8. Applying to the Codebase

This design system should be applied progressively. All changes are in the `frontend/` directory.

### Phase 1 — Token Foundation

Update `src/index.css` to replace the default shadcn/ui HSL variables with the SC palette. Add the explicit brand tokens (`--sc-green`, `--sc-purple`, `--sc-yellow`) and status tokens. Update the `@theme inline` block to register all new color utilities with Tailwind.

**File:** `src/index.css`

### Phase 2 — Font Loading

Add Lato via Google Fonts in `index.html`. Set `font-family: 'Lato', ui-sans-serif, system-ui, sans-serif` as the base font in `index.css`. Update the page `<title>` to "Suttons Creek Compliance".

**Files:** `index.html`, `src/index.css`

### Phase 3 — Header & Navigation

Restyle `Header.tsx` to show SC logo placeholder + "Suttons Creek Compliance" brand name. Replace the Shield icon and generic title. Restyle `Navigation.tsx` to use SC Green for active states instead of blue. Update `Layout.tsx` background to use the `bg` token.

**Files:**
- `src/components/layout/Header.tsx`
- `src/components/layout/Navigation.tsx`
- `src/components/layout/Layout.tsx`

### Phase 4 — Hardcoded Color Sweep

Replace all hardcoded Tailwind color classes with token-based equivalents:

| Find | Replace with |
|------|-------------|
| `text-blue-600` | `text-primary` (or `text-[--sc-green-dark]` for small text) |
| `border-blue-600` | `border-primary` |
| `hover:text-blue-600` | `hover:text-primary` |
| `focus:border-blue-500` | `focus:border-primary` |
| `focus:ring-blue-100` | `focus:ring-primary/20` |
| `bg-gray-50` (page bg) | `bg-background` |
| `text-gray-900` | `text-foreground` |
| `text-gray-600`, `text-gray-700` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |
| `bg-green-100 text-green-700` | Status pass tokens |
| `bg-red-100 text-red-600` | Status fail tokens |
| `bg-yellow-100 text-yellow-600` | Status flagged tokens |
| `bg-slate-100` | `bg-secondary` |

**Files requiring changes:**
- `src/components/results/ComplianceSummary.tsx` — Highest density of hardcoded status colors
- `src/components/results/RequirementsTable.tsx` — Confidence/status badge colors
- `src/components/evaluation/EvaluationStatus.tsx` — Outcome chip colors
- `src/pages/FrameworkDetail.tsx` — Blue links, focus states
- `src/pages/Frameworks.tsx` — Active/inactive badges, focus states
- `src/pages/Upload.tsx` — Help button hover, warning card
- `src/components/ui/tabs.tsx` — Hardcoded slate colors
- `src/components/ui/badge.tsx` — Add SC-aligned status variants
- `src/components/data-table.tsx` — Header text color

### Phase 5 — Brand Micro-Touches

- Add SC logo placeholder SVG to `public/` directory
- Optional: Add 2px SC Yellow top border accent to the page
- Update favicon from `vite.svg`
- Ensure page title headings use Lato Light (300), uppercase, SC Purple

---

## 9. Do's and Don'ts

### Do

- Use the cool gray background (`#F7F9F9`) everywhere — it's the branded backdrop
- Use Lato Light (300) uppercase for page titles in SC Purple — it signals the brand's Calibri Light convention
- Use SC Green for all actionable elements (buttons, links, active states, focus rings)
- Keep SC Yellow reserved for warnings/flagged states — it's too vivid for decorative use
- Use `rounded-md` for controls and `rounded-lg` for containers — professional, not playful
- Show confirmation dialogs for all destructive actions
- Keep shadows minimal — `shadow-sm` for cards, nothing on buttons or badges
- Use the plum-tinted foreground (`#2D1A33`) instead of pure black — it's warmer and branded
- Reference the SC brand colors (`#00978F`, `#52315B`, `#FFC000`) only through the defined tokens

### Don't

- Don't use SC Yellow for buttons, links, backgrounds, or anything other than warnings
- Don't use pure white (`#FFFFFF`) as a page background — only for cards and surfaces
- Don't use pure black (`#000000`) for text — use the plum-black foreground
- Don't add heavy shadows (`shadow-lg`, `shadow-xl`) on cards — keep it flat and border-driven
- Don't use `rounded-xl` or `rounded-2xl` on cards or buttons — reserve larger radius for modals only
- Don't uppercase body text — only page titles and table headers use uppercase
- Don't use the secondary brand colors (Deep Blue, Burnt Orange, Moss Green, Periwinkle) in the core UI — reserve for future data visualization
- Don't add hover effects that feel consumer-app (glows, scale transforms, color shifts on cards)
- Don't mix hardcoded Tailwind colors (`blue-600`, `green-500`) with the token system — always use tokens
- Don't make SC Green the background of large surfaces — it's an accent, not a backdrop

---

## 10. Assets Required

| Asset | Status | Notes |
|-------|--------|-------|
| SC logo (official) | Pending | User will provide. Use placeholder (teal square with "SC" initials) until available. |
| Lato font | Available via Google Fonts | Free. Load weights 300, 400, 500, 600, 700. |
| Favicon | Needs update | Replace default `vite.svg` with SC-branded icon once logo is provided. |
| SC brand colors (verified) | Done | Extracted from brand guide PDF: Green `#00978F`, Yellow `#FFC000`, Purple `#52315B` |

---

## Appendix: Brand Guide Color Reference

For reference, the full SC brand palette from the official brand guide:

**Primary Colors:**
| Name | Hex | Pantone | RGB |
|------|-----|---------|-----|
| Suttons Creek Green | `#00978F` | 7716C | 0, 151, 143 |
| Suttons Creek Yellow | `#FFC000` | 7548C | 255, 192, 0 |
| Suttons Creek Purple | `#52315B` | 519C | 82, 49, 91 |

**Secondary/Accent Colors (reserved for data visualization):**
| Name | Hex | Pantone | RGB |
|------|-----|---------|-----|
| Deep Blue | `#005493` | 7462C | 0, 84, 147 |
| Burnt Orange | `#C55A11` | 159C | 197, 90, 17 |
| Moss Green | `#8DC191` | 2261C | 141, 193, 145 |
| Periwinkle | `#8FAADC` | 2121C | 143, 170, 220 |

**Accessibility Notes:**
- SC Green (`#00978F`) on white has a contrast ratio of ~3.6:1 — passes WCAG AA for large text only. Use the darkened variant (`#007A73`, ~5.3:1) for body-size links and text.
- SC Purple (`#52315B`) on white has a contrast ratio of ~10.8:1 — excellent for all text sizes.
- Deep plum-black (`#2D1A33`) on white has a contrast ratio of ~16:1 — excellent for body text.
