"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadReports, ReportsView } from "./screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadReports(sp)} render={(d) => <ReportsView {...d} />} />;
}
