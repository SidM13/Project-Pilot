"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDown, ChevronRight, GripVertical, LayoutList, Plus, Rows3, Search, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { moveTask } from "@/actions/planning";
import type { AgileMetrics } from "@/lib/engine/planning";
import { remainingHours } from "@/lib/engine/progress";
import { formatShortDate } from "@/lib/format";
import { STATUS_LABELS, TASK_STATUSES, type Methodology, type Milestone, type Sprint, type Task, type TaskDependency, type TaskStatus, type TeamMember } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/system/native-select";
import { EmptyState } from "@/components/system/states";
import { Pill, TaskStatusPill } from "@/components/system/status";
import { cn } from "@/lib/utils";
import { TaskDialog } from "./task-dialog";

// Tasks tab: one set of records, several views. Switching view never changes data.
// Waterfall: List (grouped by phase) · Board. Agile: Board (one sprint) · Backlog · List.

type View = "list" | "board" | "backlog";

export interface TaskWorkspaceProps {
  projectId: string;
  methodology: Methodology;
  tasks: Task[];
  dependencies: TaskDependency[];
  members: TeamMember[];
  milestones: Milestone[];
  sprints: Sprint[];
  agile: AgileMetrics | null;
  referenceDate: string;
  flaggedTaskIds: string[];
  criticalPathIds: string[];
}

const VIEWS: Record<Methodology, { id: View; label: string; icon: typeof LayoutList }[]> = {
  waterfall: [
    { id: "list", label: "List", icon: LayoutList },
    { id: "board", label: "Board", icon: SquareKanban },
  ],
  agile: [
    { id: "board", label: "Sprint board", icon: SquareKanban },
    { id: "backlog", label: "Backlog", icon: Rows3 },
    { id: "list", label: "List", icon: LayoutList },
  ],
};

const COLUMN_TONE: Record<TaskStatus, string> = { todo: "bg-input", in_progress: "bg-primary", blocked: "bg-critical", done: "bg-healthy" };

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ member }: { member?: TeamMember }) {
  if (!member) return <span className="grid size-6 place-items-center rounded-full border border-dashed text-[10px] text-muted-foreground" title="Unassigned">—</span>;
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-foreground/80" title={member.name}>
      {initials(member.name)}
    </span>
  );
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/** The last view this viewer chose for this project (browser storage; a convenience only). */
function useStoredView(projectId: string, methodology: Methodology) {
  const key = `pp-task-view:${projectId}`;
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [chosen, setChosen] = useState<View | null>(null);
  const valid = (v: string | null): v is View => !!v && VIEWS[methodology].some((x) => x.id === v);
  const view: View = chosen ?? (valid(stored) ? stored : VIEWS[methodology][0].id);
  const choose = (v: View) => {
    setChosen(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // storage unavailable: the choice lasts for this page view
    }
  };
  return [view, choose] as const;
}

