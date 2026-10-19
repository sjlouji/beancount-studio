"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, isApiError } from "./client";
import type {
  AccountDetail,
  AccountJournalResponse,
  AccountReport,
  ActivityItem,
  ApiKey,
  BalanceSheetReport,
  BudgetsReport,
  CashFlowReport,
  ChatThread,
  Collaborator,
  CommitDetails,
  Commit,
  CommoditiesReport,
  Entry,
  EntryContext,
  FileContent,
  IncomeStatementReport,
  JournalResponse,
  Ledger,
  LedgerAttributes,
  LedgerError,
  LedgerMeta,
  MintedApiKey,
  OptionsReport,
  OverviewReport,
  PublicProfile,
  QueryResult,
  ReportParams,
  StatisticsReport,
  SystemInfo,
  TreeEntry,
  TrialBalanceReport,
  User,
} from "./types";

export const keys = {
  me: ["me"] as const,
  system: ["system"] as const,
  ledgers: ["ledgers"] as const,
  gallery: (q?: string) => ["gallery", q ?? ""] as const,
  activity: ["activity"] as const,
  apiKeys: ["api-keys"] as const,
  profile: (username: string) => ["profile", username] as const,
  ledger: (owner: string, slug: string) => ["ledger", owner, slug] as const,
  ledgerScope: (owner: string, slug: string, ...rest: unknown[]) => ["ledger", owner, slug, ...rest] as const,
};

export function ledgerPath(owner: string, slug: string): string {
  return `/ledgers/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`;
}

function cleanParams(params?: ReportParams): Record<string, string | undefined> {
  if (!params) return {};
  return {
    time: params.time || undefined,
    account: params.account || undefined,
    filter: params.filter || undefined,
    conversion: params.conversion || undefined,
    interval: params.interval || undefined,
  };
}

// ---------------------------------------------------------------- session

export function useMe(options?: Partial<UseQueryOptions<User | null>>) {
  return useQuery<User | null>({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await apiGet<User>("/auth/me");
      } catch (error) {
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useSystemInfo() {
  return useQuery<SystemInfo>({ queryKey: keys.system, queryFn: () => apiGet<SystemInfo>("/system/info"), staleTime: 10 * 60_000 });
}

/** Approves a desktop-app sign-in for the hash the app sent to the browser. */
export function useApproveDesktopSignIn() {
  return useMutation({
    mutationFn: (body: { challenge: string }) => apiPost<void>("/auth/desktop/approve", body),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<void>("/auth/logout"),
    onSuccess: () => {
      qc.clear();
      window.location.assign(`${window.location.origin}/login`);
    },
  });
}

// ---------------------------------------------------------------- ledgers

export function useLedgers(enabled = true) {
  return useQuery<Ledger[]>({ queryKey: keys.ledgers, queryFn: () => apiGet<Ledger[]>("/ledgers"), enabled });
}

export function useGallery(q?: string) {
  return useQuery<Ledger[]>({ queryKey: keys.gallery(q), queryFn: () => apiGet<Ledger[]>("/ledgers/gallery", { q }) });
}

export function useActivity(limit = 20) {
  return useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: [...keys.activity, limit],
    queryFn: () => apiGet("/ledgers/activity", { limit }),
  });
}

export function useLedger(owner: string, slug: string) {
  return useQuery<Ledger>({ queryKey: keys.ledger(owner, slug), queryFn: () => apiGet<Ledger>(ledgerPath(owner, slug)) });
}

export function useLedgerMeta(owner: string, slug: string) {
  return useQuery<LedgerMeta>({
    queryKey: keys.ledgerScope(owner, slug, "meta"),
    queryFn: () => apiGet<LedgerMeta>(`${ledgerPath(owner, slug)}/meta`),
  });
}

export function useLedgerAttributes(owner: string, slug: string) {
  return useQuery<LedgerAttributes>({
    queryKey: keys.ledgerScope(owner, slug, "attributes"),
    queryFn: () => apiGet<LedgerAttributes>(`${ledgerPath(owner, slug)}/attributes`),
    staleTime: 60_000,
  });
}

export function useLedgerErrors(owner: string, slug: string) {
  return useQuery<LedgerError[]>({
    queryKey: keys.ledgerScope(owner, slug, "errors"),
    queryFn: () => apiGet<LedgerError[]>(`${ledgerPath(owner, slug)}/errors`),
  });
}

export function useCollaborators(owner: string, slug: string) {
  return useQuery<Collaborator[]>({
    queryKey: keys.ledgerScope(owner, slug, "collaborators"),
    queryFn: () => apiGet<Collaborator[]>(`${ledgerPath(owner, slug)}/collaborators`),
  });
}

/** Invalidate everything derived from a ledger's content after a write. */
export function useInvalidateLedger(owner: string, slug: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.ledger(owner, slug) });
    void qc.invalidateQueries({ queryKey: keys.ledgers });
    void qc.invalidateQueries({ queryKey: keys.activity });
  };
}

