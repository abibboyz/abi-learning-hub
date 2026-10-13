import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { matchShortcut, shortcutLabel, isMacPlatform } from "../src/lib/lab/shortcuts";
import { marksFrom, lineFromTraceback, nextErrorLine } from "../src/lib/lab/diagnostics";
import { friendlyError, FRIENDLY_RULE_COUNT } from "../src/lib/lab/friendlyErrors";
import { buildChecklist, tickChecklist } from "../src/lib/lab/checklist";
import { diffGrids, gridsEqual, diffLines, diffSchema, diffSnapshot } from "../src/lib/lab/resultDiff";
import { parseProgress, markPassed, continueId, itemStates, markAssisted } from "../src/lib/lab/progress";
import { parsePlan, executionOrder, explainNode } from "../src/lib/lab/explainPlan";

test("shortcuts: Run, Check, Hint, F8, ? (help only outside the editor)", () => {
  assert.equal(matchShortcut({ key: "Enter", ctrlKey: true }, true), "run");
  assert.equal(matchShortcut({ key: "Enter", metaKey: true }, true), "run");
  assert.equal(matchShortcut({ key: "Enter", metaKey: true, shiftKey: true }, true), "check");
  assert.equal(matchShortcut({ key: "h", ctrlKey: true }, true), "hint");
  assert.equal(matchShortcut({ key: "F8" }, true), "nextError");
  assert.equal(matchShortcut({ key: "?" }, false), "help");
  assert.equal(matchShortcut({ key: "?" }, true), null, "single-key shortcuts are off while typing");
  assert.equal(matchShortcut({ key: "Enter" }, true), null);
  assert.equal(matchShortcut({ key: "Enter", ctrlKey: true, altKey: true }, true), null);
  assert.ok(isMacPlatform("MacIntel") && !isMacPlatform("Win32"));
  assert.equal(shortcutLabel("check", true), "⌘ ⇧ Enter");
  assert.equal(shortcutLabel("check", false), "Ctrl+Shift+Enter");
});

test("diagnostics: failures and tracebacks become line marks", () => {
  const marks = marksFrom(
    [
      { rule: "missing-table", message: "Missing table" },
      { rule: "runtime-error", message: "SyntaxError: x (line 7) — nothing was committed." },
      { rule: "rejected", message: "Import not allowed", line: 2 },
    ],
    null,
    10
  );
  assert.deepEqual(marks.map((m) => m.line), [2, 7]);
  assert.equal(lineFromTraceback('File "<frozen>", line 1\n  File "<lab>", line 4, in <module>\n  File "<lab>", line 9'), 9);
  assert.deepEqual(marksFrom([{ rule: "runtime-error", message: "boom" }], 'File "<lab>", line 3', 10).map((m) => m.line), [3]);
  assert.equal(marksFrom([{ rule: "runtime-error", message: "x", line: 40 }], null, 10).length, 0, "lines past the end are dropped");
  assert.equal(nextErrorLine(marks, 2), 7);
  assert.equal(nextErrorLine(marks, 7), 2, "wraps around");
});

test("friendly errors cover the common Postgres / Python / Prisma messages", () => {
  assert.ok(FRIENDLY_RULE_COUNT >= 15);
  assert.match(friendlyError('UndefinedTable: relation "lab_ordrs" does not exist')!, /lab_ordrs/);
  assert.match(friendlyError('syntax error at or near "FROM"')!, /FROM/);
  assert.match(friendlyError("NameError: name 'Strng' is not defined")!, /Strng/);
  assert.equal(friendlyError("something unusual"), null);
});

test("checklist: built from requirements, ticked by failures", () => {
  const items = buildChecklist({
    tables: [
      { name: "lab_a", columns: [{ name: "id", pk: true }] },
      { name: "lab_b", columns: [{ name: "a_id", fk: { table: "lab_a", column: "id" }, nullable: false }] },
    ],
    data: [{ message: "Insert 2 rows" }],
    stdout: { contains: "1", message: "Print 1" },
  });
  assert.deepEqual(items.map((i) => i.id), ["table:lab_a", "column:lab_a.id", "table:lab_b", "column:lab_b.a_id", "data:0", "stdout"]);
  assert.ok(items[3].label.includes("references lab_a.id") && items[3].label.includes("NOT NULL"));
  assert.ok(tickChecklist(items, null, false).every((i) => i.status === "pending"));
  const ticked = tickChecklist(items, [{ rule: "not-foreign-key", message: "no FK", table: "lab_b", column: "a_id" }, { rule: "missing-data", message: "need rows" }], true);
  assert.deepEqual(ticked.map((i) => i.status), ["pass", "pass", "pass", "fail", "fail", "pass"]);
  const crashed = tickChecklist(items, [{ rule: "runtime-error", message: "boom" }], true);
  assert.ok(crashed.every((i) => i.status === "pending"), "a crash proves nothing either way");
});

