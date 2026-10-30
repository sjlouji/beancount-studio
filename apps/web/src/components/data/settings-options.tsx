"use client";

import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { CardSkeleton, ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ledgerPath, useOptions } from "@/lib/api/hooks";

export function ExportCard({ workspace, slug }: { workspace: string; slug: string }) {
  return (
    <Card className="animate-rise [animation-delay:120ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Export</CardTitle>
        <CardDescription>Download the whole ledger repository, including its git history, as a zip archive.</CardDescription>
      </CardHeader>
      <CardFooter className="border-t">
        <Button asChild variant="outline">
          <a href={`/api${ledgerPath(workspace, slug)}/archive`} download={`${slug}.zip`}>
            <DownloadIcon data-icon="inline-start" /> Download archive (.zip)
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

function OptionsTable({ title, options }: { title: string; options: Record<string, string> }) {
  const entries = Object.entries(options);
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-1/3">Option</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([name, value]) => (
              <TableRow key={name}>
                <TableCell className="align-top font-mono text-[13px]">{name}</TableCell>
                <TableCell className="align-top">
                  <code className="font-mono text-xs break-all whitespace-pre-wrap">{value}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function OptionsCard({ workspace, slug }: { workspace: string; slug: string }) {
  const options = useOptions(workspace, slug);
  return (
    <Collapsible asChild>
      <Card className="animate-rise [animation-delay:160ms]">
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <CardTitle className="text-sm font-medium">Options</CardTitle>
          </CollapsibleTrigger>
          <CardDescription>The Beancount and Fava options currently in effect for this ledger. Edit them in the ledger&apos;s source files.</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-5">
            {options.isPending ? (
              <CardSkeleton rows={4} className="border-0 p-0" />
            ) : options.isError ? (
              <ErrorState error={options.error} onRetry={() => void options.refetch()} />
            ) : (
              <>
                <OptionsTable title="Beancount options" options={options.data.beancount} />
                <OptionsTable title="Fava options" options={options.data.fava} />
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
