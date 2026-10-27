-- ProjectPilot AI — foundation schema (Stage 1)
--
-- Tenancy: every row belongs to exactly one workspace. Child tables carry
-- workspace_id and reference their parent through a composite foreign key
-- (parent_id, workspace_id), so a row can never be attached to a parent in a
-- different workspace — even by a buggy server action.
--
-- Uses plain `create table` (no IF NOT EXISTS) so it fails loudly against a
-- database that still has the legacy prototype tables. See
-- supabase/scripts/drop_legacy_prototype.sql.

create extension if not exists pgcrypto;

-- ── Workspaces & membership ──────────────────────────────────────────────────

create table public.workspaces (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (char_length(name) between 1 and 120),
  is_demo                 boolean not null default false,
  -- Pinned "today" for deterministic demos. Null = use the real current date.
  reference_date          date,
  currency                text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- Fallbacks used by cost and capacity calculations when a team member has no value.
  default_hourly_rate     numeric(10, 2) not null default 120 check (default_hourly_rate >= 0),
  default_weekly_capacity numeric(5, 1) not null default 32 check (default_weekly_capacity > 0 and default_weekly_capacity <= 80),
  created_by              uuid references auth.users (id) on delete set null default auth.uid(),
  created_at              timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- People who do the work. They do not need application logins.
create table public.team_members (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  role_title            text not null default '' check (char_length(role_title) <= 80),
  -- Coarse skill group (e.g. Engineering, Delivery). Reassignment suggestions only
  -- propose members of the same discipline.
  discipline            text not null default '' check (char_length(discipline) <= 40),
  weekly_capacity_hours numeric(5, 1) not null default 40 check (weekly_capacity_hours >= 0 and weekly_capacity_hours <= 80),
  hourly_cost           numeric(10, 2) check (hourly_cost >= 0),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (id, workspace_id)
);
create index team_members_workspace_idx on public.team_members (workspace_id);

-- ── Projects, milestones, tasks ──────────────────────────────────────────────

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  client_name     text not null default '' check (char_length(client_name) <= 120),
  description     text not null default '' check (char_length(description) <= 2000),
  owner_member_id uuid,
  status          text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'completed')),
  start_date      date not null,
  target_date     date not null,
  budget          numeric(12, 2) not null default 0 check (budget >= 0),
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, workspace_id),
  check (target_date >= start_date),
  foreign key (owner_member_id, workspace_id)
    references public.team_members (id, workspace_id) on delete set null (owner_member_id)
);
create index projects_workspace_idx on public.projects (workspace_id);

