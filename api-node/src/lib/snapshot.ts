import type pg from "pg";

const LAB_TABLE = /^lab_[a-z0-9_]{1,58}$/;
export const SNAPSHOT_ROWS = 50;

export type TableSnapshot = { columns: string[]; rows: unknown[][]; total: number; primaryKey: string[] };

function cell(v: unknown): unknown {
  if (v === null || ["string", "number", "boolean"].includes(typeof v)) return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Up to SNAPSHOT_ROWS rows per existing lab table, ordered by primary key (same shape as api-python). */
export async function snapshotTables(pool: pg.Pool, names: string[]): Promise<Record<string, TableSnapshot>> {
  const out: Record<string, TableSnapshot> = {};
  for (const name of [...new Set(names)].filter((n) => LAB_TABLE.test(n)).sort()) {
    const exists = await pool.query("SELECT to_regclass($1) IS NOT NULL AS e", [`public."${name}"`]);
    if (!exists.rows[0]?.e) continue;
    const pk = (
      await pool.query(
        `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)`,
        [`public."${name}"`]
      )
    ).rows.map((r) => r.attname as string);
    const order = pk.map((c) => `"${c}"`).join(", ") || "1";
    const r = await pool.query({ text: `SELECT * FROM "${name}" ORDER BY ${order} LIMIT ${SNAPSHOT_ROWS}`, rowMode: "array" });
    const total = (await pool.query(`SELECT count(*)::int AS n FROM "${name}"`)).rows[0].n as number;
    out[name] = { columns: r.fields.map((f) => f.name), rows: r.rows.map((row: unknown[]) => row.map(cell)), total, primaryKey: pk };
  }
  return out;
}
