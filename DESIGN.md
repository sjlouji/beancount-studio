# Beancount Studio design system

> Source of truth for every UI decision in this repo. Where `docs/frontend-conventions.md`
> conflicts with this file, this file wins. Token names in braces (`{colors.accent}`) are the
> vocabulary; the Tailwind theme in `apps/web/src/app/globals.css` maps to them.

## Overview

Two parents, one child. The **language is Apple's**: the platform's own face with tracking that
tightens as type grows, a single system accent, surfaces separated by material and depth rather
than lines, feedback on the press itself, motion that is a spring you can interrupt, and
restraint everywhere else. The **frame is Slack's**: a narrow rail that picks a section, a sidebar
listing that section's pages, a full-width bar with the search field in the middle, a header with
tabs over the content, and the assistant in a thread panel on the right.

The dark theme is the reference screenshot's Slack dark (near-black canvas, a slightly deeper
rail, hairlines that are light at 8–10%); the light theme is white with Apple's grouped greys.
Both use the same accent and the same type.

**Key characteristics**
- One accent, system blue (`{colors.accent}`), for selection, links, the primary button and focus.
  The aubergine brand colour survives only in the brand mark.
- System type: SF on Apple devices, Inter elsewhere, 15px body, weight-first hierarchy.
- Materials: translucent bars and popovers with content moving underneath; the sidebar is a
  heavier material than a bar, a bar heavier than a popover; never two light ones stacked.
- Depth from colour and soft shadow, not borders: cards are flat with a hairline, floating chrome
  casts one of three soft shadows.
- Controls are rounded rectangles (6–10px); capsules are for chips, badges and the send button.
- Feedback on pointer-down: controls scale to 97% while pressed. Springs, critically damped, for
  anything that moves; cross-fades under `prefers-reduced-motion`.
- Loaders everywhere: every route has a `loading.tsx`, every query a skeleton, every mutation a
  spinner in its button.

## Colors

### Accent & links
- **Accent** (`{colors.accent}`): `#007aff` light · `#0a84ff` dark. Primary button, selected
  sidebar item, focus ring, active tab underline.
- **Accent press** (`{colors.accent-press}`): `#0066d6` · `#409cff`.
- **Accent wash** (`{colors.accent-wash}`): accent at 12% · 18%. The tinted (secondary) button
  and ledger tiles; text on it is `{colors.accent-text}` `#0066cc` · `#6cb2ff`.
- **Link** (`{colors.link}`): `#0066cc` · `#409cff`, underline on hover only.

### Canvas & surfaces
| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.canvas}` | `#ffffff` | `#1a1d21` | Content background |
| `{colors.grouped}` | `#f5f5f7` | `#222529` | Sidebar, muted panels, inset groups |
| `{colors.card}` | `#ffffff` | `#222529` | Cards (hairline in light, elevated colour in dark) |
| `{colors.rail}` | `#ebebef` | `#121417` | The rail |
| `{colors.fill}` | grey 16% | grey 24% | Search fields, segmented controls, skeletons |
| `{colors.popover}` | white 84% + blur | `#222529` 88% + blur | Menus, popovers, dialogs |
| `{colors.hairline}` | ink 14% | white 10% | Borders and separators |

### Text
- **Label** (`{colors.label}`): `#1d1d1f` · `#e9e9eb`.
- **Secondary label** (`{colors.label-2}`): `#6e6e73` · `#9b9ca1`. Captions, helper copy,
  sidebar section names.
- **On accent**: `#ffffff`.

### Semantic
- **Positive** `#248a3d` · `#30d158` · **Negative / destructive** `#d70015` (`#ff3b30` fill) ·
  `#ff453a` · **Warning** `#b25000` · `#ffb340`. As text on the canvas, or as 12–14% tints
  behind text in badges and alerts. Charts use Apple's eight system colours in order: blue,
  green, orange, purple, teal, pink, indigo, yellow.

## Typography

### Font family
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", ui-sans-serif, Inter,
"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Inter is loaded as the fallback;
nothing else. Monospace for ledger source and account names: `ui-monospace, "SF Mono", Menlo,
IBM Plex Mono`.

