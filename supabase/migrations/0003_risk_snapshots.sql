-- Stage 2 — risk history.
-- One row each time a project's calculated result (health, findings, forecast,
-- budget variance) changes. Written by the app after mutations and on first view.
-- Append-only: no update or delete policies.

create table public.risk_snapshots (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  project_id        uuid not null,
  result_hash       text not null check (char_length(result_hash) = 64),
  reference_date    date not null,
  health_score      smallint not null check (health_score between 0 and 100),
  health_status     text not null check (health_status in ('on_track', 'at_risk', 'critical')),
  forecast_finish   date,
  slip_working_days integer,
  budget_variance   numeric(12, 2) not null,
  -- [{ id, rule, severity, title }]
  findings          jsonb not null check (jsonb_typeof(findings) = 'array'),
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index risk_snapshots_project_idx on public.risk_snapshots (project_id, created_at desc);

alter table public.risk_snapshots enable row level security;

create policy "members read risk snapshots" on public.risk_snapshots for select to authenticated
  using (public.is_member(workspace_id));
create policy "members append risk snapshots" on public.risk_snapshots for insert to authenticated
  with check (public.is_member(workspace_id) and created_by = (select auth.uid()));
