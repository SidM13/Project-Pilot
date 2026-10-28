"use client";

import { StaticScreen } from "@/static/static-screen";
import { CopilotView, loadCopilot } from "./screen";

export default function Page() {
  return <StaticScreen load={(sp) => loadCopilot(sp)} render={(d) => <CopilotView {...d} />} />;
}
