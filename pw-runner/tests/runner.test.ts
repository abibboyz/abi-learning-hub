import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PW_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pw-runs-"));
const { safeRelPath, resolveArtifact, buildConfig, RUNS_DIR } = await import("../src/runner.js");
const { Semaphore } = await import("../src/semaphore.js");

describe("path sanitising", () => {
  test("safeRelPath accepts plain relative paths", () => {
    assert.equal(safeRelPath("pages/LoginPage.ts"), "pages/LoginPage.ts");
    assert.equal(safeRelPath("a/./b.ts"), "a/b.ts");
  });
  test("safeRelPath rejects traversal, absolute paths and odd characters", () => {
    for (const p of ["../x.ts", "a/../../x.ts", "/etc/passwd", "..\\x.ts", "a b.ts", "$(id).ts", ".hidden", "x".repeat(200)]) {
      assert.throws(() => safeRelPath(p), /Unsafe/, p);
    }
  });
  test("resolveArtifact stays inside the run dir and only serves allowlisted types", () => {
    const id = "d".repeat(32);
    fs.mkdirSync(path.join(RUNS_DIR, id, "test-results"), { recursive: true });
    fs.writeFileSync(path.join(RUNS_DIR, id, "test-results", "s.png"), "png");
    fs.writeFileSync(path.join(RUNS_DIR, id, "playwright.config.ts"), "x");
    assert.ok(resolveArtifact(id, "test-results/s.png"));
    assert.equal(resolveArtifact(id, "playwright.config.ts"), null);
    assert.equal(resolveArtifact(id, "../../etc/passwd"), null);
    assert.equal(resolveArtifact(id, "test-results/missing.png"), null);
    assert.equal(resolveArtifact("not-a-run-id", "s.png"), null);
  });
});

describe("buildConfig", () => {
  test("pins one worker, retries 0, trace + screenshots, repeatEach and mutant projects", () => {
    const cfg = buildConfig("e".repeat(32), { repeatEach: 3, preset: "auth", mutants: ["sort-broken"], testTimeoutMs: 15000 });
    for (const s of ["workers: 1", "retries: 0", "repeatEach: 3", "'mutant:sort-broken'", "'x-sut-bug'", "name: 'setup'", "trace:", "screenshot:"]) {
      assert.ok(cfg.includes(s), `${s} missing from config`);
    }
  });
});

describe("Semaphore", () => {
  test("caps concurrency and refuses when the queue is full", async () => {
    const s = new Semaphore(1, 1);
    const r1 = await s.tryAcquire()!;
    const p2 = s.tryAcquire();
    assert.ok(p2);
    assert.equal(s.tryAcquire(), null);
    assert.deepEqual(s.stats, { active: 1, queued: 1, max: 1, maxQueue: 1 });
    r1();
    r1(); // double release is a no-op
    const r2 = await p2!;
    assert.equal(s.stats.active, 1);
    r2();
    assert.equal(s.stats.active, 0);
  });
});
