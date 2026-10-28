"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadRisk, RiskView } from "./screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadRisk(sp)} render={(d) => <RiskView {...d} />} />;
}
