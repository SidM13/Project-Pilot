"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Shared submit handling for dialog forms: runs a server action, shows field
 * errors inline and a toast on success or failure.
 */
export function useActionForm() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(run: () => Promise<Result>, opts: { success?: string; onSuccess?: () => void } = {}) {
    start(async () => {
      const result = await run();
      if (result.ok) {
        setErrors({});
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return { pending, errors, setErrors, submit };
}
