/**
 * pw-runner — internal service for Playwright tracks. Reached only through the web BFF (/api/*).
 *
 *   GET  /health                         runner + app-under-test + DB status
 *   GET  /tracks/:id[/tasks|/lessons]    track package (solutions stripped)
 *   GET  /tracks/:id/tasks/:task/solution reference solution (on request, for "Show solution")
 *   POST /execute                        static gate + Playwright run + verdict + history
 *   GET  /history[?trackId] /history/:id run history (replay)
 *   GET  /progress/:trackId              task progress
 *   POST /pw/reset                       reset app-under-test data + delete run artifacts
 *   GET  /pw/artifacts/:runId/*          screenshots / trace.zip from a run
 *   GET  /pw/trace-viewer/*              Playwright's own trace viewer (offline, same origin)
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";
import { analyze, type GateSpec } from "./gate.js";
import { evaluateGate, type MutantSpec } from "./evaluate.js";
import * as history from "./history.js";
import { clearRuns, resolveArtifact, runPlaywright, SUT_URL, type RunFile, type RunOptions, type RunReport } from "./runner.js";
import { Semaphore } from "./semaphore.js";
import * as tracks from "./tracks.js";

const require = createRequire(import.meta.url);

export function playwrightVersion(): string {
  try {
    return (require("@playwright/test/package.json") as { version: string }).version;
  } catch {
    return "unknown";
  }
}

export function traceViewerDir(): string | null {
  try {
    const core = path.dirname(require.resolve("playwright-core/package.json"));
    const dir = path.join(core, "lib", "vite", "traceViewer");
    return fs.existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

const ExecuteBody = z.object({
  trackId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  taskId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional().nullable(),
  lessonId: z.string().regex(/^[a-z0-9-]{1,64}$/).optional().nullable(),
  code: z.string().min(1).max(40_000),
  mode: z.string().max(32).default("execute"),
  language: z.enum(["typescript", "javascript"]).default("typescript"),
});

type Deps = { run: (o: RunOptions) => Promise<RunReport>; sem: Semaphore };

type TaskLike = {
  id?: string; testFile?: string; gate?: GateSpec & { repeatEach?: number; preset?: "default" | "auth"; mutants?: MutantSpec[] };
  supportFiles?: RunFile[]; lab?: { testFile?: string; preset?: "default" | "auth"; supportFiles?: RunFile[] };
};

function isPlaywrightTrack(trackId: string): boolean {
  try {
    return tracks.loadManifest(trackId).kind === "playwright";
  } catch {
    return false;
  }
}

export function createApp(deps: Partial<Deps> = {}) {
  const sem = deps.sem || new Semaphore(Number(process.env.PW_MAX_CONCURRENCY || 2), Number(process.env.PW_MAX_QUEUE || 6));
  const run = deps.run || runPlaywright;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", async (_req, res) => {
    let sut = false;
    try {
      sut = (await fetch(`${SUT_URL}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
    } catch { sut = false; }
    res.json({
      ok: true, service: "pw-runner", playwright: playwrightVersion(), appUnderTest: sut,
      database: await history.dbHealthy(), concurrency: sem.stats, traceViewer: Boolean(traceViewerDir()),
    });
  });

  app.get("/tracks", (_req, res) => {
    res.json({ tracks: tracks.listTracks() });
  });
  app.get("/tracks/:trackId", (req, res) => {
    try {
      const index = tracks.listTracks().find((t) => t.id === req.params.trackId);
      if (!index) return res.status(404).json({ error: "Track not found" });
      res.json({ ...index, ...tracks.loadManifest(req.params.trackId), playwrightVersion: playwrightVersion() });
    } catch (e) { res.status(404).json({ error: String(e) }); }
  });
  app.get("/tracks/:trackId/tasks", (req, res) => {
    try { res.json({ tasks: tracks.listTasks(req.params.trackId).map(tracks.publicTask) }); } catch (e) { res.status(404).json({ error: String(e) }); }
  });
  app.get("/tracks/:trackId/tasks/:taskId", (req, res) => {
    try { res.json(tracks.publicTask(tracks.loadTask(req.params.trackId, req.params.taskId))); } catch (e) { res.status(404).json({ error: String(e) }); }
  });
  app.get("/tracks/:trackId/tasks/:taskId/solution", (req, res) => {
    try {
      const t = tracks.loadTask(req.params.trackId, req.params.taskId) as { solution?: string; solutionJs?: string };
      if (!t.solution) return res.status(404).json({ error: "No reference solution for this task" });
      res.json({ solution: t.solution, solutionJs: t.solutionJs || null });
    } catch (e) { res.status(404).json({ error: String(e) }); }
  });
  app.get("/tracks/:trackId/lessons", (req, res) => {
    try { res.json({ lessons: tracks.listLessons(req.params.trackId) }); } catch (e) { res.status(404).json({ error: String(e) }); }
  });

  app.post("/execute", async (req, res) => {
    const parsed = ExecuteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, gate: "bad_request", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    const body = parsed.data;
    if (!isPlaywrightTrack(body.trackId)) return res.status(400).json({ success: false, gate: "bad_request", message: `${body.trackId} is not a Playwright track.` });

    let item: TaskLike | null = null;
    try {
      if (body.taskId) item = tracks.loadTask(body.trackId, body.taskId) as TaskLike;
      else if (body.lessonId) item = tracks.loadLesson(body.trackId, body.lessonId) as TaskLike;
    } catch (e) {
      return res.status(404).json({ success: false, gate: "not_found", message: String(e) });
    }
    const isTask = Boolean(body.taskId);
    const gateSpec = isTask ? item?.gate || {} : { forbidCss: false, forbidWaitForTimeout: false, minTests: 1 };
    const lab = isTask ? { testFile: item?.testFile, preset: item?.gate?.preset, supportFiles: item?.supportFiles } : item?.lab || {};
    const ext = body.language === "javascript" ? ".js" : ".ts";
    const testFile = (lab.testFile || "learner.spec.ts").replace(/\.(ts|js)$/, ext);
    const supportFiles = lab.supportFiles || [];
    const allowImports = supportFiles.map((f) => "./" + f.path.replace(/\.(ts|js)$/, ""));

    const stat = analyze(body.code, testFile, { ...gateSpec, allowImports: [...(gateSpec.allowImports || []), ...allowImports] });
    const mutants: MutantSpec[] = isTask ? item?.gate?.mutants || [] : [];

    let report: RunReport | null = null;
    if (!stat.rejected) {
      const acquire = sem.tryAcquire();
      if (!acquire) return res.status(429).json({ success: false, gate: "busy", message: "The runner is busy with other runs. Try again in a few seconds." });
      const release = await acquire;
      try {
        report = await run({
          testFile, code: body.code, supportFiles, importRanges: stat.playwrightImportRanges,
          repeatEach: isTask ? item?.gate?.repeatEach ?? 3 : 1,
          preset: lab.preset || "default",
          mutants: mutants.map((m) => m.bug),
        });
      } catch (e) {
        report = null;
        release();
        return res.status(500).json({ success: false, gate: "runner_error", message: `Runner error: ${String(e)}` });
      }
      release();
    }

    const verdict = evaluateGate(stat, report, mutants, { isTask, minRunTests: isTask ? item?.gate?.minRunTests : undefined });
    const payload = {
      success: verdict.ok,
      gate: verdict.gate,
      message: verdict.message,
      reasons: verdict.reasons,
      warnings: verdict.warnings,
      validation: { ok: verdict.ok, errors: verdict.reasons.map((r) => r.message), matched: [], message: verdict.message },
      run: report ? {
        runId: report.runId, durationMs: report.durationMs, timedOut: report.timedOut,
        tests: report.tests, mutants: report.mutants, globalErrors: report.globalErrors,
        output: report.ok ? "" : (report.stdout + "\n" + report.stderr).trim().slice(-4000),
      } : null,
      testFile,
      language: body.language,
    };
    const historyId = await history.recordRun({
      trackId: body.trackId, taskId: body.taskId || null, mode: body.mode, code: body.code,
      success: verdict.ok, message: verdict.message,
      validation: { ...payload, run: payload.run ? { ...payload.run, tests: payload.run.tests.map((t) => ({ ...t, log: t.log.slice(0, 60) })) } : null },
    });
    res.json({ ...payload, historyId });
  });

  app.get("/history", async (req, res) => {
    res.json({ history: await history.listRuns(req.query.trackId as string | undefined, Number(req.query.limit || 40)) });
  });
  app.get("/history/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Bad id" });
    const row = await history.getRun(id);
    if (!row) return res.status(404).json({ error: "Run not found" });
    res.json(row);
  });
  app.get("/progress/:trackId", async (req, res) => {
    res.json({ progress: await history.getProgress(req.params.trackId) });
  });

  app.post("/pw/reset", async (req, res) => {
    let sut = false;
    try {
      sut = (await fetch(`${SUT_URL}/api/reset`, { method: "POST", signal: AbortSignal.timeout(3000) })).ok;
    } catch { sut = false; }
    clearRuns();
    const trackId = typeof req.body?.trackId === "string" ? req.body.trackId : null;
    if (trackId && req.body?.progress === true && /^[a-z0-9-]{1,64}$/.test(trackId)) await history.resetProgress(trackId);
    res.json({ ok: sut, message: sut ? "App under test reset to seed; run artifacts cleared." : "Run artifacts cleared, but the app under test did not answer." });
  });

  app.get(/^\/pw\/artifacts\/([a-f0-9]{32})\/(.+)$/, (req, res) => {
    const params = req.params as unknown as Record<string, string>;
    const file = resolveArtifact(params[0], params[1]);
    if (!file) return res.status(404).json({ error: "Artifact not found (runs are kept for the last 40 executions)." });
    res.sendFile(file, { headers: { "cache-control": "private, max-age=3600" } });
  });

  const tv = traceViewerDir();
  if (tv) app.use("/pw/trace-viewer", express.static(tv, { index: "index.html", fallthrough: true }));

  return app;
}

if (process.argv[1] && /server\.(ts|js)$/.test(process.argv[1])) {
  const PORT = Number(process.env.PORT || 8002);
  void history.ensureTables().then((ok) => console.log(`[pw-runner] database ${ok ? "ready" : "unavailable — history kept in memory"}`));
  fs.mkdirSync(process.env.PW_RUNS_DIR || path.resolve("."), { recursive: true });
  createApp().listen(PORT, "0.0.0.0", () => console.log(`pw-runner on :${PORT} (Playwright ${playwrightVersion()}, app under test ${SUT_URL})`));
}
