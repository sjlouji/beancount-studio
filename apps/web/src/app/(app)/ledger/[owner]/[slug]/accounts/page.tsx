"use client";

import { ListTreeIcon, PlusIcon, SearchIcon, TableIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { AccountsTable, type AccountsViewMode } from "@/components/data/accounts-table";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { NewEntryDialog } from "@/components/ledger/new-entry-dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccounts } from "@/lib/api/hooks";
import { pluralize } from "@/lib/format";

interface DialogState {
  kind: "Open" | "Close" | "Transaction";
  account?: string;
}

export default function AccountsPage() {
  const { owner, slug, params, canWrite } = useLedgerContext();
  const accounts = useAccounts(owner, slug, params);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [mode, setMode] = useState<AccountsViewMode>("tree");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sourceHash, setSourceHash] = useState<string | null>(null);

  const tokens = useMemo(() => search.toLowerCase().split(/\s+/).filter(Boolean), [search]);
  const visible = useMemo(() => {
    return (accounts.data ?? []).filter((a) => (showClosed || !a.closedAt) && tokens.every((token) => a.account.toLowerCase().includes(token)));
  }, [accounts.data, showClosed, tokens]);

  const closedCount = accounts.data?.filter((a) => a.closedAt).length ?? 0;
  const openAccountButton = canWrite ? (
    <Button onClick={() => setDialog({ kind: "Open" })}>
      <PlusIcon data-icon="inline-start" /> Open account
    </Button>
  ) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title="Every account, open and closed"
        description="Balances, currencies and the last entry for each account in scope. A green dot means the latest entry is a passing balance assertion."
        actions={openAccountButton}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 animate-rise [animation-delay:80ms]">
        <InputGroup className="w-full max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search accounts, e.g. expenses food" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search accounts" />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Switch id="show-closed" checked={showClosed} onCheckedChange={setShowClosed} />
          <Label htmlFor="show-closed" className="text-sm font-normal">
            Show closed{closedCount > 0 && <span className="ml-1 text-muted-foreground">({closedCount})</span>}
          </Label>
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as AccountsViewMode)} aria-label="View" className="ml-auto">
          <ToggleGroupItem value="tree" aria-label="Tree view">
            <ListTreeIcon /> Tree
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            <TableIcon /> Table
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {accounts.isPending ? (
        <CardSkeleton rows={10} />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Accounts exist once you open them with an `open` directive. Open your first account to start recording transactions."
          action={openAccountButton}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No accounts match" description={`Nothing matches the current search${showClosed ? "" : " among open accounts. Try enabling “Show closed”"}.`} />
      ) : (
        <div className="space-y-2 animate-rise [animation-delay:140ms]">
          <AccountsTable
            accounts={visible}
            mode={mode}
            forceOpen={tokens.length > 0}
            onNewEntry={(account) => setDialog({ kind: "Transaction", account })}
            onCloseAccount={(account) => setDialog({ kind: "Close", account })}
            onViewSource={setSourceHash}
          />
          <p className="px-1 text-xs text-muted-foreground">
            {pluralize(visible.length, "account")} shown
          </p>
        </div>
      )}

      {dialog && (
        <NewEntryDialog
          key={`${dialog.kind}:${dialog.account ?? ""}`}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          initialKind={dialog.kind}
          initialAccount={dialog.account}
        />
      )}
      <EntryContextSheet entryHash={sourceHash} onOpenChange={(open) => !open && setSourceHash(null)} />
    </div>
  );
}
