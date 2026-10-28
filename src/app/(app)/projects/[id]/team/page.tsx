import { loadProjectTeam, ProjectTeamView } from "./screen";

export default async function ProjectTeamPage({ params }: PageProps<"/projects/[id]/team">) {
  return <ProjectTeamView {...await loadProjectTeam((await params).id)} />;
}
