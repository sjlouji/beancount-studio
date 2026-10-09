"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";
import { LedgerAssistant } from "@/components/ask/assistant";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiDelete, apiPost, errorMessage } from "@/lib/api/client";
import { keys, ledgerPath, useChatThread, useChatThreads, useMe, useSystemInfo } from "@/lib/api/hooks";
import type { ChatThread } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

function AskInner() {
  const { owner, slug } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const qc = useQueryClient();
  const { data: me, isPending: mePending } = useMe();
  const { data: info } = useSystemInfo();
  const threadId = search.get("thread");
  const threads = useChatThreads(owner, slug, Boolean(me));
  const thread = useChatThread(owner, slug, threadId);
  const threadsKey = keys.ledgerScope(owner, slug, "chat-threads");

  const create = useMutation({
    mutationFn: () => apiPost<ChatThread>(`${ledgerPath(owner, slug)}/chat/threads`),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: threadsKey });
      router.replace(`?thread=${created.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`${ledgerPath(owner, slug)}/chat/threads/${id}`),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: threadsKey });
      if (id === threadId) router.replace("?");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Open the newest thread, or create one, when none is selected.
  useEffect(() => {
    if (!me || !info?.aiEnabled || threadId || !threads.data || create.isPending) return;
    if (threads.data.length > 0) router.replace(`?thread=${threads.data[0]!.id}`);
    else create.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, info?.aiEnabled, threadId, threads.data]);

  if (mePending) return <LoadingState />;
  if (!me) return <EmptyState title="Sign in to use the assistant" description="Conversations are private to your account." />;
  if (info && !info.aiEnabled) {
    return (
      <EmptyState
        title="The assistant is not configured"
        description={
          <>
            Set <code className="rounded bg-muted px-1 font-mono text-xs">BS_ANTHROPIC_API_KEY</code> on the API server to enable it. Everything else works without it.
          </>
        }
      />
    );
  }

  return (
    <div className="grid h-[calc(100dvh-7.5rem)] min-h-[32rem] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col rounded-xl border bg-card lg:flex">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversations</span>
          <Button variant="ghost" size="icon-xs" onClick={() => create.mutate()} aria-label="New conversation" disabled={create.isPending}>
            <MessageSquarePlusIcon />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-1.5">
            {(threads.data ?? []).map((t) => (
              <li key={t.id} className="group relative">
                <button type="button" onClick={() => router.replace(`?thread=${t.id}`)} className={cn("block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", t.id === threadId && "bg-accent text-accent-foreground")}>
                  <span className="line-clamp-1 pr-5">{t.title}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelative(t.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => remove.mutate(t.id)} aria-label="Delete conversation" className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-negative group-hover:opacity-100">
                  <Trash2Icon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>
      <section className="min-h-0 overflow-hidden rounded-xl border bg-card">
        {!threadId || thread.isPending ? <LoadingState label="Opening conversation…" /> : thread.isError ? <ErrorState error={thread.error} onRetry={() => void thread.refetch()} /> : <LedgerAssistant key={threadId} threadId={threadId} initialMessages={thread.data.messages} />}
      </section>
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AskInner />
    </Suspense>
  );
}
