import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.PW_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pw-api-"));
process.env.SUT_URL = "http://127.0.0.1:9"; // nothing listens: health must degrade, not crash
delete process.env.DATABASE_URL;
const { createApp } = await import("../src/server.js");
const { Semaphore } = await import("../src/semaphore.js");
const tracks = await import("../src/tracks.js");
import type { RunOptions, RunReport } from "../src/runner.js";

const TRACK = "playwright-typescript";
const fakeReport = (o: RunOptions, status = "passed"): RunReport => ({
  runId: "f".repeat(32), ok: status === "passed", exitCode: 0, timedOut: false, durationMs: 5, globalErrors: [], stdout: "", stderr: "",
  mutants: (o.mutants || []).map((bug) => ({ bug, status: "caught" as const, tests: 1 })),
  tests: [{ id: "x", title: "t", titlePath: ["t"], file: o.testFile, project: "chromium", status: status as "passed", runs: [{ status, duration: 5, repeat: 0 }], durationMs: 5, screenshots: [], log: [] }],
});

describe("manifest + track loading", () => {
  test("playwright track is listed with kind playwright and matching lesson/task files", () => {
    const t = tracks.listTracks().find((x) => x.id === TRACK);
    assert.ok(t, "track is in tracks/index.json");
    const m = tracks.loadManifest(TRACK) as { kind: string; lessonIds: string[]; taskIds: string[]; playwrightVersion: string };
    assert.equal(m.kind, "playwright");
    assert.equal(m.playwrightVersion, "1.64.0");
    assert.equal(tracks.listLessons(TRACK).length, m.lessonIds.length);
    assert.equal(tracks.listTasks(TRACK).length, m.taskIds.length);
    assert.ok(m.taskIds.length >= 19);
  });
  test("every task has a solution, at least one wrong solution, a gate and references", () => {
    for (const task of tracks.listTasks(TRACK) as Array<Record<string, any>>) {
      assert.ok(task.solution, task.id);
      assert.ok(task.wrongSolutions?.length >= 1, `${task.id} needs a wrong solution`);
      assert.ok(task.gate, task.id);
      assert.ok(task.references?.some((r: { url: string }) => r.url.startsWith("https://playwright.dev/")), task.id);
    }
  });
  test("publicTask strips solutions", () => {
    const pub = tracks.publicTask(tracks.loadTask(TRACK, "pw-10-page-object")) as Record<string, unknown>;
    assert.equal(pub.solution, undefined);
    assert.equal(pub.solutionJs, undefined);
    assert.equal(pub.wrongSolutions, undefined);
    assert.ok(pub.starterCode);
  });
  test("ids are validated (no traversal through track/task ids)", () => {
    assert.throws(() => tracks.loadTask(TRACK, "../../etc/passwd"));
    assert.throws(() => tracks.loadManifest("../x"));
  });
});

