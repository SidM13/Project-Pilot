-- Stage 6 — Methodology-aware projects.
--
-- projects.methodology: 'waterfall' (phases = milestones, baselines, Gantt) or 'agile'
--   (backlog, sprints, story points, releases = milestones). Existing rows become waterfall.
-- sprints: time-boxed iterations of an agile project. Composite FKs keep them in their
--   project's workspace, like every other child table.
-- tasks.story_points / sprint_id: agile sizing and sprint membership (null = backlog).
-- tasks.baseline_start / baseline_due: the approved schedule a waterfall plan is measured
--   against. Captured once ("set baseline"); the live start/due dates may move later.
-- ai_explanations: also caches AI Copilot answers, which may be portfolio-wide (no project).

alter table public.projects
  add column methodology text not null default 'waterfall' check (methodology in ('waterfall', 'agile'));

create table public.sprints (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  name         text not null check (char_length(name) between 1 and 120),
  goal         text not null default '' check (char_length(goal) <= 500),
  start_date   date not null,
  end_date     date not null,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  unique (id, project_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index sprints_project_idx on public.sprints (project_id, start_date);

alter table public.sprints enable row level security;
create policy "members manage sprints" on public.sprints for all to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

alter table public.tasks
  add column story_points   integer check (story_points between 0 and 100),
  add column sprint_id      uuid,
  add column baseline_start date,
  add column baseline_due   date,
  add constraint tasks_baseline_order check (baseline_due is null or baseline_start is null or baseline_due >= baseline_start),
  -- (sprint_id, project_id) → a task can only join a sprint of its own project.
  add constraint tasks_sprint_fk foreign key (sprint_id, project_id)
    references public.sprints (id, project_id) on delete set null (sprint_id);
create index tasks_sprint_idx on public.tasks (sprint_id);

-- Copilot answers can cover the whole portfolio.
alter table public.ai_explanations alter column project_id drop not null;
alter table public.ai_explanations drop constraint ai_explanations_kind_check;
alter table public.ai_explanations add constraint ai_explanations_kind_check check (kind in ('simulation', 'brief', 'copilot'));

-- ── Demo seed: keep 0002's function, then make the Website project the Agile sample ──
-- The renamed function keeps 0002's grants (authenticated, service_role); the wrapper is
-- security invoker, so it runs the base seed with the caller's own rights.
alter function public.seed_demo_workspace(uuid) rename to seed_demo_workspace_base;

create function public.seed_demo_workspace(ws uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r date;
  web uuid; erp uuid; ops uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;
begin
  perform public.seed_demo_workspace_base(ws);
  select reference_date into r from public.workspaces where id = ws;
  r := coalesce(r, current_date);
  select id into web from public.projects where workspace_id = ws and name = 'Client Website Migration';
  select id into erp from public.projects where workspace_id = ws and name = 'Client ERP Implementation';
  select id into ops from public.projects where workspace_id = ws and name = 'Operations Process Improvement';

  -- Waterfall baselines: the approved plan. Three ERP/Ops tasks have since moved.
  update public.tasks set baseline_start = start_date, baseline_due = due_date where project_id in (erp, ops);
  update public.tasks set baseline_due = r - 10 where project_id = erp and title = 'Kestrel WMS vendor integration';
  update public.tasks set baseline_due = r + 1  where project_id = erp and title = 'Legacy data extraction & cleansing';
  update public.tasks set baseline_start = r - 2, baseline_due = r + 6 where project_id = erp and title = 'Database migration (inventory & orders)';
  update public.tasks set baseline_due = r - 7  where project_id = ops and title = 'Future-state process design';

  -- Agile sample.
  update public.projects set methodology = 'agile' where id = web;
  insert into public.sprints (workspace_id, project_id, name, goal, start_date, end_date) values
    (ws, web, 'Sprint 1', 'Audit all 240 pages and agree the information architecture', r - 42, r - 22) returning id into s1;
  insert into public.sprints (workspace_id, project_id, name, goal, start_date, end_date) values
    (ws, web, 'Sprint 2', 'Approve the design system and page templates', r - 21, r - 1) returning id into s2;
  insert into public.sprints (workspace_id, project_id, name, goal, start_date, end_date) values
    (ws, web, 'Sprint 3', 'Staging site with all templates built and content migrated', r, r + 13) returning id into s3;
  insert into public.sprints (workspace_id, project_id, name, goal, start_date, end_date) values
    (ws, web, 'Sprint 4', 'Pass accessibility QA and launch', r + 14, r + 27) returning id into s4;

  update public.tasks t set story_points = v.points, sprint_id = v.sprint
  from (values
    ('Content audit & information architecture', 5, s1),
    ('Design system & page templates',           8, s2),
    ('Template build in headless CMS',          13, s3),
    ('Content migration (240 pages)',            8, s3),
    ('Legacy form integrations',                 5, s3),
    ('Redirect map & SEO checks',                3, null::uuid),
    ('Accessibility & QA pass',                  5, s4),
    ('Launch & DNS cutover',                     2, s4)
  ) as v(title, points, sprint)
  where t.project_id = web and t.title = v.title;
end $$;

revoke execute on function public.seed_demo_workspace(uuid) from public, anon;
grant execute on function public.seed_demo_workspace(uuid) to authenticated, service_role;
