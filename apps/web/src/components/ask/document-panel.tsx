"use client";

import { DownloadIcon, XIcon } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** A document the assistant made (the `document` of a create_document result). */
export interface ChatDocument {
  id: string;
  filename: string;
  format: "html" | "pdf" | "xlsx" | "docx";
  mimeType: string;
  size: number;
  url: string;
}

export const PREVIEWABLE = new Set<ChatDocument["format"]>(["html", "pdf"]);

/**
 * The document beside the conversation, as Claude shows artifacts: the Ask page provides it, and
 * a document card's Preview opens there. Elsewhere (no provider) the card falls back to a dialog.
 */
const DocumentPanelContext = createContext<{ open: (document: ChatDocument) => void } | null>(null);

export function useDocumentPanel() {
  return useContext(DocumentPanelContext);
}

/** Renders `children(panel)`: the page places the panel (or null) beside its conversation. */
export function DocumentPanelProvider({ children }: { children: (panel: ReactNode) => ReactNode }) {
  const [document, setDocument] = useState<ChatDocument | null>(null);
  return (
    <DocumentPanelContext.Provider value={{ open: setDocument }}>
      {children(document ? <DocumentPanel key={document.id} document={document} onClose={() => setDocument(null)} /> : null)}
    </DocumentPanelContext.Provider>
  );
}

/**
 * The document itself: HTML in a sandboxed frame (no scripts, no same-origin access), PDF in the
 * browser's own viewer. Fetched with the session cookie and shown from memory.
 */
export function DocumentViewer({ document }: { document: ChatDocument }) {
  const [state, setState] = useState<{ html?: string; pdfUrl?: string; error?: string }>({});
  useEffect(() => {
    let pdfUrl: string | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(document.url, { credentials: "include" });
        if (!response.ok) throw new Error(`The document could not be loaded (${response.status}).`);
        if (document.format === "html") {
          const html = await response.text();
          if (!cancelled) setState({ html });
        } else {
          pdfUrl = URL.createObjectURL(await response.blob());
          if (!cancelled) setState({ pdfUrl });
        }
      } catch (err) {
        if (!cancelled) setState({ error: err instanceof Error ? err.message : "The document could not be loaded." });
      }
    })();
    return () => {
      cancelled = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [document.url, document.format]);

  if (state.error) {
    return (
      <p role="alert" className="p-4 text-sm text-negative">
        {state.error}
      </p>
    );
  }
  if (state.html !== undefined) return <iframe title={document.filename} sandbox="" srcDoc={state.html} className="size-full bg-white" />;
  if (state.pdfUrl) return <iframe title={document.filename} src={state.pdfUrl} className="size-full" />;
  return (
    <div className="flex size-full items-center justify-center">
      <Spinner label="Loading the preview" />
    </div>
  );
}

function DocumentPanel({ document, onClose }: { document: ChatDocument; onClose: () => void }) {
  return (
    <aside aria-label={document.filename} className="flex min-h-0 w-[min(46%,42rem)] shrink-0 flex-col border-l border-border bg-background max-lg:hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 flex-1 truncate type-headline">{document.filename}</span>
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${document.filename}`}>
          <a href={document.url} download={document.filename}>
            <DownloadIcon />
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close the preview" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <DocumentViewer document={document} />
      </div>
    </aside>
  );
}
