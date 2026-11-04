"use client";

import { MoreHorizontalIcon, PencilIcon, SquarePenIcon, StarIcon, StarOffIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SidebarListSkeleton, SidebarSection } from "@/components/app/sidebar-parts";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileIcon, FileSize } from "@/components/ui/file";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useChatFiles, useChatThreads, useDeleteChatThread, useMe, useUpdateChatThread } from "@/lib/api/hooks";
import type { ChatThread } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The ⋯ menu of a conversation: star, rename, delete. Used by the sidebar rows and the conversation header. */
export function ThreadMenu({ thread, trigger, align = "end" }: { thread: ChatThread; trigger: ReactNode; align?: "start" | "end" }) {
  const { workspace, slug, base } = useLedgerContext();
  const router = useRouter();
  const current = useSearchParams().get("thread");
  const update = useUpdateChatThread(workspace, slug);
  const remove = useDeleteChatThread(workspace, slug);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(thread.title);

  const star = () =>
    update.mutate(
      { id: thread.id, pinned: !thread.pinned },
      { onSuccess: (t) => toast.success(t.pinned ? "Starred" : "Removed from Starred"), onError: (err) => toast.error(errorMessage(err)) },
    );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-44">
          <DropdownMenuItem onSelect={star}>
            {thread.pinned ? <StarOffIcon /> : <StarIcon />} {thread.pinned ? "Unstar" : "Star"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setTitle(thread.title);
              setRenaming(true);
            }}
          >
            <PencilIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                { id: thread.id, title: title.trim() },
                { onSuccess: () => setRenaming(false), onError: (err) => toast.error(errorMessage(err)) },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription className="sr-only">Give the conversation a new title</DialogDescription>
            </DialogHeader>
            <Input id="thread-title" aria-label="Title" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || update.isPending}>
                {update.isPending && <Spinner data-icon="inline-start" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>“{thread.title}” and its messages are deleted. Documents it made stay in Files until you delete them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(thread.id, {
                  onSuccess: () => {
                    toast.success("Conversation deleted");
                    if (current === thread.id) router.replace(`${base}/ask`);
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ThreadRow({ thread, active }: { thread: ChatThread; active: boolean }) {
  const { base } = useLedgerContext();
  return (
    <li className="group/row relative">
      <Link
        href={`${base}/ask?thread=${thread.id}`}
        aria-current={active ? "page" : undefined}
        title={`${thread.title} · ${formatRelative(thread.updatedAt)}`}
        className={cn(
          "press flex h-8 w-full items-center rounded-md pr-8 pl-2 type-subhead outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/40",
          active ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      </Link>
      <ThreadMenu
        thread={thread}
        trigger={
          <button
            type="button"
            aria-label={`More for ${thread.title}`}
            className={cn(
              "absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-sidebar-ring/40 data-[state=open]:opacity-100",
              active ? "text-sidebar-primary-foreground hover:bg-white/15" : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        }
      />
    </li>
  );
}

function Conversations({ query }: { query: string }) {
  const { workspace, slug } = useLedgerContext();
  const { data: me } = useMe();
  const current = useSearchParams().get("thread");
  const threads = useChatThreads(workspace, slug, Boolean(me));
  if (threads.isPending) return <SidebarListSkeleton rows={6} />;
  if (threads.isError) {
    return (
      <div role="alert" className="mx-3 mt-3 space-y-2 type-footnote text-negative">
        <p>{errorMessage(threads.error)}</p>
        <Button variant="outline" size="xs" onClick={() => void threads.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const needle = query.trim().toLowerCase();
  // A conversation that was opened but never used stays out of the lists, unless it's the open one.
  const shown = threads.data.filter((t) => (t.messageCount > 0 || t.id === current) && (!needle || t.title.toLowerCase().includes(needle)));
  const starred = shown.filter((t) => t.pinned).sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
  const recents = shown.filter((t) => !t.pinned);
  if (shown.length === 0) {
    return <p className="mx-4 mt-3 type-footnote text-sidebar-muted">{needle ? `No conversation matches “${query.trim()}”.` : "Your conversations appear here."}</p>;
  }
  return (
    <>
      {starred.length > 0 && (
        <SidebarSection id="ask-starred" label="Starred">
          <ul className="flex flex-col gap-px">
            {starred.map((t) => (
              <ThreadRow key={t.id} thread={t} active={t.id === current} />
            ))}
          </ul>
        </SidebarSection>
      )}
      {recents.length > 0 && (
        <SidebarSection id="ask-recents" label="Recents">
          <ul className="flex flex-col gap-px">
            {recents.map((t) => (
              <ThreadRow key={t.id} thread={t} active={t.id === current} />
            ))}
          </ul>
        </SidebarSection>
      )}
    </>
  );
}

function Files() {
  const { workspace, slug, base } = useLedgerContext();
  const files = useChatFiles(workspace, slug);
  return (
    <SidebarSection id="ask-files" label="Files" defaultOpen={false}>
      {files.isPending ? (
        <SidebarListSkeleton rows={3} />
      ) : files.isError ? (
        <p role="alert" className="px-1 py-1 type-footnote text-negative">
          {errorMessage(files.error)}
        </p>
      ) : files.data.length === 0 ? (
        <p className="px-1 py-1 type-footnote text-sidebar-muted">Documents the assistant makes appear here.</p>
      ) : (
        <ul className="flex flex-col gap-px">
          {files.data.map((file) => (
            <li key={file.id}>
              <Link
                href={`${base}/ask?thread=${file.threadId}`}
                title={`${file.filename} · from “${file.threadTitle}”`}
                className="press flex items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/40"
              >
                <FileIcon mimeType={file.mimeType} className="size-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-subhead text-sidebar-foreground">{file.filename}</span>
                  <span className="block truncate type-caption text-sidebar-muted">
                    <FileSize bytes={file.size} className="type-caption" /> · {formatRelative(file.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}

function ChatSidebarInner() {
  const { base } = useLedgerContext();
  const [query, setQuery] = useState("");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 px-3 pt-3">
        <Button asChild variant="secondary" className="w-full justify-start">
          <Link href={`${base}/ask?new=1`}>
            <SquarePenIcon data-icon="inline-start" /> New chat
          </Link>
        </Button>
        <SearchInput size="sm" label="Search chats" placeholder="Search chats" value={query} onValueChange={setQuery} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin">
        <Conversations query={query} />
        <Files />
      </div>
    </div>
  );
}

/** The sidebar on the Ask page, in place of the ledger's pages: new chat, search, starred, recents and files. */
export function ChatSidebar() {
  return (
    <Suspense fallback={<SidebarListSkeleton rows={6} />}>
      <ChatSidebarInner />
    </Suspense>
  );
}
