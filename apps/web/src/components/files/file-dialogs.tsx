"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiPost, errorMessage } from "@/lib/api/client";
import { ledgerPath, useInvalidateLedger } from "@/lib/api/hooks";

interface LedgerRef {
  owner: string;
  slug: string;
}

export function editorHref(base: string, path: string, line?: number): string {
  return `${base}/files/edit?path=${encodeURIComponent(path)}${line ? `&line=${line}` : ""}`;
}

export function NewFileDialog({ owner, slug, base, directory, open, onOpenChange }: LedgerRef & { base: string; directory: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NewFileForm owner={owner} slug={slug} base={base} directory={directory} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewFileForm({ owner, slug, base, directory, onDone }: LedgerRef & { base: string; directory: string; onDone: () => void }) {
  const router = useRouter();
  const invalidate = useInvalidateLedger(owner, slug);
  const [path, setPath] = useState(directory ? `${directory}/` : "");
  const [content, setContent] = useState("");
  const create = useMutation({
    mutationFn: (input: { path: string; content: string }) => apiPost<{ path: string; sha256sum: string; commit: string | null }>(`${ledgerPath(owner, slug)}/files`, input),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Created ${result.path}`);
      onDone();
      router.push(editorHref(base, result.path));
    },
    onError: (error) => toast.error("Couldn't create the file", { description: errorMessage(error) }),
  });
  const trimmed = path.trim().replace(/^\/+/, "");
  const valid = trimmed.length > 0 && !trimmed.endsWith("/");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) create.mutate({ path: trimmed, content });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>New file</DialogTitle>
        <DialogDescription>Creates the file and commits it to the repository, then opens the editor.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="new-file-path">Path</Label>
        <Input id="new-file-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="transactions/2026.bean" className="font-mono text-[13px]" autoFocus autoComplete="off" spellCheck={false} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-file-content">Initial content (optional)</Label>
        <Textarea id="new-file-content" value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="font-mono text-[13px]" spellCheck={false} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending && <Spinner data-icon="inline-start" />} Create file
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameFileDialog({ owner, slug, path, onClose }: LedgerRef & { path: string | null; onClose: () => void }) {
  return (
    <Dialog open={path !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{path !== null && <RenameForm key={path} owner={owner} slug={slug} path={path} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RenameForm({ owner, slug, path, onDone }: LedgerRef & { path: string; onDone: () => void }) {
  const invalidate = useInvalidateLedger(owner, slug);
  const [target, setTarget] = useState(path);
  const rename = useMutation({
    mutationFn: (input: { oldPath: string; newPath: string }) => apiPost<{ path: string; commit: string | null }>(`${ledgerPath(owner, slug)}/files/rename`, input),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Renamed to ${result.path}`);
      onDone();
    },
    onError: (error) => toast.error("Couldn't rename the file", { description: errorMessage(error) }),
  });
  const next = target.trim().replace(/^\/+/, "");
  const valid = next.length > 0 && next !== path;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) rename.mutate({ oldPath: path, newPath: next });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Rename or move</DialogTitle>
        <DialogDescription>
          Change the full path of <span className="font-mono text-foreground">{path}</span>. Include directories to move it. Existing <span className="font-mono">include</span> directives are not rewritten.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="rename-path">New path</Label>
        <Input id="rename-path" value={target} onChange={(e) => setTarget(e.target.value)} className="font-mono text-[13px]" autoFocus autoComplete="off" spellCheck={false} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || rename.isPending}>
          {rename.isPending && <Spinner data-icon="inline-start" />} Rename
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteFileDialog({ owner, slug, path, onClose }: LedgerRef & { path: string | null; onClose: () => void }) {
  const invalidate = useInvalidateLedger(owner, slug);
  const remove = useMutation({
    mutationFn: (target: string) => apiDelete<{ deleted: string; commit: string | null }>(`${ledgerPath(owner, slug)}/files`, { path: target }),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Deleted ${result.deleted}`);
      onClose();
    },
    onError: (error) => {
      toast.error("Couldn't delete the file", { description: errorMessage(error) });
      onClose();
    },
  });

  return (
    <AlertDialog open={path !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this file?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono text-foreground">{path}</span> will be removed in a new commit. It stays recoverable from the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (path) remove.mutate(path);
            }}
          >
            {remove.isPending && <Spinner data-icon="inline-start" />} Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
