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

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}
