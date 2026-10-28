"use client";

import { AuthForm } from "../auth-form";

// Public demo: no accounts — the page offers only "Open demo workspace".
export default function Page() {
  return <AuthForm mode="signup" configured={false} demoMode />;
}
