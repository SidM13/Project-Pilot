import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthForm mode="login" configured={isSupabaseConfigured} />;
}
