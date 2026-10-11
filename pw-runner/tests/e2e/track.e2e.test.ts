/**
 * End-to-end gate walk: starts the app under test in-process, then sends every task's reference
 * solution, every planted wrong solution, and every runnable lesson example through POST /execute
 * with real Playwright + Chromium.
 *
 *   npm run test:e2e        (needs browsers: npx playwright install chromium)
 * Skips cleanly (with a message) when Chromium is not installed.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const TRACK = "playwright-typescript";
const ONLY = process.env.PW_E2E_ONLY ? new RegExp(process.env.PW_E2E_ONLY) : null;
const CONCURRENCY = Number(process.env.PW_E2E_CONCURRENCY || 3);

function browsersInstalled(): boolean {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  return fs.existsSync(dir) && fs.readdirSync(dir).some((d) => d.startsWith("chromium"));
}

type Task = { id: string; solution: string; solutionJs?: string; wrongSolutions?: Array<{ label: string; code: string; expect: string[] }> };
type Lesson = { id: string; runnable?: boolean; example?: { code: string } };

const readDir = <T>(dir: string): T[] =>
  fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) as T);

const tasks = readDir<Task>(path.join(ROOT, "tracks", TRACK, "tasks"));
const lessons = readDir<Lesson>(path.join(ROOT, "tracks", TRACK, "lessons")).filter((l) => l.runnable !== false && l.example?.code);

type Job = { name: string; body: Record<string, unknown>; check: (r: Record<string, any>) => void };
const jobs: Job[] = [];
const fmt = (r: Record<string, any>) => JSON.stringify({ gate: r.gate, reasons: (r.reasons || []).map((x: any) => `${x.rule}: ${x.message}`), tests: (r.run?.tests || []).map((t: any) => `${t.project}/${t.title}: ${t.status} ${t.error?.message?.split("\n")[0] || ""}`), mutants: r.run?.mutants, globalErrors: r.run?.globalErrors }, null, 1);

for (const t of tasks) {
  jobs.push({ name: `task ${t.id}: reference solution passes`, body: { trackId: TRACK, taskId: t.id, code: t.solution }, check: (r) => assert.equal(r.success, true, fmt(r)) });
  if (t.solutionJs) jobs.push({ name: `task ${t.id}: JS solution passes`, body: { trackId: TRACK, taskId: t.id, code: t.solutionJs, language: "javascript" }, check: (r) => assert.equal(r.success, true, fmt(r)) });
  for (const w of t.wrongSolutions || []) {
    jobs.push({
      name: `task ${t.id}: wrong "${w.label}" fails with ${w.expect.join(", ")}`,
      body: { trackId: TRACK, taskId: t.id, code: w.code },
      check: (r) => {
        assert.equal(r.success, false, fmt(r));
        const rules = new Set((r.reasons || []).map((x: { rule: string }) => x.rule));
        for (const e of w.expect) assert.ok(rules.has(e), `expected rule ${e}; got ${fmt(r)}`);
      },
    });
  }
}
for (const l of lessons) {
  jobs.push({ name: `lesson ${l.id}: example runs green`, body: { trackId: TRACK, lessonId: l.id, code: l.example!.code, mode: "topic-exercise" }, check: (r) => assert.equal(r.success, true, fmt(r)) });
}

const selected = jobs.filter((j) => !ONLY || ONLY.test(j.name));
const skip = !browsersInstalled() ? "Chromium for Playwright is not installed (npx playwright install chromium)" : false;

describe("Playwright track e2e (real browser)", { skip }, () => {
  let sut: http.Server;
  let runner: http.Server;
  let base = "";
  const results = new Map<string, Promise<Record<string, any>>>();

  before(async () => {
    const { createServer } = await import(path.join(ROOT, "pw-app", "src", "server.js"));
    sut = createServer();
    await new Promise<void>((r) => sut.listen(0, "127.0.0.1", () => r()));
    process.env.SUT_URL = `http://127.0.0.1:${(sut.address() as AddressInfo).port}`;
    process.env.PW_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pw-e2e-"));
    delete process.env.DATABASE_URL;
    const { createApp } = await import("../../src/server.js");
    const { Semaphore } = await import("../../src/semaphore.js");
    runner = createApp({ sem: new Semaphore(CONCURRENCY, 1000) }).listen(0, "127.0.0.1");
    await new Promise<void>((r) => runner.once("listening", () => r()));
    base = `http://127.0.0.1:${(runner.address() as AddressInfo).port}`;
    // Kick off every run now (the semaphore caps concurrency); tests below await their own result.
    for (const j of selected) {
      results.set(j.name, fetch(`${base}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(j.body) }).then((r) => r.json()));
    }
  });

  after(async () => {
    await Promise.allSettled(results.values());
    runner?.close();
    sut?.close();
  });

  for (const j of selected) {
    test(j.name, { timeout: 600_000 }, async () => {
      j.check(await results.get(j.name)!);
    });
  }
});
