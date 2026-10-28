import { cascadeDelete, commitDemo, createWorkspace, demoState, DEMO_USER, prepareInsert, prepareUpdate, seedDemoWorkspace, type PgError, type Row } from "./store";

// Supabase-compatible client over the in-memory demo store. Implements exactly the
// query-builder surface the app uses (from/select/insert/update/delete, eq/in/is/gte,
// order/limit, single/maybeSingle, exact counts, one embedded relation, two RPCs and
// the auth calls), returning the same { data, error, count } shapes and error codes.

type Result = { data: unknown; error: PgError | null; count?: number | null };
type Filter = (r: Row) => boolean;

const clone = <T,>(v: T): T => structuredClone(v);

/** "a, b, alias:table(c, d)" → columns + one embedded relation (joined on <singular table>_id). */
function project(table: string, columns: string, row: Row): Row {
  if (columns.trim() === "*") return clone(row);
  const out: Row = {};
  for (const part of columns.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean)) {
    const embed = /^(\w+):(\w+)\((.*)\)$/.exec(part);
    if (embed) {
      const [, alias, other, cols] = embed;
      const fk = `${other.replace(/s$/, "")}_id`;
      const target = demoState().tables[other]?.find((r) => r.id === row[fk]);
      out[alias] = target ? project(other, cols, target) : null;
    } else out[part] = clone(row[part]);
  }
  void table;
  return out;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private sorts: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private max?: number;
  private columns = "*";
  private returning = false;
  private head = false;
  private counted = false;
  private mode: "one" | "maybe" | "many" = "many";
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;

  constructor(private table: string) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.columns = columns;
    if (this.op !== "select") this.returning = true;
    if (opts?.count) this.counted = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this; }
  upsert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this; }
  update(values: Row) { this.op = "update"; this.payload = values; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, v: unknown) { this.filters.push((r) => r[col] === v); return this; }
  in(col: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[col])); return this; }
  is(col: string, v: null) { this.filters.push((r) => (r[col] ?? null) === v); return this; }
  gte(col: string, v: string | number) { this.filters.push((r) => r[col] != null && (r[col] as string | number) >= v); return this; }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.sorts.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst }); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = "one"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onOk, onErr);
  }

  private match(rows: Row[]) {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): Result {
    const state = demoState();
    const tables = state.tables;
    if (!tables[this.table]) return { data: null, error: { code: "42P01", message: `relation "${this.table}" does not exist` } };
    let affected: Row[] = [];

    if (this.op === "insert") {
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const staged: Row[] = [];
      for (const input of inputs) {
        const r = prepareInsert({ ...tables, [this.table]: [...tables[this.table], ...staged] }, this.table, input);
        if (r.error) return { data: null, error: r.error };
        staged.push(r.row);
      }
      tables[this.table].push(...staged);
      affected = staged;
      commitDemo();
    } else if (this.op === "update") {
      for (const before of this.match(tables[this.table])) {
        const r = prepareUpdate(tables, this.table, before, this.payload as Row);
        if (r.error) return { data: null, error: r.error };
        Object.assign(before, r.row);
        affected.push(before);
      }
      if (affected.length) commitDemo();
    } else if (this.op === "delete") {
      affected = this.match(tables[this.table]);
      tables[this.table] = tables[this.table].filter((r) => !affected.includes(r));
      affected.forEach((r) => cascadeDelete(tables, this.table, r));
      if (affected.length) commitDemo();
    } else {
      affected = this.match(tables[this.table]);
    }

    let rows = [...affected];
    for (const s of [...this.sorts].reverse()) {
      rows.sort((a, b) => {
        const x = a[s.col], y = b[s.col];
        if (x == null || y == null) return x == null && y == null ? 0 : (x == null) === !!s.nullsFirst ? -1 : 1;
        return (x < y ? -1 : x > y ? 1 : 0) * (s.asc ? 1 : -1);
      });
    }
    const count = rows.length;
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    if (this.head) return { data: null, error: null, count };
    if (this.op !== "select" && !this.returning) return { data: null, error: null, count: this.counted ? count : null };

    const data = rows.map((r) => project(this.table, this.columns, r));
    if (this.mode === "one") {
      if (data.length !== 1) return { data: null, error: { code: "PGRST116", message: `JSON object requested, ${data.length} rows returned` } };
      return { data: data[0], error: null };
    }
    if (this.mode === "maybe") {
      if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows returned" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: this.counted ? count : null };
  }
}

/** Demo-mode replacement for the user-scoped Supabase server client. */
export function createDemoClient(signedIn: boolean) {
  const user = signedIn ? DEMO_USER : null;
  return {
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Record<string, unknown>): Promise<Result> => {
      const { tables } = demoState();
      if (!user) return { data: null, error: { code: "42501", message: "not_authenticated" } };
      if (fn === "create_workspace") {
        const id = createWorkspace(tables, String(args.p_name), user.id);
        commitDemo();
        return { data: id, error: null };
      }
      if (fn === "seed_demo_workspace") {
        const error = seedDemoWorkspace(tables, String(args.ws));
        if (!error) commitDemo();
        return { data: null, error };
      }
      return { data: null, error: { code: "42883", message: `function ${fn} does not exist` } };
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async () => ({ data: { session: null }, error: { message: "Password sign-in is disabled in local demo mode." } }),
      signUp: async () => ({ data: { session: null }, error: { message: "Account creation is disabled in local demo mode." } }),
      signOut: async () => ({ error: null }),
    },
  };
}
