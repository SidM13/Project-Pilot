"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6">
      <h1 className="text-[15px] font-semibold">This page could not load</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        The data request failed. Your records are unchanged. {error.digest && <span className="font-mono text-xs">Ref {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
