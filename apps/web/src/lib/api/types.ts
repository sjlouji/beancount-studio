/** API response types. Shapes mirror apps/api (see engine.py, schemas.py, routers). */

export type Balance = Record<string, number>;

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  website: string;
  location: string;
  isAdmin: boolean;
  preferences: Record<string, unknown>;
  createdAt: string;
}

export interface SystemInfo {
  appName: string;
  version: string;
  aiEnabled: boolean;
  emailEnabled: boolean;
  signupEnabled: boolean;
  hasUsers: boolean;
}

export interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface Commit {
  sha: string;
  shortSha: string;
  author: CommitAuthor;
  parents: string[];
  message: string;
  subject: string;
}

export interface CommitFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface CommitDetails extends Commit {
  files: CommitFile[];
  stats: { additions: number; deletions: number; total: number };
  diff: string;
}

export type LedgerRole = "owner" | "admin" | "write" | "read" | "public";

export interface Ledger {
  id: string;
  owner: string;
  slug: string;
  title: string;
  description: string;
  visibility: "private" | "public";
  role: LedgerRole;
  canWrite: boolean;
  canAdmin: boolean;
  isStarred: boolean;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
  lastCommit: Commit | null;
}

export interface Collaborator {
  username: string;
  displayName: string;
  role: "read" | "write" | "admin";
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  ledgerId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface MintedApiKey extends ApiKey {
  key: string;
}

export interface ActivityItem extends Commit {
  ledger: { owner: string; slug: string; title: string };
}

export interface LedgerMeta {
  title: string;
  operatingCurrencies: string[];
  options: {
    title: string;
    operatingCurrency: string[];
    nameAssets: string;
    nameLiabilities: string;
    nameEquity: string;
    nameIncome: string;
    nameExpenses: string;
    documents: string[];
    include: string[];
    renderCommas: boolean;
  };
  favaOptions: {
    invertIncomeLiabilitiesEquity: boolean;
    conversionCurrencies: string[];
    fiscalYearEnd: { month: number; day: number };
    defaultFile: string | null;
    currencyColumn: number;
    indent: number;
    showClosedAccounts: boolean;
    showAccountsWithZeroBalance: boolean;
    collapsePattern: string[];
  };
  precisions: Record<string, number>;
  commodityNames: Record<string, string>;
  sourceFiles: string[];
  errorsCount: number;
  entriesCount: number;
  transactionsCount: number;
  accountsCount: number;
  lastEntryDate: string | null;
  lastTransactionDate: string | null;
  directiveCounts: Record<string, number>;
}

export interface LedgerAttributes {
  accounts: string[];
  currencies: string[];
  payees: string[];
  tags: string[];
  links: string[];
  years: string[];
  narrations: string[];
}

export interface LedgerError {
  type: string;
  message: string;
  filename: string | null;
  lineno: number | null;
}

export interface DateRange {
  begin: string;
  end: string;
  endInclusive: string;
}

export interface TreeNode {
  account: string;
  balance: Balance;
  balanceChildren: Balance;
  children: TreeNode[];
  hasTxns: boolean;
  cost: Balance | null;
  costChildren: Balance | null;
}

export interface DateBalance {
  date: string;
  balance: Balance;
}

export interface IntervalTotal extends DateBalance {
  accountBalances: Record<string, Balance>;
  budgets: Balance;
}

export interface Posting {
  account: string;
  amount: string;
  units: { number: number; currency: string } | null;
  cost: { number: number; currency: string; date: string; label: string | null } | null;
  price: { number: number; currency: string } | null;
  flag: string | null;
  lineno: number | null;
  meta: Record<string, unknown>;
}

export type EntryType =
  | "Transaction"
  | "Balance"
  | "Open"
  | "Close"
  | "Note"
  | "Document"
  | "Pad"
  | "Price"
  | "Event"
  | "Query"
  | "Custom"
  | "Commodity";

export interface Entry {
  type: EntryType;
  entryHash: string;
  date: string;
  filename: string | null;
  lineno: number | null;
  meta: Record<string, unknown>;
  // Transaction
  flag?: string;
  payee?: string;
  narration?: string;
  tags?: string[];
  links?: string[];
  postings?: Posting[];
  // Balance / Open / Close / Note / Pad / Document
  account?: string;
  amount?: { number: string | number; currency: string };
  diff_amount?: { number: string | number; currency: string } | null;
  currencies?: string[] | null;
  booking?: string | null;
  comment?: string;
  source_account?: string;
  filename_doc?: string;
  // Price / Commodity
  currency?: string;
  // Event
  type_?: string;
  description?: string;
  // Query / Custom
  name?: string;
  query_string?: string;
  values?: unknown[];
  // Document extras
  documentPath?: string;
  basename?: string;
}

export interface JournalResponse {
  entries: Entry[];
  total: number;
  offset: number;
  limit: number;
}

export interface EntryContext {
  entry: Entry;
  balancesBefore: Record<string, string[]> | null;
  balancesAfter: Record<string, string[]> | null;
  slice: string;
  sha256sum: string;
}

export interface AccountJournalResponse {
  account: string;
  withChildren: boolean;
  items: Array<{ entry: Entry; change: Balance; balance: Balance }>;
  total: number;
  offset: number;
  limit: number;
}

export interface OverviewReport {
  dateRange: DateRange | null;
  netWorth: DateBalance[];
  netWorthAtValue: DateBalance[];
  assets: TreeNode;
  liabilities: TreeNode;
  income: TreeNode;
  expenses: TreeNode;
  incomeIntervals: IntervalTotal[];
  expensesIntervals: IntervalTotal[];
  netProfitIntervals: IntervalTotal[];
  recentTransactions: Entry[];
  transactionsCount: number;
  errorsCount: number;
  upcomingEvents: Entry[];
}

export interface IncomeStatementReport {
  dateRange: DateRange | null;
  charts: { netProfit: IntervalTotal[]; income: IntervalTotal[]; expenses: IntervalTotal[] };
  trees: { income: TreeNode; netProfit: TreeNode; expenses: TreeNode };
  invertIncomeLiabilitiesEquity: boolean;
}

export interface BalanceSheetReport {
  dateRange: DateRange | null;
  charts: { netWorth: DateBalance[]; assets: DateBalance[]; liabilities: DateBalance[] };
  trees: { assets: TreeNode; liabilities: TreeNode; equity: TreeNode };
  invertIncomeLiabilitiesEquity: boolean;
}

export interface TrialBalanceReport {
  dateRange: DateRange | null;
  tree: TreeNode;
}

export interface CashFlowInterval {
  date: string;
  begin: string;
  operating: Balance;
  investing: Balance;
  financing: Balance;
  netChange: Balance;
  openingCash: Balance;
  closingCash: Balance;
}

export interface CashFlowReport {
  dateRange: DateRange | null;
  intervals: CashFlowInterval[];
  accounts: Array<{ account: string; role: string; declared: boolean; total: Balance }>;
  cashAccounts: Array<{ account: string; declared: boolean }>;
}

export interface AccountReport {
  account: string;
  dateRange: DateRange | null;
  closedAt: string | null;
  meta: Record<string, unknown>;
  charts: { balance: DateBalance[]; changes: IntervalTotal[] };
  intervalBalances: Array<{ date: string; begin: string; tree: TreeNode }>;
  budgets: Record<string, Array<{ budget: Balance; budgetChildren: Balance }>>;
}

export interface AccountDetail {
  account: string;
  openedAt: string;
  closedAt: string | null;
  currencies: string[];
  meta: Record<string, unknown>;
  balance: Balance;
  balanceChildren: Balance;
  entryCount: number;
  entryHash: string | null;
  closeEntryHash: string | null;
  lastEntry: { date: string; entryHash: string } | null;
  uptodateStatus: "green" | "yellow" | "red" | null;
  balanceString: string | null;
}

export interface CommoditiesReport {
  pairs: Array<{ base: string; quote: string; prices: Array<{ date: string; value: number }> }>;
  names: Record<string, string>;
  declared: Array<{ currency: string; date: string; meta: Record<string, unknown>; entryHash: string }>;
  precisions: Record<string, number>;
}

export interface StatisticsReport {
  entriesByType: Array<{ type: string; count: number }>;
  postingsPerAccount: Array<{ account: string; count: number }>;
  accountLastEntries: Array<{ account: string; date: string | null; entryHash: string | null; balance: Balance; uptodateStatus: string | null }>;
  allBalanceDirectives: string;
}

export interface BudgetEntry extends Omit<Entry, "account" | "currency"> {
  account: string | null;
  period: string | null;
  number: number | null;
  currency: string | null;
}

export interface BudgetsReport {
  entries: BudgetEntry[];
  report: Array<{ interval: "month" | "quarter" | "year"; begin: string; end: string; rows: Array<{ account: string; budget: Balance; actual: Balance }> }>;
  dateRange: DateRange | null;
}

export interface QueryColumn {
  name: string;
  dtype: string;
}

export type QueryCell = string | number | boolean | null | Balance | { units: { number: number; currency: string }; cost: unknown } | Record<string, unknown>;

export interface QueryTableResult {
  type: "table";
  columns: QueryColumn[];
  rows: QueryCell[][];
  rowCount: number;
  truncated: boolean;
}

export interface QueryTextResult {
  type: "text";
  contents: string;
}

export type QueryResult = QueryTableResult | QueryTextResult;

export interface OptionsReport {
  beancount: Record<string, string>;
  fava: Record<string, string>;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  modifiedAt?: string;
  lastCommit?: Commit | null;
}

export interface FileContent {
  path: string;
  ref: string;
  binary: boolean;
  content?: string;
  sha256sum?: string | null;
  size: number;
  lastCommit?: Commit | null;
}

export interface Projection {
  errors: Array<{ filename: string; lineno: number | null; message: string; type: string }>;
  diffs: Array<{ path: string; diff: string }>;
}

export interface WriteResult {
  path: string;
  sha256sum: string;
  commit: string | null;
  errors?: LedgerError[];
}

export interface ParsedStatement {
  headers: string[];
  mapping: ColumnMapping;
  rows: ParsedRow[];
  detectedCurrency: string | null;
  validCount: number;
  format: "csv" | "ofx" | "qif";
  existingKeys: Array<[string, string, string, string]>;
  accounts: string[];
  currencies: string[];
  filename: string;
}

export interface ColumnMapping {
  date: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  payee: string | null;
  description: string | null;
  balance: string | null;
  invert_amount: boolean;
}

export interface ParsedRow {
  id: number;
  date: string | null;
  payee: string;
  description: string;
  amount: string | null;
  currency: string | null;
  balance: string | null;
  raw: Record<string, string>;
  errors: string[];
}

export interface CategorySuggestion {
  id: number;
  account: string;
  confidence: number;
  source: "history" | "ai";
  reasoning: string;
}

export interface ImportCommitResult {
  written: number;
  writtenIds?: number[];
  skipped: number[];
  commit: string | null;
  file?: string;
  errors: LedgerError[];
}

export interface ReceiptParse {
  upload: { id: string; filename: string; mimeType: string };
  receipt: {
    date: string;
    payee: string;
    narration: string;
    total: number;
    currency: string;
    tax: number | null;
    items: Array<{ description: string; amount: number }>;
    expenseAccount: string;
    paymentAccount: string;
    confidence: number;
    notes: string;
  };
}

export interface Upload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: ThreadMessageLike[];
}

export interface ThreadMessageLike {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
}

export interface PublicProfile {
  profile: { username: string; displayName: string; bio: string; website: string; location: string; createdAt: string };
  ledgers: Array<{ owner: string; slug: string; title: string; description: string; visibility: string; starsCount: number; updatedAt: string }>;
  starredCount: number;
  isSelf: boolean;
}

/** Shared report query parameters, mirrored in the URL. */
export interface ReportParams {
  time?: string;
  account?: string;
  filter?: string;
  conversion?: string;
  interval?: "day" | "week" | "month" | "quarter" | "year";
}
