import type { TaskDependency } from "@/lib/types";

// Dependency graph helpers. An edge { task_id: A, depends_on_id: B } means
// "A cannot finish until B is done" — B is upstream of A.

export interface DependencyGraph {
  upstream: Map<string, string[]>;
  downstream: Map<string, string[]>;
}

export function buildGraph(dependencies: Pick<TaskDependency, "task_id" | "depends_on_id">[]): DependencyGraph {
  const upstream = new Map<string, string[]>();
  const downstream = new Map<string, string[]>();
  for (const { task_id, depends_on_id } of dependencies) {
    upstream.set(task_id, [...(upstream.get(task_id) ?? []), depends_on_id]);
    downstream.set(depends_on_id, [...(downstream.get(depends_on_id) ?? []), task_id]);
  }
  return { upstream, downstream };
}

/** Every task reachable from `rootId` along `edges` (excluding the root). */
export function reachable(edges: Map<string, string[]>, rootId: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(edges.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === rootId || seen.has(id)) continue;
    seen.add(id);
    stack.push(...(edges.get(id) ?? []));
  }
  return seen;
}

/**
 * True if adding "taskId depends on dependsOnId" would close a loop, i.e. taskId
 * is already upstream of dependsOnId (or they are the same task).
 * Mirrors the prevent_dependency_cycle() trigger in the database.
 */
export function wouldCreateCycle(
  dependencies: Pick<TaskDependency, "task_id" | "depends_on_id">[],
  taskId: string,
  dependsOnId: string,
): boolean {
  if (taskId === dependsOnId) return true;
  return reachable(buildGraph(dependencies).upstream, dependsOnId).has(taskId);
}

/** Tasks ordered so every task comes after its upstream tasks (Kahn's algorithm). Throws on a cycle. */
export function topologicalOrder(taskIds: string[], dependencies: Pick<TaskDependency, "task_id" | "depends_on_id">[]): string[] {
  const ids = new Set(taskIds);
  const indegree = new Map(taskIds.map((id) => [id, 0]));
  const { downstream } = buildGraph(dependencies.filter((d) => ids.has(d.task_id) && ids.has(d.depends_on_id)));
  for (const children of downstream.values()) for (const c of children) indegree.set(c, indegree.get(c)! + 1);

  const queue = taskIds.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const c of downstream.get(id) ?? []) {
      indegree.set(c, indegree.get(c)! - 1);
      if (indegree.get(c) === 0) queue.push(c);
    }
  }
  if (order.length !== taskIds.length) throw new Error("Dependency graph contains a cycle");
  return order;
}
