"use client";

import { EyeIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { DocumentPreviewDialog, documentRawUrl, previewKind } from "@/components/data/document-preview-dialog";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDocuments } from "@/lib/api/hooks";

const DOCUMENT_EXAMPLE = `option "documents" "documents"

; matches documents/Assets/US/BofA/Checking/2025-03-01.statement.pdf
2025-03-01 document Assets:US:BofA:Checking "documents/Assets/US/BofA/Checking/2025-03-01.statement.pdf"`;

export default function DocumentsPage() {
  const { workspace, slug, base, params, queryString } = useLedgerContext();
  const documents = useDocuments(workspace, slug, params);
  const [preview, setPreview] = useState<string | null>(null);

  if (documents.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Documents" title="Statements and receipts" />
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (documents.isError) return <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />;
  const entries = documents.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documents"
        title="Statements and receipts"
        description="Files attached to accounts through Beancount `document` directives. Click a file name to open it in a new tab."
        actions={
          <Button asChild variant="outline">
            <Link href={`${base}/files`}>Manage files</Link>
          </Button>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon />}
          title="No documents in this scope"
          description={
            <>
              A <code className="font-mono text-xs">document</code> directive links a file to an account on a date. Files under a folder listed in the{" "}
              <code className="font-mono text-xs">documents</code> option are picked up automatically when their path mirrors the account name.
              <pre className="mx-auto mt-3 w-fit max-w-full overflow-x-auto rounded-lg border bg-surface p-3 text-left font-mono text-xs">{DOCUMENT_EXAMPLE}</pre>
            </>
          }
          action={
            <Button asChild>
              <Link href={`${base}/files`}>Upload on the Files page</Link>
            </Button>
          }
        />
      ) : (
        <div className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:80ms]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Tags &amp; links</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Preview</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const path = entry.documentPath ?? "";
                return (
                  <TableRow key={entry.entryHash}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{entry.date}</TableCell>
                    <TableCell>
                      {entry.account && (
                        <Link href={accountHref(base, entry.account, queryString)} className="font-mono text-[13px] hover:underline">
                          {entry.account}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <a href={documentRawUrl(workspace, slug, path)} target="_blank" rel="noreferrer" title={path} className="font-mono text-[13px] hover:underline">
                        {entry.basename ?? path}
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {entry.tags?.map((tag) => (
                          <Badge key={`t-${tag}`} variant="secondary">
                            #{tag}
                          </Badge>
                        ))}
                        {entry.links?.map((link) => (
                          <Badge key={`l-${link}`} variant="outline">
                            ^{link}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={previewKind(path) === "none" ? `No preview available for ${entry.basename}` : `Preview ${entry.basename}`}
                        disabled={previewKind(path) === "none"}
                        onClick={() => setPreview(path)}
                      >
                        <EyeIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <DocumentPreviewDialog workspace={workspace} slug={slug} documentPath={preview} onOpenChange={(open) => !open && setPreview(null)} />
    </div>
  );
}
