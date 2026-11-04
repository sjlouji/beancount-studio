"use client";

import { ChevronDownIcon, StarIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { LedgerAssistant } from "@/components/ask/assistant";
import { AssistantSetup } from "@/components/ask/assistant-setup";
import { ThreadMenu } from "@/components/ask/chat-sidebar";
import { DocumentPanelProvider } from "@/components/ask/document-panel";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { errorMessage } from "@/lib/api/client";
import { useChatThread, useChatThreads, useCreateChatThread, useMe, useSystemInfo } from "@/lib/api/hooks";
import type { ChatThread } from "@/lib/api/types";

// The page fills the content column below the top bar (44px) and the local nav (52px + hairline);
// on phones the tab bar (56px) sits under it.
const FULL_HEIGHT = "h-[calc(100dvh-97px-env(safe-area-inset-top))] max-md:h-[calc(100dvh-153px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]";

/** The conversation's title (once it has one) with its menu, as Claude shows it above the chat. */
function ConversationHeader({ thread }: { thread: ChatThread }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-center border-b border-border px-4">
      <ThreadMenu
        thread={thread}
        align="start"
        trigger={
          <button type="button" className="press flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 type-headline outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40 data-[state=open]:bg-accent">
            {thread.pinned && <StarIcon aria-label="Starred" className="size-3.5 shrink-0 fill-current" />}
            <span className="truncate">{thread.title}</span>
            <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />
          </button>
        }
      />
    </div>
  );
}

function AskInner() {
  const { workspace, slug, base } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const { data: me, isPending: mePending } = useMe();
  const { data: info } = useSystemInfo();
  const threadId = search.get("thread");
  const wantsNew = search.get("new") === "1";
  const threads = useChatThreads(workspace, slug, Boolean(me));
  const thread = useChatThread(workspace, slug, threadId);
  const create = useCreateChatThread(workspace, slug);

  // A new chat (no conversation chosen, or New chat): reuse a conversation that was opened but never
  // used, else start one. Conversations are created up front because the chat stream needs an id.
  useEffect(() => {
    if (!me || !info?.aiEnabled || !threads.data || create.isPending) return;
    if (threadId && !wantsNew) return;
    const unused = threads.data.find((t) => t.messageCount === 0);
    if (unused) {
      router.replace(`${base}/ask?thread=${unused.id}`);
      return;
    }
    create.mutate(undefined, {
      onSuccess: (created) => router.replace(`${base}/ask?thread=${created.id}`),
      onError: (err) => toast.error(errorMessage(err)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, info?.aiEnabled, threads.data, threadId, wantsNew]);

  if (mePending) return <LoadingState />;
  if (!me) return <EmptyState title="Sign in to use the assistant" description="Conversations are private to your account." />;
  if (info && !info.aiEnabled) return <AssistantSetup className="m-4 md:m-8" />;
  if (threads.isError) return <ErrorState className="m-4 md:m-8" error={threads.error} onRetry={() => void threads.refetch()} />;

  // The list entry carries the live title and star; the thread query holds the messages.
  const summary = threads.data?.find((t) => t.id === threadId) ?? thread.data;
  return (
    <div className={`flex min-h-0 ${FULL_HEIGHT}`}>
      <DocumentPanelProvider>
        {(panel) => (
          <>
            <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
              {summary && summary.messageCount > 0 && <ConversationHeader thread={summary} />}
              <div className="min-h-0 flex-1">
                {!threadId || wantsNew || thread.isPending ? (
                  <LoadingState label="Opening conversation…" />
                ) : thread.isError ? (
                  <ErrorState className="m-4" error={thread.error} onRetry={() => void thread.refetch()} />
                ) : (
                  <LedgerAssistant key={threadId} threadId={threadId} initialMessages={thread.data.messages} />
                )}
              </div>
            </section>
            {panel}
          </>
        )}
      </DocumentPanelProvider>
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
