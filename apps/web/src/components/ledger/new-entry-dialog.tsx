"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountCombobox } from "@/components/ledger/account-combobox";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, errorMessage } from "@/lib/api/client";
import { ledgerPath, useAddEntries } from "@/lib/api/hooks";
import type { Entry } from "@/lib/api/types";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "Transaction" | "Balance" | "Note" | "Open" | "Close" | "Pad" | "Price" | "Event" | "Commodity" | "Budget";

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "Transaction", label: "Transaction" },
  { id: "Balance", label: "Balance" },
  { id: "Note", label: "Note" },
  { id: "Open", label: "Open" },
  { id: "Close", label: "Close" },
  { id: "Pad", label: "Pad" },
  { id: "Price", label: "Price" },
  { id: "Event", label: "Event" },
  { id: "Commodity", label: "Commodity" },
  { id: "Budget", label: "Budget" },
];

interface PostingDraft {
  id: number;
  account: string;
  amount: string;
}

let postingSeq = 0;
const newPosting = (account = "", amount = ""): PostingDraft => ({ id: ++postingSeq, account, amount });

/** Parse "12.50 USD" -> { number, currency }; returns null when incomplete. */
function parseAmount(text: string): { number: number; currency: string } | null {
  const match = text.trim().match(/^([-+]?\d[\d,]*(?:\.\d+)?)\s+([A-Z][A-Z0-9'._-]*)$/);
  if (!match) return null;
  return { number: Number(match[1]!.replace(/,/g, "")), currency: match[2]! };
}

function balanceSummary(postings: PostingDraft[]): { byCurrency: Record<string, number>; blank: number } {
  const byCurrency: Record<string, number> = {};
  let blank = 0;
  for (const p of postings) {
    if (!p.amount.trim()) {
      blank += 1;
      continue;
    }
    const amt = parseAmount(p.amount.replace(/\{.*$|@.*$/, "").trim());
    if (amt) byCurrency[amt.currency] = (byCurrency[amt.currency] ?? 0) + amt.number;
  }
  return { byCurrency, blank };
}

interface NewEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind?: Kind;
  initialAccount?: string;
  onCreated?: (hashes: string[]) => void;
}

export function NewEntryDialog(props: NewEntryDialogProps) {
  // A fresh form per opening (and per initial kind/account) instead of resetting state in effects.
  return <NewEntryForm key={`${props.open}:${props.initialKind ?? ""}:${props.initialAccount ?? ""}`} {...props} />;
}

function NewEntryForm({ open, onOpenChange, initialKind = "Transaction", initialAccount, onCreated }: NewEntryDialogProps) {
  const { workspace, slug, meta, attributes, precisions } = useLedgerContext();
  const addEntries = useAddEntries(workspace, slug);
  const currency = meta?.operatingCurrencies[0] ?? "USD";

  const [kind, setKind] = useState<Kind>(initialKind);
  const [date, setDate] = useState(todayIso());
  const [flag, setFlag] = useState<"*" | "!">("*");
  const [payee, setPayee] = useState("");
  const [narration, setNarration] = useState("");
  const [tags, setTags] = useState("");
  const [postings, setPostings] = useState<PostingDraft[]>([newPosting(initialAccount ?? ""), newPosting()]);
  const [account, setAccount] = useState(initialAccount ?? "");
  const [secondAccount, setSecondAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [commodity, setCommodity] = useState("");

  // Autofill accounts from the payee's last transaction, as Fava does.
  useEffect(() => {
    const trimmed = payee.trim();
    if (kind !== "Transaction" || !trimmed || !attributes?.payees.includes(trimmed)) return;
    let cancelled = false;
    apiGet<Entry | null>(`${ledgerPath(workspace, slug)}/payees/${encodeURIComponent(trimmed)}/transaction`)
      .then((entry) => {
        if (cancelled || !entry?.postings) return;
        setPostings((current) => {
          if (current.some((p) => p.account || p.amount)) return current;
          return entry.postings!.map((p) => newPosting(p.account, ""));
        });
        if (!narration && entry.narration) setNarration(entry.narration);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [payee, kind, attributes, workspace, slug, narration]);

  const summary = useMemo(() => balanceSummary(postings), [postings]);
  const unbalanced = Object.entries(summary.byCurrency).filter(([, v]) => Math.abs(v) > 0.000001);
  const balanced = summary.blank > 0 || unbalanced.length === 0;

  function reset() {
    setPayee("");
    setNarration("");
    setTags("");
    setPostings([newPosting(), newPosting()]);
    setAccount("");
    setSecondAccount("");
    setAmount("");
    setText("");
    setCommodity("");
  }

  function buildEntry(): Record<string, unknown> {
    const base = { date };
    switch (kind) {
      case "Transaction":
        return {
          ...base,
          type: "Transaction",
          flag,
          payee: payee.trim(),
          narration: narration.trim(),
          tags: tags.split(/[\s,]+/).filter(Boolean),
          postings: postings.filter((p) => p.account.trim()).map((p) => ({ account: p.account.trim(), amount: p.amount.trim() })),
        };
      case "Balance":
        return { ...base, type: "Balance", account, amount: amount.trim() };
      case "Note":
        return { ...base, type: "Note", account, comment: text.trim() };
      case "Open":
        return { ...base, type: "Open", account: account.trim(), currencies: commodity.split(/[\s,]+/).filter(Boolean) };
      case "Close":
        return { ...base, type: "Close", account };
      case "Pad":
        return { ...base, type: "Pad", account, sourceAccount: secondAccount };
      case "Price":
        return { ...base, type: "Price", currency: commodity.trim().toUpperCase(), amount: amount.trim() };
      case "Event":
        return { ...base, type: "Event", eventType: commodity.trim(), description: text.trim() };
      case "Commodity":
        return { ...base, type: "Commodity", currency: commodity.trim().toUpperCase() };
      case "Budget":
        return { ...base, type: "Budget", account, period, amount: amount.trim() };
    }
  }

  async function submit(keepOpen: boolean) {
    const entry = buildEntry();
    if (kind === "Transaction" && (entry.postings as unknown[]).length < 1) {
      toast.error("Add at least one posting");
      return;
    }
    try {
      const result = await addEntries.mutateAsync({ entries: [entry] });
      const newErrors = result.errors.length;
      toast.success(newErrors ? `Saved, but the ledger now has ${newErrors} error${newErrors === 1 ? "" : "s"}` : `${kind} saved`, {
        description: result.commit ? `Commit ${result.commit.slice(0, 7)}` : undefined,
      });
      onCreated?.(result.entryHashes);
      reset();
      if (!keepOpen) onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const amountPlaceholder = `0.00 ${currency}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="type-title-2">New entry</DialogTitle>
          <DialogDescription>Written to the ledger&apos;s default file and committed immediately.</DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {KINDS.map((k) => (
              <TabsTrigger key={k.id} value={k.id} className="rounded-full border px-3 data-[state=active]:border-primary data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                {k.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="grid grid-cols-[9.5rem_1fr] gap-3">
            <Field>
              <FieldLabel htmlFor="entry-date">Date</FieldLabel>
              <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="font-mono" />
            </Field>
            {kind === "Transaction" && (
              <Field>
                <FieldLabel>Flag</FieldLabel>
                <div className="flex gap-1">
                  {(["*", "!"] as const).map((f) => (
                    <Button key={f} type="button" variant={flag === f ? "secondary" : "outline"} size="sm" onClick={() => setFlag(f)} className="font-mono">
                      {f} <span className="font-sans text-xs text-muted-foreground">{f === "*" ? "cleared" : "pending"}</span>
                    </Button>
                  ))}
                </div>
              </Field>
            )}
            {(kind === "Price" || kind === "Commodity") && (
              <Field>
                <FieldLabel htmlFor="entry-commodity">Commodity</FieldLabel>
                <Input id="entry-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="AAPL" className="font-mono uppercase" required list="entry-commodities" />
                <datalist id="entry-commodities">{attributes?.currencies.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
            )}
            {kind === "Event" && (
              <Field>
                <FieldLabel htmlFor="entry-event-type">Event type</FieldLabel>
                <Input id="entry-event-type" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="location" required />
              </Field>
            )}
            {kind === "Budget" && (
              <Field>
                <FieldLabel>Period</FieldLabel>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["daily", "weekly", "monthly", "quarterly", "yearly"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {kind === "Transaction" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="entry-payee">Payee</FieldLabel>
                  <Input id="entry-payee" value={payee} onChange={(e) => setPayee(e.target.value)} list="entry-payees" placeholder="Blue Bottle" />
                  <datalist id="entry-payees">{attributes?.payees.slice(0, 500).map((p) => <option key={p} value={p} />)}</datalist>
                </Field>
                <Field>
                  <FieldLabel htmlFor="entry-narration">Narration</FieldLabel>
                  <Input id="entry-narration" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Flat white" />
                </Field>
              </div>
              <FieldGroup>
                <div className="flex items-center justify-between">
                  <FieldLabel>Postings</FieldLabel>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setPostings((p) => [...p, newPosting()])}>
                    <PlusIcon data-icon="inline-start" /> Add posting
                  </Button>
                </div>
                <div className="space-y-2">
                  {postings.map((posting, i) => (
                    <div key={posting.id} className="grid grid-cols-[1fr_11rem_2rem] items-center gap-2">
                      <AccountCombobox value={posting.account} onChange={(value) => setPostings((all) => all.map((p) => (p.id === posting.id ? { ...p, account: value } : p)))} placeholder={i === 0 ? "Expenses:…" : "Assets:… (leave amount blank to auto-balance)"} />
                      <Input
                        value={posting.amount}
                        onChange={(e) => setPostings((all) => all.map((p) => (p.id === posting.id ? { ...p, amount: e.target.value } : p)))}
                        placeholder={i === postings.length - 1 ? "auto" : amountPlaceholder}
                        className="font-mono text-right"
                        aria-label="Amount"
                      />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove posting" disabled={postings.length <= 1} onClick={() => setPostings((all) => all.filter((p) => p.id !== posting.id))}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                </div>
                <FieldDescription className={cn(!balanced && "text-negative")}>
                  {balanced
                    ? summary.blank > 0
                      ? `${summary.blank} posting${summary.blank === 1 ? "" : "s"} will auto-balance.`
                      : "Postings balance to zero."
                    : `Postings do not balance: ${unbalanced.map(([c, v]) => `${v.toFixed(precisions[c] ?? 2)} ${c}`).join(", ")}. Leave one amount blank to auto-balance.`}
                </FieldDescription>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="entry-tags">Tags</FieldLabel>
                <Input id="entry-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trip-2026 reimbursable" />
              </Field>
            </>
          )}

          {(kind === "Balance" || kind === "Note" || kind === "Close" || kind === "Pad" || kind === "Budget") && (
            <Field>
              <FieldLabel>Account</FieldLabel>
              <AccountCombobox value={account} onChange={setAccount} />
            </Field>
          )}
          {kind === "Open" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <Field>
                <FieldLabel htmlFor="entry-open-account">Account name</FieldLabel>
                <Input id="entry-open-account" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Expenses:Food:Coffee" className="font-mono" required pattern="[A-Z][A-Za-z0-9\-]*(:[A-Z0-9][A-Za-z0-9\-]*)+" />
                <FieldDescription>Capitalised segments separated by colons.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="entry-open-currencies">Currencies</FieldLabel>
                <Input id="entry-open-currencies" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder={`${currency} (optional)`} className="font-mono uppercase" />
              </Field>
            </div>
          )}
          {kind === "Pad" && (
            <Field>
              <FieldLabel>Pad from</FieldLabel>
              <AccountCombobox value={secondAccount} onChange={setSecondAccount} placeholder="Equity:Opening-Balances" />
            </Field>
          )}
          {(kind === "Balance" || kind === "Price" || kind === "Budget") && (
            <Field>
              <FieldLabel htmlFor="entry-amount">Amount</FieldLabel>
              <Input id="entry-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={amountPlaceholder} className="font-mono" required />
            </Field>
          )}
          {(kind === "Note" || kind === "Event") && (
            <Field>
              <FieldLabel htmlFor="entry-text">{kind === "Note" ? "Comment" : "Description"}</FieldLabel>
              <Textarea id="entry-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} required />
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {kind === "Transaction" && (
              <Button type="button" variant="outline" disabled={addEntries.isPending} onClick={() => void submit(true)}>
                Save &amp; add another
              </Button>
            )}
            <Button type="submit" disabled={addEntries.isPending}>
              {addEntries.isPending && <Spinner className="size-4" data-icon="inline-start" />}
              Save {kind.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
