import { createClient } from "@/static/supabase";
import { setActiveWorkspace } from "@/static/data/workspace";
import { workspaceNameSchema } from "@/lib/validation";
import { actionContext, fail, logActivity, uuid, type ActionResult } from "@/static/generated/actions/shared";

// Static (GitHub Pages) replacement for actions/workspace.ts: same behaviour, with the
// active workspace in localStorage and full-page navigation instead of redirect().

// A full page load re-reads the demo store from localStorage; router.push is not available in a plain function.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const go = (path: string) => window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`);

export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    setActiveWorkspace(uuid.parse(workspaceId));
    go("/command-center/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createWorkspace(_: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const name = workspaceNameSchema.parse(formData.get("name"));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_workspace", { p_name: name });
    if (error) throw error;
    setActiveWorkspace(data as string);
    go("/command-center/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDemoWorkspace(): Promise<ActionResult> {
  try {
    const ctx = await actionContext();
    const { error } = await ctx.supabase.rpc("seed_demo_workspace", { ws: ctx.workspaceId });
    if (error) throw error;
    await logActivity(ctx, { projectId: null, entityType: "workspace", entityId: ctx.workspaceId, action: "reset", summary: "Demo data reset to the seeded scenario" });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
