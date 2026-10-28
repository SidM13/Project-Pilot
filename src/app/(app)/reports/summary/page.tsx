import type { Metadata } from "next";
import { loadSummary, SummaryView } from "./screen";

export const metadata: Metadata = { title: "Portfolio status summary" };

export default async function SummaryPage() {
  return <SummaryView {...await loadSummary()} />;
}
