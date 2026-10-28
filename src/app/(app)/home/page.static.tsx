"use client";

import { StaticScreen } from "@/static/static-screen";
import { HomeView, loadHome } from "./screen";

export default function Page() {
  return <StaticScreen load={() => loadHome()} render={(d) => <HomeView {...d} />} />;
}
