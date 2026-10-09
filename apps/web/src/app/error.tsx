"use client";

import { useEffect } from "react";
import { Brand } from "@/components/app/brand";
import { ErrorState } from "@/components/app/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[beancount-studio] unhandled error", error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <Brand />
      <ErrorState title="Something went wrong" error={error} onRetry={reset} className="w-full max-w-lg" />
    </div>
  );
}
