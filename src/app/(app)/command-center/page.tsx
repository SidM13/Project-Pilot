import type { Metadata } from "next";
import { CommandCenterView, loadCommandCenter } from "./screen";

export const metadata: Metadata = { title: "Command Center" };

export default async function CommandCenterPage() {
  return <CommandCenterView {...await loadCommandCenter()} />;
}
