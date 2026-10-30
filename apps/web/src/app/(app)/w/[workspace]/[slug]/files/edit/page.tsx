"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import "@/components/files/monaco-loader";
import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon, CheckCircle2Icon, ChevronDownIcon, DownloadIcon, HistoryIcon, RefreshCwIcon, SaveIcon, ShieldCheckIcon, WandSparklesIcon } from "lucide-react";
import type { editor } from "monaco-editor";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { isBeancountPath, languageForPath, registerBeancount } from "@/components/files/beancount-language";
import { THEME_DARK, THEME_LIGHT } from "@/components/files/monaco-theme";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { apiPost, apiPut, errorMessage, isApiError } from "@/lib/api/client";
import { ledgerPath, useFileContent, useInvalidateLedger } from "@/lib/api/hooks";
import type { FileContent, LedgerError, Projection, WriteResult } from "@/lib/api/types";
import { formatBytes, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type CodeEditor = editor.IStandaloneCodeEditor;
type MonacoApi = Parameters<OnMount>[1];
type CheckError = Projection["errors"][number] | LedgerError;

const MARKER_OWNER = "beancount-check";

/** Highlight for the `?line=` target; Monaco decorations need a global class. */
const HIGHLIGHT_CSS = `.bc-target-line{background:color-mix(in oklab,var(--warning) 26%,transparent);border-left:2px solid var(--warning)}`;

function readMonoFont(): string {
  const fallback = "'IBM Plex Mono', ui-monospace, monospace";
  if (typeof document === "undefined") return fallback;
  const family = getComputedStyle(document.body).getPropertyValue("--font-mono").trim();
  return family ? `${family}, ${fallback}` : fallback;
}

export default function EditPage() {
  const { base } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const path = search.get("path");
  const lineParam = Number(search.get("line"));
  const line = Number.isInteger(lineParam) && lineParam > 0 ? lineParam : undefined;

  useEffect(() => {
    if (!path) router.replace(`${base}/files`);
  }, [path, base, router]);

  if (!path) return <LoadingState label="Opening files…" />;
  // Keyed by path so switching files resets all draft state.
  return <EditorView key={path} path={path} line={line} />;
}

function EditorView({ path, line }: { path: string; line?: number }) {
  const { workspace, slug, base, canWrite } = useLedgerContext();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const invalidate = useInvalidateLedger(workspace, slug);
  const file = useFileContent(workspace, slug, path);

  const [draft, setDraft] = useState<string | null>(null);
  const [shaOverride, setShaOverride] = useState<string | null>(null);
  const [message, setMessage] = useState(`Update ${path}`);
  const [stale, setStale] = useState(false);
  const [checkErrors, setCheckErrors] = useState<CheckError[] | null>(null);
  const [fontFamily] = useState(readMonoFont);

  const editorRef = useRef<CodeEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const saveRef = useRef<() => void>(() => {});

  const data: FileContent | undefined = file.data;
  const baseline = data?.content ?? "";
  const text = draft ?? baseline;
  const dirty = draft !== null && draft !== baseline;
  const readOnly = !canWrite || Boolean(data?.binary);
  const sha = shaOverride ?? data?.sha256sum ?? undefined;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const segments = path.split("/");

  function applyMarkers(errors: CheckError[]) {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    const markers = errors
      .filter((e) => isHere(e) && e.lineno)
      .map((e) => {
        const lineNumber = Math.min(Math.max(e.lineno ?? 1, 1), model.getLineCount());
        return {
          severity: monaco.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: lineNumber,
          startColumn: 1,
          endLineNumber: lineNumber,
          endColumn: model.getLineMaxColumn(lineNumber),
        };
      });
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }

  function isHere(error: CheckError): boolean {
    return error.filename === path || Boolean(error.filename?.endsWith(`/${path}`));
  }

  function jumpTo(lineno: number) {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model) return;
    const target = Math.min(Math.max(lineno, 1), model.getLineCount());
    instance.revealLineInCenter(target);
    instance.setPosition({ lineNumber: target, column: 1 });
    instance.focus();
  }

  const handleFailure = (title: string) => (error: unknown) => {
    if (isApiError(error) && error.details.code === "stale_file") {
      setStale(true);
      toast.error("This file changed on the server", { description: "Reload it to continue editing." });
      return;
    }
    toast.error(title, { description: errorMessage(error) });
  };

  const check = useMutation({
    mutationFn: (source: string) => apiPost<Projection>(`${ledgerPath(workspace, slug)}/files/check`, { changes: { [path]: source } }),
    onSuccess: (result) => {
      setCheckErrors(result.errors);
      applyMarkers(result.errors);
    },
    onError: handleFailure("Check failed"),
  });

  const format = useMutation({
    mutationFn: (source: string) => apiPost<{ source: string }>(`${ledgerPath(workspace, slug)}/files/format`, { source }),
    onSuccess: (result) => setDraft(result.source),
    onError: handleFailure("Couldn't format the file"),
  });

  const save = useMutation({
    mutationFn: (input: { content: string; sha256sum: string | undefined; message: string }) =>
      apiPut<WriteResult>(`${ledgerPath(workspace, slug)}/files/content`, { path, ...input }),
    onSuccess: async (result) => {
      setShaOverride(result.sha256sum);
      setStale(false);
      const errors = result.errors ?? [];
      setCheckErrors(errors);
      applyMarkers(errors);
      const short = result.commit ? result.commit.slice(0, 7) : null;
      toast.success(short ? `Committed ${short}` : "Saved, no changes to commit", {
        description: errors.length > 0 ? `${errors.length} ledger ${errors.length === 1 ? "error" : "errors"} after this change` : undefined,
        action: result.commit ? { label: "View commit", onClick: () => router.push(`${base}/commit/${result.commit}`) } : undefined,
      });
      invalidate();
      const refreshed = await file.refetch();
      if (refreshed.isSuccess) {
        setDraft(null);
        setShaOverride(null);
      }
    },
    onError: handleFailure("Couldn't save"),
  });

  function runSave() {
    if (readOnly || save.isPending) return;
    if (!dirty) {
      toast.info("No changes to save");
      return;
    }
    save.mutate({ content: text, sha256sum: sha, message: message.trim() || `Update ${path}` });
  }

  useEffect(() => {
    saveRef.current = runSave;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    const model = instance.getModel();
    if (line && model) {
      const target = Math.min(line, model.getLineCount());
      instance.revealLineInCenter(target);
      instance.setPosition({ lineNumber: target, column: 1 });
      instance.createDecorationsCollection([{ range: new monaco.Range(target, 1, target, 1), options: { isWholeLine: true, className: "bc-target-line" } }]);
    }
    instance.focus();
  };

  function reload() {
    setDraft(null);
    setShaOverride(null);
    setStale(false);
    setCheckErrors(null);
    applyMarkers([]);
    void file.refetch();
  }

  if (file.isPending) return <LoadingState label={`Opening ${path}…`} />;
  if (file.isError) return <ErrorState error={file.error} onRetry={() => void file.refetch()} title="Couldn't open this file" />;
  const loaded = file.data;
  const rawUrl = `/api${ledgerPath(workspace, slug)}/files/raw?path=${encodeURIComponent(path)}`;

  if (loaded.binary) {
    return (
      <EmptyState
        title="Binary file"
        description={`${path} (${formatBytes(loaded.size)}) isn't text, so it can't be edited here.`}
        action={
          <div className="flex gap-2">
            <Button asChild size="sm">
              <a href={rawUrl} download>
                <DownloadIcon data-icon="inline-start" /> Download
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={dir ? `${base}/files?path=${encodeURIComponent(dir)}` : `${base}/files`}>Back to files</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const commit = loaded.lastCommit;
  const canFormat = isBeancountPath(path) && !readOnly;

  return (
    <div className="space-y-3">
      <style>{HIGHLIGHT_CSS}</style>

      <div className="sticky top-12 z-10 -mx-1 animate-rise rounded-xl border bg-background/90 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <nav aria-label="File path" className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-[13px]">
              <Link href={`${base}/files`} className="text-muted-foreground hover:text-foreground">
                {slug}
              </Link>
              {segments.map((segment, index) => {
                const target = segments.slice(0, index + 1).join("/");
                const last = index === segments.length - 1;
                return (
                  <Fragment key={target}>
                    <span className="text-muted-foreground/60">/</span>
                    {last ? (
                      <span className="font-medium">{segment}</span>
                    ) : (
                      <Link href={`${base}/files?path=${encodeURIComponent(target)}`} className="text-muted-foreground hover:text-foreground">
                        {segment}
                      </Link>
                    )}
                  </Fragment>
                );
              })}
              {dirty && (
                <Badge variant="outline" className="ml-2 gap-1.5 border-warning/50 font-sans text-warning-foreground dark:text-warning">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden /> Unsaved
                </Badge>
              )}
              {!canWrite && (
                <Badge variant="secondary" className="ml-2 font-sans">
                  Read-only
                </Badge>
              )}
            </nav>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="tabular">{formatBytes(loaded.size)}</span>
              {commit && (
                <span>
                  Last commit{" "}
                  <Link href={`${base}/commit/${commit.sha}`} className="font-mono text-foreground hover:underline">
                    {commit.shortSha}
                  </Link>{" "}
                  · {formatRelative(commit.author.date)}
                </span>
              )}
              <Link href={`${base}/commits?path=${encodeURIComponent(path)}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <HistoryIcon className="size-3" /> History
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate(text)}>
              {check.isPending ? <Spinner data-icon="inline-start" /> : <ShieldCheckIcon data-icon="inline-start" />} Check
            </Button>
            {canFormat && (
              <Button size="sm" variant="outline" disabled={format.isPending} onClick={() => format.mutate(text)}>
                {format.isPending ? <Spinner data-icon="inline-start" /> : <WandSparklesIcon data-icon="inline-start" />} Format
              </Button>
            )}
            {canWrite && (
              <div className="flex items-center">
                <Button size="sm" className="rounded-r-none" disabled={!dirty || save.isPending} onClick={runSave}>
                  {save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />} Save &amp; commit
                  <Kbd className="ml-1 hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">⌘S</Kbd>
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="icon-sm" className="h-7 rounded-l-none border-l border-primary-foreground/25" aria-label="Edit commit message">
                      <ChevronDownIcon />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 space-y-2">
                    <Label htmlFor="commit-message">Commit message</Label>
                    <Input
                      id="commit-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSave()}
                      placeholder={`Update ${path}`}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">Used for ⌘S and the Save button. Leave empty for the default.</p>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
      </div>

      {stale && (
        <Alert variant="destructive" className="animate-rise">
          <AlertCircleIcon />
          <AlertTitle>This file changed since you opened it</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Someone else committed to {path}. Reloading discards your unsaved edits.
            <Button size="xs" variant="outline" onClick={reload}>
              <RefreshCwIcon data-icon="inline-start" /> Reload file
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:60ms]">
        <div className="h-[calc(100dvh-20rem)] min-h-[360px]">
          <Editor
            path={path}
            language={languageForPath(path)}
            value={text}
            theme={resolvedTheme === "dark" ? THEME_DARK : THEME_LIGHT}
            beforeMount={registerBeancount}
            onMount={onMount}
            onChange={(value) => setDraft(value ?? "")}
            loading={<LoadingState label="Loading editor…" />}
            options={{
              fontFamily,
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: "off",
              renderWhitespace: "none",
              lineNumbers: "on",
              tabSize: 2,
              readOnly,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              smoothScrolling: true,
              renderLineHighlight: "line",
              overviewRulerLanes: 0,
            }}
          />
        </div>

        {checkErrors && (
          <div className="border-t bg-surface/60" role="region" aria-label="Check results">
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
              {checkErrors.length === 0 ? (
                <span className="flex items-center gap-1.5 text-positive">
                  <CheckCircle2Icon className="size-3.5" /> No errors. The ledger parses and balances.
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-negative">
                  <AlertCircleIcon className="size-3.5" /> {checkErrors.length} {checkErrors.length === 1 ? "error" : "errors"}
                </span>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => {
                  setCheckErrors(null);
                  applyMarkers([]);
                }}
              >
                Dismiss
              </Button>
            </div>
            {checkErrors.length > 0 && (
              <ul className="max-h-48 divide-y overflow-y-auto border-t scrollbar-thin">
                {checkErrors.map((error, index) => {
                  const here = isHere(error) && error.lineno;
                  const location = `${error.filename ?? "ledger"}${error.lineno ? `:${error.lineno}` : ""}`;
                  return (
                    <li key={`${location}-${index}`}>
                      <button
                        type="button"
                        disabled={!here}
                        onClick={() => error.lineno && jumpTo(error.lineno)}
                        className={cn("flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-[13px]", here ? "hover:bg-muted" : "cursor-default opacity-70")}
                      >
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{location}</span>
                        <span className="min-w-0 flex-1 break-words">{error.message}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
