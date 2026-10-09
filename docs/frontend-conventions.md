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

- Fonts are set globally: sans (IBM Plex Sans), mono (IBM Plex Mono) for account names/source, heading serif only on `h1` (PageHeader). Don't add fonts.
- Colours only through tokens: `text-muted-foreground`, `bg-card`, `text-positive`, `text-negative`, `text-warning`, `bg-surface`, `chart-1…8`. Never raw hex in components.
- Cards: `rounded-xl border bg-card card-elevated` (or shadcn `Card`). Section titles inside cards: `text-sm font-medium`.
- Numbers: always `tabular` (utility class) in tables and lists; `formatNumber(value, precisions[currency] ?? 2)`.
- Entrance motion: `animate-rise` on top-level blocks with staggered `[animation-delay:…ms]`. Nothing else should animate on load.
- Dark mode must work automatically (tokens) — test by toggling the theme button.
- Responsive: grids collapse to one column below `lg`; tables may scroll horizontally inside `overflow-x-auto`.
- Empty states say what to do next (link to Import, Editor, Ask).
- Accessibility: every icon-only button has `aria-label`; tables have header rows; interactive rows are buttons or links.

## Tooling

- `pnpm exec tsc --noEmit` and `pnpm lint` must pass. No new dependencies (Monaco is already installed: `@monaco-editor/react`).
- Do not edit `src/lib/api/hooks.ts`, `types.ts`, `components/ui/*`, `components/assistant-ui/*`, or another page group's files. If a hook is missing, write a local `useQuery` with `apiGet` inside your page/component files.
- The local shell guard blocks commands containing the words `truncate ` or `drop database`; write files with the Write tool, not heredocs.
