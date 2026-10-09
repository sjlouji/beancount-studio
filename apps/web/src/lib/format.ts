/** Number, amount and date formatting helpers shared by every page. */

export type Balance = Record<string, number>;

const numberFormats = new Map<string, Intl.NumberFormat>();

function formatter(fractionDigits: number, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${fractionDigits}:${JSON.stringify(options)}`;
  let fmt = numberFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      ...options,
    });
    numberFormats.set(key, fmt);
  }
  return fmt;
}

export function precisionFor(currency: string | undefined, precisions?: Record<string, number>): number {
  if (currency && precisions && precisions[currency] !== undefined) return precisions[currency];
  if (!currency) return 2;
  if (/^[A-Z]{3}$/.test(currency)) return 2;
  return 2;
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "–";
  return formatter(digits).format(value);
}

export function formatAmount(value: number, currency: string, precisions?: Record<string, number>): string {
  return `${formatNumber(value, precisionFor(currency, precisions))} ${currency}`;
}

/** Compact: 1.2K, 3.4M — for stat tiles and axis ticks. */
export function formatCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs < 1000) return formatter(abs < 10 ? 2 : 0).format(value);
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: digits }).format(value);
}

export function balanceEntries(balance: Balance | undefined | null): Array<[string, number]> {
  if (!balance) return [];
  return Object.entries(balance).filter(([, v]) => v !== 0 && Number.isFinite(v));
}

/** Pick the most common / largest unit for single-unit charts. */
export function primaryUnit(balances: Array<Balance | undefined>, preferred?: string): string | undefined {
  const score = new Map<string, number>();
  for (const bal of balances) {
    for (const [unit, value] of balanceEntries(bal)) {
      score.set(unit, (score.get(unit) ?? 0) + Math.abs(value));
    }
  }
  if (preferred && score.has(preferred)) return preferred;
  let best: string | undefined;
  let bestScore = -1;
  for (const [unit, value] of score) {
    if (value > bestScore) {
      best = unit;
      bestScore = value;
    }
  }
  return best ?? preferred;
}

export function formatDate(value: string | Date | undefined | null, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatRelative(value: string | Date | undefined | null): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function accountLeaf(account: string): string {
  const parts = account.split(":");
  return parts[parts.length - 1] ?? account;
}

/**
 * Short labels for a set of accounts: the leaf name, extended with parent segments only
 * where leaves collide (e.g. Taxes:Y2024:Federal vs Taxes:Y2025:Federal).
 */
export function shortAccountLabels(accounts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const groups = new Map<string, string[]>();
  for (const account of accounts) {
    const leaf = accountLeaf(account);
    groups.set(leaf, [...(groups.get(leaf) ?? []), account]);
  }
  for (const [leaf, members] of groups) {
    if (members.length === 1) {
      out[members[0]!] = leaf;
      continue;
    }
    let depth = 2;
    while (depth <= 6) {
      const labels = members.map((m) => m.split(":").slice(-depth).join(":"));
      if (new Set(labels).size === members.length) {
        members.forEach((m, i) => (out[m] = labels[i]!));
        break;
      }
      depth += 1;
    }
    for (const m of members) if (!out[m]) out[m] = m;
  }
  return out;
}

export function accountParent(account: string): string {
  const idx = account.lastIndexOf(":");
  return idx === -1 ? "" : account.slice(0, idx);
}

export function todayIso(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function monthIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
