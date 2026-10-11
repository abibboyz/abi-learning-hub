// Same fixture as api-python/tests/test_gate_parity.py — both gates must agree rule for rule.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkRequirements } from "../src/lib/taskChecker.ts";

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../tests/fixtures/schema-gate-cases.json"), "utf8")
);

for (const c of fixture.cases) {
  test(`gate parity: ${c.name}`, () => {
    const r = checkRequirements(c.schema, c.requirements);
    assert.deepEqual(r.failures.map((f) => f.rule).sort(), [...c.expectRules].sort());
    assert.equal(r.ok, c.expectRules.length === 0);
  });
}
