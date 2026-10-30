"use client";

import {
  AssistantRuntimeProvider,
  AuiConfig,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  Tools,
  type AttachmentAdapter,
  type CompleteAttachment,
  type PendingAttachment,
  type ThreadMessageLike,
  type Toolkit,
} from "@assistant-ui/react";
import { useDataStreamRuntime } from "@assistant-ui/react-data-stream";
import type { JSONSchema7 } from "json-schema";
import { useQueryClient } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { keys, ledgerPath, useSystemInfo } from "@/lib/api/hooks";
import type { ThreadMessageLike as StoredMessage } from "@/lib/api/types";
import { ApprovalCard } from "./approval-card";
import { BqlToolUI, CheckEditToolUI, EditFilesToolUI, ListFilesToolUI, ReadFileToolUI, ReportToolUI, SearchToolUI, SummaryToolUI } from "./tool-uis";

const APPROVAL_PARAMETERS = {
  type: "object",
  properties: {
    description: { type: "string", description: "One sentence describing the change; shown to the user and used as the commit message." },
    files: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["create", "update", "replace", "delete", "append"] },
          path: { type: "string" },
          content: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["operation", "path"],
        additionalProperties: false,
      },
    },
  },
  required: ["description", "files"],
  additionalProperties: false,
} satisfies JSONSchema7;

const toolkit: Toolkit = {
  request_approval: {
    type: "human",
    description:
      "Ask the user to approve a set of ledger file operations before they are committed. Pass the exact `description` and `files` you will then pass to edit_ledger_files. The user sees a diff and bean-check result and answers with {approved: true} or {approved: false, reason}.",
    parameters: APPROVAL_PARAMETERS,
    render: ApprovalCard,
  },
  run_bql_query: { type: "backend", render: BqlToolUI },
  read_ledger_file: { type: "backend", render: ReadFileToolUI },
  list_ledger_files: { type: "backend", render: ListFilesToolUI },
  get_ledger_summary: { type: "backend", render: SummaryToolUI },
  search_transactions: { type: "backend", render: SearchToolUI },
  get_report: { type: "backend", render: ReportToolUI },
  check_ledger_edit: { type: "backend", render: CheckEditToolUI },
  edit_ledger_files: { type: "backend", render: EditFilesToolUI },
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** PDFs travel as data URLs; the API passes them to the model as documents (Anthropic) or a text note (OpenAI-compatible servers). */
class PdfAttachmentAdapter implements AttachmentAdapter {
  accept = "application/pdf";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > 20 * 1024 * 1024) throw new Error("PDF attachments must be under 20 MB");
    return { id: crypto.randomUUID(), type: "document", name: file.name, contentType: file.type || "application/pdf", file, status: { type: "requires-action", reason: "composer-send" } };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const data = await readAsDataUrl(attachment.file);
    return { ...attachment, status: { type: "complete" }, content: [{ type: "file", data, mimeType: "application/pdf", filename: attachment.name }] };
  }

  async remove(): Promise<void> {}
}

function toInitialMessages(messages: StoredMessage[] | undefined): ThreadMessageLike[] {
  if (!messages) return [];
  return messages.map((m) => ({ role: m.role, content: m.content as unknown as ThreadMessageLike["content"] })) as ThreadMessageLike[];
}

function Welcome() {
  const { ledger, canWrite } = useLedgerContext();
  const { data: info } = useSystemInfo();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center animate-rise">
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <SparklesIcon className="size-6" />
      </div>
      <h2 className="type-title-2">Ask about {ledger.title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        It can run queries, read your files and reports, and {canWrite ? "propose edits that you approve before anything is written" : "draft entries you can add yourself"}. Attach a receipt or statement to turn it into entries.
      </p>
      {info?.aiModel && (
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{info.aiModel}</span>
          {info.aiProvider === "openai" ? " · self-hosted via an OpenAI-compatible server" : " · Anthropic"}
        </p>
      )}
    </div>
  );
}

export function LedgerAssistant({ threadId, initialMessages }: { threadId: string; initialMessages: StoredMessage[] | undefined }) {
  const { workspace, slug } = useLedgerContext();
  const qc = useQueryClient();
  const attachments = useMemo(() => new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter(), new SimpleTextAttachmentAdapter(), new PdfAttachmentAdapter()]), []);
  const initial = useMemo(() => toInitialMessages(initialMessages), [initialMessages]);

  const runtime = useDataStreamRuntime({
    api: `/api${ledgerPath(workspace, slug)}/chat`,
    protocol: "data-stream",
    body: { threadId },
    initialMessages: initial,
    unstable_humanToolNames: ["request_approval"],
    maxSteps: 20,
    adapters: { attachments },
    onError: (error) => toast.error(error.message),
    onFinish: () => {
      void qc.invalidateQueries({ queryKey: keys.ledgerScope(workspace, slug, "chat-threads") });
      void qc.invalidateQueries({ queryKey: keys.ledger(workspace, slug) });
    },
  });

  const config = useMemo(() => AuiConfig({ tools: Tools({ toolkit }) }), []);

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <div className="h-full min-h-0">
        <Thread components={{ Welcome }} />
      </div>
    </AssistantRuntimeProvider>
  );
}
