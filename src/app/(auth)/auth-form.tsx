"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signInDemo, signUp, type AuthState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/system/field";

export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const [demoState, demoAction, demoPending] = useActionState<AuthState, FormData>(signInDemo, undefined);

  if (!configured) {
    return (
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        <h2 className="text-[15px] font-semibold">Supabase is not configured</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Copy <code className="font-mono text-xs">.env.local.example</code> to <code className="font-mono text-xs">.env.local</code>, add your Supabase URL and anon key, then restart the dev server. See README → Setup.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h2 className="font-serif text-[22px] font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create your workspace"}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {mode === "login" ? "Use your work email." : "Start with an empty workspace for your firm's projects."}
      </p>

      <form action={action} className="mt-6 grid gap-4">
        {mode === "signup" && (
          <Field label="Workspace name" htmlFor="workspace">
            <Input id="workspace" name="workspace" placeholder="e.g. Northwind Advisory" required maxLength={120} />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
        </Field>
        {state?.error && <p role="alert" className="rounded-md border border-critical/20 bg-critical-soft px-3 py-2 text-xs text-critical">{state.error}</p>}
        {state?.message && <p role="status" className="rounded-md border bg-info-soft px-3 py-2 text-xs">{state.message}</p>}
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-[13px] text-muted-foreground">
        {mode === "login" ? (
          <>No account? <Link className="font-medium text-primary hover:underline" href="/signup">Create one</Link></>
        ) : (
          <>Already registered? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link></>
        )}
      </p>

      <div className="mt-8 border-t pt-6">
        <p className="text-[13px] font-medium">Explore the demo workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">Three fictional client projects with a pinned reference date, so every figure is reproducible.</p>
        <form action={demoAction} className="mt-3">
          <Button type="submit" variant="outline" disabled={demoPending} className="w-full">
            {demoPending ? "Opening…" : "Open demo workspace"}
          </Button>
        </form>
        {demoState?.error && <p role="alert" className="mt-2 text-xs text-critical">{demoState.error}</p>}
      </div>
    </div>
  );
}
