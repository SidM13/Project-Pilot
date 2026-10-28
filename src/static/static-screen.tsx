"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageSkeleton } from "@/components/system/states";
import { useStaticData } from "./use-static-data";

export type SearchParams = Record<string, string | undefined>;

/**
 * Static-demo page: runs the same loader the server page uses (against the in-browser
 * demo store) and renders the same view. Handles loading, not-found and errors.
 */
interface ScreenProps<T> {
  load: (sp: SearchParams) => Promise<T>;
  render: (data: T) => React.ReactNode;
  fallback?: React.ReactNode;
  /** Render instead of the error panel (e.g. null for a layout header whose page shows the error). */
  onError?: React.ReactNode;
}

export function StaticScreen<T>(props: ScreenProps<T>) {
  const fallback = props.fallback ?? <PageSkeleton />;
  return (
    <Suspense fallback={fallback}>
      <Screen {...props} fallback={fallback} />
    </Suspense>
  );
}

function Screen<T>({ load, render, fallback, onError }: ScreenProps<T>) {
  const params = useSearchParams();
  const key = params.toString();
  const { data, error } = useStaticData(() => load(Object.fromEntries(params.entries())), key);
  if (error && onError !== undefined) return onError;
  if (error) {
    const notFound = String((error as { digest?: string }).digest ?? "").includes("404");
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6">
        <h1 className="text-[15px] font-semibold">{notFound ? "Not found in this demo" : "This page could not load"}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {notFound ? "It may have been deleted, or the demo data in this browser was reset." : "Something went wrong reading the demo data in this browser."}
        </p>
        <Link href="/command-center" className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline">Back to the Command Center</Link>
      </div>
    );
  }
  if (data === null) return fallback;
  return render(data);
}