### Hierarchy
| Token | Size | Weight | Leading | Tracking | Use |
|---|---|---|---|---|---|
| `{type.large-title}` | 34px (28 on phones) | 700 | 1.18 | −0.022em | The page's h1 (`PageHeader`) |
| `{type.title-1}` | 28px | 700 | 1.2 | −0.02em | Stat numerals, auth titles |
| `{type.title-2}` | 22px | 700 | 1.27 | −0.016em | Dialog titles, section heads |
| `{type.title-3}` | 20px | 600 | 1.25 | −0.012em | Sub-section heads |
| `{type.headline}` | 15px | 600 | 1.33 | −0.01em | Card titles, sidebar switcher, emphasis |
| `{type.body}` | 15px | 400 | 1.4 | −0.01em | Default UI text |
| `{type.callout}` | 14px | 400 | 1.36 | −0.006em | Dense body |
| `{type.subhead}` | 13px | 400 | 1.38 | −0.004em | Descriptions, table text, tabs |
| `{type.footnote}` | 12px | 400 | 1.33 | 0 | Helper copy, timestamps |
| `{type.caption}` | 11px | 500 | 1.27 | +0.004em | Rail labels, tab bar labels |
| `{type.caption-2}` | 11px | 600 | 1.2 | +0.06em, uppercase | Eyebrows and group labels |

### Principles
- Tracking is size-specific: titles tighten, body sits near zero, captions open slightly.
- Build hierarchy from weight and size together; emphasise with weight before size.
- Numbers are always tabular (`tabular`).
- Layout scales with text: spacing in `rem`, no fixed-height text boxes.

## Layout

### The frame
```
┌──────────────────────── top bar (44px, material) ─────────────────────────┐
│ ‹ ›   [ ⌕ Search …                                 ⌘K ]        ☾  avatar  │
├────┬──────────────┬─────────────────────────────────────────┬─────────────┤
│rail│ sidebar 280  │ header: tile · title · actions           │  Ask panel  │
│ 72 │ switcher ▾   │ tabs: siblings of the current page      │  26rem      │
│    │ find…        │ toolbar: filters                        │  (lg+)      │
│    │ pages of the ├─────────────────────────────────────────┤             │
│    │ rail section │ content, max 80rem, scrolls under the   │             │
│    │              │ header                                  │             │
│    │              │                                         │             │
│    │ footer meta  │                                         │             │
└────┴──────────────┴─────────────────────────────────────────┴─────────────┘
```
- Inside a ledger the rail holds Home, the sections (Overview, Reports, Capture, Data,
  Repository) and Ask; the sidebar lists the current section's pages. No ledgers list there: the
  switcher at the top of the sidebar changes ledger.
- Below `md` (768px): rail and sidebar fold into one sheet from the left (rail beside pages), a tab
  bar sits at the bottom, the Ask panel is a sheet from the bottom.
- Between `md` and `lg` (1024px): rail and sidebar show; the Ask panel is still a sheet.
- The sidebar toggles with the top-bar button (and ⌘B); the width transition is 200ms.

### Spacing
8px base: 4 · 8 · 12 · 16 · 20 · 24 · 32. Content padding 16px on phones, 32px from `md`.
Cards pad 20px (`sm` 12px). Sidebar rows are 28px tall with 8px horizontal padding.

## Elevation & depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat, hairline border | Cards, tables, inputs |
| 1 | `0 1px 2px / .06` | Raised controls (outline buttons) |
| 2 | `0 8px 24px / .12` | Menus, popovers |
| 3 | `0 24px 64px / .2` | Dialogs, sheets, the auth window |

Materials: `material-bar` (canvas 78% + 20px blur) for the top bar and the header;
`material-sidebar` for sheets of navigation; `material-popover` for menus; `material-thick` for
dialogs and sheets. Under `prefers-reduced-transparency` every material becomes solid; under
`prefers-contrast: more` popovers gain a full-contrast border.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Tiny tiles |
| `{rounded.sm}` | 6px | Compact controls |
| `{rounded.md}` | 8px | Buttons, inputs, menu items, sidebar rows |
| `{rounded.lg}` | 10px | Large buttons, panes |
| `{rounded.xl}` | 12px | Cards, popovers, menus |
| `{rounded.2xl}` | 16px | Sheets, the auth window |
| `{rounded.3xl}` | 20px | Dialogs |
| `{rounded.pill}` | 9999px | Chips, badges, the send button, avatars of people |

