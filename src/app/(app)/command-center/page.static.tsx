"use client";

import { StaticScreen } from "@/static/static-screen";
import { CommandCenterView, loadCommandCenter } from "./screen";

export default function Page() {
  return <StaticScreen load={() => loadCommandCenter()} render={(d) => <CommandCenterView {...d} />} />;
}
