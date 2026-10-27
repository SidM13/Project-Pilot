"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect("/command-center");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({ workspace: z.string().trim().min(1, "Name your workspace").max(120) })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), workspace: formData.get("workspace") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };

  const { error: wsError } = await supabase.rpc("create_workspace", { p_name: parsed.data.workspace });
  if (wsError) return { error: `Account created, but the workspace could not be created: ${wsError.message}` };
  redirect("/command-center");
}

/** Signs in to the shared demo account. Credentials stay on the server. */
export async function signInDemo(): Promise<AuthState> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return { error: "The demo workspace is not configured on this server (DEMO_EMAIL / DEMO_PASSWORD)." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: `Demo sign-in failed: ${error.message}. Run npm run demo:setup.` };
  redirect("/command-center");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
