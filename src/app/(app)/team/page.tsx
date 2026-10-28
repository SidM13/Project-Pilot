import type { Metadata } from "next";
import { loadTeam, TeamView } from "./screen";

export const metadata: Metadata = { title: "Team & capacity" };

export default async function TeamPage() {
  return <TeamView {...await loadTeam()} />;
}
