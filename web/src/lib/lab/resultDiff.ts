/** Expected vs yours: row tables and schema (pure). Rows match by full value (order-insensitive). */
export type Grid = { columns: string[]; rows: unknown[][] };
export type RowMark = "=" | "≠";
export type GridDiff = {
  columnsMatch: boolean;
  expected: Array<{ row: unknown[]; mark: RowMark }>;
  yours: Array<{ row: unknown[]; mark: RowMark }>;
  summary: { match: number; missing: number; extra: number; orderMatters: boolean; inOrder: boolean };
};

const TS = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
/** Columns whose values are generated per run (timestamps) are ignored when comparing. */
export function volatileColumns(g: Grid): Set<number> {
  const s = new Set<number>();
  g.columns.forEach((_, i) => {
    if (g.rows.length && g.rows.every((r) => r[i] === null || (typeof r[i] === "string" && TS.test(r[i] as string)))) s.add(i);
  });
  return s;
}

function key(row: unknown[], skip: Set<number>): string {
  return JSON.stringify(row.filter((_, i) => !skip.has(i)).map((v) => (v === null || v === undefined ? null : String(v))));
}

export function diffGrids(expected: Grid, yours: Grid, orderMatters = false): GridDiff {
  const columnsMatch = expected.columns.join("|").toLowerCase() === yours.columns.join("|").toLowerCase();
  const skip = new Set([...volatileColumns(expected)]);
  const remaining = new Map<string, number>();
  for (const r of yours.rows) remaining.set(key(r, skip), (remaining.get(key(r, skip)) || 0) + 1);
  const exp = expected.rows.map((row) => {
    const k = key(row, skip);
    const n = remaining.get(k) || 0;
    if (n > 0) {
      remaining.set(k, n - 1);
      return { row, mark: "=" as RowMark };
    }
    return { row, mark: "≠" as RowMark };
  });
  const pool = new Map<string, number>();
  for (const r of expected.rows) pool.set(key(r, skip), (pool.get(key(r, skip)) || 0) + 1);
  const yrs = yours.rows.map((row) => {
    const k = key(row, skip);
    const n = pool.get(k) || 0;
    if (n > 0) {
      pool.set(k, n - 1);
      return { row, mark: "=" as RowMark };
    }
    return { row, mark: "≠" as RowMark };
  });
  const inOrder = expected.rows.length === yours.rows.length && expected.rows.every((r, i) => key(r, skip) === key(yours.rows[i], skip));
  return {
    columnsMatch,
    expected: exp,
    yours: yrs,
    summary: {
      match: exp.filter((e) => e.mark === "=").length,
      missing: exp.filter((e) => e.mark === "≠").length,
      extra: yrs.filter((e) => e.mark === "≠").length,
      orderMatters,
      inOrder,
    },
  };
}

export function gridsEqual(d: GridDiff): boolean {
  return d.columnsMatch && d.summary.missing === 0 && d.summary.extra === 0 && (!d.summary.orderMatters || d.summary.inOrder);
}

/** Text output diff, line by line (LCS). */
export type LineOp = { op: "=" | "+" | "-"; text: string };
export function diffLines(expected: string, actual: string): LineOp[] {
  const a = expected.split("\n"), b = actual.split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: LineOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: "=", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

/** Schema: per expected table/column, is it present in yours with the same type/keys? */
type Col = { name: string; type: string; nullable: boolean; isPrimaryKey: boolean; isUnique?: boolean; isForeignKey: boolean };
type Table = { name: string; columns: Col[] };
export type SchemaRow = { table: string; column?: string; expected: string; yours: string; ok: boolean };

function describe(c: Col): string {
  return [c.type, c.isPrimaryKey ? "PK" : "", c.isForeignKey ? "FK" : "", c.nullable ? "null" : "not null", c.isUnique && !c.isPrimaryKey ? "unique" : ""].filter(Boolean).join(" · ");
}

export function diffSchema(expected: { tables: Table[] }, yours: { tables: Table[] }): SchemaRow[] {
  const rows: SchemaRow[] = [];
  for (const et of expected.tables) {
    const yt = yours.tables.find((t) => t.name === et.name);
    rows.push({ table: et.name, expected: "table", yours: yt ? "table" : "missing", ok: Boolean(yt) });
    for (const ec of et.columns) {
      const yc = yt?.columns.find((c) => c.name === ec.name);
      const e = describe(ec), y = yc ? describe(yc) : "missing";
      rows.push({ table: et.name, column: ec.name, expected: e, yours: y, ok: e === y });
    }
  }
  return rows;
}

/** Before → after for one table, keyed by primary key (or full row): + inserted, − deleted, ~ updated. */
export type ChangeMark = "+" | "-" | "~" | "=";
export function diffSnapshot(before: Grid & { primaryKey?: string[] } | undefined, after: Grid & { primaryKey?: string[] }): Array<{ row: unknown[]; mark: ChangeMark; changed?: number[] }> {
  const pk = (after.primaryKey || []).map((c) => after.columns.indexOf(c)).filter((i) => i >= 0);
  const k = (r: unknown[]) => JSON.stringify(pk.length ? pk.map((i) => r[i]) : r);
  const prev = new Map((before?.rows || []).map((r) => [k(r), r]));
  const out: Array<{ row: unknown[]; mark: ChangeMark; changed?: number[] }> = [];
  for (const r of after.rows) {
    const p = prev.get(k(r));
    if (!p) out.push({ row: r, mark: "+" });
    else {
      const changed = r.map((v, i) => (JSON.stringify(v) === JSON.stringify(p[i]) ? -1 : i)).filter((i) => i >= 0);
      out.push({ row: r, mark: changed.length ? "~" : "=", changed });
      prev.delete(k(r));
    }
  }
  for (const r of prev.values()) out.push({ row: r, mark: "-" });
  return out;
}
