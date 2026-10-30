"use client";

import { useMutation } from "@tanstack/react-query";
import { FileIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, errorMessage } from "@/lib/api/client";
import { ledgerPath, useInvalidateLedger } from "@/lib/api/hooks";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UploadResult {
  files: string[];
  commit: string | null;
}

/** multipart upload over XHR: `fetch` cannot report upload progress. */
function uploadFiles(url: string, files: File[], directory: string, onProgress: (percent: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    form.append("directory", directory);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.withCredentials = true;
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new ApiError(0, "network_error", "Network error while uploading"));
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        /* non-JSON body */
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload as UploadResult);
        return;
      }
      const error = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
      reject(new ApiError(request.status, error?.code ?? `http_${request.status}`, error?.message ?? (request.statusText || "Upload failed"), error?.details ?? {}));
    };
    request.send(form);
  });
}

export function UploadDialog({ workspace, slug, directory, open, onOpenChange }: { workspace: string; slug: string; directory: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <UploadForm workspace={workspace} slug={slug} directory={directory} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UploadForm({ workspace, slug, directory, onDone }: { workspace: string; slug: string; directory: string; onDone: () => void }) {
  const invalidate = useInvalidateLedger(workspace, slug);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const upload = useMutation({
    mutationFn: () => uploadFiles(`/api${ledgerPath(workspace, slug)}/files/upload`, files, directory, setProgress),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Uploaded ${result.files.length} ${result.files.length === 1 ? "file" : "files"}`);
      onDone();
    },
    onError: (error) => {
      setProgress(0);
      toast.error("Upload failed", { description: errorMessage(error) });
    },
  });

  function addFiles(incoming: FileList | File[]) {
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      return [...current, ...Array.from(incoming).filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  const total = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Upload files</DialogTitle>
        <DialogDescription>
          Files are added to <span className="font-mono text-foreground">{directory ? `${directory}/` : "the repository root"}</span> in a single commit.
        </DialogDescription>
      </DialogHeader>

      <div
        role="button"
        tabIndex={0}
        aria-label="Choose files to upload"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed bg-surface/60 px-6 py-8 text-center text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <UploadCloudIcon className="size-6 text-muted-foreground" />
        <div className="font-medium">Drop files here or click to browse</div>
        <div className="text-xs text-muted-foreground">Statements, receipts, or additional .bean files</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-sm scrollbar-thin">
          {files.map((file) => (
            <li key={`${file.name}:${file.size}`} className="flex items-center gap-2 px-3 py-1.5">
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{file.name}</span>
              <span className="tabular text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} disabled={upload.isPending} onClick={() => setFiles((c) => c.filter((f) => f !== file))}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {upload.isPending && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <Progress value={progress} aria-label="Upload progress" />
          <div className="tabular text-xs text-muted-foreground">{progress < 100 ? `Uploading… ${progress}%` : "Committing…"}</div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={upload.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={files.length === 0 || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending && <Spinner data-icon="inline-start" />}
          Upload {files.length > 0 ? `${files.length} ${files.length === 1 ? "file" : "files"} · ${formatBytes(total)}` : ""}
        </Button>
      </DialogFooter>
    </div>
  );
}
