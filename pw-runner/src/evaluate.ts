/** Combines the static findings and the Playwright run into one gate verdict with specific reasons. */
import type { Finding, StaticReport } from "./gate.js";
import type { RunReport } from "./runner.js";

export type MutantSpec = { bug: string; reason: string };

export type GateVerdict = {
  ok: boolean;
  gate: "passed" | "rejected" | "static_failed" | "tests_failed" | "flaky" | "weak_test" | "runtime_error";
  message: string;
  reasons: Finding[];
  warnings: Finding[];
};

function firstLine(s: string): string {
  return s.split("\n").find((l) => l.trim())?.trim().slice(0, 300) || s.slice(0, 300);
}

export function evaluateGate(stat: StaticReport, run: RunReport | null, mutants: MutantSpec[] = [], opts: { isTask: boolean; minRunTests?: number } = { isTask: true }): GateVerdict {
  const reasons: Finding[] = [];
  const warnings: Finding[] = stat.findings.filter((f) => f.severity === "warning");

  if (stat.rejected) {
    const rej = stat.findings.filter((f) => f.severity === "reject");
    return {
      ok: false, gate: "rejected", reasons: rej, warnings,
      message: rej[0].rule === "syntax-error" ? "The file does not parse — fix the syntax error first." : "Not run: the file uses something the lab runner does not allow.",
    };
  }
  reasons.push(...stat.findings.filter((f) => f.severity === "error"));

  if (run) {
    for (const e of run.globalErrors) {
      reasons.push({ rule: run.timedOut ? "timeout" : "runtime-error", severity: "error", message: `The run failed before tests could finish: ${firstLine(e.message)}`, line: e.line, column: e.column });
    }
    const primary = run.tests.filter((t) => !t.project.startsWith("mutant:"));
    if (primary.length === 0 && run.globalErrors.length === 0) {
      reasons.push({ rule: "no-tests-ran", severity: "error", message: "No tests ran. Check that the file declares test(...) calls and that none are skipped." });
    }
    for (const t of primary) {
      const label = t.project === "setup" ? `Setup '${t.title}'` : `Test '${t.title}'`;
      if (t.status === "failed" || t.status === "timedOut") {
        reasons.push({
          rule: t.status === "timedOut" ? "test-timeout" : "test-failed", severity: "error",
          message: `${label} ${t.status === "timedOut" ? "timed out" : "failed"}${t.error?.line ? ` at line ${t.error.line}` : ""}: ${firstLine(t.error?.message || "unknown error")}`,
          line: t.error?.file && !t.error.file.includes("/") ? t.error.line : undefined, column: t.error?.column,
        });
      } else if (t.status === "flaky") {
        const passed = t.runs.filter((r) => r.status === "passed").length;
        const failedAt = t.runs.findIndex((r) => r.status !== "passed") + 1;
        reasons.push({
          rule: "flaky", severity: "error",
          message: `${label} is flaky: it passed ${passed} of ${t.runs.length} identical runs (run ${failedAt} failed${t.error?.line ? ` at line ${t.error.line}` : ""}: ${firstLine(t.error?.message || "")}). A test that only sometimes passes cannot be trusted — wait for a condition, not for time.`,
          line: t.error?.line, column: t.error?.column,
        });
      } else if (t.status === "skipped" && opts.isTask) {
        reasons.push({ rule: "test-skipped", severity: "error", message: `${label} was skipped. Remove test.skip/fixme so the gate can check it.` });
      }
    }
    const distinct = primary.filter((t) => t.project !== "setup").length;
    if (opts.minRunTests && primary.length > 0 && distinct < opts.minRunTests) {
      reasons.push({ rule: "min-run-tests", severity: "error", message: `Only ${distinct} test(s) ran; this task expects at least ${opts.minRunTests} (one per data row/scenario).` });
    }
    const allGreen = primary.length > 0 && primary.every((t) => t.status === "passed");
    if (allGreen) {
      for (const m of run.mutants) {
        if (m.status !== "missed") continue;
        const spec = mutants.find((x) => x.bug === m.bug);
        reasons.push({
          rule: "weak-test", severity: "error",
          message: `Your test still passes when the app is broken (${spec?.reason || m.bug}). The assertion is too weak or checks the wrong thing.`,
        });
      }
    }
  }

  if (reasons.length === 0) {
    return { ok: true, gate: "passed", message: opts.isTask ? "Task passed! Every check is green." : "All tests passed.", reasons, warnings };
  }
  const rules = new Set(reasons.map((r) => r.rule));
  const gate: GateVerdict["gate"] =
    rules.has("runtime-error") || rules.has("timeout") ? "runtime_error"
      : rules.has("test-failed") || rules.has("test-timeout") || rules.has("no-tests-ran") ? "tests_failed"
        : rules.has("flaky") ? "flaky"
          : rules.has("weak-test") ? "weak_test"
            : "static_failed";
  const message = {
    runtime_error: "The run hit an error before the tests could finish.",
    tests_failed: "Some tests failed — see the first error and its line.",
    flaky: "Tests pass sometimes and fail sometimes — the gate runs every test 3 times.",
    weak_test: "Tests are green, but they would not catch the bug the gate planted.",
    static_failed: "Tests ran, but the code does not meet the task rules yet.",
    rejected: "", passed: "",
  }[gate];
  return { ok: false, gate, message: `${message} (${reasons.length} issue${reasons.length > 1 ? "s" : ""})`, reasons, warnings };
}
