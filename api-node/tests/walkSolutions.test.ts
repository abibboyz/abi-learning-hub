/**
 * Walk EVERY task and lesson exercise of node-typescript and node-javascript against a real Postgres:
 * reference passes, each wrong solution fails with its expected rule ids, the starter does not pass.
 * Skipped when Postgres is not reachable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { app, prepare } from "../src/app.ts";
import { getPool } from "../src/lib/db.ts";

const ROOT = path.resolve(import.meta.dirname, "../../tracks");
process.env.TRACKS_DIR ||= ROOT;

let dbUp = true;
try {
  await getPool().query("SELECT 1");
} catch {
  dbUp = false;
}

type Spec = { solution: string; wrongSolutions: Array<{ label: string; expect: string[]; code: string }>; starterCode?: string };

test("walk node track solutions", { skip: !dbUp && "Postgres not reachable (DATABASE_URL)", timeout: 600_000 }, async (t) => {
  await prepare();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const run = async (body: Record<string, unknown>) => {
    const r = await fetch(`${base}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 200);
    const d = (await r.json()) as { success: boolean; message: string; validation: { failures: Array<{ rule: string }> } };
    return { ...d, rules: [...new Set(d.validation.failures.map((f) => f.rule))] };
  };
  try {
    for (const track of ["node-typescript", "node-javascript"]) {
      const items: Array<[string, Record<string, string>, Spec]> = [];
      for (const f of fs.readdirSync(path.join(ROOT, track, "tasks")).sort()) {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, track, "tasks", f), "utf8"));
        items.push([`${track} task ${d.id}`, { taskId: d.id }, d]);
      }
      for (const f of fs.readdirSync(path.join(ROOT, track, "lessons")).sort()) {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, track, "lessons", f), "utf8"));
        items.push([`${track} lesson ${d.id}`, { lessonId: d.id }, d.exercise]);
      }
      assert.equal(items.length, 29);
      for (const [name, target, spec] of items) {
        await t.test(name, async () => {
          const ok = await run({ trackId: track, code: spec.solution, ...target });
          assert.ok(ok.success, `reference failed: ${ok.message}`);
          assert.ok(spec.wrongSolutions.length > 0);
          for (const w of spec.wrongSolutions) {
            const r = await run({ trackId: track, code: w.code, ...target });
            assert.ok(!r.success, `wrong passed: ${w.label}`);
            for (const e of w.expect) assert.ok(r.rules.includes(e), `${w.label}: expected ${e}, got ${r.rules} — ${r.message}`);
          }
          if (spec.starterCode) {
            const s = await run({ trackId: track, code: spec.starterCode, ...target });
            assert.ok(!s.success, "starter must not pass");
          }
        });
      }
    }
    const pub = JSON.stringify(await (await fetch(`${base}/tracks/node-typescript/lessons`)).json());
    assert.ok(!pub.includes('"solution"') && !pub.includes('"correct"'), "public lessons leak answers");
  } finally {
    server.close();
    await getPool().end();
  }
});
