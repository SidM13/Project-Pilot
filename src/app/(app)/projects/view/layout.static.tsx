"use client";

import { StaticScreen } from "@/static/static-screen";
import { loadProjectHeader, ProjectHeaderView } from "../[id]/header";
import { Skeleton } from "@/components/system/states";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StaticScreen
        load={(sp) => loadProjectHeader(sp.id ?? "")}
        render={(d) => <ProjectHeaderView {...d} />}
        fallback={<Skeleton className="mb-6 h-24 w-full" />}
        onError={null}
      />
      {children}
    </>
  );
}
