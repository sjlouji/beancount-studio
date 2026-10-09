"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2Icon, LockIcon, ScanTextIcon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState } from "@/components/app/states";
import { Dropzone } from "@/components/import/dropzone";
import { parseTags, ReadingReceipt, ReceiptForm, type ReceiptFormValues } from "@/components/import/receipt-form";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api/client";
import { ledgerPath, useInvalidateLedger, useSystemInfo } from "@/lib/api/hooks";
import type { LedgerError, ReceiptParse, Upload } from "@/lib/api/types";
import { todayIso } from "@/lib/format";

const ACCEPT = "image/*,application/pdf";

interface InsertResult {
  commit: string | null;
  file: string;
  receiptPath: string | null;
  errors: LedgerError[];
}

export default function ReceiptPage() {
  const { owner, slug, base, canWrite, meta } = useLedgerContext();
  const system = useSystemInfo();
  const invalidate = useInvalidateLedger(owner, slug);
  const aiEnabled = system.data?.aiEnabled ?? false;

  const blank = (): ReceiptFormValues => ({
    date: todayIso(),
    payee: "",
    narration: "",
    amount: "",
    currency: meta?.operatingCurrencies[0] ?? "",
    expenseAccount: "",
    paymentAccount: "",
    tags: "",
    attachFile: true,
  });
  const [values, setValues] = useState<ReceiptFormValues>(blank);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [receipt, setReceipt] = useState<ReceiptParse["receipt"] | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState<InsertResult | null>(null);

  const parse = useMutation({
    mutationFn: (uploadId: string) => apiPost<ReceiptParse>(`${ledgerPath(owner, slug)}/receipts/parse`, { uploadId }),
    onSuccess: ({ receipt: parsed }) => {
      setReceipt(parsed);
      setValues((prev) => ({
        ...prev,
        date: parsed.date || prev.date,
        payee: parsed.payee,
        narration: parsed.narration,
        amount: String(parsed.total),
        currency: parsed.currency || prev.currency,
        expenseAccount: parsed.expenseAccount,
        paymentAccount: parsed.paymentAccount,
      }));
    },
    onError: (err) => toast.error("Couldn't read the receipt", { description: errorMessage(err) }),
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiPost<Upload>("/uploads", form);
    },
    onSuccess: (uploaded) => {
      setUpload(uploaded);
      setReceipt(null);
      if (aiEnabled) parse.mutate(uploaded.id);
    },
    onError: (err) => toast.error("Upload failed", { description: errorMessage(err) }),
  });

  const insert = useMutation({
    mutationFn: () =>
      apiPost<InsertResult>(`${ledgerPath(owner, slug)}/receipts/insert`, {
        uploadId: upload?.id ?? null,
        date: values.date,
        payee: values.payee,
        narration: values.narration,
        amount: values.amount.trim(),
        currency: values.currency.trim(),
        expenseAccount: values.expenseAccount,
        paymentAccount: values.paymentAccount,
        tags: parseTags(values.tags),
        attachFile: upload ? values.attachFile : false,
      }),
    onSuccess: (result) => {
      setDone(result);
      invalidate();
      toast.success("Receipt added to the ledger");
    },
    onError: (err) => toast.error("Couldn't add the receipt", { description: errorMessage(err) }),
  });

  const reset = () => {
    setValues(blank());
    setUpload(null);
    setReceipt(null);
    setDone(null);
    setAttempted(false);
    parse.reset();
    uploadFile.reset();
    insert.reset();
  };

  const validationError = (() => {
    if (!values.date) return "Enter a date.";
    if (!Number.isFinite(Number(values.amount)) || values.amount.trim() === "") return "Enter the total as a number.";
    if (!values.currency.trim()) return "Enter a currency.";
    if (!values.expenseAccount || !values.paymentAccount) return "Choose both an expense account and a payment account.";
    return null;
  })();

  if (!canWrite) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Receipt" title="Capture a receipt" />
        <EmptyState icon={<LockIcon />} title="This ledger is read-only for you" description="Adding receipts writes to the ledger, which needs write access." />
      </div>
    );
  }

  const header = <PageHeader eyebrow="Receipt" title="Capture a receipt" description="Drop a photo or PDF, let the model read it, fix anything it got wrong, and add the transaction with the file attached." />;

  if (done) {
    return (
      <div className="space-y-6">
        {header}
        <section className="space-y-4 rounded-xl border bg-card p-6 card-elevated animate-rise">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-positive/10 text-positive">
              <CheckCircle2Icon className="size-5" />
            </span>
            <div>
              <h2 className="font-medium">Added to {done.file}</h2>
              <p className="text-sm text-muted-foreground">
                Commit <span className="font-mono">{done.commit?.slice(0, 8) ?? "none"}</span>
                {done.receiptPath && (
                  <>
                    {" "}
                    with receipt saved at <span className="font-mono text-[13px]">{done.receiptPath}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          {done.errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
              {done.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`${base}/journal`}>Open journal</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              Scan another
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const reading = parse.isPending;
  const showWorkspace = upload !== null || !aiEnabled;

  return (
    <div className="space-y-6">
      {header}

      {!system.isPending && !aiEnabled && (
        <EmptyState
          icon={<SparklesIcon />}
          title="Receipt reading is switched off"
          description={
            <>
              Automatic extraction needs a configured model: set <span className="font-mono text-[13px]">BS_ANTHROPIC_API_KEY</span>, or <span className="font-mono text-[13px]">BS_OPENAI_BASE_URL</span> plus <span className="font-mono text-[13px]">BS_AI_MODEL</span> for a self-hosted model, then restart the server. You can still enter the transaction by hand below.
            </>
          }
        />
      )}

      {!showWorkspace && (
        <div className="animate-rise [animation-delay:60ms]">
          <Dropzone
            accept={ACCEPT}
            onFile={(file) => uploadFile.mutate(file)}
            busy={uploadFile.isPending}
            busyLabel="Uploading…"
            icon={<ScanTextIcon className="size-6" />}
            title="Drop a receipt here, or click to choose"
            hint="JPG, PNG, HEIC or PDF. The file stays private until you choose to attach it to the ledger."
          />
        </div>
      )}

      {uploadFile.isError && !upload && <ErrorState error={uploadFile.error} title="Couldn't upload that file" />}

      {showWorkspace && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-3 animate-rise [animation-delay:60ms]">
            {upload ? (
              <div className="overflow-hidden rounded-xl border bg-card card-elevated">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
                  <span className="truncate text-sm font-medium">{upload.filename}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => { setUpload(null); setReceipt(null); parse.reset(); }}>
                    <XIcon />
                  </Button>
                </div>
                {upload.mimeType === "application/pdf" ? (
                  <iframe title="Receipt preview" src={`/api/uploads/${upload.id}`} className="h-[70vh] w-full bg-muted" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin upload, not optimisable
                  <img src={`/api/uploads/${upload.id}`} alt={`Receipt ${upload.filename}`} className="max-h-[70vh] w-full bg-muted object-contain" />
                )}
              </div>
            ) : (
              <Dropzone accept={ACCEPT} onFile={(file) => uploadFile.mutate(file)} busy={uploadFile.isPending} busyLabel="Uploading…" compact icon={<ScanTextIcon className="size-6" />} title="Attach a receipt (optional)" hint="Images or PDF." />
            )}
            {upload && aiEnabled && parse.isError && (
              <ErrorState error={parse.error} title="Couldn't read this receipt" onRetry={() => parse.mutate(upload.id)} className="py-6" />
            )}
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            {reading ? (
              <ReadingReceipt />
            ) : (
              <ReceiptForm
                values={values}
                onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                receipt={receipt}
                hasUpload={upload !== null}
                submitting={insert.isPending}
                invalid={attempted ? validationError : null}
                onSubmit={() => {
                  setAttempted(true);
                  if (!validationError) insert.mutate();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
