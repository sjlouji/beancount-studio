> **Design system:** [`DESIGN.md`](../DESIGN.md) at the repo root defines colours, type,
> shapes and components. This file covers app-specific patterns; `DESIGN.md` wins on conflicts.

# Frontend conventions (apps/web)

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · shadcn/ui (radix-nova preset) · TanStack Query · Recharts · assistant-ui.

## Layout of the code

```
src/app/(auth)/…                      login, sign-up, forgot/reset password
src/app/(app)/(home)/…                /ledgers, /gallery, /settings/*, /u/[username]   (top-bar layout)
src/app/(app)/ledger/[owner]/[slug]/… every ledger page                                  (sidebar shell)
src/components/ui/*                   shadcn primitives (do not edit)
src/components/assistant-ui/*         assistant-ui registry components (do not edit)
src/components/app/*                  app-wide pieces: PageHeader, states, Amount, theme toggle, user menu, command palette
src/components/ledger/*               ledger pieces: context, shell, sidebar, filter bar, hierarchy table, entry cards/sheet, diff view, dialogs
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
| Loading / error / empty | `CardSkeleton`, `LoadingState`, `ErrorState`, `EmptyState` from `components/app/states` |
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

- Fonts are set globally: Inter for everything (the display and UI tiers), IBM Plex Mono for
  account names and ledger source. No serif, no other fonts. Type tiers are utilities:
  `type-display-xxl|xl|lg|md`, `type-heading-lg|md|sm`, `type-body-lg|md|strong`, `type-caption`,
  `type-micro-cap` (uppercase eyebrows and section labels).
- Colours only through tokens: `bg-primary` (aubergine, filled CTAs only), `bg-secondary` /
  `bg-accent` (lavender), `bg-muted` / `bg-canvas-cream` (cream bands), `border` (hairline),
  `text-muted-foreground` (ink mute), `text-link`, `text-positive` / `text-negative` (success /
  error), `text-warning` (a semantic extension for pending states), `chart-1…8`. The aubergine
  frame uses `bg-sidebar`, `text-sidebar-foreground`, `text-sidebar-muted`, `bg-sidebar-accent`.
  Never raw hex in components.
- Buttons: every button is a pill. `size="lg"` is the standard 16px / 14×28 pill, reserved for
  the one filled aubergine CTA per view (PageHeader actions, submit buttons). `default`, `sm`,
  `xs` are the compact pills for toolbars and tables. `secondary` is the lavender pill, `outline`
  the 2px aubergine outline. On the aubergine frame use `outline-on-aubergine` /
  `ghost-on-aubergine`.
- Inline links: the `link` utility (link blue, underline on hover). Never aubergine text links.
- Cards: `rounded-xl border bg-card` or shadcn `Card` (flat, hairline border, no shadow).
  `Card variant="cream"` for feature bands, `variant="aubergine"` for closing CTA bands.
  Section titles inside cards: `text-base font-semibold`.
- Stat tiles: numerals in `type-display-md text-primary` on white ({card-stat}).
- Elevation: cards and tables are flat. `shadow-sm` / `shadow-md` / `shadow-lg` map to DESIGN.md
  levels 1–3 and are reserved for floating chrome (menus, dialogs, toasts, tooltips).
- Radii: inputs 4px (`rounded-sm`), menus 8px (`rounded-md`), panes 12px (`rounded-lg`), cards
  16px (`rounded-xl`), buttons and badges `rounded-full`.
- Public and hero surfaces (auth pages, gallery band) use the `pastel-mesh` backdrop and the
  aubergine band; data pages stay on plain canvas.
- Numbers: always `tabular` (utility class) in tables and lists; `formatNumber(value, precisions[currency] ?? 2)`.
- Entrance motion: `animate-rise` on top-level blocks with staggered `[animation-delay:…ms]`. Nothing else should animate on load.
- Dark mode is derived from the aubergine surface tokens and must work automatically — test by toggling the theme button.
- Responsive: grids collapse to one column below `lg`; tables may scroll horizontally inside `overflow-x-auto`.
- Empty states say what to do next (link to Import, Editor, Ask).
- Accessibility: every icon-only button has `aria-label`; tables have header rows; interactive rows are buttons or links.

## Tooling

- `pnpm exec tsc --noEmit` and `pnpm lint` must pass. No new dependencies (Monaco is already installed: `@monaco-editor/react`).
- Do not edit `src/lib/api/hooks.ts`, `types.ts`, or another page group's files. `components/ui/*` and `components/assistant-ui/*` are themed to `DESIGN.md`; change them only to keep them on the system. If a hook is missing, write a local `useQuery` with `apiGet` inside your page/component files.
- The local shell guard blocks commands containing the words `truncate ` or `drop database`; write files with the Write tool, not heredocs.
