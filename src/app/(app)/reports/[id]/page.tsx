import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BriefView, loadBrief } from "./screen";

export const metadata: Metadata = { title: "Decision brief" };

export default async function BriefPage({ params }: PageProps<"/reports/[id]">) {
  const { brief } = await loadBrief((await params).id);
  if (!brief) notFound();
  return <BriefView brief={brief} />;
}
