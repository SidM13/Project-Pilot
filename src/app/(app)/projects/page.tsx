import type { Metadata } from "next";
import { loadProjects, ProjectsView } from "./screen";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return <ProjectsView {...await loadProjects(await searchParams)} />;
}
