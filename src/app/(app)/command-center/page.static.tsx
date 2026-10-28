"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// The portfolio overview moved to /home. Keeps old public-demo links working.
export default function CommandCenterRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/home"), [router]);
  return (
    <p className="p-8 text-sm">
      <Link href="/home" className="text-primary hover:underline">Go to Home</Link>
    </p>
  );
}
