import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool() {
  if (!pool) {
    const url =
      process.env.DATABASE_URL ||
      "postgresql://hub:hub_secret@localhost:5432/learning_hub";
    pool = new Pool({ connectionString: url, max: 8 });
  }
  return pool;
}

export async function ensureMetaTables() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS run_history (
      id SERIAL PRIMARY KEY,
      track_id VARCHAR(64) NOT NULL,
      task_id VARCHAR(64),
      mode VARCHAR(32) NOT NULL DEFAULT 'execute',
      code TEXT NOT NULL,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      message TEXT,
      schema_before JSONB,
      schema_after JSONB,
      validation JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS learner_progress (
      id SERIAL PRIMARY KEY,
      track_id VARCHAR(64) NOT NULL,
      task_id VARCHAR(64) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_code TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (track_id, task_id)
    )
  `);
}

/** Additive lab-UX columns (api-python creates the same; both are idempotent). */
export async function ensureLabColumns() {
  const p = getPool();
  await p.query("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS data_before JSONB");
  await p.query("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS data_after JSONB");
  await p.query("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS hint_level INTEGER NOT NULL DEFAULT 0");
  await p.query(`CREATE TABLE IF NOT EXISTS hint_usage (
    id SERIAL PRIMARY KEY, track_id VARCHAR(64) NOT NULL, item_kind VARCHAR(16) NOT NULL,
    item_id VARCHAR(64) NOT NULL, level INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (track_id, item_kind, item_id, level))`);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}