export function TaskWorkspace(props: TaskWorkspaceProps) {
  const { projectId, methodology, tasks, members, sprints, agile } = props;
  const [view, setView] = useStoredView(projectId, methodology);
  const [editing, setEditing] = useState<{ task?: Task; defaults?: Partial<{ sprint_id: string; status: string; milestone_id: string }> } | null>(null);
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const [sprintId, setSprintId] = useState(agile?.active?.sprint.id ?? sprints.at(-1)?.id ?? "");
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const visible = tasks.filter((t) => (!owner || (owner === "none" ? !t.assignee_id : t.assignee_id === owner)) && (!query || t.title.toLowerCase().includes(query.toLowerCase())));
  const ctx = { ...props, memberById, open: (task?: Task, defaults?: Partial<{ sprint_id: string; status: string; milestone_id: string }>) => setEditing({ task, defaults }) };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Task view" className="flex rounded-md border bg-card p-0.5">
          {VIEWS[methodology].map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn("flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs", view === v.id ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <v.icon aria-hidden className="size-3.5" />
              {v.label}
            </button>
          ))}
        </div>
        {methodology === "agile" && view === "board" && sprints.length > 0 && (
          <NativeSelect aria-label="Sprint" value={sprintId} onChange={(e) => setSprintId(e.target.value)} className="h-8 w-auto text-xs">
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {agile?.active?.sprint.id === s.id ? " (current)" : ""}
              </option>
            ))}
          </NativeSelect>
        )}
        <div className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-2">
          <Search aria-hidden className="size-3.5 text-muted-foreground" />
          <label htmlFor="task-search" className="sr-only">Search tasks</label>
          <input id="task-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" className="h-full w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
        </div>
        <NativeSelect aria-label="Filter by owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 w-auto text-xs">
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {members.filter((m) => tasks.some((t) => t.assignee_id === m.id)).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </NativeSelect>
        <span className="ml-auto" />
        <Button onClick={() => ctx.open(undefined, methodology === "agile" && view === "board" && sprintId ? { sprint_id: sprintId } : undefined)}>
          <Plus /> New task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Add tasks with an owner, planned hours and dates. ProjectPilot uses them to forecast your finish date, cost and team workload."
          action={<Button onClick={() => ctx.open()}><Plus /> Add the first task</Button>}
        />
      ) : view === "board" ? (
        <Board ctx={ctx} tasks={methodology === "agile" ? visible.filter((t) => t.sprint_id === sprintId) : visible} sprintId={methodology === "agile" ? sprintId : undefined} />
      ) : view === "backlog" && agile ? (
        <Backlog ctx={ctx} tasks={visible} />
      ) : (
        <GroupedList ctx={ctx} tasks={visible} />
      )}

      {editing && (
        <TaskDialog
          key={editing.task?.id ?? "new"}
          projectId={projectId}
          task={editing.task ? tasks.find((t) => t.id === editing.task!.id) : undefined}
          defaults={editing.defaults}
          tasks={tasks}
          dependencies={props.dependencies}
          members={members}
          milestones={props.milestones}
          methodology={methodology}
          sprints={sprints}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}

type Ctx = TaskWorkspaceProps & { memberById: Map<string, TeamMember>; open: (task?: Task, defaults?: Partial<{ sprint_id: string; status: string; milestone_id: string }>) => void };

function useMove() {
  const [pending, start] = useTransition();
  const move = (task: Task, change: { status?: TaskStatus; sprintId?: string | null }, label: string) =>
    start(async () => {
      const r = await moveTask(task.id, change);
      if (!r.ok) toast.error(r.error);
      else toast.success(`"${task.title}" ${label}`);
    });
  return { pending, move };
}

function TaskFlags({ task, ctx }: { task: Task; ctx: Ctx }) {
  const overdue = task.status !== "done" && !!task.due_date && task.due_date < ctx.referenceDate;
  return (
    <>
      {ctx.criticalPathIds.includes(task.id) && <Pill tone="info">Critical path</Pill>}
      {task.status === "blocked" && <Pill tone="critical">Blocked</Pill>}
      {overdue && task.status !== "blocked" && <Pill tone="critical">Overdue</Pill>}
      {ctx.flaggedTaskIds.includes(task.id) && !overdue && task.status !== "blocked" && <Pill tone="warning">Needs attention</Pill>}
    </>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────

function Board({ ctx, tasks, sprintId }: { ctx: Ctx; tasks: Task[]; sprintId?: string }) {
  const { pending, move } = useMove();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (ctx.methodology === "agile" && !sprintId) {
    return <EmptyState title="No sprints yet" description="Create a sprint on the Timeline tab, then pull work into it from the Backlog." />;
  }
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-4" aria-busy={pending}>
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
        const points = column.reduce((s, t) => s + (t.story_points ?? 0), 0);
        return (
          <section
            key={status}
            aria-label={`${STATUS_LABELS[status]} column`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const t = byId.get(e.dataTransfer.getData("text/task-id"));
              if (t && t.status !== status) move(t, { status }, `moved to ${STATUS_LABELS[status]}`);
            }}
            className={cn("flex min-w-[240px] flex-col rounded-lg border bg-subtle/80 transition-colors", over === status && "border-primary/50 bg-info-soft")}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <span aria-hidden className={cn("size-2 rounded-full", COLUMN_TONE[status])} />
              <h3 className="text-[13px] font-semibold">{STATUS_LABELS[status]}</h3>
              <span className="tabular text-xs text-muted-foreground">{column.length}</span>
              {ctx.methodology === "agile" && points > 0 && <span className="tabular ml-auto text-[11px] text-muted-foreground">{points} pts</span>}
            </header>
            <ul className="grid gap-2 px-2 pb-2">
              {column.map((t) => (
                <BoardCard key={t.id} task={t} ctx={ctx} onMove={(s) => move(t, { status: s }, `moved to ${STATUS_LABELS[s]}`)} />
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => ctx.open(undefined, { status, ...(sprintId ? { sprint_id: sprintId } : {}) })}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  <Plus className="size-3.5" /> Add task
                </button>
              </li>
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ task, ctx, onMove }: { task: Task; ctx: Ctx; onMove: (s: TaskStatus) => void }) {
  const member = task.assignee_id ? ctx.memberById.get(task.assignee_id) : undefined;
  const overdue = task.status !== "done" && !!task.due_date && task.due_date < ctx.referenceDate;
  return (
    <li
      id={`task-${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group scroll-mt-24 rounded-md border bg-card p-2.5 hover:border-input target:ring-2 target:ring-primary/30"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical aria-hidden className="mt-0.5 size-3.5 shrink-0 cursor-grab text-input opacity-0 group-hover:opacity-100" />
        <button type="button" onClick={() => ctx.open(task)} className="min-w-0 flex-1 text-left text-[13px] leading-snug font-medium hover:underline underline-offset-2">
          {task.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Move ${task.title}`} className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
            {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onMove(s)}>{STATUS_LABELS[s]}</DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => ctx.open(task)}>Edit details…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 pl-5">
        <TaskFlags task={task} ctx={ctx} />
      </div>
      <div className="mt-2 flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
        <Avatar member={member} />
        <span className={cn("tabular", overdue && "font-medium text-critical")}>{task.due_date ? `Due ${formatShortDate(task.due_date)}` : "No due date"}</span>
        <span className="tabular ml-auto">{ctx.methodology === "agile" && task.story_points !== null ? `${task.story_points} pts · ` : ""}{remainingHours(task)} h left</span>
      </div>
      {task.status === "blocked" && task.blocked_reason && <p className="mt-1.5 line-clamp-2 pl-5 text-[11px] text-critical">{task.blocked_reason}</p>}
    </li>
  );
}

// ── Grouped list ─────────────────────────────────────────────────────────────

function GroupedList({ ctx, tasks }: { ctx: Ctx; tasks: Task[] }) {
  const groups =
    ctx.methodology === "agile"
      ? [...ctx.sprints.map((s) => ({ id: s.id, title: s.name, subtitle: `${formatShortDate(s.start_date)} – ${formatShortDate(s.end_date)}`, tasks: tasks.filter((t) => t.sprint_id === s.id) })), { id: "backlog", title: "Backlog", subtitle: "Not in a sprint", tasks: tasks.filter((t) => !t.sprint_id || !ctx.sprints.some((s) => s.id === t.sprint_id)) }]
      : [
          ...[...ctx.milestones].sort((a, b) => a.due_date.localeCompare(b.due_date)).map((m, i) => ({ id: m.id, title: `Phase ${i + 1} · ${m.name}`, subtitle: `Milestone due ${formatShortDate(m.due_date)}${m.completed_at ? " · complete" : ""}`, tasks: tasks.filter((t) => t.milestone_id === m.id) })),
          { id: "none", title: "No phase", subtitle: "Not linked to a milestone", tasks: tasks.filter((t) => !t.milestone_id || !ctx.milestones.some((m) => m.id === t.milestone_id)) },
        ];
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[minmax(0,1fr)_9rem_6rem_7.5rem_5rem] gap-3 border-b bg-subtle px-4 py-2 text-xs text-muted-foreground">
          <span>Task</span>
          <span>Owner</span>
          <span>Due</span>
          <span>Status</span>
          <span className="text-right">{ctx.methodology === "agile" ? "Points · h" : "Hours left"}</span>
        </div>
        {groups.filter((g) => g.tasks.length > 0 || g.id !== "none").map((g) => (
          <Group key={g.id} title={g.title} subtitle={g.subtitle} count={g.tasks.length} onAdd={() => ctx.open(undefined, ctx.methodology === "agile" ? (g.id === "backlog" ? {} : { sprint_id: g.id }) : g.id === "none" ? {} : { milestone_id: g.id })}>
            {g.tasks
              .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
              .map((t) => {
                const member = t.assignee_id ? ctx.memberById.get(t.assignee_id) : undefined;
                const overdue = t.status !== "done" && !!t.due_date && t.due_date < ctx.referenceDate;
                return (
                  <li key={t.id} id={`task-${t.id}`} className="grid scroll-mt-24 grid-cols-[minmax(0,1fr)_9rem_6rem_7.5rem_5rem] items-center gap-3 px-4 py-2 hover:bg-subtle target:bg-info-soft">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => ctx.open(t)} className={cn("truncate text-left text-[13px] hover:underline underline-offset-2", t.status === "done" ? "text-muted-foreground line-through" : "font-medium")} title={t.title}>
                        {t.title}
                      </button>
                      <TaskFlags task={t} ctx={ctx} />
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                      <Avatar member={member} />
                      <span className="truncate">{member?.name ?? <span className="text-muted-foreground">Unassigned</span>}</span>
                    </span>
                    <span className={cn("tabular text-xs", overdue ? "font-medium text-critical" : "text-muted-foreground")}>{formatShortDate(t.due_date)}</span>
                    <span><TaskStatusPill status={t.status} /></span>
                    <span className="tabular text-right text-xs text-muted-foreground">
                      {ctx.methodology === "agile" ? `${t.story_points ?? "–"} · ${remainingHours(t)}` : remainingHours(t)}
                    </span>
                  </li>
                );
              })}
          </Group>
        ))}
      </div>
    </div>
  );
}

function Group({ title, subtitle, count, onAdd, children, right }: { title: string; subtitle?: string; count: number; onAdd: () => void; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b last:border-b-0">
      <header className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 items-center gap-1.5 rounded-sm text-left">
          {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <span className="truncate text-[13px] font-semibold">{title}</span>
          <span className="tabular text-xs text-muted-foreground">{count}</span>
        </button>
        {subtitle && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{subtitle}</span>}
        <span className="ml-auto flex items-center gap-3">
          {right}
          <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="size-3.5" /> Add
          </button>
        </span>
      </header>
      {open && (count === 0 ? <p className="px-10 pb-3 text-xs text-muted-foreground">No tasks.</p> : <ul className="divide-y border-t">{children}</ul>)}
    </section>
  );
}

// ── Agile backlog ────────────────────────────────────────────────────────────

function Backlog({ ctx, tasks }: { ctx: Ctx; tasks: Task[] }) {
  const agile = ctx.agile!;
  const { pending, move } = useMove();
  const planned = agile.sprints.filter((m) => m.state !== "completed");
  const sections = [
    ...planned.map((m) => ({ id: m.sprint.id, title: m.sprint.name, subtitle: m.sprint.goal || `${formatShortDate(m.sprint.start_date)} – ${formatShortDate(m.sprint.end_date)}`, state: m.state, committed: m.committedPoints })),
    { id: null as string | null, title: "Product backlog", subtitle: "Not yet planned into a sprint", state: null, committed: agile.backlogPoints },
  ];
  const sprintOptions = planned.map((m) => m.sprint);
  return (
    <div className="grid gap-4" aria-busy={pending}>
      <p className="text-xs text-muted-foreground">
        Average velocity: <span className="tabular font-medium text-foreground">{agile.velocity ?? "not yet known"}</span>
        {agile.velocity !== null && ` points per sprint over ${agile.completedSprintCount} completed sprint${agile.completedSprintCount === 1 ? "" : "s"}`}
        {agile.sprintsToFinish !== null && ` · ${agile.openPoints} open points ≈ ${agile.sprintsToFinish} more sprint${agile.sprintsToFinish === 1 ? "" : "s"} at that pace`}
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        {sections.map((s) => {
          const own = tasks.filter((t) => (s.id ? t.sprint_id === s.id : !t.sprint_id || !ctx.sprints.some((x) => x.id === t.sprint_id)) && t.status !== "done");
          const overVelocity = s.id && agile.velocity && s.committed > agile.velocity;
          return (
            <Group
              key={s.id ?? "backlog"}
              title={`${s.title}${s.state === "active" ? " · current" : ""}`}
              subtitle={s.subtitle}
              count={own.length}
              onAdd={() => ctx.open(undefined, s.id ? { sprint_id: s.id } : {})}
              right={s.id ? <Pill tone={overVelocity ? "warning" : "neutral"}>{s.committed} pts{agile.velocity ? ` / ${agile.velocity} velocity` : ""}</Pill> : <Pill>{s.committed} pts</Pill>}
            >
              {own.map((t) => {
                const member = t.assignee_id ? ctx.memberById.get(t.assignee_id) : undefined;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2 hover:bg-subtle">
                    <span className="tabular grid size-7 shrink-0 place-items-center rounded-md border bg-subtle text-xs font-semibold" title="Story points">{t.story_points ?? "–"}</span>
                    <button type="button" onClick={() => ctx.open(t)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline underline-offset-2">{t.title}</button>
                    <TaskStatusPill status={t.status} />
                    <Avatar member={member} />
                    <NativeSelect
                      aria-label={`Sprint for ${t.title}`}
                      value={t.sprint_id ?? ""}
                      onChange={(e) => {
                        const target = e.target.value || null;
                        move(t, { sprintId: target }, target ? `moved to ${sprintOptions.find((x) => x.id === target)?.name}` : "moved to the backlog");
                      }}
                      className="h-7 w-36 text-xs"
                    >
                      <option value="">Product backlog</option>
                      {sprintOptions.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </NativeSelect>
                  </li>
                );
              })}
            </Group>
          );
        })}
      </div>
      {agile.sprints.some((m) => m.state === "completed") && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground">Completed sprints</summary>
          <ul className="divide-y border-t">
            {agile.sprints.filter((m) => m.state === "completed").map((m) => (
              <li key={m.sprint.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <span className="font-medium">{m.sprint.name}</span>
                <span className="text-xs text-muted-foreground">{formatShortDate(m.sprint.start_date)} – {formatShortDate(m.sprint.end_date)}</span>
                <span className="tabular ml-auto text-xs">{m.completedPoints} of {m.committedPoints} pts done</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
