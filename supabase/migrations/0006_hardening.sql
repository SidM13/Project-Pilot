-- Hardening from the pre-deployment security review.
-- RLS decides which rows a member may touch; these column grants decide which
-- columns. Supabase grants table-wide UPDATE to `authenticated` by default.

-- Workspaces: members may rename and change defaults, but never flip `is_demo`
-- (which would enable demo reset on real data) or move the pinned reference date.
revoke update on public.workspaces from anon, authenticated;
grant update (name, currency, default_hourly_rate, default_weekly_capacity) on public.workspaces to authenticated;

-- Decision briefs: calculated `facts` (and ownership/linkage) are immutable after
-- creation; only the title, narrative and its metadata can be edited.
revoke update on public.decision_briefs from anon, authenticated;
grant update (title, narrative, ai_meta) on public.decision_briefs to authenticated;

-- Append-only tables: no updates through the API at all.
revoke update on public.activity_events, public.risk_snapshots, public.ai_explanations from anon, authenticated;

-- Authorization helpers are only needed by signed-in requests.
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;
