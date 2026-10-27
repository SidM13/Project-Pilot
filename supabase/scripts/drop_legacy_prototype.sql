-- Run ONLY if this Supabase project previously hosted the earlier ProjectPilot
-- prototype (~/projectpilot-ai). Destroys those tables and their data.
drop function if exists public.seed_my_demo_data();
drop function if exists public._demo_task(uuid, text, text, text, text, int, int, numeric, int, text);
drop table if exists public.chat_messages, public.status_reports, public.risk_analyses,
  public.task_dependencies, public.milestones, public.tasks, public.projects cascade;
drop function if exists public.touch_updated_at() cascade;
drop function if exists public.sync_task_completed_at() cascade;
