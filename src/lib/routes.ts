// Links to project and brief pages. The server app uses path segments
// (/projects/<id>/tasks); the static GitHub Pages demo cannot pre-render pages for ids
// created in the visitor's browser, so it uses query links (/projects/view/tasks/?id=).

export type ProjectTab = "tasks" | "milestones" | "budget" | "activity";

const STATIC = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

export function projectHref(id: string, tab?: ProjectTab, hash?: string) {
  const h = hash ? `#${hash}` : "";
  return STATIC ? `/projects/view/${tab ? `${tab}/` : ""}?id=${encodeURIComponent(id)}${h}` : `/projects/${id}${tab ? `/${tab}` : ""}${h}`;
}

export function briefHref(id: string) {
  return STATIC ? `/reports/view/?id=${encodeURIComponent(id)}` : `/reports/${id}`;
}
