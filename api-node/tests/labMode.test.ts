/** Run (scratch) mode, data snapshots and public payloads on api-node. DB parts skip without Postgres. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { app, prepare } from "../src/app.ts";
import { getPool } from "../src/lib/db.ts";
import { snapshotTables } from "../src/lib/snapshot.ts";
import { publicItem } from "../src/lib/tracks.ts";

const ROOT = path.resolve(import.meta.dirname, "../../tracks");
process.env.TRACKS_DIR ||= ROOT;
const TRACK = "node-typescript";

let dbUp = true;
try {
  await getPool().query("SELECT 1");
} catch {
  dbUp = false;
}
const skip = !dbUp && "Postgres not reachable (DATABASE_URL)";

test("publicItem never exposes solutions or authored hint ladders", () => {
  const out = publicItem({ id: "x", solution: "s", wrongSolutions: [], hintLadder: [{ level: 1 }], title: "t" });
  assert.deepEqual(Object.keys(out).sort(), ["id", "title"]);
});

test("snapshotTables: rows ordered by PK, totals, ignores non-lab names", { skip }, async () => {
  const pool = getPool();
  await pool.query("DROP TABLE IF EXISTS lab_zz_snap; CREATE TABLE lab_zz_snap (id int PRIMARY KEY, name text); INSERT INTO lab_zz_snap VALUES (2,'b'),(1,'a')");
  try {
    const s = await snapshotTables(pool, ["lab_zz_snap", "pg_class", "lab_zz_missing"]);
    assert.deepEqual(Object.keys(s), ["lab_zz_snap"]);
    assert.deepEqual(s.lab_zz_snap, { columns: ["id", "name"], rows: [[1, "a"], [2, "b"]], total: 2, primaryKey: ["id"] });
  } finally {
    await pool.query("DROP TABLE IF EXISTS lab_zz_snap");
  }
});

test("Run executes without grading or keeping tables; Check grades and returns snapshots", { skip, timeout: 120_000 }, async () => {
  await prepare();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (body: Record<string, unknown>) =>
    (await (await fetch(`${base}/execute`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) as Record<string, any>;
  try {
    const file = fs.readdirSync(path.join(ROOT, TRACK, "tasks")).sort()[0];
    const task = JSON.parse(fs.readFileSync(path.join(ROOT, TRACK, "tasks", file), "utf8"));
    const tables: string[] = (task.requirements?.tables || []).map((t: { name: string }) => t.name);
    const pool = getPool();
    for (const t of tables) await pool.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);

    const ran = await post({ trackId: TRACK, taskId: task.id, code: task.solution, scratch: true });
    assert.equal(ran.gate, "ran", ran.message);
    assert.equal(ran.checked, false);
    assert.ok(Array.isArray(ran.sql) && ran.sql.length > 0, "Run shows the SQL the schema translates to");
    for (const t of tables) {
      const e = await pool.query("SELECT to_regclass($1) IS NOT NULL AS e", [`public."${t}"`]);
      assert.equal(e.rows[0].e, false, `Run must not keep ${t}`);
    }

    const checked = await post({ trackId: TRACK, taskId: task.id, code: task.solution });
    assert.equal(checked.success, true, checked.message);
    assert.ok(checked.dataAfter && tables.every((t) => t in checked.dataAfter), "Check returns the tables after the run");
    assert.equal(typeof checked.hintsUsed, "number");

    const bad = await post({ trackId: TRACK, taskId: task.id, code: "model Broken {", scratch: true });
    assert.equal(bad.success, false);
    assert.equal(bad.checked, false);
  } finally {
    server.close();
  }
});
