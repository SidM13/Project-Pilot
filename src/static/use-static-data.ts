"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { demoVersion, subscribeDemo } from "@/lib/demo/store";
import "@/static/supabase"; // installs localStorage persistence before the first read

/**
 * Runs a page loader in the browser and re-runs it whenever the demo store changes
 * (every write calls commitDemo), so pages update after actions without a server.
 */
export function useStaticData<T>(load: () => Promise<T>, key: string) {
  const version = useSyncExternalStore(subscribeDemo, demoVersion, () => 0);
  const [state, setState] = useState<{ key: string; data: T | null; error: unknown }>({ key: "", data: null, error: null });
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ key, data, error: null }),
      (error) => alive && setState({ key, data: null, error }),
    );
    return () => {
      alive = false;
    };
    // `load` is recreated each render; `key` and the store version identify the request.
  }, [key, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null };
}
