"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Static demo entry: go to the demo landing page.
export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace("/login"), [router]);
  return (
    <p className="p-8 text-sm">
      <Link href="/login" className="text-primary hover:underline">Open the ProjectPilot demo</Link>
    </p>
  );
}
