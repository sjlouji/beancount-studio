"use client";

import { ReceiptIcon, WalletIcon } from "lucide-react";
import { AccountCombobox } from "@/components/ledger/account-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ReceiptParse } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReceiptFormValues {
  date: string;
  payee: string;
  narration: string;
  amount: string;
  currency: string;
  expenseAccount: string;
  paymentAccount: string;
  tags: string;
  attachFile: boolean;
}

export function parseTags(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean);
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Shimmering placeholder shown while the model reads the receipt. */
export function ReadingReceipt() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 rounded-xl border bg-card p-5 card-elevated">
      <div className="shimmer flex items-center gap-2 text-sm font-medium text-muted-foreground motion-reduce:animate-none">
        <Spinner className="size-4" /> Reading receipt…
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="shimmer h-9 rounded-md bg-muted motion-reduce:animate-none" style={{ width: `${100 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

export function ReceiptForm({
  values,
  onChange,
  receipt,
  hasUpload,
  submitting,
  invalid,
  onSubmit,
}: {
  values: ReceiptFormValues;
  onChange: (patch: Partial<ReceiptFormValues>) => void;
  receipt: ReceiptParse["receipt"] | null;
  hasUpload: boolean;
  submitting: boolean;
  invalid: string | null;
  onSubmit: () => void;
}) {
  const set = <K extends keyof ReceiptFormValues>(key: K) => (value: ReceiptFormValues[K]) => onChange({ [key]: value });
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5 card-elevated"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h2 className="text-sm font-medium">Transaction</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="r-date">
          <Input id="r-date" type="date" value={values.date} onChange={(e) => set("date")(e.target.value)} className="tabular" required />
        </Field>
        <Field label="Payee" htmlFor="r-payee">
          <Input id="r-payee" value={values.payee} onChange={(e) => set("payee")(e.target.value)} />
        </Field>
        <Field label="Narration" htmlFor="r-narration" className="sm:col-span-2">
          <Input id="r-narration" value={values.narration} onChange={(e) => set("narration")(e.target.value)} />
        </Field>
        <Field label="Total" htmlFor="r-amount">
          <Input id="r-amount" inputMode="decimal" value={values.amount} onChange={(e) => set("amount")(e.target.value)} className="text-right font-mono tabular" placeholder="0.00" required />
        </Field>
        <Field label="Currency" htmlFor="r-currency">
          <Input id="r-currency" value={values.currency} onChange={(e) => set("currency")(e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={24} required />
        </Field>
        <Field label="Expense account" htmlFor="r-expense">
          <AccountCombobox id="r-expense" value={values.expenseAccount} onChange={set("expenseAccount")} placeholder="Expenses:…" icon={<ReceiptIcon className="size-3.5 text-muted-foreground" />} />
        </Field>
        <Field label="Payment account" htmlFor="r-payment">
          <AccountCombobox id="r-payment" value={values.paymentAccount} onChange={set("paymentAccount")} placeholder="Assets or Liabilities…" icon={<WalletIcon className="size-3.5 text-muted-foreground" />} />
        </Field>
        <Field label="Tags" htmlFor="r-tags" className="sm:col-span-2">
          <Input id="r-tags" value={values.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="trip-2025, reimbursable" />
        </Field>
      </div>

      {hasUpload && (
        <div className="flex items-start gap-3 rounded-lg border bg-surface p-3">
          <Switch id="r-attach" checked={values.attachFile} onCheckedChange={set("attachFile")} />
          <div className="space-y-0.5">
            <Label htmlFor="r-attach">Attach the file to the ledger</Label>
            <p className="text-xs text-muted-foreground">Saved under receipts/ and linked from the transaction with a receipt metadata key.</p>
          </div>
        </div>
      )}

      {receipt && (
        <div className="space-y-3 border-t pt-4">
          {receipt.items.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Line items</div>
              <ul className="flex flex-wrap gap-1.5">
                {receipt.items.map((item, i) => (
                  <li key={`${item.description}-${i}`}>
                    <Badge variant="secondary" className="gap-1.5 font-normal">
                      {item.description}
                      <span className="tabular text-muted-foreground">{formatNumber(item.amount, 2)}</span>
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="tabular">
              {Math.round(receipt.confidence * 100)}% confidence
            </Badge>
            {receipt.tax != null && <span className="tabular">Tax {formatNumber(receipt.tax, 2)}</span>}
          </div>
          {receipt.notes && <p className="text-sm text-muted-foreground">{receipt.notes}</p>}
        </div>
      )}

      {invalid && (
        <p role="alert" className="text-sm text-negative">
          {invalid}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting && <Spinner data-icon="inline-start" />}
          {submitting ? "Adding…" : "Add to ledger"}
        </Button>
      </div>
    </form>
  );
}
