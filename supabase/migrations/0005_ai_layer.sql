-- Stage 4 — AI layer.
--
-- ai_explanations: cache of validated model outputs keyed by a hash of the exact
-- grounded input (prompt version + model + calculated context). Identical inputs
-- never call the model twice. Rows also serve as the per-user hourly usage count.
--
-- decision_briefs: executive briefs. `facts` is calculated by the engine and is
-- never edited; `narrative` holds AI-drafted (and user-edited) text, labelled as such.
--
-- Neither table gives the model any path to project records.

create table public.ai_explanations (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  project_id     uuid not null,
  kind           text not null check (kind in ('simulation', 'brief')),
  input_hash     text not null check (char_length(input_hash) = 64),
  model          text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 20),
  output         jsonb not null check (jsonb_typeof(output) = 'object'),
  usage          jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (workspace_id, input_hash),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index ai_explanations_user_idx on public.ai_explanations (created_by, created_at desc);

create table public.decision_briefs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  simulation_id uuid references public.simulations (id) on delete set null,
  title         text not null check (char_length(title) between 1 and 160),
  facts         jsonb not null check (jsonb_typeof(facts) = 'object'),
  narrative     jsonb not null check (jsonb_typeof(narrative) = 'object'),
  -- { status: 'drafted' | 'unavailable' | 'manual', model?, reason?, edited? }
  ai_meta       jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index decision_briefs_workspace_idx on public.decision_briefs (workspace_id, created_at desc);

create trigger decision_briefs_touch before update on public.decision_briefs
  for each row execute function public.touch_updated_at();

alter table public.ai_explanations enable row level security;
alter table public.decision_briefs enable row level security;

create policy "members read ai explanations" on public.ai_explanations for select to authenticated
  using (public.is_member(workspace_id));
create policy "members cache ai explanations" on public.ai_explanations for insert to authenticated
  with check (public.is_member(workspace_id) and created_by = (select auth.uid()));

create policy "members read briefs" on public.decision_briefs for select to authenticated
  using (public.is_member(workspace_id));
create policy "members create briefs" on public.decision_briefs for insert to authenticated
  with check (public.is_member(workspace_id) and created_by = (select auth.uid()));
create policy "members edit briefs" on public.decision_briefs for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "members delete briefs" on public.decision_briefs for delete to authenticated
  using (public.is_member(workspace_id));

alter table public.activity_events drop constraint activity_events_entity_type_check;
alter table public.activity_events add constraint activity_events_entity_type_check
  check (entity_type in ('project', 'task', 'milestone', 'dependency', 'budget_entry', 'team_member', 'workspace', 'simulation', 'brief'));
