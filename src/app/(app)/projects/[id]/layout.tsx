import { Suspense } from "react";
import { Skeleton } from "@/components/system/states";
import { loadProjectHeader, ProjectHeaderView } from "./header";

async function ProjectHeader({ params }: { params: Promise<{ id: string }> }) {
  return <ProjectHeaderView {...await loadProjectHeader((await params).id)} />;
}

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  return (
    <>
      <Suspense
        fallback={
          <div aria-busy="true">
            <Skeleton className="mb-2 h-3 w-40" />
            <Skeleton className="mb-6 h-7 w-80" />
            <Skeleton className="mb-6 h-6 w-96" />
          </div>
        }
      >
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </>
  );
}