test("expected vs yours: rows matched as multisets, mismatches marked ≠", () => {
  const exp = { columns: ["title", "publisher"], rows: [["A", "X"], ["B", "X"], ["C", "Y"]] };
  const mine = { columns: ["title", "publisher"], rows: [["B", "X"], ["A", "X"], ["Z", "Y"]] };
  const d = diffGrids(exp, mine);
  assert.deepEqual(d.expected.map((r) => r.mark), ["=", "=", "≠"]);
  assert.deepEqual(d.yours.map((r) => r.mark), ["=", "=", "≠"]);
  assert.deepEqual(d.summary, { match: 2, missing: 1, extra: 1, orderMatters: false, inOrder: false });
  assert.equal(gridsEqual(d), false);
  assert.equal(gridsEqual(diffGrids(exp, { columns: exp.columns, rows: [...exp.rows].reverse() })), true);
  assert.equal(gridsEqual(diffGrids(exp, { columns: exp.columns, rows: [...exp.rows].reverse() }, true)), false, "order matters when asked");
  const t1 = { columns: ["id", "at"], rows: [[1, "2026-10-13T10:00:00"]] };
  const t2 = { columns: ["id", "at"], rows: [[1, "2026-10-13T11:59:00"]] };
  assert.equal(gridsEqual(diffGrids(t1, t2)), true, "generated timestamps are ignored");
});

test("output diff, schema diff and before/after snapshots", () => {
  assert.deepEqual(diffLines("a\nb\nc", "a\nc\nd").map((o) => o.op + o.text), ["=a", "-b", "=c", "+d"]);
  const col = (name: string, extra = {}) => ({ name, type: "integer", nullable: false, isPrimaryKey: false, isForeignKey: false, ...extra });
  const rows = diffSchema(
    { tables: [{ name: "lab_a", columns: [col("id", { isPrimaryKey: true }), col("b_id", { isForeignKey: true })] }] },
    { tables: [{ name: "lab_a", columns: [col("id", { isPrimaryKey: true }), col("b_id")] }] }
  );
  assert.deepEqual(rows.map((r) => r.ok), [true, true, false]);
  const changes = diffSnapshot(
    { columns: ["id", "name"], rows: [[1, "a"], [2, "b"], [3, "c"]], primaryKey: ["id"] },
    { columns: ["id", "name"], rows: [[1, "a"], [2, "B"], [4, "d"]], primaryKey: ["id"] }
  );
  assert.deepEqual(changes.map((c) => c.mark), ["=", "~", "+", "-"]);
  assert.deepEqual(changes[1].changed, [1]);
});

test("progress: localStorage shape, Continue and ✓ ● ○ states", () => {
  assert.deepEqual(parseProgress("not json"), { passed: [], assisted: [] });
  let p = parseProgress(null);
  p = markPassed(p, "a");
  p = markAssisted(markPassed(p, "a"), "a");
  assert.deepEqual(p.passed, ["a"]);
  assert.deepEqual(p.assisted, ["a"]);
  assert.equal(continueId(["a", "b", "c"], p), "b");
  assert.deepEqual(itemStates(["a", "b", "c"], p), { a: "done", b: "current", c: "todo" });
  assert.equal(continueId(["a"], p), "a", "all done → last item");
});

test("EXPLAIN ANALYZE JSON from Postgres → tree, execution order, explanations", () => {
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/explain-join-analyze.json"), "utf8"));
  const { root, executionMs } = parsePlan(json);
  assert.equal(root.type, "Sort");
  assert.ok(typeof executionMs === "number");
  const order = executionOrder(root);
  assert.equal(order[order.length - 1].id, root.id, "the root runs last");
  assert.ok(order[0].children.length === 0, "a leaf (scan) starts the flow");
  assert.ok(order.some((n) => n.relation?.startsWith("lab_l10_")));
  assert.ok(order.every((n) => n.actualRows !== undefined), "ANALYZE gives actual rows");
  assert.match(explainNode(root), /Sorts rows/);
  assert.throws(() => parsePlan({}), /EXPLAIN/);
});
