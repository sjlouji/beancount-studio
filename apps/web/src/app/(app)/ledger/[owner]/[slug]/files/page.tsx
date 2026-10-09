"use client";

import { ArchiveIcon, DownloadIcon, FileIcon, FilePlusIcon, FolderIcon, MoreHorizontalIcon, PencilLineIcon, Trash2Icon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { DeleteFileDialog, editorHref, NewFileDialog, RenameFileDialog } from "@/components/files/file-dialogs";
import { UploadDialog } from "@/components/files/upload-dialog";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerPath, useFileTree } from "@/lib/api/hooks";
import type { TreeEntry } from "@/lib/api/types";
import { formatBytes, formatRelative } from "@/lib/format";

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.type === "dir" ? -1 : 1));
}

export default function FilesPage() {
  const { owner, slug, base, canWrite, meta } = useLedgerContext();
  const path = (useSearchParams().get("path") ?? "").replace(/^\/+|\/+$/g, "");
  const tree = useFileTree(owner, slug, path);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const mainFile = meta?.favaOptions.defaultFile ?? "main.bean";
  const segments = useMemo(() => (path ? path.split("/") : []), [path]);
  const entries = useMemo(() => sortEntries(tree.data?.entries ?? []), [tree.data]);
  const rawUrl = (filePath: string) => `/api${ledgerPath(owner, slug)}/files/raw?path=${encodeURIComponent(filePath)}`;
  const dirHref = (dir: string) => (dir ? `${base}/files?path=${encodeURIComponent(dir)}` : `${base}/files`);

  const actions = (
    <>
      {canWrite && (
        <>
          <Button size="sm" onClick={() => setCreating(true)}>
            <FilePlusIcon data-icon="inline-start" /> New file
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUploading(true)}>
            <UploadIcon data-icon="inline-start" /> Upload
          </Button>
        </>
      )}
      <Button asChild size="sm" variant="outline">
        <a href={`/api${ledgerPath(owner, slug)}/archive`} download>
          <ArchiveIcon data-icon="inline-start" /> Download archive
        </a>
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repository"
        title="Files"
        description={
          <>
            Every file in this ledger&apos;s git repository. The main file is <span className="font-mono text-foreground">{mainFile}</span>; it pulls in the rest with <span className="font-mono">include</span>.
          </>
        }
        actions={actions}
      />

      <Breadcrumb className="animate-rise [animation-delay:80ms]">
        <BreadcrumbList className="font-mono text-[13px]">
          <BreadcrumbItem>
            {segments.length === 0 ? (
              <BreadcrumbPage>{slug}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link href={dirHref("")}>{slug}</Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {segments.map((segment, index) => {
            const target = segments.slice(0, index + 1).join("/");
            const last = index === segments.length - 1;
            return (
              <Fragment key={target}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {last ? (
                    <BreadcrumbPage>{segment}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={dirHref(target)}>{segment}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {tree.isPending ? (
        <CardSkeleton rows={6} />
      ) : tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => void tree.refetch()} title="Couldn't open this directory" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<FolderIcon />}
          title="This directory is empty"
          description={canWrite ? "Create a new file or upload statements and receipts here." : "Nothing has been added here yet."}
          action={
            canWrite ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setCreating(true)}>
                  <FilePlusIcon data-icon="inline-start" /> New file
                </Button>
                <Button size="sm" variant="outline" onClick={() => setUploading(true)}>
                  <UploadIcon data-icon="inline-start" /> Upload
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="animate-rise overflow-hidden rounded-xl border bg-card card-elevated [animation-delay:120ms]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell">Last commit</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isDir = entry.type === "dir";
                  const isMain = !isDir && entry.path === mainFile;
                  const commit = entry.lastCommit;
                  return (
                    <TableRow key={entry.path}>
                      <TableCell>
                        <Link href={isDir ? dirHref(entry.path) : editorHref(base, entry.path)} className="group flex items-center gap-2.5 font-mono text-[13px]">
                          {isDir ? <FolderIcon className="size-4 shrink-0 text-chart-3" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
                          <span className="truncate group-hover:underline">{entry.name}</span>
                          {isMain && (
                            <Badge variant="secondary" className="font-sans">
                              main
                            </Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular hidden text-right text-muted-foreground sm:table-cell">{isDir ? "–" : formatBytes(entry.size)}</TableCell>
                      <TableCell className="hidden max-w-0 md:table-cell">
                        {commit ? (
                          <div className="flex min-w-0 items-baseline gap-2 text-[13px]">
                            <Link href={`${base}/commit/${commit.sha}`} className="truncate hover:underline" title={commit.subject}>
                              {commit.subject}
                            </Link>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(commit.author.date)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isDir && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.name}`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <a href={rawUrl(entry.path)} download={entry.name}>
                                  <DownloadIcon /> Download
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`${base}/commits?path=${encodeURIComponent(entry.path)}`}>History</Link>
                              </DropdownMenuItem>
                              {canWrite && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setRenaming(entry.path)}>
                                    <PencilLineIcon /> Rename or move
                                  </DropdownMenuItem>
                                  <DropdownMenuItem variant="destructive" disabled={isMain} onSelect={() => setDeleting(entry.path)}>
                                    <Trash2Icon /> {isMain ? "Delete (main file)" : "Delete"}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {canWrite && (
        <>
          <NewFileDialog owner={owner} slug={slug} base={base} directory={path} open={creating} onOpenChange={setCreating} />
          <UploadDialog owner={owner} slug={slug} directory={path} open={uploading} onOpenChange={setUploading} />
          <RenameFileDialog owner={owner} slug={slug} path={renaming} onClose={() => setRenaming(null)} />
          <DeleteFileDialog owner={owner} slug={slug} path={deleting} onClose={() => setDeleting(null)} />
        </>
      )}
    </div>
  );
}
