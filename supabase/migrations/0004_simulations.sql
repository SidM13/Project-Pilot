-- Stage 3 — Decision Simulator.
--
-- tasks.deferred_at: scope reduction defers work instead of deleting it. Deferred
-- tasks leave every calculation (progress, cost, forecast, load) and can be restored.
--
-- simulations: saved what-if scenarios. `scenario` is the proposed change; `result`
-- is the server-computed comparison at the time it was saved or applied. Rows are
-- never applied automatically — status becomes 'applied' only through the
-- explicit, user-approved server action.

alter table public.tasks add column deferred_at timestamptz;

create table public.simulations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  project_id     uuid not null,
  name           text not null check (char_length(name) between 1 and 120),
  kind           text not null check (kind in ('reassign', 'deadline', 'scope')),
  scenario       jsonb not null check (jsonb_typeof(scenario) = 'object'),
  result         jsonb not null check (jsonb_typeof(result) = 'object'),
  reference_date date not null,
  status         text not null default 'draft' check (status in ('draft', 'applied')),
  applied_at     timestamptz,
  applied_by     uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  check ((status = 'applied') = (applied_at is not null)),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index simulations_project_idx on public.simulations (project_id, created_at desc);

alter table public.simulations enable row level security;

create policy "members read simulations" on public.simulations for select to authenticated
  using (public.is_member(workspace_id));
create policy "members create simulations" on public.simulations for insert to authenticated
  with check (public.is_member(workspace_id) and created_by = (select auth.uid()));
-- Only a draft can change, and only into an applied record attributed to the caller.
create policy "members apply draft simulations" on public.simulations for update to authenticated
  using (public.is_member(workspace_id) and status = 'draft')
  with check (public.is_member(workspace_id) and (status = 'draft' or applied_by = (select auth.uid())));
create policy "members delete draft simulations" on public.simulations for delete to authenticated
  using (public.is_member(workspace_id) and status = 'draft');

alter table public.activity_events drop constraint activity_events_entity_type_check;
alter table public.activity_events add constraint activity_events_entity_type_check
  check (entity_type in ('project', 'task', 'milestone', 'dependency', 'budget_entry', 'team_member', 'workspace', 'simulation'));