## Motion

- Press: `transform: scale(0.97)` on `:active`, 100ms ease-out, every control.
- Entrance: `animate-rise` (6px, 350ms, ease-out) on top-level blocks, staggered by 60ms;
  `animate-materialize` (blur + scale) for glass surfaces.
- Anything a person can touch moves on a spring: damping 1.0, response 0.3–0.4 (`motion`'s
  `{ type: "spring", bounce: 0, duration: 0.35 }`). Bounce only follows a flick or a throw.
- Enter and exit along the same path; menus originate from their trigger.
- `prefers-reduced-motion`: entrances become 200ms cross-fades, the ticker stops, nothing slides.

## Components

**Buttons** (`Button`): `default` filled accent, `secondary` tinted, `outline` hairline with a
level-1 shadow, `ghost` for toolbars, `destructive` filled red, `link`, `chip` capsule for
filters. Sizes `xs` 24 · `sm` 28 · `default` 32 · `lg` 40; icon sizes match. Weight 600. One
filled accent button per view.

**Inputs** (`Input`, `Select`, `Textarea`): 36px, 8px radius, hairline, 3px accent ring at 30% on
focus, 16px text on phones (no zoom).

**Cards** (`Card`): 12px radius, hairline, flat. `muted` for inset grouped panels, `accent` for
the one filled band a view may carry. Titles are `{type.headline}`.

**Tabs** (`Tabs`): `default` is a segmented control on `{colors.fill}`; `line` is the header
tab row with an accent underline.

**Badges** (`Badge`): capsules with tints: `secondary`, `success`, `warning`, `destructive`,
`outline`.

**Frame pieces** (`components/app`): `AppFrame`, `Rail`, `TopBar`, `ContentHeader` (title row,
tabs, toolbar), `MobileTabBar`, `HomeSidebar`, `sidebar-parts` (`SidebarItem`, `SidebarSection`,
`SidebarFind`, `LedgerTile`). Ledger pieces (`components/ledger`): `LedgerSidebar`,
`LedgerSwitcher`, `AskPanel`, `ledger-nav` (the one table of ledger pages).

**States** (`components/app/states`): `PageSkeleton` for routes, `CardSkeleton` and
`ListSkeleton` for queries, `LoadingState` for short waits, `ErrorState` with retry, `EmptyState`
with a next step.

## Do's and Don'ts

### Do
- Use the type tokens; never set a font size by hand except the auth hero.
- Put selection, focus and the primary action in the accent, and nothing else.
- Let content scroll under translucent chrome; keep the chrome thin.
- Give every pending state a skeleton of the right shape, and every button a spinner while its
  request runs.
- Design phone-first: one column, 16px gutters, 44px touch targets, no horizontal page scroll.

### Don't
- Don't add a second accent or decorate with gradients beyond the auth aurora.
- Don't use heavy borders, drop shadows on resting cards, or dividers under floating bars.
- Don't animate colour on release or use fixed-duration slides for things a person drags.
- Don't stack two light materials, or put colour on a translucent layer.
- Don't render an h1 outside `PageHeader`.

## Responsive behavior

| Name | Width | Key changes |
|---|---|---|
| Wide | ≥ 1280px | Three panes plus the Ask panel inline |
| Desktop | 1024–1279px | Rail, sidebar, content; Ask panel inline |
| Tablet | 768–1023px | Rail and sidebar; Ask panel as a bottom sheet |
| Phone | < 768px | Tab bar, sidebar sheet, single column, large title at 28px |

Tables scroll horizontally inside `overflow-x-auto`; grids collapse to one column below `lg`;
dialogs take the full width minus 16px gutters on phones.

## Iteration guide
1. Change tokens in `globals.css` first, components second, pages last.
2. Check both themes and a 390px viewport before calling anything done.
3. Add a new control as a variant of an existing primitive before adding a component.
