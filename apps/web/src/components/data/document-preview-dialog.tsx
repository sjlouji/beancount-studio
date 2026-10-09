"use client";

import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ledgerPath } from "@/lib/api/hooks";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);

export type PreviewKind = "image" | "pdf" | "none";

export function documentRawUrl(owner: string, slug: string, documentPath: string): string {
  return `/api${ledgerPath(owner, slug)}/files/raw?path=${encodeURIComponent(documentPath)}`;
}

export function previewKind(path: string): PreviewKind {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return extension === "pdf" ? "pdf" : "none";
}

/** Inline preview for image and PDF documents, served from the ledger's raw-file endpoint. */
export function DocumentPreviewDialog({ owner, slug, documentPath, onOpenChange }: { owner: string; slug: string; documentPath: string | null; onOpenChange: (open: boolean) => void }) {
  const url = documentPath ? documentRawUrl(owner, slug, documentPath) : "";
  const kind = documentPath ? previewKind(documentPath) : "none";
  return (
    <Dialog open={Boolean(documentPath)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm">{documentPath?.split("/").pop()}</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{documentPath}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-surface">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin API file, not optimisable by next/image
            <img src={url} alt={documentPath ?? "Document preview"} className="mx-auto max-h-[70dvh] object-contain" />
          )}
          {kind === "pdf" && <iframe src={url} title={documentPath ?? "Document preview"} className="h-[70dvh] w-full" />}
          {kind === "none" && <p className="p-6 text-center text-sm text-muted-foreground">This file type can&apos;t be previewed in the browser.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon data-icon="inline-start" /> Open in new tab
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={url} download>
              <DownloadIcon data-icon="inline-start" /> Download
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
