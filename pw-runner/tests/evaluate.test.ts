import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateGate } from "../src/evaluate.js";
import { parseReport, type RunReport, type TestResult } from "../src/runner.js";
import type { StaticReport } from "../src/gate.js";

const clean: StaticReport = { findings: [], testCount: 1, rejected: false, playwrightImportRanges: [] };
const t = (over: Partial<TestResult> = {}): TestResult => ({
  id: "1", title: "t", titlePath: ["t"], file: "learner.spec.ts", project: "chromium", status: "passed",
  runs: [{ status: "passed", duration: 10, repeat: 0 }], durationMs: 10, screenshots: [], log: [], ...over,
});
const report = (over: Partial<RunReport> = {}): RunReport => ({
  runId: "a".repeat(32), ok: true, exitCode: 0, timedOut: false, durationMs: 100, tests: [t()], mutants: [], globalErrors: [], stdout: "", stderr: "", ...over,
});

describe("evaluateGate", () => {
  test("all green passes", () => {
    const v = evaluateGate(clean, report());
    assert.equal(v.ok, true);
    assert.equal(v.gate, "passed");
  });
  test("rejected static report never runs and says why", () => {
    const v = evaluateGate({ ...clean, rejected: true, findings: [{ rule: "forbidden-api", severity: "reject", message: "no" }] }, null);
    assert.equal(v.gate, "rejected");
    assert.equal(v.reasons[0].rule, "forbidden-api");
  });
  test("static errors with green run -> static_failed; warnings kept separately", () => {
    const v = evaluateGate({ ...clean, findings: [{ rule: "prefer-user-facing-locators", severity: "error", message: "css" }, { rule: "no-wait-for-timeout", severity: "warning", message: "w" }] }, report());
    assert.equal(v.gate, "static_failed");
    assert.equal(v.warnings.length, 1);
  });
  test("failed test reports the line", () => {
    const v = evaluateGate(clean, report({ tests: [t({ status: "failed", error: { message: "Error: expect(locator).toBeVisible() failed", line: 7, file: "learner.spec.ts" } })] }));
    assert.equal(v.gate, "tests_failed");
    assert.match(v.reasons[0].message, /line 7/);
    assert.equal(v.reasons[0].line, 7);
  });
  test("flaky over 3 runs", () => {
    const runs = [{ status: "passed", duration: 1, repeat: 0 }, { status: "failed", duration: 1, repeat: 1 }, { status: "passed", duration: 1, repeat: 2 }];
    const v = evaluateGate(clean, report({ tests: [t({ status: "flaky", runs, error: { message: "Timeout", line: 9 } })] }));
    assert.equal(v.gate, "flaky");
    assert.match(v.reasons[0].message, /passed 2 of 3/);
  });
  test("missed mutant -> weak_test with the task's reason; ignored when primary fails", () => {
    const m = [{ bug: "welcome-name", reason: "the welcome heading shows the wrong name" }];
    const v = evaluateGate(clean, report({ mutants: [{ bug: "welcome-name", status: "missed", tests: 1 }] }), m);
    assert.equal(v.gate, "weak_test");
    assert.match(v.reasons[0].message, /wrong name/);
    const v2 = evaluateGate(clean, report({ tests: [t({ status: "failed", error: { message: "x" } })], mutants: [{ bug: "welcome-name", status: "missed", tests: 1 }] }), m);
    assert.ok(!v2.reasons.some((r) => r.rule === "weak-test"));
  });
  test("no tests / global error / timeout / skipped / min-run-tests", () => {
    assert.equal(evaluateGate(clean, report({ tests: [] })).reasons[0].rule, "no-tests-ran");
    assert.equal(evaluateGate(clean, report({ tests: [], globalErrors: [{ message: "SyntaxError" }] })).gate, "runtime_error");
    assert.equal(evaluateGate(clean, report({ tests: [], timedOut: true, globalErrors: [{ message: "timeout" }] })).reasons[0].rule, "timeout");
    assert.equal(evaluateGate(clean, report({ tests: [t({ status: "skipped" })] })).reasons[0].rule, "test-skipped");
    assert.equal(evaluateGate(clean, report(), [], { isTask: false }).ok, true);
    assert.equal(evaluateGate(clean, report(), [], { isTask: true, minRunTests: 3 }).reasons[0].rule, "min-run-tests");
  });
});

describe("parseReport", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-parse-"));
  const spec = (status: string, i: number, project = "chromium") => ({
    title: "logs in", file: "learner.spec.ts", line: 3,
    tests: [{ projectName: project, status: "expected", repeatEachIndex: i, results: [{
      status, duration: 5, repeatEachIndex: i,
      errors: status === "failed" ? [{ message: "\u001b[31mboom\u001b[39m", location: { file: path.join(dir, "tests", "learner.spec.ts"), line: 12, column: 5 } }] : [],
      attachments: [
        { name: "screenshot", contentType: "image/png", path: path.join(dir, "test-results", "a.png") },
        { name: "trace", contentType: "application/zip", path: path.join(dir, "test-results", "trace.zip") },
        { name: "hub-log", contentType: "application/json", body: Buffer.from(JSON.stringify([{ kind: "console", text: "hi", at: 1 }])).toString("base64") },
      ],
    }] }],
  });
  test("groups repeat-each copies into one flaky row with line, artifacts and log", () => {
    const r = parseReport(dir, "b".repeat(32), { suites: [{ title: "learner.spec.ts", file: "learner.spec.ts", specs: [spec("passed", 0), spec("failed", 1), spec("passed", 2)] }] });
    assert.equal(r.tests.length, 1);
    const row = r.tests[0];
    assert.equal(row.status, "flaky");
    assert.equal(row.runs.length, 3);
    assert.equal(row.error?.line, 12);
    assert.equal(row.error?.file, "learner.spec.ts");
    assert.equal(row.error?.message, "boom");
    assert.equal(row.screenshots[0], `/pw/artifacts/${"b".repeat(32)}/test-results/a.png`);
    assert.ok(row.trace?.endsWith("trace.zip"));
    assert.equal(row.log[0].text, "hi");
  });
  test("mutant projects become caught / missed", () => {
    const r = parseReport(dir, "c".repeat(32), { suites: [{ title: "learner.spec.ts", file: "learner.spec.ts", specs: [spec("passed", 0), spec("failed", 0, "mutant:a"), spec("passed", 0, "mutant:b")] }] });
    assert.equal(r.tests.length, 1);
    assert.deepEqual(r.mutants.map((m) => `${m.bug}:${m.status}`).sort(), ["a:caught", "b:missed"]);
  });
});
