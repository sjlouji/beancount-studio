"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiDelete, errorMessage } from "@/lib/api/client";
import { keys, ledgerPath } from "@/lib/api/hooks";
import type { Ledger } from "@/lib/api/types";
import { workspaceHref } from "@/lib/routes";

export function DangerZone({ ledger }: { ledger: Ledger }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const remove = useMutation({
    mutationFn: () => apiDelete<void>(ledgerPath(ledger.workspace, ledger.slug)),
    onSuccess: () => {
      toast.success(`Deleted ${ledger.title}`);
      setOpen(false);
      qc.removeQueries({ queryKey: keys.ledger(ledger.workspace, ledger.slug) });
      void qc.invalidateQueries({ queryKey: keys.ledgers });
      void qc.invalidateQueries({ queryKey: keys.workspaceScope(ledger.workspace) });
      void qc.invalidateQueries({ queryKey: keys.workspaces });
      router.push(workspaceHref(ledger.workspace));
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't delete the ledger")),
  });

  return (
    <Card className="animate-rise border-negative/40 ring-negative/20 [animation-delay:200ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-negative">Danger zone</CardTitle>
        <CardDescription>Deleting a ledger permanently removes its files, history, stars and chat threads. This cannot be undone. Download an archive first if you might need it.</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setTyped("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2Icon data-icon="inline-start" /> Delete this ledger
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {ledger.title}?</AlertDialogTitle>
              <AlertDialogDescription>
                Type <code className="font-mono text-foreground">{ledger.slug}</code> to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={ledger.slug} aria-label="Type the ledger slug to confirm" autoComplete="off" className="font-mono" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* A plain Button, not AlertDialogAction, so the dialog stays open until the request settles. */}
              <Button variant="destructive" disabled={typed !== ledger.slug || remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending && <Spinner data-icon="inline-start" />} Delete ledger
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
