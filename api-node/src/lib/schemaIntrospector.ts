import type pg from "pg";
import { getPool } from "./db.js";

const SKIP = new Set(["run_history", "learner_progress", "alembic_version", "_prisma_migrations"]);

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique?: boolean;
  references?: { table: string; column: string };
};

export type TableInfo = {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  indexes: string[][];
  checks: { name: string; definition: string }[];
};

export type SchemaSnapshot = {
  tables: TableInfo[];
  relationships: {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    onDelete: string;
    onUpdate: string;
    constraint: string;
    type: string;
  }[];
};

export async function introspectSchema(pool?: pg.Pool): Promise<SchemaSnapshot> {
  const p = pool || getPool();
  const tablesRes = await p.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  // Every PK / UNIQUE / plain index with ordered columns (same query as api-python). Only single-column
  // keys make a column `isUnique`: a composite UNIQUE(a, b) does not make `a` unique on its own.
  const keyRes = await p.query<{ table_name: string; is_primary: boolean; is_unique: boolean; columns: string[] }>(
    `SELECT c.relname AS table_name, i.indisprimary AS is_primary, i.indisunique AS is_unique,
            array_agg(a.attname::text ORDER BY k.ord) AS columns
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
     WHERE i.indpred IS NULL AND i.indexprs IS NULL
     GROUP BY c.relname, i.indexrelid, i.indisprimary, i.indisunique`
  );
  const keys = new Map<string, { primaryKey: string[]; unique: string[][]; indexes: string[][] }>();
  for (const r of keyRes.rows) {
    const e = keys.get(r.table_name) || { primaryKey: [], unique: [], indexes: [] };
    if (r.is_primary) e.primaryKey = r.columns;
    else if (r.is_unique) e.unique.push(r.columns);
    else e.indexes.push(r.columns);
    keys.set(r.table_name, e);
  }
  const checkRes = await p.query<{ relname: string; conname: string; definition: string }>(
    `SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE con.contype = 'c' ORDER BY con.conname`
  );
  const checks = new Map<string, { name: string; definition: string }[]>();
  for (const r of checkRes.rows) {
    checks.set(r.relname, [...(checks.get(r.relname) || []), { name: r.conname, definition: r.definition }]);
  }

  const tables: SchemaSnapshot["tables"] = [];
  const relationships: SchemaSnapshot["relationships"] = [];

  for (const { table_name } of tablesRes.rows) {
    if (SKIP.has(table_name)) continue;

    const cols = await p.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
      is_pk: boolean;
    }>(
      `SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.table_schema = 'public' AND tc.table_name = $1
            AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = c.column_name
        ) AS is_pk
       FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.table_name = $1
       ORDER BY c.ordinal_position`,
      [table_name]
    );

    const k = keys.get(table_name) || { primaryKey: [], unique: [], indexes: [] };
    const singleUnique = new Set(k.unique.filter((u) => u.length === 1).map((u) => u[0]));
    if (k.primaryKey.length === 1) singleUnique.add(k.primaryKey[0]);
    const columns: ColumnInfo[] = cols.rows.map((c) => ({
      name: c.column_name,
      type: c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type,
      nullable: c.is_nullable === "YES",
      default: c.column_default,
      isPrimaryKey: c.is_pk,
      isUnique: singleUnique.has(c.column_name),
      isForeignKey: false,
    }));

    const fks = await p.query<{
      column_name: string;
      foreign_table: string;
      foreign_column: string;
      delete_rule: string;
      update_rule: string;
      constraint_name: string;
    }>(
      `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
              rc.delete_rule, rc.update_rule, tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
      [table_name]
    );

    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    for (const fk of fks.rows) {
      if (byName[fk.column_name]) {
        byName[fk.column_name].isForeignKey = true;
        byName[fk.column_name].references = {
          table: fk.foreign_table,
          column: fk.foreign_column,
        };
      }
      relationships.push({
        fromTable: table_name,
        fromColumn: fk.column_name,
        toTable: fk.foreign_table,
        toColumn: fk.foreign_column,
        onDelete: fk.delete_rule,
        onUpdate: fk.update_rule,
        constraint: fk.constraint_name,
        type: "many-to-one",
      });
    }

    tables.push({
      name: table_name,
      columns,
      primaryKey: k.primaryKey,
      uniqueConstraints: k.unique,
      indexes: k.indexes,
      checks: checks.get(table_name) || [],
    });
  }

  return { tables, relationships };
}
