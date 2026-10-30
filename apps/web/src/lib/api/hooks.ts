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
  CommitDetails,
  Commit,
  CommoditiesReport,
  Entry,
  EntryContext,
  FileContent,
  GitTestResult,
  IncomeStatementReport,
  Invite,
  InvitePreview,
  JournalResponse,
  Ledger,
  LedgerAttributes,
  LedgerError,
  LedgerMeta,
  LedgerRemote,
  Member,
  MintedApiKey,
  MintedInvite,
  OptionsReport,
  OverviewReport,
  PublicProfile,
  QueryResult,
  RemoteConnectInput,
  ReportParams,
  SshKey,
  StatisticsReport,
  SystemInfo,
  TreeEntry,
  TrialBalanceReport,
  User,
  Workspace,
} from "./types";

export const keys = {
  me: ["me"] as const,
  sshKey: ["ssh-key"] as const,
  system: ["system"] as const,
  workspaces: ["workspaces"] as const,
  workspaceScope: (workspace: string, ...rest: unknown[]) => ["workspace", workspace, ...rest] as const,
  invite: (token: string) => ["invite", token] as const,
  ledgers: ["ledgers"] as const,
  activity: ["activity"] as const,
  apiKeys: ["api-keys"] as const,
  profile: (username: string) => ["profile", username] as const,
  ledger: (workspace: string, slug: string) => ["ledger", workspace, slug] as const,
  ledgerScope: (workspace: string, slug: string, ...rest: unknown[]) => ["ledger", workspace, slug, ...rest] as const,
};

export function workspacePath(workspace: string): string {
  return `/workspaces/${encodeURIComponent(workspace)}`;
}

export function ledgerPath(workspace: string, slug: string): string {
  return `${workspacePath(workspace)}/ledgers/${encodeURIComponent(slug)}`;
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

// ---------------------------------------------------------------- workspaces

/** The workspaces the signed-in person belongs to, with their role in each. */
export function useWorkspaces(enabled = true) {
  return useQuery<Workspace[]>({ queryKey: keys.workspaces, queryFn: () => apiGet<Workspace[]>("/workspaces"), enabled });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug?: string }) => apiPost<Workspace>("/workspaces", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

export function useUpdateWorkspace(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; slug?: string }) => apiPatch<Workspace>(workspacePath(workspace), input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.workspaces }),
  });
}

/** Owners only; the API removes the workspace's ledgers from disk as well. */
export function useDeleteWorkspace(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<void>(workspacePath(workspace)),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.workspaceScope(workspace) });
      void qc.invalidateQueries({ queryKey: keys.workspaces });
      void qc.invalidateQueries({ queryKey: keys.ledgers });
    },
  });
}

export function useWorkspaceLedgers(workspace: string, enabled = true) {
  return useQuery<Ledger[]>({
    queryKey: keys.workspaceScope(workspace, "ledgers"),
    queryFn: () => apiGet<Ledger[]>(`${workspacePath(workspace)}/ledgers`),
    enabled: enabled && workspace !== "",
  });
}

export function useMembers(workspace: string, enabled = true) {
  return useQuery<Member[]>({
    queryKey: keys.workspaceScope(workspace, "members"),
    queryFn: () => apiGet<Member[]>(`${workspacePath(workspace)}/members`),
    enabled: enabled && workspace !== "",
  });
}

function memberPath(workspace: string, username: string): string {
  return `${workspacePath(workspace)}/members/${encodeURIComponent(username)}`;
}

export function useSetMemberRole(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; role: Member["role"] }) => apiPatch<Member>(memberPath(workspace, input.username), { role: input.role }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace, "members") }),
  });
}

/** Removes a member, or the person themselves when `username` is their own. */
export function useRemoveMember(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => apiDelete<void>(memberPath(workspace, username)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace, "members") });
      void qc.invalidateQueries({ queryKey: keys.workspaces });
    },
  });
}

export function useInvites(workspace: string, enabled = true) {
  return useQuery<Invite[]>({
    queryKey: keys.workspaceScope(workspace, "invites"),
    queryFn: () => apiGet<Invite[]>(`${workspacePath(workspace)}/invites`),
    enabled: enabled && workspace !== "",
  });
}

export function useCreateInvite(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: Member["role"]; expiresInDays: number }) => apiPost<MintedInvite>(`${workspacePath(workspace)}/invites`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace, "invites") }),
  });
}

