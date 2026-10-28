import type { Metadata } from "next";
import { CopilotView, loadCopilot } from "./screen";

export const metadata: Metadata = { title: "AI Copilot" };

export default async function CopilotPage({ searchParams }: PageProps<"/copilot">) {
  return <CopilotView {...await loadCopilot(await searchParams)} />;
}
