import type { Metadata } from "next";
import { loadReports, ReportsView } from "./screen";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return <ReportsView {...await loadReports(await searchParams)} />;
}
