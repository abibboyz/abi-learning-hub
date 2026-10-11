import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, resetState } from "../src/server.js";

let server;
let base = "";
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// Todo state is per visitor (keyed by the `ns` cookie), so the test acts as one visitor.
const NS = "ns=00000000000000aa"; // 16 hex chars, like a real visitor id
const json = async (p, init = {}) => { const r = await fetch(base + p, { ...init, headers: { cookie: NS, ...(init.headers || {}) } }); return { status: r.status, body: r.status === 204 ? null : await r.json(), r }; };

test("health and every practice page render", async () => {
  assert.equal((await json("/api/health")).status, 200);
  for (const p of ["/", "/login", "/register", "/products", "/todos", "/async", "/dialogs", "/frames", "/frame/payment", "/newtab", "/help", "/upload"]) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type") || "", /text\/html/, p);
  }
  assert.equal((await fetch(base + "/nope")).status, 404);
});

test("dashboard requires a session; form login sets an HttpOnly cookie", async () => {
  const anon = await fetch(base + "/dashboard", { redirect: "manual" });
  assert.ok([302, 303].includes(anon.status));
  const bad = await fetch(base + "/login", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=qa%40example.com&password=wrong" });
  assert.match(bad.headers.get("location") || "", /error=/);
  const ok = await fetch(base + "/login", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=qa%40example.com&password=Passw0rd!" });
  assert.equal(ok.status, 303);
  const session = ok.headers.getSetCookie().find((c) => c.startsWith("session=")) || "";
  assert.match(session, /HttpOnly/i);
  const dash = await fetch(base + "/dashboard", { headers: { cookie: session.split(";")[0] } });
  assert.equal(dash.status, 200);
  assert.match(await dash.text(), /QA Tester/);
});

test("JSON API: products filter, todos CRUD + validation, login + me", async () => {
  const all = await json("/api/products");
  assert.equal(all.body.total, 12);
  const fruit = await json("/api/products?category=Fruit&q=an");
  assert.ok(fruit.body.items.every((p) => p.category === "Fruit" && /an/i.test(p.name)));
  const todos0 = await json("/api/todos");
  const list = (b) => (Array.isArray(b) ? b : b.todos);
  assert.equal(list(todos0.body).length, 3);
  const bad = await json("/api/todos", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(bad.status, 400);
  assert.match(JSON.stringify(bad.body), /Title is required/);
  const made = await json("/api/todos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Write tests" }) });
  assert.equal(made.status, 201);
  assert.equal((await json(`/api/todos/${made.body.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await json(`/api/todos/${made.body.id}`, { method: "DELETE" })).status, 404);
  const login = await json("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "qa@example.com", password: "Passw0rd!" }) });
  assert.equal(login.status, 200);
  const me = await json("/api/me", { headers: { authorization: `Bearer ${login.body.token}` } });
  assert.equal(me.status, 200);
  assert.equal((await json("/api/me")).status, 401);
});

test("orders delay cycle is deterministic per run header", async () => {
  const t = async () => { const s = Date.now(); await fetch(base + "/api/orders", { headers: { "x-hub-run": "r-test" } }); return Date.now() - s; };
  const [a, b, c] = [await t(), await t(), await t()];
  assert.ok(a >= 200 && a < 1000, `first ${a}`);
  assert.ok(b >= 1500, `second ${b}`);
  assert.ok(c >= 650 && c < 1500, `third ${c}`);
});

test("bug switch changes behaviour only when requested; reset restores seed", async () => {
  const good = await json("/api/todos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) });
  assert.equal(good.status, 201);
  const buggy = await json("/api/todos", { method: "POST", headers: { "content-type": "application/json", "x-sut-bug": "api-created" }, body: JSON.stringify({ title: "y" }) });
  assert.notEqual(buggy.status, 201);
  assert.equal((await fetch(base + "/api/reset", { method: "POST" })).status, 200);
  resetState();
  const list = (await json("/api/todos")).body;
  assert.equal((Array.isArray(list) ? list : list.todos).length, 3);
});
