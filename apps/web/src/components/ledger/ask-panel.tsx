"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, MaximizeIcon, MessageSquarePlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { LedgerAssistant } from "@/components/ask/assistant";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsWide } from "@/hooks/use-mobile";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys, ledgerPath, useChatThread, useChatThreads, useMe, useSystemInfo } from "@/lib/api/hooks";
import type { ChatThread } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";

function PanelBody() {
  const { owner, slug, base, ask, setAskThread, closeAsk } = useLedgerContext();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: info } = useSystemInfo();
  const aiReady = Boolean(info?.aiEnabled) && Boolean(me);
  const threads = useChatThreads(owner, slug, aiReady);
  const thread = useChatThread(owner, slug, ask.threadId);
  const threadsKey = keys.ledgerScope(owner, slug, "chat-threads");

  const create = useMutation({
    mutationFn: () => apiPost<ChatThread>(`${ledgerPath(owner, slug)}/chat/threads`),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: threadsKey });
      setAskThread(created.id);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Continue the latest conversation, or start one, when the panel opens without a thread.
  useEffect(() => {
    if (!aiReady || ask.threadId || !threads.data || create.isPending) return;
    if (threads.data.length > 0) setAskThread(threads.data[0]!.id);
    else create.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, ask.threadId, threads.data]);

  const current = threads.data?.find((t) => t.id === ask.threadId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="min-w-0 max-w-[60%] gap-1 pl-2">
              <span className="truncate type-headline">{current?.title ?? "Assistant"}</span>
              <ChevronDownIcon className="shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Conversations</DropdownMenuLabel>
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              {(threads.data ?? []).map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => setAskThread(t.id)} className="flex-col items-start gap-0">
                  <span className="line-clamp-1 w-full">{t.title}</span>
                  <span className="type-caption text-muted-foreground">{formatRelative(t.updatedAt)}</span>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => create.mutate()} disabled={create.isPending}>
              <MessageSquarePlusIcon /> New conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="New conversation" onClick={() => create.mutate()} disabled={create.isPending}>
            <MessageSquarePlusIcon />
          </Button>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Open the full assistant page">
            <Link href={ask.threadId ? `${base}/ask?thread=${ask.threadId}` : `${base}/ask`}>
              <MaximizeIcon />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={closeAsk}>
            <XIcon />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {!me ? (
          <EmptyState className="m-4" title="Sign in to use the assistant" description="Conversations are private to your account." />
        ) : info && !info.aiEnabled ? (
          <EmptyState
            className="m-4"
            title="The assistant is not configured"
            description={
              <>
                Set <code className="rounded bg-muted px-1 font-mono text-xs">BS_ANTHROPIC_API_KEY</code> on the API server, or point <code className="rounded bg-muted px-1 font-mono text-xs">BS_OPENAI_BASE_URL</code> at an OpenAI-compatible server and set <code className="rounded bg-muted px-1 font-mono text-xs">BS_AI_MODEL</code>.
              </>
            }
          />
        ) : !ask.threadId || thread.isPending ? (
          <LoadingState label="Opening conversation…" />
        ) : thread.isError ? (
          <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
        ) : (
          <LedgerAssistant key={ask.threadId} threadId={ask.threadId} initialMessages={thread.data.messages} />
        )}
      </div>
    </div>
  );
}

/** The assistant beside the content on wide screens, as a sheet from the bottom elsewhere. */
export function AskPanel() {
  const { ask, closeAsk, ledger } = useLedgerContext();
  const wide = useIsWide();
  if (wide) {
    if (!ask.open) return null;
    return (
      <aside aria-label="Assistant" className="hidden w-[26rem] shrink-0 flex-col border-l border-border bg-background lg:flex animate-fade">
        <PanelBody />
      </aside>
    );
  }
  return (
    <Drawer open={ask.open} onOpenChange={(open) => !open && closeAsk()}>
      <DrawerContent className="h-[92dvh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Assistant</DrawerTitle>
          <DrawerDescription>Ask about {ledger.title}.</DrawerDescription>
        </DrawerHeader>
        <PanelBody />
      </DrawerContent>
    </Drawer>
  );
}
