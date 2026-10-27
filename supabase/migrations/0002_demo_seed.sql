-- ProjectPilot AI — demo workspace seed
--
-- seed_demo_workspace(ws) wipes and re-creates the demo portfolio for an
-- is_demo workspace. Every date is an offset from the workspace's
-- reference_date, so moving that date shifts the whole scenario consistently.
--
-- Runs as the caller (security invoker): the setup script calls it with the
-- service role; a signed-in demo member can call it to reset the demo, and RLS
-- confines that call to their own workspace.

create function public._seed_task(
  p_ws uuid, p_project uuid, p_milestone uuid, p_title text, p_status text, p_priority text,
  p_critical boolean, p_assignee uuid, p_start date, p_due date,
  p_planned numeric, p_actual numeric, p_remaining numeric,
  p_completed date default null, p_blocked_reason text default '', p_description text default ''
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.tasks (workspace_id, project_id, milestone_id, title, description, status, priority,
                            is_critical, assignee_id, start_date, due_date, planned_hours, actual_hours,
                            remaining_hours, blocked_reason, completed_at)
  values (p_ws, p_project, p_milestone, p_title, p_description, p_status, p_priority,
          p_critical, p_assignee, p_start, p_due, p_planned, p_actual,
          p_remaining, p_blocked_reason, p_completed::timestamptz + interval '17 hours')
  returning id into v_id;
  return v_id;
end $$;

create function public.seed_demo_workspace(ws uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r date;
  -- team
  elena uuid; marcus uuid; priya uuid; daniel uuid; maya uuid; jordan uuid; aisha uuid; tom uuid;
  -- projects
  erp uuid; web uuid; ops uuid;
  -- milestones
  erp_m1 uuid; erp_m2 uuid; erp_m3 uuid; erp_m4 uuid;
  web_m1 uuid; web_m2 uuid; web_m3 uuid;
  ops_m1 uuid; ops_m2 uuid; ops_m3 uuid;
  -- ERP tasks
  e_req uuid; e_design uuid; e_vendor uuid; e_monitor uuid; e_extract uuid; e_migrate uuid;
  e_finance uuid; e_sit uuid; e_uat uuid; e_rehearse uuid; e_golive uuid;
  -- Website tasks
  w_audit uuid; w_design uuid; w_build uuid; w_content uuid; w_forms uuid; w_redirects uuid; w_qa uuid; w_launch uuid;
  -- Ops tasks
  o_interviews uuid; o_asis uuid; o_tobe uuid; o_sop uuid; o_dash uuid; o_train uuid; o_rollout uuid;
begin
  select reference_date into r from public.workspaces where id = ws and is_demo;
  if not found then
    raise exception 'seed_demo_workspace: workspace % is not a demo workspace (or is not visible)', ws;
  end if;
  r := coalesce(r, current_date);

  delete from public.activity_events where workspace_id = ws;
  -- risk_snapshots cascade from projects (table added in 0003).
  delete from public.projects        where workspace_id = ws; -- cascades milestones, tasks, deps, budget
  delete from public.team_members    where workspace_id = ws;

  -- ── Team ──────────────────────────────────────────────────────────────────
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Elena Rossi',   'Engagement Manager', 'Delivery',   40, 150) returning id into elena;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Marcus Lee',    'Integration Engineer', 'Engineering', 40, 135) returning id into marcus;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Priya Shah',    'Data Engineer', 'Engineering',        40, 130) returning id into priya;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Daniel Okafor', 'ERP Consultant', 'Delivery',       40, 140) returning id into daniel;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Maya Chen',     'Front-end Lead', 'Engineering',       40, 115) returning id into maya;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Jordan Ruiz',   'Web Developer', 'Engineering',        40, 105) returning id into jordan;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Aisha Khan',    'Process Analyst', 'Analysis',      40, 110) returning id into aisha;
  insert into public.team_members (workspace_id, name, role_title, discipline, weekly_capacity_hours, hourly_cost) values
    (ws, 'Tom Becker',    'QA Analyst', 'Quality',           24,  95) returning id into tom;

  -- ── 1. Client ERP Implementation — blocked vendor dependency, schedule pressure
  insert into public.projects (workspace_id, name, client_name, description, owner_member_id, status,
                               start_date, target_date, budget)
  values (ws, 'Client ERP Implementation', 'Halden Manufacturing',
          'Replace Halden''s legacy inventory and finance system with a cloud ERP, including the Kestrel WMS integration and a full data migration.',
          elena, 'active', r - 70, r + 32, 148000)
  returning id into erp;

  insert into public.milestones (workspace_id, project_id, name, due_date, completed_at)
    values (ws, erp, 'Solution design sign-off', r - 45, (r - 46)::timestamptz + interval '17 hours') returning id into erp_m1;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, erp, 'Data migration complete', r + 11) returning id into erp_m2;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, erp, 'UAT sign-off', r + 25) returning id into erp_m3;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, erp, 'Go-live', r + 32) returning id into erp_m4;

  e_req      := public._seed_task(ws, erp, erp_m1, 'Requirements & process mapping', 'done', 'high', false, daniel, r - 70, r - 52, 60, 64, null, r - 53);
  e_design   := public._seed_task(ws, erp, erp_m1, 'Solution design', 'done', 'high', false, daniel, r - 56, r - 46, 48, 52, null, r - 47);
  e_vendor   := public._seed_task(ws, erp, erp_m2, 'Kestrel WMS vendor integration', 'blocked', 'critical', true, marcus, r - 28, r - 3, 80, 58, 30, null,
                  'Kestrel has not delivered sandbox credentials for the inventory endpoint. After two follow-ups they committed to the date below.',
                  'Build and test the inventory and shipment sync between the ERP and Kestrel WMS.');
  e_monitor  := public._seed_task(ws, erp, erp_m2, 'Interface error handling & monitoring', 'in_progress', 'high', false, marcus, r - 7, r + 4, 32, 8, 24);
  e_extract  := public._seed_task(ws, erp, erp_m2, 'Legacy data extraction & cleansing', 'in_progress', 'high', true, priya, r - 21, r + 4, 56, 40, 16, null, '',
                  'Extract 14 years of inventory and order history; de-duplicate ~9% of item master records.');
  e_migrate  := public._seed_task(ws, erp, erp_m2, 'Database migration (inventory & orders)', 'todo', 'critical', true, priya, r, r + 9, 40, 0, null, null, '',
                  'Load cleansed data into the ERP and reconcile stock balances against the WMS.');
  e_finance  := public._seed_task(ws, erp, erp_m3, 'Finance module configuration', 'in_progress', 'high', false, daniel, r - 14, r + 8, 64, 36, 28);
  e_sit      := public._seed_task(ws, erp, erp_m3, 'System integration testing', 'todo', 'high', true, tom, r + 14, r + 18, 32, 0, null);
  e_uat      := public._seed_task(ws, erp, erp_m3, 'User acceptance testing', 'todo', 'critical', true, elena, r + 21, r + 25, 24, 0, null);
  e_rehearse := public._seed_task(ws, erp, erp_m4, 'Cutover rehearsal', 'todo', 'high', true, marcus, r + 28, r + 30, 16, 0, null);
  e_golive   := public._seed_task(ws, erp, erp_m4, 'Go-live & hypercare', 'todo', 'critical', true, daniel, r + 31, r + 32, 16, 0, null);

  update public.tasks set blocked_until = r + 10 where id = e_vendor; -- Kestrel's committed date (Thu)

  insert into public.task_dependencies (workspace_id, project_id, task_id, depends_on_id) values
    (ws, erp, e_design, e_req),
    (ws, erp, e_vendor, e_design),
    (ws, erp, e_monitor, e_design),
    (ws, erp, e_extract, e_design),
    (ws, erp, e_migrate, e_vendor),
    (ws, erp, e_migrate, e_extract),
    (ws, erp, e_finance, e_design),
    (ws, erp, e_sit, e_migrate),
    (ws, erp, e_sit, e_finance),
    (ws, erp, e_sit, e_monitor),
    (ws, erp, e_uat, e_sit),
    (ws, erp, e_rehearse, e_uat),
    (ws, erp, e_golive, e_rehearse);

  insert into public.budget_entries (workspace_id, project_id, entry_date, amount, category, note) values
    (ws, erp, r - 66, 72000.00, 'software', 'Cloud ERP subscription — year one'),
    (ws, erp, r - 40, 15000.00, 'software', 'Data migration tooling licence'),
    (ws, erp, r - 47, 16240.00, 'labor',    'Requirements and design (116 h)'),
    (ws, erp, r - 17,  9800.00, 'labor',    'October build effort'),
    (ws, erp, r - 3,   8270.00, 'labor',    'November build effort to date'),
    (ws, erp, r - 35,  3400.00, 'travel',   'On-site discovery workshops');

  -- ── 2. Client Website Migration — resource bottleneck, moderate risk
  insert into public.projects (workspace_id, name, client_name, description, owner_member_id, status,
                               start_date, target_date, budget)
  values (ws, 'Client Website Migration', 'Brightline Health',
          'Move Brightline''s 240-page patient website from a legacy CMS to a headless CMS with a new template system.',
          maya, 'active', r - 42, r + 25, 64000)
  returning id into web;

  insert into public.milestones (workspace_id, project_id, name, due_date, completed_at)
    values (ws, web, 'Content freeze', r - 10, (r - 10)::timestamptz + interval '17 hours') returning id into web_m1;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, web, 'Staging site complete', r + 9) returning id into web_m2;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, web, 'Public launch', r + 25) returning id into web_m3;

  w_audit     := public._seed_task(ws, web, web_m1, 'Content audit & information architecture', 'done', 'medium', false, jordan, r - 42, r - 31, 40, 38, null, r - 31);
  w_design    := public._seed_task(ws, web, web_m1, 'Design system & page templates', 'done', 'high', false, maya, r - 35, r - 17, 60, 66, null, r - 18);
  w_build     := public._seed_task(ws, web, web_m2, 'Template build in headless CMS', 'in_progress', 'critical', true, maya, r - 14, r + 4, 80, 44, 40);
  w_content   := public._seed_task(ws, web, web_m2, 'Content migration (240 pages)', 'in_progress', 'high', true, maya, r - 7, r + 8, 56, 8, 48);
  w_forms     := public._seed_task(ws, web, web_m2, 'Legacy form integrations', 'todo', 'high', false, marcus, r, r + 8, 32, 0, null);
  w_redirects := public._seed_task(ws, web, web_m3, 'Redirect map & SEO checks', 'todo', 'medium', false, jordan, r + 7, r + 15, 20, 0, null);
  w_qa        := public._seed_task(ws, web, web_m3, 'Accessibility & QA pass', 'todo', 'high', true, tom, r + 14, r + 18, 24, 0, null);
  w_launch    := public._seed_task(ws, web, web_m3, 'Launch & DNS cutover', 'todo', 'critical', true, marcus, r + 23, r + 25, 8, 0, null);

  insert into public.task_dependencies (workspace_id, project_id, task_id, depends_on_id) values
    (ws, web, w_design, w_audit),
    (ws, web, w_build, w_design),
    (ws, web, w_content, w_design),
    (ws, web, w_forms, w_design),
    (ws, web, w_qa, w_build),
    (ws, web, w_qa, w_content),
    (ws, web, w_launch, w_qa),
    (ws, web, w_launch, w_redirects),
    (ws, web, w_launch, w_forms);

  insert into public.budget_entries (workspace_id, project_id, entry_date, amount, category, note) values
    (ws, web, r - 30, 11580.00, 'labor',    'Audit, IA and design system (104 h)'),
    (ws, web, r - 3,   5980.00, 'labor',    'November build effort to date'),
    (ws, web, r - 38,  6200.00, 'software', 'Headless CMS — annual plan'),
    (ws, web, r - 20,  1850.00, 'vendor',   'Stock photography licences');

  -- ── 3. Operations Process Improvement — healthy delivery, limited budget headroom
  insert into public.projects (workspace_id, name, client_name, description, owner_member_id, status,
                               start_date, target_date, budget)
  values (ws, 'Operations Process Improvement', 'Calder Logistics',
          'Redesign Calder''s order-to-dispatch process, document the new SOPs and train three warehouse shifts.',
          aisha, 'active', r - 49, r + 18, 31200)
  returning id into ops;

  insert into public.milestones (workspace_id, project_id, name, due_date, completed_at)
    values (ws, ops, 'Current-state assessment', r - 31, (r - 31)::timestamptz + interval '17 hours') returning id into ops_m1;
  insert into public.milestones (workspace_id, project_id, name, due_date, completed_at)
    values (ws, ops, 'Future-state design approved', r - 3, (r - 4)::timestamptz + interval '17 hours') returning id into ops_m2;
  insert into public.milestones (workspace_id, project_id, name, due_date)
    values (ws, ops, 'Rollout complete', r + 18) returning id into ops_m3;

  o_interviews := public._seed_task(ws, ops, ops_m1, 'Stakeholder interviews', 'done', 'medium', false, aisha, r - 49, r - 38, 40, 42, null, r - 38);
  o_asis       := public._seed_task(ws, ops, ops_m1, 'As-is process mapping', 'done', 'high', false, aisha, r - 42, r - 31, 48, 50, null, r - 31);
  o_tobe       := public._seed_task(ws, ops, ops_m2, 'Future-state process design', 'done', 'high', true, aisha, r - 28, r - 4, 40, 44, null, r - 4);
  o_sop        := public._seed_task(ws, ops, ops_m3, 'SOP documentation', 'in_progress', 'high', true, aisha, r - 7, r + 9, 32, 14, 18);
  o_dash       := public._seed_task(ws, ops, ops_m3, 'Dispatch reporting dashboard', 'in_progress', 'medium', false, maya, r - 7, r + 11, 32, 8, 24);
  o_train      := public._seed_task(ws, ops, ops_m3, 'Shift training sessions', 'todo', 'high', true, aisha, r + 14, r + 16, 16, 0, null);
  o_rollout    := public._seed_task(ws, ops, ops_m3, 'Rollout & handover', 'todo', 'high', true, elena, r + 17, r + 18, 8, 0, null);

  insert into public.task_dependencies (workspace_id, project_id, task_id, depends_on_id) values
    (ws, ops, o_asis, o_interviews),
    (ws, ops, o_tobe, o_asis),
    (ws, ops, o_sop, o_tobe),
    (ws, ops, o_dash, o_tobe),
    (ws, ops, o_train, o_sop),
    (ws, ops, o_rollout, o_train),
    (ws, ops, o_rollout, o_dash);

  insert into public.budget_entries (workspace_id, project_id, entry_date, amount, category, note) values
    (ws, ops, r - 30, 10120.00, 'labor',  'Assessment phase (92 h)'),
    (ws, ops, r - 4,   7300.00, 'labor',  'Design and documentation to date'),
    (ws, ops, r - 36,  2200.00, 'travel', 'Site visits — three warehouses'),
    (ws, ops, r - 25,  1400.00, 'other',  'Workshop facility hire');

  insert into public.activity_events (workspace_id, project_id, entity_type, entity_id, action, summary, created_at) values
    (ws, erp, 'task', e_vendor, 'status_changed', 'Kestrel WMS vendor integration marked Blocked: vendor committed to deliver credentials in 10 days', (r - 5)::timestamptz + interval '10 hours'),
    (ws, erp, 'task', e_extract, 'hours_logged', 'Legacy data extraction & cleansing: 40 h actual, 16 h remaining', (r - 3)::timestamptz + interval '16 hours'),
    (ws, web, 'task', w_content, 'hours_logged', 'Content migration (240 pages): 8 h actual, 48 h remaining', (r - 3)::timestamptz + interval '15 hours'),
    (ws, ops, 'milestone', ops_m2, 'completed', 'Milestone completed: Future-state design approved', (r - 4)::timestamptz + interval '17 hours');
end $$;

revoke execute on function public.seed_demo_workspace(uuid) from public, anon;
grant execute on function public.seed_demo_workspace(uuid) to authenticated, service_role;
revoke execute on function public._seed_task(uuid, uuid, uuid, text, text, text, boolean, uuid, date, date, numeric, numeric, numeric, date, text, text) from public, anon;
grant execute on function public._seed_task(uuid, uuid, uuid, text, text, text, boolean, uuid, date, date, numeric, numeric, numeric, date, text, text) to authenticated, service_role;