export function useRevokeInvite(workspace: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => apiDelete<void>(`${workspacePath(workspace)}/invites/${encodeURIComponent(inviteId)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace, "invites") }),
  });
}

/** What an invite link offers; readable before signing in, since the link itself is the secret. */
export function useInvitePreview(token: string) {
  return useQuery<InvitePreview>({
    queryKey: keys.invite(token),
    queryFn: () => apiGet<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<Workspace>(`/invites/${encodeURIComponent(token)}/accept`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.workspaces });
      void qc.invalidateQueries({ queryKey: keys.ledgers });
    },
  });
}

// ---------------------------------------------------------------- ledgers

/** Every ledger across the person's workspaces. */
export function useLedgers(enabled = true) {
  return useQuery<Ledger[]>({ queryKey: keys.ledgers, queryFn: () => apiGet<Ledger[]>("/ledgers"), enabled });
}

/** Recent commits across the person's ledgers, or only those of one workspace. */
export function useActivity(limit = 20, workspace?: string, enabled = true) {
  return useQuery<{ items: ActivityItem[]; total: number }>({
    queryKey: [...keys.activity, limit, workspace ?? ""],
    queryFn: () => apiGet("/ledgers/activity", { limit, workspace }),
    enabled,
  });
}

export function useLedger(workspace: string, slug: string) {
  return useQuery<Ledger>({
    queryKey: keys.ledger(workspace, slug),
    queryFn: () => apiGet<Ledger>(ledgerPath(workspace, slug)),
    // A push lasts seconds; poll only while one is in flight so the status chip stays honest.
    refetchInterval: (query) => (query.state.data?.remote?.state === "pushing" ? 3000 : false),
  });
}

export function useLedgerMeta(workspace: string, slug: string) {
  return useQuery<LedgerMeta>({
    queryKey: keys.ledgerScope(workspace, slug, "meta"),
    queryFn: () => apiGet<LedgerMeta>(`${ledgerPath(workspace, slug)}/meta`),
  });
}

export function useLedgerAttributes(workspace: string, slug: string) {
  return useQuery<LedgerAttributes>({
    queryKey: keys.ledgerScope(workspace, slug, "attributes"),
    queryFn: () => apiGet<LedgerAttributes>(`${ledgerPath(workspace, slug)}/attributes`),
    staleTime: 60_000,
  });
}

export function useLedgerErrors(workspace: string, slug: string) {
  return useQuery<LedgerError[]>({
    queryKey: keys.ledgerScope(workspace, slug, "errors"),
    queryFn: () => apiGet<LedgerError[]>(`${ledgerPath(workspace, slug)}/errors`),
  });
}

/** Invalidate everything derived from a ledger's content after a write. */
export function useInvalidateLedger(workspace: string, slug: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.ledger(workspace, slug) });
    void qc.invalidateQueries({ queryKey: keys.ledgers });
    void qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace, "ledgers") });
    void qc.invalidateQueries({ queryKey: keys.activity });
  };
}

// ---------------------------------------------------------------- ssh key

export function useSshKey() {
  return useQuery<SshKey | null>({
    queryKey: keys.sshKey,
    queryFn: async () => {
      try {
        return await apiGet<SshKey>("/users/me/ssh-key");
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
  });
}

export function useCreateSshKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<SshKey>("/users/me/ssh-key"),
    onSuccess: (key) => qc.setQueryData(keys.sshKey, key),
  });
}

export function useDeleteSshKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<void>("/users/me/ssh-key"),
    onSuccess: () => qc.setQueryData(keys.sshKey, null),
  });
}

// ---------------------------------------------------------------- remotes

export function useTestRepository() {
  return useMutation({ mutationFn: (input: RemoteConnectInput) => apiPost<GitTestResult>("/git/test", input) });
}

export function useConnectRemote(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({
    mutationFn: (input: RemoteConnectInput) => apiPut<LedgerRemote>(`${ledgerPath(workspace, slug)}/remote`, input),
    onSuccess: invalidate,
  });
}

export function useDisconnectRemote(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({ mutationFn: () => apiDelete<void>(`${ledgerPath(workspace, slug)}/remote`), onSuccess: invalidate });
}

/** Sync and resolve can change ledger content, so everything derived from it is refetched. */
export function useSyncRemote(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({ mutationFn: () => apiPost<LedgerRemote>(`${ledgerPath(workspace, slug)}/remote/sync`), onSuccess: invalidate });
}

export function useResolveRemote(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({
    mutationFn: (keep: "local" | "remote") => apiPost<LedgerRemote>(`${ledgerPath(workspace, slug)}/remote/resolve`, { keep }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- reports

function useReport<T>(workspace: string, slug: string, name: string, params?: ReportParams, enabled = true) {
  const cleaned = cleanParams(params);
  return useQuery<T>({
    queryKey: keys.ledgerScope(workspace, slug, "report", name, cleaned),
    queryFn: () => apiGet<T>(`${ledgerPath(workspace, slug)}/reports/${name}`, cleaned),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export const useOverview = (workspace: string, slug: string, params?: ReportParams) => useReport<OverviewReport>(workspace, slug, "overview", params);
export const useIncomeStatement = (workspace: string, slug: string, params?: ReportParams) => useReport<IncomeStatementReport>(workspace, slug, "income-statement", params);
export const useBalanceSheet = (workspace: string, slug: string, params?: ReportParams) => useReport<BalanceSheetReport>(workspace, slug, "balance-sheet", params);
export const useTrialBalance = (workspace: string, slug: string, params?: ReportParams) => useReport<TrialBalanceReport>(workspace, slug, "trial-balance", params);
export const useCashFlow = (workspace: string, slug: string, params?: ReportParams) => useReport<CashFlowReport>(workspace, slug, "cash-flow", params);
export const useAccountReport = (workspace: string, slug: string, account: string, params?: ReportParams) =>
  useReport<AccountReport>(workspace, slug, `account/${account.split(":").map(encodeURIComponent).join(":")}`, params, Boolean(account));

function useDataPage<T>(workspace: string, slug: string, name: string, params?: ReportParams, extra?: Record<string, string | number | boolean | undefined>) {
  const cleaned = { ...cleanParams(params), ...(extra ?? {}) };
  return useQuery<T>({
    queryKey: keys.ledgerScope(workspace, slug, name, cleaned),
    queryFn: () => apiGet<T>(`${ledgerPath(workspace, slug)}/${name}`, cleaned),
    placeholderData: (prev) => prev,
  });
}

export const useAccounts = (workspace: string, slug: string, params?: ReportParams) => useDataPage<AccountDetail[]>(workspace, slug, "accounts", params);
export const useCommodities = (workspace: string, slug: string, params?: ReportParams) => useDataPage<CommoditiesReport>(workspace, slug, "commodities", params);
export const useDocuments = (workspace: string, slug: string, params?: ReportParams) => useDataPage<Entry[]>(workspace, slug, "documents", params);
export const useEvents = (workspace: string, slug: string, params?: ReportParams) => useDataPage<Entry[]>(workspace, slug, "events", params);
export const useStatistics = (workspace: string, slug: string, params?: ReportParams) => useDataPage<StatisticsReport>(workspace, slug, "statistics", params);
export const useBudgets = (workspace: string, slug: string, params?: ReportParams) => useDataPage<BudgetsReport>(workspace, slug, "budgets", params);
export const useHoldings = (workspace: string, slug: string, groupBy: "lot" | "account" | "currency", params?: ReportParams) =>
  useDataPage<QueryResult>(workspace, slug, "holdings", params, { groupBy });
export const useOptions = (workspace: string, slug: string) => useDataPage<OptionsReport>(workspace, slug, "options");

export function useBqlQuery(workspace: string, slug: string, query: string, params?: ReportParams) {
  const cleaned = cleanParams(params);
  return useQuery<QueryResult>({
    queryKey: keys.ledgerScope(workspace, slug, "query", query, cleaned),
    queryFn: () => apiGet<QueryResult>(`${ledgerPath(workspace, slug)}/query`, { ...cleaned, q: query }),
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

export function useJournal(workspace: string, slug: string, query: JournalQuery) {
  const cleaned = { ...cleanParams(query), types: query.types, flags: query.flags, search: query.search || undefined, offset: query.offset ?? 0, limit: query.limit ?? 50, order: query.order ?? "desc" };
  return useQuery<JournalResponse>({
    queryKey: keys.ledgerScope(workspace, slug, "journal", cleaned),
    queryFn: () => apiGet<JournalResponse>(`${ledgerPath(workspace, slug)}/journal`, cleaned),
    placeholderData: (prev) => prev,
  });
}

export function useAccountJournal(workspace: string, slug: string, account: string, query: JournalQuery & { withChildren?: boolean }) {
  const cleaned = { ...cleanParams(query), withChildren: query.withChildren ?? true, offset: query.offset ?? 0, limit: query.limit ?? 50 };
  return useQuery<AccountJournalResponse>({
    queryKey: keys.ledgerScope(workspace, slug, "account-journal", account, cleaned),
    queryFn: () => apiGet<AccountJournalResponse>(`${ledgerPath(workspace, slug)}/journal/account/${account.split(":").map(encodeURIComponent).join(":")}`, cleaned),
    enabled: Boolean(account),
    placeholderData: (prev) => prev,
  });
}

export function useEntryContext(workspace: string, slug: string, entryHash: string | null) {
  return useQuery<EntryContext>({
    queryKey: keys.ledgerScope(workspace, slug, "entry", entryHash),
    queryFn: () => apiGet<EntryContext>(`${ledgerPath(workspace, slug)}/entries/${entryHash}`),
    enabled: Boolean(entryHash),
  });
}

export function useUpdateEntry(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({
    mutationFn: (input: { entryHash: string; source: string; sha256sum: string; message?: string }) =>
      apiPut<{ sha256sum: string; commit: string | null }>(`${ledgerPath(workspace, slug)}/entries/${input.entryHash}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEntry(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({
    mutationFn: (input: { entryHash: string; sha256sum: string }) =>
      apiDelete<{ deleted: boolean; commit: string | null }>(`${ledgerPath(workspace, slug)}/entries/${input.entryHash}`, { sha256sum: input.sha256sum }),
    onSuccess: invalidate,
  });
}

export function useAddEntries(workspace: string, slug: string) {
  const invalidate = useInvalidateLedger(workspace, slug);
  return useMutation({
    mutationFn: (input: { entries: Array<Record<string, unknown>>; message?: string }) =>
      apiPost<{ entryHashes: string[]; commit: string | null; errors: LedgerError[] }>(`${ledgerPath(workspace, slug)}/entries`, input),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- files & history

export function useFileTree(workspace: string, slug: string, path = "", ref?: string) {
  return useQuery<{ path: string; ref: string; entries: TreeEntry[] }>({
    queryKey: keys.ledgerScope(workspace, slug, "tree", path, ref ?? "HEAD"),
    queryFn: () => apiGet(`${ledgerPath(workspace, slug)}/files/tree`, { path, ref }),
  });
}

export function useFileContent(workspace: string, slug: string, path: string | null, ref?: string) {
  return useQuery<FileContent>({
    queryKey: keys.ledgerScope(workspace, slug, "file", path, ref ?? "HEAD"),
    queryFn: () => apiGet<FileContent>(`${ledgerPath(workspace, slug)}/files/content`, { path: path ?? "", ref }),
    enabled: Boolean(path),
  });
}

export function useCommits(workspace: string, slug: string, page = 1, limit = 30, path?: string) {
  return useQuery<{ commits: Commit[]; total: number; page: number; limit: number }>({
    queryKey: keys.ledgerScope(workspace, slug, "commits", page, limit, path ?? ""),
    queryFn: () => apiGet(`${ledgerPath(workspace, slug)}/commits`, { page, limit, path }),
    placeholderData: (prev) => prev,
  });
}

export function useCommit(workspace: string, slug: string, sha: string | null) {
  return useQuery<CommitDetails>({
    queryKey: keys.ledgerScope(workspace, slug, "commit", sha),
    queryFn: () => apiGet<CommitDetails>(`${ledgerPath(workspace, slug)}/commits/${sha}`),
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

export function useChatThreads(workspace: string, slug: string, enabled = true) {
  return useQuery<ChatThread[]>({
    queryKey: keys.ledgerScope(workspace, slug, "chat-threads"),
    queryFn: () => apiGet<ChatThread[]>(`${ledgerPath(workspace, slug)}/chat/threads`),
    enabled,
  });
}

export function useChatThread(workspace: string, slug: string, threadId: string | null) {
  return useQuery<ChatThread>({
    queryKey: keys.ledgerScope(workspace, slug, "chat-thread", threadId),
    queryFn: () => apiGet<ChatThread>(`${ledgerPath(workspace, slug)}/chat/threads/${threadId}`),
    enabled: Boolean(threadId),
    staleTime: Infinity,
  });
}
