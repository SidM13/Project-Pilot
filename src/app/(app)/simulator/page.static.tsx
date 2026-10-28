"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadSimulator, SimulatorView } from "./screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadSimulator(sp)} render={(d) => <SimulatorView {...d} />} />;
}
