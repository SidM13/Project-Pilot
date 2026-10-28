"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadSummary, SummaryView } from "./screen";

export default function Page() {
  return <StaticScreen load={() => loadSummary()} render={(d) => <SummaryView {...d} />} />;
}
