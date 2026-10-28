import type { Metadata } from "next";
import { loadRisk, RiskView } from "./screen";

export const metadata: Metadata = { title: "Risk analysis" };

export default async function RiskPage({ searchParams }: PageProps<"/risk">) {
  return <RiskView {...await loadRisk(await searchParams)} />;
}
