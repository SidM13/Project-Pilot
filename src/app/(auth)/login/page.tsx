import type { Metadata } from "next";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthForm mode="login" configured={isSupabaseConfigured} demoMode={isDemoMode} />;
}
