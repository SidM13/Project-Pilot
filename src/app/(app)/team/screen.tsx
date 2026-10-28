import { getAnalysis } from "@/lib/data/analysis";
import { formatMoney, formatShortDate } from "@/lib/format";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/states";
import { Pill } from "@/components/system/status";
import { MemberDialog } from "@/components/team/member-dialog";
import { cn } from "@/lib/utils";


export async function loadTeam() {
  return getAnalysis();
}

export function TeamView({ snapshot, analysis }: Awaited<ReturnType<typeof loadTeam>>) {
  const load = new Map(analysis.loads.map((l) => [l.memberId, l]));
  const disciplines = [...new Set(snapshot.members.map((m) => m.discipline).filter(Boolean))].sort();
  const { window } = analysis;

  return (
    <>
      <PageHeader
        eyebrow={snapshot.workspace.name}
        title="Team & capacity"
        description={`Load = remaining hours assigned in ${formatShortDate(window.start)}–${formatShortDate(window.end)} (${window.workingDays} working days) ÷ capacity in that window. Hours of tasks that extend past the window are spread evenly across their working days.`}
        actions={<MemberDialog disciplines={disciplines} />}
      />
      {snapshot.members.length === 0 ? (
        <EmptyState title="No team members yet" description="Add the people who deliver your projects, with their weekly capacity and hourly cost." action={<MemberDialog disciplines={disciplines} />} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="bg-subtle text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Discipline</th>
                <th className="px-3 py-2 text-right font-medium">Capacity</th>
                <th className="px-3 py-2 text-right font-medium">Hourly cost</th>
                <th className="px-3 py-2 text-right font-medium">Assigned (window)</th>
                <th className="px-3 py-2 text-right font-medium">Load</th>
                <th className="w-12 px-3 py-2"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snapshot.members.map((m) => {
                const l = load.get(m.id);
                return (
                  <tr key={m.id} id={`member-${m.id}`} className="scroll-mt-24 hover:bg-subtle target:bg-info-soft">
                    <td className="px-4 py-2">
                      <span className="font-medium">{m.name}</span>
                      {!m.active && <Pill className="ml-2">Inactive</Pill>}
                      <span className="block text-xs text-muted-foreground">{m.role_title || "—"}</span>
                    </td>
                    <td className="px-3 py-2">{m.discipline || <span className="text-muted-foreground">—</span>}</td>
                    <td className="tabular px-3 py-2 text-right">{m.weekly_capacity_hours} h/wk</td>
                    <td className="tabular px-3 py-2 text-right">
                      {m.hourly_cost !== null ? formatMoney(m.hourly_cost, snapshot.workspace.currency) : <span className="text-muted-foreground">default</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{l ? `${l.assignedHours} / ${l.capacityHours} h` : "—"}</td>
                    <td className={cn("tabular px-3 py-2 text-right", l && l.loadPercent > 100 && "font-semibold text-critical", l && l.loadPercent > 85 && l.loadPercent <= 100 && "text-warning")}>
                      {l ? `${l.loadPercent}%` : "—"}
                    </td>
                    <td className="px-3 py-2"><MemberDialog member={m} disciplines={disciplines} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
