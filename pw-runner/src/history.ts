/** Run history + progress in the shared Postgres tables (falls back to memory without a DB). */
import pg from "pg";

let pool: pg.Pool | null = null;
let dbOk = false;
const memory: Array<Record<string, unknown>> = [];
let memId = 1;

export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
    pool.on("error", () => { dbOk = false; });
  }
  return pool;
}

export async function ensureTables(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(`CREATE TABLE IF NOT EXISTS run_history (
      id SERIAL PRIMARY KEY, track_id VARCHAR(64) NOT NULL, task_id VARCHAR(64),
      mode VARCHAR(32) NOT NULL DEFAULT 'execute', code TEXT NOT NULL,
      success BOOLEAN NOT NULL DEFAULT FALSE, message TEXT,
      schema_before JSONB, schema_after JSONB, validation JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await p.query(`CREATE TABLE IF NOT EXISTS learner_progress (
      id SERIAL PRIMARY KEY, track_id VARCHAR(64) NOT NULL, task_id VARCHAR(64) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE, attempts INTEGER NOT NULL DEFAULT 0,
      last_code TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (track_id, task_id))`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return dbOk;
}

export async function dbHealthy(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return dbOk;
}

export type HistoryRow = {
  trackId: string; taskId: string | null; mode: string; code: string;
  success: boolean; message: string; validation: unknown;
};

export async function recordRun(row: HistoryRow): Promise<number | null> {
  const p = getPool();
  if (p) {
    try {
      const r = await p.query(
        `INSERT INTO run_history (track_id, task_id, mode, code, success, message, validation)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
        [row.trackId, row.taskId, row.mode, row.code, row.success, row.message, JSON.stringify(row.validation)]
      );
      if (row.taskId) {
        await p.query(
          `INSERT INTO learner_progress (track_id, task_id, completed, attempts, last_code)
           VALUES ($1,$2,$3,1,$4)
           ON CONFLICT (track_id, task_id) DO UPDATE SET
             completed = learner_progress.completed OR EXCLUDED.completed,
             attempts = learner_progress.attempts + 1, last_code = EXCLUDED.last_code, updated_at = NOW()`,
          [row.trackId, row.taskId, row.success, row.code]
        );
      }
      return r.rows[0].id as number;
    } catch (e) {
      console.warn("[history] db write failed, keeping in memory:", String(e));
    }
  }
  const id = memId++;
  memory.unshift({ id, track_id: row.trackId, task_id: row.taskId, mode: row.mode, code: row.code, success: row.success, message: row.message, validation: row.validation, created_at: new Date().toISOString() });
  memory.splice(200);
  return id;
}

export async function listRuns(trackId: string | undefined, limit: number) {
  const p = getPool();
  const lim = Math.min(Math.max(limit || 40, 1), 200);
  if (p && dbOk) {
    try {
      const r = trackId
        ? await p.query(`SELECT id, track_id, task_id, mode, success, message, created_at, LEFT(code,500) AS code_preview FROM run_history WHERE track_id=$1 ORDER BY id DESC LIMIT $2`, [trackId, lim])
        : await p.query(`SELECT id, track_id, task_id, mode, success, message, created_at, LEFT(code,500) AS code_preview FROM run_history ORDER BY id DESC LIMIT $1`, [lim]);
      return r.rows;
    } catch { /* fall through */ }
  }
  return memory.filter((m) => !trackId || m.track_id === trackId).slice(0, lim)
    .map(({ code, validation: _v, ...rest }) => ({ ...rest, code_preview: String(code).slice(0, 500) }));
}

export async function getRun(id: number) {
  const p = getPool();
  if (p && dbOk) {
    try {
      const r = await p.query(`SELECT id, track_id, task_id, mode, code, success, message, validation, created_at FROM run_history WHERE id=$1`, [id]);
      if (r.rows[0]) return r.rows[0];
    } catch { /* fall through */ }
  }
  return memory.find((m) => m.id === id) || null;
}

export async function getProgress(trackId: string) {
  const p = getPool();
  if (p && dbOk) {
    try {
      const r = await p.query(`SELECT task_id, completed, attempts, updated_at FROM learner_progress WHERE track_id=$1`, [trackId]);
      return r.rows;
    } catch { /* fall through */ }
  }
  const seen = new Map<string, { task_id: string; completed: boolean; attempts: number }>();
  for (const m of [...memory].reverse()) {
    if (m.track_id !== trackId || !m.task_id) continue;
    const k = String(m.task_id);
    const prev = seen.get(k) || { task_id: k, completed: false, attempts: 0 };
    seen.set(k, { task_id: k, completed: prev.completed || Boolean(m.success), attempts: prev.attempts + 1 });
  }
  return [...seen.values()];
}

export async function resetProgress(trackId: string) {
  const p = getPool();
  for (let i = memory.length - 1; i >= 0; i--) if (memory[i].track_id === trackId) memory.splice(i, 1);
  if (p && dbOk) {
    await p.query(`DELETE FROM learner_progress WHERE track_id=$1`, [trackId]);
  }
}
