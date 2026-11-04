# Beancount Studio design system

> Source of truth for every UI decision in this repo. Where `docs/frontend-conventions.md`
> conflicts with this file, this file wins. Token names in braces (`{colors.accent}`) are the
> vocabulary; the Tailwind theme in `apps/web/src/app/globals.css` maps to them.

## Overview

Two parents, one child. The **language is Apple's**: the platform's own face with tracking that
tightens as type grows, a monochrome palette (black, white and Apple's greys), surfaces separated
by material and depth rather than lines, feedback on the press itself, motion that is a spring you can interrupt, and
restraint everywhere else. The **frame is Slack's**: a narrow rail that picks a section, a sidebar
listing that section's pages, a full-width bar with the search field in the middle, a header with
tabs over the content. The assistant (Ask) is a full page in the manner of Claude's chat: the
sidebar lists the conversations and the chat takes the whole column.

The palette is **Apple monochrome**, as on Apple's and SpaceX's sites: the light theme is white
with Apple's grouped greys, the dark theme is true black (`#000`) with near-black lifted surfaces
and white hairlines at 10–12%. Both use the same type. Colour is kept for meaning only: blue for
links and focus, green and red for money moving, orange for warnings.

**Key characteristics**
- No brand accent. The primary action and every selected state are near-black in light and
  white in dark (`{colors.accent}`). Blue appears only on links and the focus ring.
  The aubergine brand colour survives only in the brand mark.
- System type: SF on Apple devices, Inter elsewhere, 15px body, weight-first hierarchy.
- Materials: translucent bars and popovers with content moving underneath; the sidebar is a
  heavier material than a bar, a bar heavier than a popover; never two light ones stacked.
- Depth from colour and soft shadow, not borders: cards are flat with a hairline, floating chrome
  casts one of three soft shadows.
- Controls are rounded rectangles (6–10px); capsules are for chips, badges, the send button and
  the one call to action in the local nav (New entry), as on apple.com.
- Feedback on pointer-down: controls scale to 97% while pressed. Springs, critically damped, for
  anything that moves; cross-fades under `prefers-reduced-motion`.
- Loaders everywhere: every route has a `loading.tsx`, every query a skeleton, every mutation a
  spinner in its button.

## Colors

### Primary, grey & links
- **Primary** (`{colors.accent}`, `--primary`): `#1d1d1f` light · `#f5f5f7` dark. The one filled
  action per view and every selected state: selected sidebar row, checked box, on switch, active
  tab underline, current page.
- **Primary press** (`{colors.accent-press}`): `#424245` · `#d2d2d7`.
- **On primary**: `#ffffff` · `#000000` (about 16:1 in both themes).
- **Grey button** (`{colors.accent-wash}`, `--secondary`): `#e8e8ed` · `#2c2c2e`, text
  `#1d1d1f` · `#f5f5f7`. Second actions and ledger tiles.
- **Link** (`{colors.link}`): `#0066cc` · `#2997ff`, underline on hover only. With the focus ring
  (`--ring`, `#007aff` · `#0a84ff`), the only blue in the interface.

### Canvas & surfaces
| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.canvas}` | `#ffffff` | `#000000` | Content background |
| `{colors.grouped}` | `#f5f5f7` | `#0d0d0d` | Muted panels, inset groups |
| `{colors.sidebar}` | `#f5f5f7` | `#0a0a0a` | The sidebar |
| `{colors.card}` | `#ffffff` | `#161617` | Cards (hairline in light, lifted near-black in dark) |
| `{colors.rail}` | `#ebebef` | `#000000` | The rail |
| `{colors.fill}` | grey 16% | grey 24% | Search fields, segmented controls, skeletons |
| `{colors.popover}` | white 84% + blur | `#1c1c1e` 88% + blur | Menus, popovers, dialogs |
| `{colors.hairline}` | ink 14% | white 12% | Borders and separators |