create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  name         text not null check (char_length(name) between 1 and 160),
  due_date     date not null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index milestones_project_idx on public.milestones (project_id, due_date);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  project_id      uuid not null,
  milestone_id    uuid,
  title           text not null check (char_length(title) between 1 and 200),
  description     text not null default '' check (char_length(description) <= 4000),
  status          text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  is_critical     boolean not null default false,
  assignee_id     uuid,
  start_date      date,
  due_date        date,
  planned_hours   numeric(7, 1) not null default 8 check (planned_hours > 0),
  actual_hours    numeric(7, 1) not null default 0 check (actual_hours >= 0),
  -- Owner's estimate of work left. Null = derive as max(planned - actual, 0).
  remaining_hours numeric(7, 1) check (remaining_hours >= 0),
  blocked_reason  text not null default '' check (char_length(blocked_reason) <= 1000),
  -- When a blocked task is expected to become workable (e.g. a vendor's committed date).
  blocked_until   date,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, project_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (assignee_id, workspace_id)
    references public.team_members (id, workspace_id) on delete set null (assignee_id),
  foreign key (milestone_id, project_id)
    references public.milestones (id, project_id) on delete set null (milestone_id)
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- Both ends reference tasks through (id, project_id), so a dependency can only
-- link tasks of the same project.
create table public.task_dependencies (
  workspace_id  uuid not null,
  project_id    uuid not null,
  task_id       uuid not null,
  depends_on_id uuid not null,
  created_at    timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete cascade,
  foreign key (depends_on_id, project_id) references public.tasks (id, project_id) on delete cascade
);
create index task_dependencies_upstream_idx on public.task_dependencies (depends_on_id);

-- ── Budget & activity ────────────────────────────────────────────────────────

-- Actual expenditure. Actual cost (AC) of a project is the sum of its entries.
create table public.budget_entries (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id   uuid not null,
  task_id      uuid,
  entry_date   date not null,
  amount       numeric(12, 2) not null check (amount > 0),
  category     text not null check (category in ('labor', 'vendor', 'software', 'travel', 'other')),
  note         text not null default '' check (char_length(note) <= 300),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (task_id, project_id) references public.tasks (id, project_id) on delete set null (task_id)
);
create index budget_entries_project_idx on public.budget_entries (project_id, entry_date);

-- Append-only audit trail written by server actions.
create table public.activity_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid,
  actor_id     uuid references auth.users (id) on delete set null default auth.uid(),
  entity_type  text not null check (entity_type in ('project', 'task', 'milestone', 'dependency', 'budget_entry', 'team_member', 'workspace')),
  entity_id    uuid,
  action       text not null check (char_length(action) between 1 and 40),
  summary      text not null check (char_length(summary) between 1 and 300),
  created_at   timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index activity_events_feed_idx on public.activity_events (workspace_id, created_at desc);
create index activity_events_project_idx on public.activity_events (project_id, created_at desc);

-- ── Triggers ─────────────────────────────────────────────────────────────────

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Keeps completed_at and remaining_hours consistent with status.
create function public.sync_task_completion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.remaining_hours := 0;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_completion before insert or update of status, completed_at, remaining_hours on public.tasks
  for each row execute function public.sync_task_completion();

-- Rejects an edge task_id → depends_on_id when task_id is already upstream of
-- depends_on_id. The advisory lock serialises concurrent inserts per project
-- so two individually-valid edges cannot together form a cycle.
create function public.prevent_dependency_cycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('task_dependencies:' || new.project_id::text));
  if exists (
    with recursive upstream (id) as (
      select d.depends_on_id from public.task_dependencies d where d.task_id = new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join upstream u on d.task_id = u.id
    )
    select 1 from upstream where id = new.task_id
  ) then
    raise exception 'dependency_cycle: this dependency would create a circular chain'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger task_dependencies_no_cycle before insert or update on public.task_dependencies
  for each row execute function public.prevent_dependency_cycle();

-- ── Authorization helpers ────────────────────────────────────────────────────
-- security definer so policies on workspace_members don't recurse.

create function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create function public.has_role(ws uuid, roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.team_members      enable row level security;
alter table public.projects          enable row level security;
alter table public.milestones        enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.budget_entries    enable row level security;
alter table public.activity_events   enable row level security;

-- Workspaces are created through create_workspace(); members read, owners/admins edit.
create policy "members read workspace" on public.workspaces for select to authenticated
  using (public.is_member(id));
create policy "admins update workspace" on public.workspaces for update to authenticated
  using (public.has_role(id, array['owner', 'admin'])) with check (public.has_role(id, array['owner', 'admin']));

create policy "members read membership" on public.workspace_members for select to authenticated
  using (public.is_member(workspace_id));
create policy "owners manage membership" on public.workspace_members for all to authenticated
  using (public.has_role(workspace_id, array['owner'])) with check (public.has_role(workspace_id, array['owner']));

-- Workspace-scoped data: any member can read and write.
do $$
declare t text;
begin
  foreach t in array array['team_members', 'projects', 'milestones', 'tasks', 'task_dependencies', 'budget_entries']
  loop
    execute format(
      'create policy "members manage %1$s" on public.%1$I for all to authenticated
         using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;

-- Activity is append-only and must be attributed to the caller.
create policy "members read activity" on public.activity_events for select to authenticated
  using (public.is_member(workspace_id));
create policy "members append activity" on public.activity_events for insert to authenticated
  with check (public.is_member(workspace_id) and actor_id = (select auth.uid()));

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Creates a workspace owned by the caller.
create function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.workspaces (name, created_by) values (p_name, v_user) returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, v_user, 'owner');
  return v_id;
end $$;

revoke execute on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
