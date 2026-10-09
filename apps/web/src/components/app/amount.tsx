import { formatNumber, precisionFor, type Balance } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A single amount with tabular digits and a sign-aware tone. */
export function Amount({
  value,
  currency,
  precisions,
  signed = false,
  colored = false,
  invert = false,
  className,
  hideCurrency = false,
}: {
  value: number;
  currency: string;
  precisions?: Record<string, number>;
  signed?: boolean;
  colored?: boolean;
  invert?: boolean;
  className?: string;
  hideCurrency?: boolean;
}) {
  const shown = invert ? -value : value;
  const digits = precisionFor(currency, precisions);
  const tone = !colored || shown === 0 ? "" : shown > 0 ? "text-positive" : "text-negative";
  const text = `${signed && shown > 0 ? "+" : ""}${formatNumber(shown, digits)}`;
  return (
    <span className={cn("tabular whitespace-nowrap", tone, className)}>
      {text}
      {!hideCurrency && <span className="ml-1 text-[0.8em] text-muted-foreground">{currency}</span>}
    </span>
  );
}

/** Every unit of a balance map, stacked, largest first. */
export function BalanceAmounts({
  balance,
  precisions,
  colored = false,
  invert = false,
  className,
  emptyLabel = "–",
  align = "right",
}: {
  balance: Balance | null | undefined;
  precisions?: Record<string, number>;
  colored?: boolean;
  invert?: boolean;
  className?: string;
  emptyLabel?: string;
  align?: "left" | "right";
}) {
  const entries = Object.entries(balance ?? {}).filter(([, v]) => v !== 0 && Number.isFinite(v));
  if (entries.length === 0) return <span className={cn("text-muted-foreground tabular", className)}>{emptyLabel}</span>;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return (
    <span className={cn("flex flex-col gap-0.5", align === "right" ? "items-end" : "items-start", className)}>
      {entries.map(([currency, value]) => (
        <Amount key={currency} value={value} currency={currency} precisions={precisions} colored={colored} invert={invert} />
      ))}
    </span>
  );
}
