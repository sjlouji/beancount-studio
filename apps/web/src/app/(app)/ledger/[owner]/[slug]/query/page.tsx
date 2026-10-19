"use client";

import { BookMarkedIcon, ChevronDownIcon, PlayIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState } from "@/components/app/states";
import { queryExamples } from "@/components/data/query-examples";
import { QueryResultView } from "@/components/data/query-results";
import { useRecentQueries } from "@/components/data/use-recent-queries";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useBqlQuery } from "@/lib/api/hooks";

export default function QueryPage() {
  const { owner, slug, params, meta } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const initial = search.get("q") ?? "";
  // The editor text and the submitted text are separate so typing never triggers a request.
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const { recent, remember, clear } = useRecentQueries(owner, slug);
  const result = useBqlQuery(owner, slug, submitted, params);
  const examples = useMemo(() => queryExamples(meta?.operatingCurrencies[0] ?? "USD"), [meta?.operatingCurrencies]);

  const run = (query: string = text) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setText(query);
    remember(trimmed);
    const next = new URLSearchParams(search.toString());
    next.set("q", trimmed);
    router.replace(`?${next.toString()}`, { scroll: false });
    if (trimmed === submitted) void result.refetch();
    else setSubmitted(trimmed);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Query"
        title="Ask the ledger in BQL"
        description="Run Beancount Query Language against the entries in scope. Results respect the time, account and filter settings in the header."
      />

      <section className="space-y-3 rounded-xl border bg-card p-3 animate-rise [animation-delay:80ms]">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
          rows={6}
          spellCheck={false}
          placeholder="SELECT account, sum(position) GROUP BY account"
          aria-label="BQL query"
          className="resize-y font-mono text-[13px] leading-relaxed md:text-[13px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => run()} disabled={!text.trim() || result.isFetching}>
            {result.isFetching ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />} Run
            <Kbd className="ml-1 hidden sm:inline-flex">⌘↵</Kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <BookMarkedIcon data-icon="inline-start" /> Examples <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Start from an example</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {examples.map((example) => (
                <DropdownMenuItem key={example.label} onSelect={() => run(example.query)} className="flex-col items-start gap-0.5">
                  <span className="font-medium">{example.label}</span>
                  <span className="text-xs text-muted-foreground">{example.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-auto hidden text-xs text-muted-foreground md:inline">Ctrl or ⌘ + Enter to run</span>
        </div>
        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="text-xs text-muted-foreground">Recent</span>
            {recent.map((query) => (
              <button
                key={query}
                type="button"
                title={query}
                onClick={() => run(query)}
                className="max-w-64 truncate rounded-full border bg-background px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {query.replace(/\s+/g, " ")}
              </button>
            ))}
            <Button variant="ghost" size="xs" onClick={clear} className="ml-auto">
              Clear
            </Button>
          </div>
        )}
      </section>

      {submitted.trim() === "" ? (
        <p className="px-1 text-sm text-muted-foreground">Write a query above, or pick one from Examples. Try <code className="font-mono text-xs">balances</code> for a quick overview.</p>
      ) : result.isError ? (
        <ErrorState title="The query failed" error={result.error} onRetry={() => void result.refetch()} />
      ) : result.isPending ? (
        <div role="status" className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Running query…
        </div>
      ) : (
        <div className="animate-rise">
          <QueryResultView key={`${submitted}:${result.dataUpdatedAt}`} result={result.data} />
        </div>
      )}
    </div>
  );
}
