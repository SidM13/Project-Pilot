import type { Metadata } from "next";
import { HomeView, loadHome } from "./screen";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  return <HomeView {...await loadHome()} />;
}
