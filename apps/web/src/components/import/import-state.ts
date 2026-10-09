import type { CategorySuggestion, ColumnMapping, ImportCommitResult, ParsedRow, ParsedStatement } from "@/lib/api/types";

export type WizardStep = 0 | 1 | 2;

/** A parsed row plus the user's edits. `include` undefined means "automatic" (valid and not a duplicate). */
export interface ReviewRow {
  id: number;
  include: boolean | undefined;
  date: string;
  payee: string;
  narration: string;
  amount: string;
  currency: string | null;
  account: string;
  suggestion: { source: CategorySuggestion["source"]; confidence: number; reasoning: string } | null;
  errors: string[];
}

export interface WizardState {
  step: WizardStep;
  file: File | null;
  statement: ParsedStatement | null;
  mapping: ColumnMapping | null;
  rows: ReviewRow[];
  sourceAccount: string;
  currency: string;
  result: ImportCommitResult | null;
}

export type WizardAction =
  | { type: "parsed"; file: File; statement: ParsedStatement; sourceAccount: string; currency: string }
  | { type: "reparsed"; statement: ParsedStatement }
  | { type: "mapping"; mapping: ColumnMapping }
  | { type: "source"; account: string }
  | { type: "currency"; currency: string }
  | { type: "patch"; ids: number[]; patch: Partial<Omit<ReviewRow, "id">> }
  | { type: "suggestions"; suggestions: CategorySuggestion[] }
  | { type: "step"; step: WizardStep }
  | { type: "committed"; result: ImportCommitResult }
  | { type: "reset" };

export const initialWizardState: WizardState = {
  step: 0,
  file: null,
  statement: null,
  mapping: null,
  rows: [],
  sourceAccount: "",
  currency: "",
  result: null,
};

function toReviewRow(row: ParsedRow): ReviewRow {
  return {
    id: row.id,
    include: undefined,
    date: row.date ?? "",
    payee: row.payee,
    narration: row.description,
    amount: row.amount ?? "",
    currency: row.currency,
    account: "",
    suggestion: null,
    errors: row.errors,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "parsed":
      return {
        ...initialWizardState,
        file: action.file,
        statement: action.statement,
        mapping: action.statement.mapping,
        rows: action.statement.rows.map(toReviewRow),
        sourceAccount: action.sourceAccount,
        currency: action.currency,
      };
    case "reparsed":
      return { ...state, statement: action.statement, mapping: action.statement.mapping, rows: action.statement.rows.map(toReviewRow) };
    case "mapping":
      return { ...state, mapping: action.mapping };
    case "source":
      return { ...state, sourceAccount: action.account };
    case "currency":
      return { ...state, currency: action.currency };
    case "patch": {
      const ids = new Set(action.ids);
      return { ...state, rows: state.rows.map((r) => (ids.has(r.id) ? { ...r, ...action.patch } : r)) };
    }
    case "suggestions": {
      const byId = new Map(action.suggestions.map((s) => [s.id, s]));
      return {
        ...state,
        rows: state.rows.map((r) => {
          const hit = byId.get(r.id);
          if (!hit || !hit.account) return r;
          return { ...r, account: hit.account, suggestion: { source: hit.source, confidence: hit.confidence, reasoning: hit.reasoning } };
        }),
      };
    }
    case "step":
      return { ...state, step: action.step };
    case "committed":
      return { ...state, result: action.result };
    case "reset":
      return initialWizardState;
  }
}

// ------------------------------------------------------------------ derived row facts

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function rowIsInvalid(row: ReviewRow): boolean {
  return !ISO_DATE.test(row.date) || row.amount.trim() === "" || !Number.isFinite(Number(row.amount));
}

/** Canonical numeric text so "-6.50" and "-6.5" compare equal to the ledger's keys. */
function normalizeNumber(text: string): string {
  const value = Number(text);
  return Number.isFinite(value) ? String(value) : text;
}

export function duplicateKey(date: string, account: string, amount: string, currency: string): string {
  return [date, account, normalizeNumber(amount), currency].join("\u0000");
}

export function buildExistingKeySet(keys: ParsedStatement["existingKeys"]): Set<string> {
  return new Set(keys.map(([date, account, amount, currency]) => duplicateKey(date, account, amount, currency)));
}

export interface RowView {
  row: ReviewRow;
  currency: string;
  invalid: boolean;
  duplicate: boolean;
  included: boolean;
}

export function deriveRows(rows: ReviewRow[], existing: Set<string>, sourceAccount: string, currency: string): RowView[] {
  return rows.map((row) => {
    const rowCurrency = row.currency || currency;
    const invalid = rowIsInvalid(row);
    const duplicate = !invalid && sourceAccount !== "" && existing.has(duplicateKey(row.date, sourceAccount, row.amount, rowCurrency));
    const included = !invalid && (row.include ?? !duplicate);
    return { row, currency: rowCurrency, invalid, duplicate, included };
  });
}

export function pickSourceAccount(accounts: string[], assetsRoot: string, liabilitiesRoot: string): string {
  const looksLikeBank = /bank|check|saving|card|credit|visa|amex|master|chase|current/i;
  const candidates = accounts.filter((a) => a.startsWith(`${assetsRoot}:`) || a.startsWith(`${liabilitiesRoot}:`));
  return candidates.find((a) => looksLikeBank.test(a)) ?? "";
}