### Text
- **Label** (`{colors.label}`): `#1d1d1f` · `#f5f5f7`.
- **Secondary label** (`{colors.label-2}`): `#6e6e73` · `#a1a1a6`. Captions, helper copy,
  sidebar section names.

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
│rail│ sidebar 240  │ local nav: title • · pages · (+ New) ⋯   │             │
│ 56 │ switcher ▾   │ All time ⌄ All accounts Filter ⌄  INR ⌄  │             │
│    │ find…        │ Large title          [primary action]   │  (lg+)      │
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
  bar sits at the bottom.
- Between `md` and `lg` (1024px): rail and sidebar show.
- **Ask** (`/ask`) is a full page, laid out like Claude's chat. The sidebar becomes the
  conversation list (New chat, Search chats, Starred, Recents, Files: every document the
  assistant made, linked to its conversation); each row's ⋯ menu stars, renames or deletes.
  A new conversation shows a greeting by name over a centred composer card with suggestion chips
  under it; a conversation shows its title (with the same menu) above the messages, user turns in
  grey bubbles on the right, the assistant's on the canvas, and the composer pinned at the bottom.
  A document's Preview opens beside the chat (like Claude's artifacts) on wide screens and in a
  dialog on narrow ones. There is no side panel: the rail's Ask opens this page.
- The sidebar toggles with the top-bar button (and ⌘B), instantly: animating its width would
  re-lay out the whole content column on every frame.
- **The local nav** (`ContentHeader`), as on apple.com's product pages: one 52px row with the
  ledger's name and a sync dot (green in sync, orange needs attention, red failed), the section's
  pages (the current one in semibold label colour, the rest grey; no underline), and on the right
  a small black New entry capsule and the More menu. Search lives in the top bar (⌘K), not here.
  Under it, on pages that report (not files, history, settings, import or query), the report
  filters form a second row of quiet text menus (`All time ⌄ · All accounts · Filter ⌄ …
  Monthly ⌄ · INR ⌄`): no borders, no icons, grey at their default and label colour once set,
  with a blue "Clear" when anything is set.
- **The header is static:** sticky, the same bar-material glass and hairline on every page and at
  every scroll position, and nothing in it animates when the page changes. The filters are always
  in the same place and always visible, including on a page's error and loading states.
- **The page header** (`PageHeader`): the large title, one line of description and the page's
  primary action. No eyebrow: the nav already says where you are.
- **Table headers** are small grey uppercase labels (`type-caption-2`, `muted-foreground`) over a
  hairline, never bold black text.

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

Materials: `material-bar` (canvas 78% + 20px blur) for the content header and the phone tab bar,
the surfaces content scrolls under; `material-sidebar` for sheets of navigation;
`material-popover` for menus; `material-thick` (card 94% + 20px blur) for dialogs and sheets.
The top bar is solid canvas, since nothing passes beneath it. Modal scrims dim and never blur, and
chart tooltips are solid cards: a blur that moves or animates is recomputed every frame.

In the Mac app the top bar is the window's title bar (the `titlebar` utility): it drags the
window, starts after the traffic lights, and keeps its controls clickable. Every page without the
top bar gives its header the same utility. Under `prefers-reduced-transparency` every material becomes solid; under
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
| `{rounded.pill}` | 9999px | Chips, badges, the send button, the local nav's New entry, avatars of people |

## Motion

- Curves (tokens in `globals.css`): `ease-out` `cubic-bezier(0.23, 1, 0.32, 1)` for anything
  entering or leaving, `ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)` for movement on screen,
  `ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)` for sheets from an edge. Never `ease-in` on UI.
  UI motion stays under 300ms.
- Press: the `press` utility, `transform: scale(0.97)` on `:active`, 100ms ease-out, every control.
  It owns the control's transition list; don't add a `transition-*` class next to it.
- Entrance: `animate-rise` (4px, 220ms, ease-out) on top-level blocks. Stagger in 20ms steps and
  cap every delay at 80ms, so a page is fully in within 300ms; list items use
  `Math.min(index, 4) * 20`. `animate-materialize` (blur + scale) for glass surfaces.
- Keyboard-summoned surfaces (the ⌘K palette) open and close with no animation.
- Charts draw at once: no growing bars or lines on load, and tooltips follow the pointer without
  easing behind it.
- Everything clickable shows the pointing-hand cursor; menu items keep the arrow, as native
  menus do.
