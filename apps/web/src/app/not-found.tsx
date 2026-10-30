import Link from "next/link";
import { Brand } from "@/components/app/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Brand />
      <div>
        <p className="type-large-title text-primary">404</p>
        <h1 className="mt-3 type-title-2">This page doesn&apos;t balance.</h1>
        <p className="mt-2 type-body text-muted-foreground">The address is wrong, or the ledger it belongs to is private.</p>
      </div>
      <Button asChild size="lg">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
