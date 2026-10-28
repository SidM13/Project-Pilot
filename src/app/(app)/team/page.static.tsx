"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadTeam, TeamView } from "./screen";

export default function Page() {
  return <StaticScreen load={() => loadTeam()} render={(d) => <TeamView {...d} />} />;
}
