import { daysBetween } from "@/lib/engine/dates";
import { isOpen, remainingHours } from "@/lib/engine/progress";
import { getProjectView } from "@/lib/data/project";
import { MilestoneList } from "@/components/projects/milestone-list";

export async function loadProjectMilestones(id: string) {
  return getProjectView(id);
}

export function ProjectMilestonesView({ project, facts, findings, referenceDate }: Awaited<ReturnType<typeof loadProjectMilestones>>) {
  const atRisk = new Set(findings.filter((f) => f.rule === "milestone_at_risk" || f.rule === "milestone_forecast_late" || f.rule === "blocked_task").flatMap((f) => f.milestoneIds));
  const rows = [...facts.milestones]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((m) => {
      const linked = facts.tasks.filter((t) => t.milestone_id === m.id && isOpen(t));
      return {
        milestone: m,
        openTasks: linked.length,
        remainingHours: Math.round(linked.reduce((s, t) => s + remainingHours(t), 0) * 10) / 10,
        daysUntil: daysBetween(referenceDate, m.due_date),
        atRisk: atRisk.has(m.id),
      };
    });
  return <MilestoneList projectId={project.id} rows={rows} />;
}