- Sheets slide fully in from their edge on `ease-drawer` (300ms in, 200ms out) and cross-fade
  under reduced motion.
- Animate `transform` and `opacity`; never `transition-all`, never a layout property on something
  that pushes the page around.
- Anything a person can touch moves on a spring: damping 1.0, response 0.3–0.4 (`motion`'s
  `{ type: "spring", bounce: 0, duration: 0.35 }`). Bounce only follows a flick or a throw.
- Enter and exit along the same path; menus originate from their trigger.
- `prefers-reduced-motion`: entrances become 200ms cross-fades, the ticker stops, nothing slides.

## Components

**Buttons** (`Button`): `default` filled primary (black / white), `secondary` grey, `outline`
hairline with a level-1 shadow, `ghost` for toolbars, `destructive` outline with red text,
`link`, `chip` capsule for filters. Sizes `xs` 24 · `sm` 28 · `default` 32 · `lg` 40; icon sizes
match. Weight 600, 8px corners (10px at `lg`). One filled primary button per view. Inside a
dialog footer, `destructive` is the final confirm and turns solid red on its own: the only solid
red in the interface.

**Inputs** (`Input`, `Select`, `Textarea`): 36px, 8px radius, hairline, 3px blue focus ring at 30% on
focus, 16px text on phones (no zoom).

**Cards** (`Card`): 12px radius, hairline, flat. `muted` for inset grouped panels, `accent` for
the one filled band a view may carry. Titles are `{type.headline}`.

**Tabs** (`Tabs`): `default` is a segmented control on `{colors.fill}`; `line` is the header
tab row with a primary (black / white) underline.

**Badges** (`Badge`): capsules with tints: `secondary`, `success`, `warning`, `destructive`,
`outline`.

**Frame pieces** (`components/app`): `AppFrame`, `Rail`, `TopBar`, `ContentHeader` (the local nav:
title, sync dot, pages, actions), `MobileTabBar`, `HomeSidebar`, `sidebar-parts` (`SidebarItem`, `SidebarSection`,
`SidebarFind`, `LedgerTile`). Ledger pieces (`components/ledger`): `LedgerSidebar`,
`LedgerSwitcher`, `ledger-nav` (the one table of ledger pages). Ask pieces (`components/ask`):
`ChatSidebar`, `ThreadMenu`, `DocumentPanelProvider`, `LedgerAssistant`.

**States** (`components/app/states`): `PageSkeleton` for routes, `CardSkeleton` and
`ListSkeleton` for queries, `LoadingState` for short waits, `ErrorState` with retry, `EmptyState`
with a next step.

## Do's and Don'ts

### Do
- Use the type tokens; never set a font size by hand except the auth hero.
- Put selection and the primary action in `primary` (black / white); keep blue for links and focus only.
- Let content scroll under translucent chrome; keep the chrome thin.
- Give every pending state a skeleton of the right shape, and every button a spinner while its
  request runs.
- Design phone-first: one column, 16px gutters, 44px touch targets, no horizontal page scroll.

### Don't
- Don't add an accent colour or decorate with gradients beyond the auth aurora.
- Don't use heavy borders, drop shadows on resting cards, or dividers under floating bars.
- Don't animate colour on release or use fixed-duration slides for things a person drags.
- Don't stack two light materials, or put colour on a translucent layer.
- Don't render an h1 outside `PageHeader`.

## Responsive behavior

| Name | Width | Key changes |
|---|---|---|
| Wide | ≥ 1280px | Rail, sidebar, content; on Ask, a document preview beside the chat |
| Desktop | 1024–1279px | Rail, sidebar, content |
| Tablet | 768–1023px | Rail and sidebar; document previews in a dialog |
| Phone | < 768px | Tab bar, sidebar sheet, single column, large title at 28px |

Tables scroll horizontally inside `overflow-x-auto`; grids collapse to one column below `lg`;
dialogs take the full width minus 16px gutters on phones.

## Iteration guide
1. Change tokens in `globals.css` first, components second, pages last.
2. Check both themes and a 390px viewport before calling anything done.
3. Add a new control as a variant of an existing primitive before adding a component.
