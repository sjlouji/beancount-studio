# ADR 0003: The web app speaks Apple's design language inside Slack's frame

**Status:** Accepted · 2026-10-20 · amended 2026-11-04 (monochrome palette, see the end)

## Context

The first design system (aubergine primary, cream and lavender canvases, pill buttons, Inter)
read as a marketing site more than a working tool, and the app's layout was a loose mix of a
top bar and a sidebar. The product direction is a web app plus a Mac app that loads it (ADR
0001), used for hours at a time, on laptops first and phones second. The request was explicit:
layouts like Slack, design language like Apple, both themes Apple, loaders everywhere, and a
responsive application.

## Decision

- **Language: Apple's**, as distilled in Apple's WWDC design talks for the web. The platform's
  system face (SF where it exists, Inter elsewhere) with size-specific tracking; a 15px body and
  an Apple text scale; one system accent (blue) for selection, links, focus and the primary
  button; grouped greys for surfaces; translucent materials for bars and popovers with content
  moving underneath; soft three-level depth; press feedback on pointer-down; critically damped
  springs for anything that moves; cross-fades and solid surfaces under the reduced-motion and
  reduced-transparency preferences. The aubergine remains only in the brand mark.
- **Frame: Slack's.** A full-width top bar with the search field in the middle and history
  controls on the left; a 72px rail for Home and, inside a ledger, its sections (Overview,
  Reports, Capture, Data, Repository); a 240px sidebar (280px until 2026-11-04) with a switcher, a find field and the
  pages of the section picked in the rail;
  a content header with the ledger's title, actions and a tab row of the current section's
  pages; the assistant opens from the rail into a right-hand panel, Slack's thread panel, so
  the report stays visible while you ask about it (superseded 2026-11-04: Ask is a full page, see the amendment). Below 768px the rail and sidebar fold into a bottom tab bar and a
  sheet; the panel becomes a bottom sheet.
- **Themes.** Dark is the Slack-dark canvas (`#1a1d21`, `#222529`, light hairlines) with Apple's
  dark-mode colours; light is white with Apple's greys. Both follow the system by default.
- **Loaders.** Every route group has a `loading.tsx`; every query a skeleton of its shape; every
  mutation a spinner in its button; the ledger shell itself has a skeleton silhouette.
- **One navigation table.** `ledger-nav.ts` feeds the sidebar, the header tabs and the mobile
  tab bar, so adding a page is one entry.

## Consequences

- `DESIGN.md` and `docs/frontend-conventions.md` are rewritten; the old type tiers, the aubergine
  button variants, the cream and aubergine card variants and the pastel mesh are gone.
- The shadcn primitives keep their APIs and change only their classes, so pages needed token and
  class migrations rather than rewrites.
- The system font means the app looks native on Apple devices and falls back to Inter elsewhere;
  type metrics differ slightly between the two, which the scale tolerates.
- The Ask panel reuses the assistant runtime and continues the latest conversation. The
  full-page assistant remains for history. A composer docked at the bottom of every ledger page
  was tried and dropped the same day: it cost every report a permanent strip at the bottom.
- The ledger sidebar first held every section as collapsible groups plus the person's other
  ledgers. The same day the sections moved to the rail, the sidebar became one flat page list,
  and the ledgers list left it: the switcher at the top already changes ledger.
- The desktop shell's own connect screen is outside this change and keeps its small static style.

## Amendment 2026-11-04: Apple monochrome

The blue accent and the Slack-dark canvas gave way to a black-and-white palette, as on Apple's
and SpaceX's product sites. `--primary` is near-black in light and white in dark and still marks
the primary action and every selected state; blue survives only as `--link` and `--ring`, so it
always means "you can go there" or "you are here". Dark is true black (`#000`) with near-black
lifted surfaces. Green, red and orange keep their meanings for money and warnings. Delete-style
buttons are outline buttons with red text (grey with red text missed 4.5:1 contrast); solid red
is reserved for the confirm button inside a dialog footer. The design system in Claude
("Beancount Studio") holds the same tokens and a spec page per component; the connect screen of
the desktop shell now mirrors these tokens too.

## Amendment 2026-11-04: Ask is a full page

The right-hand Ask panel is gone. Ask is one full page laid out like Claude's chat: the sidebar
becomes the conversation list (new chat, search, starred and recent conversations, and the files
the assistant made), each conversation can be starred, renamed or deleted, and a document's
preview opens beside the chat. One place to chat keeps the experience simple; the panel duplicated
the page in a narrower, harder-to-use form.

