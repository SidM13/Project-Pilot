import type { Metadata } from "next";
import { loadSimulator, SimulatorView } from "./screen";

export const metadata: Metadata = { title: "What-if planner" };

export default async function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  return <SimulatorView {...await loadSimulator(await searchParams)} />;
}
