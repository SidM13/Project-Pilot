import type { Metadata } from "next";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return <AuthForm mode="signup" configured={isSupabaseConfigured} demoMode={isDemoMode} />;
}