// ---------------------------------------------------------------- reports

function useReport<T>(owner: string, slug: string, name: string, params?: ReportParams, enabled = true) {
  const cleaned = cleanParams(params);
  return useQuery<T>({
    queryKey: keys.ledgerScope(owner, slug, "report", name, cleaned),
    queryFn: () => apiGet<T>(`${ledgerPath(owner, slug)}/reports/${name}`, cleaned),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export const useOverview = (owner: string, slug: string, params?: ReportParams) => useReport<OverviewReport>(owner, slug, "overview", params);
export const useIncomeStatement = (owner: string, slug: string, params?: ReportParams) => useReport<IncomeStatementReport>(owner, slug, "income-statement", params);
export const useBalanceSheet = (owner: string, slug: string, params?: ReportParams) => useReport<BalanceSheetReport>(owner, slug, "balance-sheet", params);
export const useTrialBalance = (owner: string, slug: string, params?: ReportParams) => useReport<TrialBalanceReport>(owner, slug, "trial-balance", params);
export const useCashFlow = (owner: string, slug: string, params?: ReportParams) => useReport<CashFlowReport>(owner, slug, "cash-flow", params);
export const useAccountReport = (owner: string, slug: string, account: string, params?: ReportParams) =>
  useReport<AccountReport>(owner, slug, `account/${account.split(":").map(encodeURIComponent).join(":")}`, params, Boolean(account));

function useDataPage<T>(owner: string, slug: string, name: string, params?: ReportParams, extra?: Record<string, string | number | boolean | undefined>) {
  const cleaned = { ...cleanParams(params), ...(extra ?? {}) };
  return useQuery<T>({
    queryKey: keys.ledgerScope(owner, slug, name, cleaned),
    queryFn: () => apiGet<T>(`${ledgerPath(owner, slug)}/${name}`, cleaned),
    placeholderData: (prev) => prev,
  });
}

export const useAccounts = (owner: string, slug: string, params?: ReportParams) => useDataPage<AccountDetail[]>(owner, slug, "accounts", params);
export const useCommodities = (owner: string, slug: string, params?: ReportParams) => useDataPage<CommoditiesReport>(owner, slug, "commodities", params);
export const useDocuments = (owner: string, slug: string, params?: ReportParams) => useDataPage<Entry[]>(owner, slug, "documents", params);
export const useEvents = (owner: string, slug: string, params?: ReportParams) => useDataPage<Entry[]>(owner, slug, "events", params);
export const useStatistics = (owner: string, slug: string, params?: ReportParams) => useDataPage<StatisticsReport>(owner, slug, "statistics", params);
export const useBudgets = (owner: string, slug: string, params?: ReportParams) => useDataPage<BudgetsReport>(owner, slug, "budgets", params);
export const useHoldings = (owner: string, slug: string, groupBy: "lot" | "account" | "currency", params?: ReportParams) =>
  useDataPage<QueryResult>(owner, slug, "holdings", params, { groupBy });
export const useOptions = (owner: string, slug: string) => useDataPage<OptionsReport>(owner, slug, "options");

export function useBqlQuery(owner: string, slug: string, query: string, params?: ReportParams) {
  const cleaned = cleanParams(params);
  return useQuery<QueryResult>({
    queryKey: keys.ledgerScope(owner, slug, "query", query, cleaned),
    queryFn: () => apiGet<QueryResult>(`${ledgerPath(owner, slug)}/query`, { ...cleaned, q: query }),
    enabled: query.trim().length > 0,
    retry: false,
  });
}

// ---------------------------------------------------------------- journal

export interface JournalQuery extends ReportParams {
  types?: string[];
  flags?: string[];
  search?: string;
  offset?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export function useJournal(owner: string, slug: string, query: JournalQuery) {
  const cleaned = { ...cleanParams(query), types: query.types, flags: query.flags, search: query.search || undefined, offset: query.offset ?? 0, limit: query.limit ?? 50, order: query.order ?? "desc" };
  return useQuery<JournalResponse>({
    queryKey: keys.ledgerScope(owner, slug, "journal", cleaned),
    queryFn: () => apiGet<JournalResponse>(`${ledgerPath(owner, slug)}/journal`, cleaned),
    placeholderData: (prev) => prev,
  });
}

export function useAccountJournal(owner: string, slug: string, account: string, query: JournalQuery & { withChildren?: boolean }) {
  const cleaned = { ...cleanParams(query), withChildren: query.withChildren ?? true, offset: query.offset ?? 0, limit: query.limit ?? 50 };
  return useQuery<AccountJournalResponse>({
    queryKey: keys.ledgerScope(owner, slug, "account-journal", account, cleaned),
    queryFn: () => apiGet<AccountJournalResponse>(`${ledgerPath(owner, slug)}/journal/account/${account.split(":").map(encodeURIComponent).join(":")}`, cleaned),
    enabled: Boolean(account),
    placeholderData: (prev) => prev,
  });
}

export function useEntryContext(owner: string, slug: string, entryHash: string | null) {
  return useQuery<EntryContext>({
    queryKey: keys.ledgerScope(owner, slug, "entry", entryHash),
    queryFn: () => apiGet<EntryContext>(`${ledgerPath(owner, slug)}/entries/${entryHash}`),
    enabled: Boolean(entryHash),
  });
}

export function useUpdateEntry(owner: string, slug: string) {
  const invalidate = useInvalidateLedger(owner, slug);
  return useMutation({
    mutationFn: (input: { entryHash: string; source: string; sha256sum: string; message?: string }) =>
      apiPut<{ sha256sum: string; commit: string | null }>(`${ledgerPath(owner, slug)}/entries/${input.entryHash}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEntry(owner: string, slug: string) {
  const invalidate = useInvalidateLedger(owner, slug);
  return useMutation({
    mutationFn: (input: { entryHash: string; sha256sum: string }) =>
      apiDelete<{ deleted: boolean; commit: string | null }>(`${ledgerPath(owner, slug)}/entries/${input.entryHash}`, { sha256sum: input.sha256sum }),
    onSuccess: invalidate,
  });
}

export function useAddEntries(owner: string, slug: string) {
  const invalidate = useInvalidateLedger(owner, slug);
  return useMutation({
    mutationFn: (input: { entries: Array<Record<string, unknown>>; message?: string }) =>
      apiPost<{ entryHashes: string[]; commit: string | null; errors: LedgerError[] }>(`${ledgerPath(owner, slug)}/entries`, input),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- files & history

export function useFileTree(owner: string, slug: string, path = "", ref?: string) {
  return useQuery<{ path: string; ref: string; entries: TreeEntry[] }>({
    queryKey: keys.ledgerScope(owner, slug, "tree", path, ref ?? "HEAD"),
    queryFn: () => apiGet(`${ledgerPath(owner, slug)}/files/tree`, { path, ref }),
  });
}

export function useFileContent(owner: string, slug: string, path: string | null, ref?: string) {
  return useQuery<FileContent>({
    queryKey: keys.ledgerScope(owner, slug, "file", path, ref ?? "HEAD"),
    queryFn: () => apiGet<FileContent>(`${ledgerPath(owner, slug)}/files/content`, { path: path ?? "", ref }),
    enabled: Boolean(path),
  });
}

export function useCommits(owner: string, slug: string, page = 1, limit = 30, path?: string) {
  return useQuery<{ commits: Commit[]; total: number; page: number; limit: number }>({
    queryKey: keys.ledgerScope(owner, slug, "commits", page, limit, path ?? ""),
    queryFn: () => apiGet(`${ledgerPath(owner, slug)}/commits`, { page, limit, path }),
    placeholderData: (prev) => prev,
  });
}

export function useCommit(owner: string, slug: string, sha: string | null) {
  return useQuery<CommitDetails>({
    queryKey: keys.ledgerScope(owner, slug, "commit", sha),
    queryFn: () => apiGet<CommitDetails>(`${ledgerPath(owner, slug)}/commits/${sha}`),
    enabled: Boolean(sha),
  });
}

// ---------------------------------------------------------------- settings

export function useApiKeys() {
  return useQuery<ApiKey[]>({ queryKey: keys.apiKeys, queryFn: () => apiGet<ApiKey[]>("/api-keys") });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[]; ledgerId?: string | null; expiresInDays?: number | null }) => apiPost<MintedApiKey>("/api-keys", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<ApiKey>(`/api-keys/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.apiKeys }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Pick<User, "displayName" | "bio" | "website" | "location" | "username" | "preferences">>) => apiPatch<User>("/users/me", input),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useProfile(username: string) {
  return useQuery<PublicProfile>({ queryKey: keys.profile(username), queryFn: () => apiGet<PublicProfile>(`/users/${encodeURIComponent(username)}`) });
}

// ---------------------------------------------------------------- chat threads

export function useChatThreads(owner: string, slug: string, enabled = true) {
  return useQuery<ChatThread[]>({
    queryKey: keys.ledgerScope(owner, slug, "chat-threads"),
    queryFn: () => apiGet<ChatThread[]>(`${ledgerPath(owner, slug)}/chat/threads`),
    enabled,
  });
}

export function useChatThread(owner: string, slug: string, threadId: string | null) {
  return useQuery<ChatThread>({
    queryKey: keys.ledgerScope(owner, slug, "chat-thread", threadId),
    queryFn: () => apiGet<ChatThread>(`${ledgerPath(owner, slug)}/chat/threads/${threadId}`),
    enabled: Boolean(threadId),
    staleTime: Infinity,
  });
}
