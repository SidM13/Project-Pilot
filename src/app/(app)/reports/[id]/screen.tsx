import Link from "next/link";
import { z } from "zod";
import { getBrief, type DecisionBrief } from "@/lib/data/briefs";
import { BriefDocument } from "@/components/reports/brief-document";


/** Null when the id is malformed or the brief is not visible to this user (RLS). */
export async function loadBrief(id: string) {
  return { brief: z.uuid().safeParse(id).success ? await getBrief(id) : null };
}

export function BriefView({ brief }: { brief: DecisionBrief }) {
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