describe("runner HTTP API", () => {
  let server: Server;
  let base = "";
  const calls: RunOptions[] = [];
  let hold: (() => void) | null = null;
  before(async () => {
    const app = createApp({
      sem: new Semaphore(1, 0),
      run: async (o) => {
        calls.push(o);
        if (o.code.includes("HOLD")) await new Promise<void>((r) => { hold = r; });
        return fakeReport(o, o.code.includes("FAILME") ? "failed" : "passed");
      },
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (body: unknown) => fetch(`${base}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const sol = (id: string) => (tracks.loadTask(TRACK, id) as { solution: string }).solution;

  test("health reports version and degrades when the app under test is down", async () => {
    const h = await (await fetch(`${base}/health`)).json();
    assert.equal(h.ok, true);
    assert.equal(h.playwright, "1.64.0");
    assert.equal(h.appUnderTest, false);
    assert.equal(h.database, false);
  });
  test("track endpoints never leak solutions except the explicit solution endpoint", async () => {
    const tasks = await (await fetch(`${base}/tracks/${TRACK}/tasks`)).json();
    assert.ok(tasks.tasks.every((t: Record<string, unknown>) => t.solution === undefined));
    const s = await (await fetch(`${base}/tracks/${TRACK}/tasks/pw-01-first-test/solution`)).json();
    assert.ok(s.solution.includes("@playwright/test"));
    assert.equal((await fetch(`${base}/tracks/nope`)).status, 404);
  });
  test("bad bodies get 400, unknown tasks 404, non-playwright tracks 400", async () => {
    assert.equal((await post({ trackId: TRACK })).status, 400);
    assert.equal((await post({ trackId: "../x", code: "x" })).status, 400);
    assert.equal((await post({ trackId: TRACK, code: "x".repeat(40_001) })).status, 400);
    assert.equal((await post({ trackId: "python-sqlalchemy", code: "x" })).status, 400);
    assert.equal((await post({ trackId: TRACK, taskId: "pw-99-nope", code: "x" })).status, 404);
  });
  test("forbidden code is rejected without starting a run", async () => {
    const before = calls.length;
    const r = await (await post({ trackId: TRACK, taskId: "pw-01-first-test", code: "import { execSync } from 'child_process';\nexecSync('id');" })).json();
    assert.equal(r.gate, "rejected");
    assert.equal(r.run, null);
    assert.equal(calls.length, before);
  });
  test("task run: repeat-each 3, mutants passed, history recorded and replayable", async () => {
    const r = await (await post({ trackId: TRACK, taskId: "pw-02-locators", code: sol("pw-02-locators") })).json();
    assert.equal(r.success, true, JSON.stringify(r.reasons));
    const o = calls.at(-1)!;
    assert.equal(o.repeatEach, 3);
    assert.deepEqual(o.mutants, ["login-redirect", "welcome-name"]);
    assert.ok(r.historyId);
    const h = await (await fetch(`${base}/history/${r.historyId}`)).json();
    assert.equal(h.code, sol("pw-02-locators"));
    const list = await (await fetch(`${base}/history?trackId=${TRACK}`)).json();
    assert.ok(list.history.some((x: { id: number }) => x.id === r.historyId));
    assert.equal((await fetch(`${base}/history/0`)).status, 400);
    assert.equal((await fetch(`${base}/history/999999`)).status, 404);
  });
  test("auth preset task wires support files and the setup file name", async () => {
    await post({ trackId: TRACK, taskId: "pw-14-storage-state", code: sol("pw-14-storage-state") });
    const o = calls.at(-1)!;
    assert.equal(o.preset, "auth");
    assert.ok(o.supportFiles?.some((f) => f.path.endsWith("auth.setup.ts")));
  });
  test("javascript variant renames the file", async () => {
    const t = tracks.loadTask(TRACK, "pw-10-page-object") as { solutionJs: string };
    const r = await (await post({ trackId: TRACK, taskId: "pw-10-page-object", code: t.solutionJs, language: "javascript" })).json();
    assert.ok(r.testFile.endsWith(".js"));
  });
  test("lesson run: repeat 1, lenient gate", async () => {
    const r = await (await post({ trackId: TRACK, lessonId: "pw-l03-first-test", code: "import { test, expect } from '@playwright/test';\ntest('t', async ({ page }) => { await page.goto('/'); await expect(page).toHaveTitle(/Shop/); });" })).json();
    assert.equal(calls.at(-1)!.repeatEach, 1);
    assert.equal(r.success, true);
  });
  test("failed run reports tests_failed", async () => {
    const r = await (await post({ trackId: TRACK, taskId: "pw-01-first-test", code: sol("pw-01-first-test") + "\n// FAILME" })).json();
    assert.equal(r.gate, "tests_failed");
  });
  test("busy runner answers 429 instead of queueing unbounded work", async () => {
    const first = post({ trackId: TRACK, taskId: "pw-01-first-test", code: sol("pw-01-first-test") + "\n// HOLD" });
    while (!hold) await new Promise((r) => setTimeout(r, 10));
    const second = await post({ trackId: TRACK, taskId: "pw-01-first-test", code: sol("pw-01-first-test") });
    assert.equal(second.status, 429);
    hold!();
    assert.equal((await first).status, 200);
    hold = null;
  });
  test("artifact route refuses traversal and unknown runs", async () => {
    assert.equal((await fetch(`${base}/pw/artifacts/${"0".repeat(32)}/x.png`)).status, 404);
    assert.equal((await fetch(`${base}/pw/artifacts/${"0".repeat(32)}/..%2F..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/pw/artifacts/zzz/x.png`)).status, 404);
  });
  test("trace viewer is served from Playwright's own bundle", async () => {
    const r = await fetch(`${base}/pw/trace-viewer/index.html`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<html/i);
  });
});
