import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getBrief } from "@/lib/data/briefs";
import { BriefDocument } from "@/components/reports/brief-document";

export const metadata: Metadata = { title: "Decision brief" };

export default async function BriefPage({ params }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const brief = await getBrief(id); // RLS: only briefs in the user's workspaces are visible
  if (!brief) notFound();
  return (
    <>
      <div className="mb-4 text-xs text-muted-foreground print:hidden">
        <Link href="/reports" className="hover:text-foreground hover:underline">Reports</Link>
        <span aria-hidden> / </span>
        <span>{brief.facts.project.name}</span>
      </div>
      <BriefDocument id={brief.id} title={brief.title} facts={brief.facts} narrative={brief.narrative} aiMeta={brief.ai_meta} createdAt={brief.created_at} />
    </>
  );
}
