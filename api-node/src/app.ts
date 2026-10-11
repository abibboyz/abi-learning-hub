import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureMetaTables, getPool } from "./lib/db.js";
import { introspectSchema } from "./lib/schemaIntrospector.js";
import {
  checkData,
  checkDatasource,
  checkProbes,
  checkRequirements,
  gradeQuiz,
  merge,
  validation,
  type QuizQuestion,
  type Requirements,
  type Validation,
} from "./lib/taskChecker.js";
import { checkZodExercise } from "./lib/zodLab.js";
import * as tracks from "./lib/tracks.js";
import { prismaModelsToSql } from "./runners/prismaSchemaRunner.js";

export const app = express();
const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",");

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  let database = false;
  try {
    await getPool().query("SELECT 1");
    database = true;
  } catch {
    database = false;
  }
  res.json({ ok: true, service: "api-node", database, time: new Date().toISOString() });
});

app.get("/tracks", (_req, res) => {
  res.json({ tracks: tracks.listTracks() });
});

app.get("/tracks/:trackId", (req, res) => {
  try {
    const index = tracks.listTracks().find((t) => t.id === req.params.trackId);
    if (!index) return res.status(404).json({ error: "Track not found" });
    const manifest = tracks.loadManifest(req.params.trackId);
    res.json({ ...index, ...manifest });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/tasks", (req, res) => {
  try {
    res.json({ tasks: tracks.listTasks(req.params.trackId).map(tracks.publicItem) });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/tasks/:taskId", (req, res) => {
  try {
    res.json(tracks.publicItem(tracks.loadTask(req.params.trackId, req.params.taskId)));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/tasks/:taskId/solution", (req, res) => {
  try {
    const t = tracks.loadTask(req.params.trackId, req.params.taskId) as { solution?: string };
    if (!t.solution) return res.status(404).json({ error: "No reference solution for this task" });
    res.json({ solution: t.solution });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/lessons/:lessonId/solution", (req, res) => {
  try {
    const l = tracks.loadLesson(req.params.trackId, req.params.lessonId) as { exercise?: { solution?: string } };
    if (!l.exercise?.solution) return res.status(404).json({ error: "No reference solution for this lesson" });
    res.json({ solution: l.exercise.solution });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/lessons/:lessonId", (req, res) => {
  try {
    res.json(tracks.publicItem(tracks.loadLesson(req.params.trackId, req.params.lessonId)));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/lessons", (req, res) => {
  try {
    res.json({ lessons: tracks.listLessons(req.params.trackId).map(tracks.publicItem) });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/schema", async (_req, res) => {
  try {
    res.json(await introspectSchema(getPool()));
  } catch (e) {
    res.status(503).json({ error: String(e) });
  }
});

const ExecuteBody = z.object({
  trackId: z.string(),
  taskId: z.string().optional().nullable(),
  lessonId: z.string().optional().nullable(),
  code: z.string().min(1).max(20000),
  mode: z.string().default("execute"),
  language: z.enum(["typescript", "javascript"]).optional(),
});
type Body = z.infer<typeof ExecuteBody>;

const LAB_TABLE = /^lab_[a-z0-9_]{1,58}$/;

type Exercise = {
  requirements: Requirements | null;
  animation: unknown;
  quiz: QuizQuestion[] | null;
};

function loadExercise(body: Body): Exercise {
  if (body.taskId) {
    const t = tracks.loadTask(body.trackId, body.taskId) as { requirements?: Requirements; animation?: unknown };
    return { requirements: t.requirements || null, animation: t.animation ?? null, quiz: null };
  }
  if (body.lessonId) {
    const l = tracks.loadLesson(body.trackId, body.lessonId) as {
      exercise?: { kind?: string; requirements?: Requirements; questions?: QuizQuestion[]; animation?: unknown };
    };
    const ex = l.exercise || {};
    if (ex.kind === "quiz") return { requirements: null, animation: null, quiz: ex.questions || [] };
    if (!ex.requirements) throw new HttpError(400, `Lesson ${body.lessonId} has no runnable exercise.`);
    return { requirements: ex.requirements, animation: ex.animation ?? null, quiz: null };
  }
  return { requirements: null, animation: null, quiz: null };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function runProbe(statements: string[]): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 5000");
    let rows = 0;
    for (const st of statements) {
      const r = await client.query(st);
      rows = r.rows?.length ? r.rows.length : r.rowCount ?? 0;
    }
    return rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

/**
 * Gate: translate (or interpret) → clean slate + DDL in ONE transaction → introspect → check schema,
 * probes and data. Failures are {rule, message, table?, column?, line?} with the same rule ids as api-python.
 */
app.post("/execute", async (req, res) => {
  const parsed = ExecuteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.message });
  }
  const body = parsed.data;
  if (!body.trackId.startsWith("node-")) {
    return res.status(400).json({
      success: false,
      message: "This API handles node-typescript / node-javascript. Use api-python for Python and SQL.",
    });
  }
  if (body.lessonId && !body.taskId) body.mode = `lesson:${body.lessonId}`.slice(0, 32);

  let ex: Exercise;
  try {
    ex = loadExercise(body);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 404;
    return res.status(status).json({ success: false, message: e instanceof Error ? e.message : String(e) });
  }

  const pool = getPool();
  let schemaBefore;
  try {
    schemaBefore = await introspectSchema(pool);
  } catch (e) {
    return res.status(503).json({ success: false, message: String(e) });
  }

  const finish = async (v: Validation, gate: string, extra: Record<string, unknown> = {}, schemaAfter = schemaBefore) => {
    const success = v.ok;
    const message = success
      ? body.lessonId && !body.taskId
        ? ex.quiz ? "Quiz passed!" : "Lesson exercise passed!"
        : ex.requirements ? "Task passed! Schema updated — watch the diagram highlight." : "Executed successfully."
      : v.message;
    await recordHistory(body, success, message, schemaBefore, schemaAfter, v);
    if (success && body.taskId && ex.requirements) await upsertProgress(body.trackId, body.taskId, body.code);
    return res.json({
      success,
      gate: success ? "passed" : gate,
      message,
      schema: schemaAfter,
      validation: v,
      animation: success ? ex.animation : null,
      ...(success ? { schemaBefore } : {}),
      ...extra,
    });
  };

  if (ex.quiz) {
    const v = gradeQuiz(ex.quiz, body.code);
    return finish(v, v.failures[0]?.rule === "rejected" ? "rejected" : "validation_failed");
  }

  const req_ = ex.requirements;
  if (req_?.zod) {
    const r = checkZodExercise(body.code, req_.zod, body.trackId === "node-javascript");
    const v = validation(r.failures);
    const gate = r.failures.some((f) => f.rule === "rejected") ? "rejected" : r.failures.some((f) => f.rule === "runtime-error") ? "runtime_error" : "validation_failed";
    return finish(v, gate);
  }

  const translated = prismaModelsToSql(body.code);
  if (!translated.ok) {
    const v = validation([{ rule: "rejected", message: translated.error || "Parse error", line: translated.line }]);
    return finish(v, "rejected");
  }
  if (req_?.datasource) {
    const v = validation(checkDatasource(translated.datasource));
    return finish(v, "validation_failed", { sql: [] });
  }
  if (!translated.sql.length) {
    const v = validation([
      { rule: "rejected", message: "No Prisma `model` blocks found. Declare models with @@map(\"lab_…\") table names." },
    ]);
    return finish(v, "rejected");
  }

  // Clean slate + DDL in one transaction: if any statement fails, the previous tables come back untouched.
  const drop = [...new Set([...(req_?.tables || []).map((t) => t.name), ...(req_?.resetTables || []), ...translated.tables])]
    .filter((n) => LAB_TABLE.test(n))
    .sort();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 10000");
    for (const t of drop) await client.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    for (const stmt of translated.sql) await client.query(stmt);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    const msg = `Postgres rejected the generated SQL: ${e instanceof Error ? e.message : String(e)}`;
    client.release();
    return finish(validation([{ rule: "runtime-error", message: msg }]), "runtime_error", { sql: translated.sql });
  }
  client.release();

  const schemaAfter = await introspectSchema(pool);
  if (!req_) return finish(validation([]), "passed", { sql: translated.sql }, schemaAfter);
  let v = checkRequirements(schemaAfter, req_);
  v = merge(v, [
    ...(await checkData(req_.data, async (sql) => {
      const row = (await pool.query(sql)).rows[0];
      return row ? Object.values(row)[0] : 0;
    })),
    ...(await checkProbes(req_.probes, runProbe)),
  ]);
  return finish(v, "validation_failed", { sql: translated.sql, ...(v.ok ? {} : { note: "Requirements not met. Extra tables/columns are OK; the listed rules are not." }) }, schemaAfter);
});

app.get("/history/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
  try {
    const r = await getPool().query("SELECT * FROM run_history WHERE id = $1", [id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Run not found" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(503).json({ error: String(e) });
  }
});

async function recordHistory(
  body: { trackId: string; taskId?: string | null; mode: string; code: string },
  success: boolean,
  message: string,
  before: unknown,
  after: unknown,
  validation: unknown
) {
  try {
    await getPool().query(
      `INSERT INTO run_history
        (track_id, task_id, mode, code, success, message, schema_before, schema_after, validation)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
      [
        body.trackId,
        body.taskId ?? null,
        body.mode,
        body.code,
        success,
        message,
        JSON.stringify(before),
        JSON.stringify(after),
        validation ? JSON.stringify(validation) : null,
      ]
    );
  } catch (e) {
    console.warn("[history]", e);
  }
}

async function upsertProgress(trackId: string, taskId: string, code: string) {
  try {
    await getPool().query(
      `INSERT INTO learner_progress (track_id, task_id, completed, attempts, last_code)
       VALUES ($1,$2,TRUE,1,$3)
       ON CONFLICT (track_id, task_id) DO UPDATE SET
         completed = TRUE,
         attempts = learner_progress.attempts + 1,
         last_code = EXCLUDED.last_code,
         updated_at = NOW()`,
      [trackId, taskId, code]
    );
  } catch (e) {
    console.warn("[progress]", e);
  }
}

app.get("/history", async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const trackId = req.query.trackId as string | undefined;
  try {
    const r = trackId
      ? await getPool().query(
          `SELECT id, track_id, task_id, mode, success, message, created_at, LEFT(code,500) AS code_preview
           FROM run_history WHERE track_id=$1 ORDER BY id DESC LIMIT $2`,
          [trackId, limit]
        )
      : await getPool().query(
          `SELECT id, track_id, task_id, mode, success, message, created_at, LEFT(code,500) AS code_preview
           FROM run_history ORDER BY id DESC LIMIT $1`,
          [limit]
        );
    res.json({ history: r.rows });
  } catch (e) {
    res.status(503).json({ error: String(e) });
  }
});

app.get("/progress/:trackId", async (req, res) => {
  try {
    const r = await getPool().query(
      `SELECT task_id, completed, attempts, last_code, updated_at FROM learner_progress WHERE track_id=$1`,
      [req.params.trackId]
    );
    res.json({ progress: r.rows });
  } catch (e) {
    res.status(503).json({ error: String(e) });
  }
});

app.post("/lab/reset", async (_req, res) => {
  const pool = getPool();
  const r = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'lab_%' OR tablename LIKE 'task_%')`
  );
  for (const row of r.rows) {
    await pool.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
  }
  res.json({ ok: true, message: "Lab tables dropped.", schema: await introspectSchema(pool) });
});

app.get("/db/snapshots", (_req, res) => {
  const dir = process.env.SNAPSHOTS_DIR || path.resolve(process.cwd(), "../snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const snapshots = fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith("."))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, mtime: st.mtime.toISOString() };
    });
  res.json({ snapshots });
});

app.get("/compare/orms", (_req, res) => {
  res.json({
    primary: "Prisma",
    comparison: "Drizzle",
    notes: [
      "Prisma uses a dedicated schema DSL and generates a typed client.",
      "Drizzle keeps schema in TypeScript (see track validationCatalog drizzle-compare).",
      "Both sit above node-postgres (pg). Zod validates DTOs at the API boundary.",
    ],
  });
});

export async function prepare() {
  try {
    await ensureMetaTables();
  } catch (e) {
    console.warn("[startup] DB not ready:", e);
  }
}
