"use client";

import Link from "next/link";
import { StaticScreen } from "@/static/static-screen";
import { BriefView, loadBrief } from "../[id]/screen";

export default function Page() {
  return (
    <StaticScreen
      load={(sp) => loadBrief(sp.id ?? "")}
      render={({ brief }) =>
        brief ? (
          <BriefView brief={brief} />
        ) : (
          <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6">
            <h1 className="text-[15px] font-semibold">Brief not found in this demo</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">It may have been deleted, or the demo data in this browser was reset.</p>
            <Link href="/reports" className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline">Back to reports</Link>
          </div>
        )
      }
    />
  );
}
