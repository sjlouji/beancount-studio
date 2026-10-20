> **Design system:** [`DESIGN.md`](../DESIGN.md) at the repo root defines colours, type,
> shapes and components. This file covers app-specific patterns; `DESIGN.md` wins on conflicts.

# Frontend conventions (apps/web)

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · shadcn/ui (radix-nova preset) · TanStack Query · Recharts · assistant-ui.

## Layout of the code

```
src/app/(auth)/…                      login, sign-up, forgot/reset password
src/app/(app)/(home)/…                /ledgers, /settings/*, /u/[username]   (AppFrame + HomeSidebar)
src/app/(app)/ledger/[owner]/[slug]/… every ledger page                                  (AppFrame + rail sections + LedgerSidebar, header tabs, Ask panel)
src/components/ui/*                   shadcn primitives, restyled to DESIGN.md (tokens only; keep their APIs)
src/components/assistant-ui/*         assistant-ui registry components (do not edit)
src/components/app/*                  the frame (AppFrame, Rail, TopBar, ContentHeader, MobileTabBar, HomeSidebar, sidebar-parts, home-search), PageHeader, states, Amount, theme toggle, user menu, command palette
src/components/ledger/*               ledger pieces: context (incl. the Ask panel state), shell, sidebar, ledger-nav (one table of pages), ask-panel, filter bar, hierarchy table, entry cards/sheet, diff view, dialogs
src/components/charts/*               Recharts wrappers + chart primitives (palette, tooltip, legend)
src/lib/api/client.ts                 api(), apiGet/apiPost/apiPut/apiPatch/apiDelete, ApiError, errorMessage()
src/lib/api/types.ts                  every API response type
src/lib/api/hooks.ts                  TanStack Query hooks (useOverview, useJournal, useFileTree, …) + `keys` + ledgerPath()
src/lib/format.ts                     formatNumber/formatAmount/formatCompact/formatDate/formatRelative/accountLeaf/…
```

The Python API is proxied at `/api/*` (same origin, cookie auth). All ledger endpoints are under
`/api/ledgers/{owner}/{slug}/…` — see `apps/api/app/routers/*.py` for the exact routes and
`apps/api/app/ledgers/engine.py` for report payload shapes (mirrored in `types.ts`).

## Page skeleton

Every ledger page is a client component that reads the shared context:

```tsx
"use client";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { useIncomeStatement } from "@/lib/api/hooks";

export default function Page() {
  const { owner, slug, params, conversion, precisions, invert, base, queryString, canWrite } = useLedgerContext();
  const query = useIncomeStatement(owner, slug, { ...params, conversion });
  if (query.isPending) return <CardSkeleton rows={8} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reports" title="Income statement" description="…" actions={…} />
      …
    </div>
  );
}
```

- `params` are the shared URL filters (`time`, `account`, `filter`, `conversion`, `interval`); the
  filter bar in the header already edits them. Pass `{ ...params, conversion }` to report hooks.
- `href(path, extra?)` / `queryString` keep the shared filters when linking between ledger pages.
  Use `accountHref(base, account, queryString)` for account links.
- Writes: use the mutation hooks (`useAddEntries`, `useUpdateEntry`, …) or `apiPost` + `useInvalidateLedger(owner, slug)()` afterwards. Show `toast.success/error` (sonner) with `errorMessage(err)`.
- Gate write UI on `canWrite`.
- Dynamic route params in pages: `({ params }: { params: Promise<{ account: string }> })` + `use(params)`.
  Account names in URLs are `encodeURIComponent` per segment joined with `:`; decode with `decodeURIComponent`.

## Building blocks to reuse (don't reinvent)

| Need | Use |
| --- | --- |
| Page title block | `PageHeader` (eyebrow/title/description/actions) |
| Loading / error / empty | `PageSkeleton` (route `loading.tsx`), `CardSkeleton`, `ListSkeleton`, `LoadingState`, `ErrorState`, `EmptyState` from `components/app/states` |
| A new ledger page (rail section, sidebar, header tabs, palette) | add it to `LEDGER_SECTIONS` in `components/ledger/ledger-nav.ts`; nothing else to wire |
| Sidebar rows and sections | `SidebarItem`, `SidebarSection`, `SidebarFind`, `LedgerTile` from `components/app/sidebar-parts` |
| Opening the assistant | `openAsk()` from `useLedgerContext()`; the rail and the phone tab bar call it |
| Amounts | `Amount` (single) and `BalanceAmounts` (map of unit → number) — `precisions` from context, `invert` for income/liabilities/equity when `invert` is true, `colored` for sign colours |
| Tree reports (statements) | `HierarchyTable` (`root`, `title`, `invert`, `summaryRows`, `initialDepth`) + `addBalances`/`negate` |
| Charts | `BalanceLineChart` (DateBalance[] series), `IntervalBarChart` (IntervalTotal[], `mode="single"|"stacked"`), `HierarchyTreemap` (TreeNode) and primitives in `chart-primitives.tsx` (`seriesColor(i)`, `ChartTooltipCard`, `ChartLegend`, `ChartEmpty`) |
| Journal entries | `EntryCard` (one entry with postings), `EntryContextSheet` (view/edit/delete by hash), `EntryBadgeList` |
| Account picker | `AccountCombobox` |
| Diffs | `DiffView` (unified diff string) |
| New directive dialog | `NewEntryDialog` (`initialKind`, `initialAccount`, `onCreated`) |
| Tables | shadcn `Table` components; numeric cells `className="tabular text-right"`; mono account names `font-mono text-[13px]` |

