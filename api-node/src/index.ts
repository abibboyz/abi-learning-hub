import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensureMetaTables, getPool } from "./lib/db.js";
import { introspectSchema } from "./lib/schemaIntrospector.js";
import { checkRequirements } from "./lib/taskChecker.js";
import * as tracks from "./lib/tracks.js";
import { prismaModelsToSql } from "./runners/prismaSchemaRunner.js";

const app = express();
const PORT = Number(process.env.PORT || 8001);
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
    res.json({ tasks: tracks.listTasks(req.params.trackId) });
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/tasks/:taskId", (req, res) => {
  try {
    res.json(tracks.loadTask(req.params.trackId, req.params.taskId));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get("/tracks/:trackId/lessons", (req, res) => {
  try {
    res.json({ lessons: tracks.listLessons(req.params.trackId) });
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
  code: z.string().min(1).max(20000),
  mode: z.string().default("execute"),
  language: z.enum(["typescript", "javascript"]).optional(),
});

app.post("/execute", async (req, res) => {
  const parsed = ExecuteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.message });
  }
  const body = parsed.data;
  if (!body.trackId.startsWith("node-")) {
    return res.status(400).json({
      success: false,
      message: "This API handles node-typescript / node-javascript. Use api-python for Python.",
    });
  }

  const pool = getPool();
  let schemaBefore;
  try {
    schemaBefore = await introspectSchema(pool);
  } catch (e) {
    return res.status(503).json({ success: false, message: String(e) });
  }

  let task: Record<string, unknown> | null = null;
  let requirements = null;
  if (body.taskId) {
    try {
      task = tracks.loadTask(body.trackId, body.taskId);
      requirements = (task as { requirements: unknown }).requirements;
    } catch (e) {
      return res.status(404).json({ success: false, message: String(e) });
    }
  }

  const translated = prismaModelsToSql(body.code);
  if (!translated.ok) {
    await recordHistory(body, false, translated.error || "Parse error", schemaBefore, schemaBefore, null);
    return res.json({
      success: false,
      gate: "rejected",
      message: translated.error,
      schema: schemaBefore,
      validation: { ok: false, errors: [translated.error], matched: [] },
    });
  }

  // Execute DDL
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of translated.sql) {
      try {
        await client.query(stmt);
      } catch (e) {
        // IF NOT EXISTS / duplicate constraint — continue soft
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists/i.test(msg)) {
          await client.query("ROLLBACK");
          await recordHistory(body, false, msg, schemaBefore, schemaBefore, null);
          return res.json({
            success: false,
            gate: "runtime_error",
            message: msg,
            sql: translated.sql,
            schema: schemaBefore,
          });
        }
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.json({ success: false, gate: "runtime_error", message: msg, schema: schemaBefore });
  } finally {
    client.release();
  }

  const schemaAfter = await introspectSchema(pool);
  let validation = null;
  if (requirements) {
    validation = checkRequirements(schemaAfter, requirements as never);
    if (!validation.ok) {
      await recordHistory(body, false, validation.message, schemaBefore, schemaAfter, validation);
      return res.json({
        success: false,
        gate: "validation_failed",
        message: validation.message,
        schema: schemaAfter,
        validation,
        sql: translated.sql,
        note: "Requirements not met. Extra columns are OK.",
      });
    }
  }

  const animation = task ? (task as { animation?: unknown }).animation : null;
  const message =
    validation && validation.ok
      ? "Task passed! Schema updated — watch the diagram highlight."
      : "Executed successfully.";
  await recordHistory(body, true, message, schemaBefore, schemaAfter, validation);
  if (body.taskId && validation?.ok) {
    await upsertProgress(body.trackId, body.taskId, body.code);
  }

  res.json({
    success: true,
    gate: "passed",
    message,
    schema: schemaAfter,
    validation,
    animation,
    sql: translated.sql,
    schemaBefore,
  });
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

async function boot() {
  try {
    await ensureMetaTables();
  } catch (e) {
    console.warn("[startup] DB not ready:", e);
  }
  app.listen(PORT, () => console.log(`api-node listening on :${PORT}`));
}

boot();