## Design rules

`DESIGN.md` is the system; these are the app-specific applications of it.

- The frame is `AppFrame`: top bar, rail, sidebar, content column, optional right panel, mobile
  tab bar. Pages render inside the content column and never add their own chrome. Ledger pages
  get the `ContentHeader` (title, route-derived tabs, filter toolbar) and the `AskPanel` beside them.
  Inside a ledger the rail carries the sections and the sidebar the current section's pages; the
  phone sheet shows rail and sidebar side by side.
- The frame's scroll containers (content column, sidebars) are `relative`. Absolutely positioned
  content such as `sr-only` labels and dialog headers is then clipped by the scroller instead of
  landing in document coordinates and making the whole page scroll under the frame.
- Every route group has a `loading.tsx` rendering `PageSkeleton`; every query renders a skeleton
  of the right shape while pending; every mutation shows a spinner in its button and a toast on
  error. Nothing waits silently.

- Fonts are set globally: the system face (SF on Apple devices, Inter elsewhere) for everything,
  the system monospace for account names and ledger source. Type tiers are utilities:
  `type-large-title`, `type-title-1|2|3`, `type-headline`, `type-body`, `type-callout`,
  `type-subhead`, `type-footnote`, `type-caption`, `type-caption-2` (uppercase eyebrows and
  group labels).
- Colours only through tokens: `bg-primary` (the accent, one filled button per view),
  `bg-secondary` (accent wash with `text-secondary-foreground`), `bg-muted` / `bg-surface`
  (grouped grey), `bg-fill` / `bg-fill-secondary` (search fields, segmented controls, skeletons),
  `border` (hairline), `text-muted-foreground`, `text-link`, `text-positive` / `text-negative` /
  `text-warning`, `chart-1…8`. The frame uses `bg-sidebar`, `text-sidebar-foreground`,
  `text-sidebar-muted`, `bg-sidebar-accent`, `bg-sidebar-primary` (selected row) and `bg-rail`.
  Never raw hex in components.
- Buttons: rounded rectangles. `default` is the filled accent button, `secondary` the tinted one,
  `outline` the hairline control, `ghost` for toolbars, `chip` the capsule filter. `size="lg"` for
  the one primary action of a view (PageHeader actions, submit buttons); `default`, `sm`, `xs`
  for toolbars and tables. Press feedback is built in; do not add hover colour flashes.
- Inline links: the `link` utility (accent, underline on hover).
- Cards: shadcn `Card` (12px radius, hairline, flat). `variant="muted"` for inset grouped
  panels, `variant="accent"` for the one filled band a view may carry. Titles are
  `type-headline`.
- Stat tiles: numerals in `type-title-1 tabular text-primary`.
- Elevation: cards and tables are flat. `shadow-xs` on outline buttons, `shadow-md` on menus and
  popovers, `shadow-lg` on dialogs and sheets; nothing else casts a shadow.
- Radii: controls `rounded-lg` (8px via the token scale), cards and menus `rounded-xl` (12px),
  sheets `rounded-2xl`, dialogs `rounded-3xl`, chips and badges `rounded-full`.
- Materials: `material-bar` for sticky bars inside a scroll container, `material-popover` for
  menus, `material-thick` for dialogs and sheets. Content must actually scroll under a material;
  otherwise use a solid token.
- Public surfaces (auth pages) use the `aurora` backdrop; data pages stay on plain canvas.
- Numbers: always `tabular` (utility class) in tables and lists; `formatNumber(value, precisions[currency] ?? 2)`.
- Entrance motion: `animate-rise` on top-level blocks with staggered `[animation-delay:…ms]`. Nothing else should animate on load. Anything a person can drag or toggle moves on a `motion` spring with `bounce: 0`; check `useReducedMotion()` and fall back to a fade.
- Dark mode is derived from the aubergine surface tokens and must work automatically — test by toggling the theme button.
- Responsive: grids collapse to one column below `lg`; tables may scroll horizontally inside `overflow-x-auto`; below `md` the frame shows the tab bar, so pages leave the bottom 6rem free (the frame pads it) and keep 44px touch targets.
- Empty states say what to do next (link to Import, Editor, Ask).
- Accessibility: every icon-only button has `aria-label`; tables have header rows; interactive rows are buttons or links.

## Tooling

- `pnpm exec tsc --noEmit` and `pnpm lint` must pass. No new dependencies (Monaco is already installed: `@monaco-editor/react`).
- Do not edit `src/lib/api/hooks.ts`, `types.ts`, or another page group's files. `components/ui/*` and `components/assistant-ui/*` are themed to `DESIGN.md`; change them only to keep them on the system. If a hook is missing, write a local `useQuery` with `apiGet` inside your page/component files.
- The local shell guard blocks commands containing the words `truncate ` or `drop database`; write files with the Write tool, not heredocs.
