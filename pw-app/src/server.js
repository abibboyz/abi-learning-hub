// QA Practice Shop — the deterministic app under test for the Playwright track.
// Internal-only: reached by the pw-runner over the Compose network, never published.
// No dependencies: node:http only, in-memory state, resettable via POST /api/reset.
import http from "node:http";
import crypto from "node:crypto";
import { BUGS, ORDERS, ORDER_DELAYS, PRODUCTS, SEED_TODOS, TEAM, USERS } from "./data.js";

const PORT = Number(process.env.PORT || 4000);
const MAX_NAMESPACES = 2000;

/** Per-visitor state, keyed by the `ns` cookie, so parallel tests never share todos. */
const namespaces = new Map();
const sessions = new Map(); // token -> email
const runCounters = new Map(); // x-hub-run -> request counter for /api/orders

export function resetState() {
  namespaces.clear();
  sessions.clear();
  runCounters.clear();
}

function freshNamespace() {
  return { todos: SEED_TODOS.map((t) => ({ ...t })), nextId: SEED_TODOS.length + 1 };
}

function getNamespace(id) {
  if (!namespaces.has(id)) {
    if (namespaces.size >= MAX_NAMESPACES) namespaces.delete(namespaces.keys().next().value);
    namespaces.set(id, freshNamespace());
  }
  return namespaces.get(id);
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const CSS = `
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;color:#1d2433;background:#f6f7fb}
header{background:#1d2433;color:#fff;padding:12px 24px;display:flex;gap:16px;align-items:center}
[data-testid=session-id],[data-testid=live-clock]{display:inline-block;font-family:ui-monospace,Menlo,Consolas,monospace;min-width:24ch}
header a{color:#cfe3ff;text-decoration:none}header a:hover{text-decoration:underline}
main{max-width:960px;margin:24px auto;padding:0 24px}
.card{background:#fff;border:1px solid #dde2ee;border-radius:10px;padding:16px;margin-bottom:16px}
label{display:block;font-weight:600;margin-top:12px}input,select{font:inherit;padding:6px 8px;margin-top:4px}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #3b5bdb;background:#3b5bdb;color:#fff;cursor:pointer}
button.secondary{background:#fff;color:#3b5bdb}.error{color:#c92a2a;font-size:.9em;margin:4px 0 0}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #dde2ee;padding:8px;text-align:left}
th button{background:none;border:none;color:#1d2433;font-weight:700;padding:0}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{background:#eef3ff;border-radius:8px;padding:12px}
.stats.shifted .stat{background:#ffe3e3;padding:24px}
dialog::backdrop{background:rgba(0,0,0,.4)}.spinner{color:#868e96}
`;

const NAV = [
  ["/", "Home"], ["/login", "Login"], ["/register", "Register"], ["/products", "Products"],
  ["/todos", "Todos"], ["/async", "Orders"], ["/dialogs", "Dialogs"], ["/frames", "Payment"],
  ["/newtab", "Help link"], ["/upload", "Upload"], ["/dashboard", "Dashboard"],
];

function page(title, body, { script = "" } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · QA Practice Shop</title><style>${CSS}</style></head>
<body><header><strong>QA Practice Shop</strong><nav aria-label="Main">${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join(" ")}</nav></header>
<main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(body);
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readForm(req) {
  const raw = await readBody(req);
  const ct = req.headers["content-type"] || "";
  if (ct.includes("application/json")) {
    try { return JSON.parse(raw || "{}"); } catch { return null; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function currentUser(req, cookies) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : cookies.session;
  const email = token && sessions.get(token);
  return email ? USERS.find((u) => u.email === email) : null;
}

// ---------------------------------------------------------------- pages

const pages = {
  "/": () => page("Home", `<h1>QA Practice Shop</h1>
<p>A small, deterministic app for practising Playwright. Every page is built for one skill.</p>
<ul>${NAV.slice(1).map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul>`),

  "/login": (req, { query }) => page("Login", `<h1>Sign in</h1>
<form class="card" method="post" action="/login" novalidate>
${query.get("error") ? `<p role="alert" class="error">${esc(query.get("error"))}</p>` : ""}
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" value="${esc(query.get("email") || "")}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
<p><button type="submit">Sign in</button></p>
<p><small>Practice account: qa@example.com / Passw0rd!</small></p>
</form>`),

  "/register": (req, { bug }) => page("Register", `<h1>Create your account</h1>
<form id="register" class="card" novalidate>
<label for="name">Full name</label><input id="name" name="name" aria-describedby="name-error"><p id="name-error" class="error"></p>
<label for="remail">Email</label><input id="remail" name="email" type="email" aria-describedby="email-error"><p id="email-error" class="error"></p>
<label for="age">Age</label><input id="age" name="age" type="number" aria-describedby="age-error"><p id="age-error" class="error"></p>
<label for="country">Country</label><select id="country" name="country"><option value="">Choose…</option><option>Australia</option><option>Nepal</option><option>Canada</option></select>
<fieldset style="margin-top:12px;border:none;padding:0"><legend><strong>Plan</strong></legend>
<label style="font-weight:400"><input type="radio" name="plan" value="Free" checked> Free</label>
<label style="font-weight:400"><input type="radio" name="plan" value="Pro"> Pro</label></fieldset>
<label style="font-weight:400"><input type="checkbox" name="terms" id="terms"> I accept the terms</label><p id="terms-error" class="error"></p>
<p><button type="submit">Create account</button></p>
<p id="result" role="status"></p>
</form>`, { script: `
const BUG_NO_VALIDATION = ${JSON.stringify(bug === "form-no-validation")};
document.getElementById('register').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.name.value.trim(), email = f.email.value.trim(), age = Number(f.age.value);
  const errs = { name: '', email: '', age: '', terms: '' };
  if (!BUG_NO_VALIDATION) {
    if (!name) errs.name = 'Full name is required';
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) errs.email = 'Enter a valid email address';
    if (!f.age.value || age < 18 || age > 120) errs.age = 'Age must be between 18 and 120';
    if (!f.terms.checked) errs.terms = 'You must accept the terms';
  }
  for (const k of Object.keys(errs)) document.getElementById(k + '-error').textContent = errs[k];
  for (const k of ['name','email','age']) f[k].setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
  const ok = Object.values(errs).every((v) => !v);
  document.getElementById('result').textContent = ok ? 'Account created for ' + name + ' (' + f.plan.value + ' plan)' : '';
});` }),

  "/products": (req, { bug }) => page("Products", `<h1>Products</h1>
<div class="card">
<label for="q">Search products</label><input id="q" type="search" placeholder="e.g. apple">
<label for="cat">Category</label><select id="cat"><option value="">All</option><option>Fruit</option><option>Bakery</option><option>Dairy</option></select>
<p id="count" role="status"></p>
<table><caption style="text-align:left;font-weight:700">Product list</caption>
<thead><tr>
<th aria-sort="none" data-key="name"><button type="button">Name</button></th>
<th>Category</th>
<th aria-sort="none" data-key="price"><button type="button">Price</button></th>
<th aria-sort="none" data-key="stock"><button type="button">Stock</button></th>
</tr></thead><tbody id="rows"></tbody></table></div>`, { script: `
const ALL = ${JSON.stringify(PRODUCTS)};
const BUG = ${JSON.stringify(bug || "")};
let sortKey = null, dir = 1;
function render() {
  const q = BUG === 'filter-broken' ? '' : document.getElementById('q').value.trim().toLowerCase();
  const cat = document.getElementById('cat').value;
  let rows = ALL.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!cat || p.category === cat));
  if (sortKey && BUG !== 'sort-broken') rows = rows.slice().sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * dir);
  document.getElementById('rows').innerHTML = rows.map((p) => '<tr><td>' + p.name + '</td><td>' + p.category + '</td><td>$' + p.price.toFixed(2) + '</td><td>' + (p.stock === 0 ? 'Out of stock' : p.stock) + '</td></tr>').join('');
  document.getElementById('count').textContent = 'Showing ' + rows.length + ' of ' + ALL.length + ' products';
  document.querySelectorAll('th[data-key]').forEach((th) => th.setAttribute('aria-sort', th.dataset.key === sortKey ? (dir === 1 ? 'ascending' : 'descending') : 'none'));
}
document.querySelectorAll('th[data-key] button').forEach((b) => b.addEventListener('click', () => {
  const key = b.parentElement.dataset.key;
  if (sortKey === key) dir = -dir; else { sortKey = key; dir = 1; }
  render();
}));
document.getElementById('q').addEventListener('input', render);
document.getElementById('cat').addEventListener('change', render);
render();` }),

  "/todos": (req, { bug }) => page("Todos", `<h1>Todos</h1>
<div class="card">
<form id="add"><label for="new">New todo</label><input id="new" name="title"> <button type="submit">Add</button></form>
<p id="error" role="alert" class="error"></p>
<ul id="list" aria-label="Todo list"><li class="spinner">Loading todos…</li></ul>
<p id="left"></p></div>`, { script: `
const BUG = ${JSON.stringify(bug || "")};
async function load() {
  try {
    const res = await fetch('/api/todos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const todos = BUG === 'todos-ignore-api' ? [] : data.todos;
    const list = document.getElementById('list');
    list.innerHTML = todos.length ? todos.map((t) => '<li>' + (t.done ? '✅ ' : '') + t.title.replace(/</g, '&lt;') + '</li>').join('') : '<li>No todos yet</li>';
    document.getElementById('left').textContent = todos.filter((t) => !t.done).length + ' items left';
  } catch (e) {
    document.getElementById('list').innerHTML = '';
    document.getElementById('error').textContent = 'Could not load todos. Please try again.';
  }
}
document.getElementById('add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = e.target.title.value;
  const res = await fetch('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
  document.getElementById('error').textContent = res.ok ? '' : (await res.json()).error;
  if (res.ok) { e.target.reset(); load(); }
});
load();` }),

  "/async": () => page("Orders", `<h1>Orders</h1>
<div class="card"><button type="button" id="load">Load orders</button>
<p id="state" class="spinner" aria-live="polite"></p>
<ul id="orders" aria-label="Orders"></ul></div>`, { script: `
document.getElementById('load').addEventListener('click', async () => {
  const state = document.getElementById('state');
  state.textContent = 'Loading orders…';
  document.getElementById('orders').innerHTML = '';
  const res = await fetch('/api/orders');
  const data = await res.json();
  if (data.pending) return; // bug: never finishes
  state.textContent = 'Loaded ' + data.orders.length + ' orders';
  document.getElementById('orders').innerHTML = data.orders.map((o) => '<li>' + o.id + ' · ' + o.customer + ' · ' + o.status + '</li>').join('');
});` }),

  "/dialogs": (req, { bug }) => page("Dialogs", `<h1>Team &amp; settings</h1>
<div class="card"><h2>Team</h2><ul id="team" aria-label="Team members">${TEAM.map((n) => `<li>${n} <button type="button" class="secondary" data-name="${n}" aria-label="Delete ${n}">Delete</button></li>`).join("")}</ul>
<p id="status" role="status"></p></div>
<div class="card"><button type="button" id="open">Open settings</button> <button type="button" class="secondary" id="alert">Show tip</button></div>
<dialog id="settings" aria-labelledby="settings-title"><h2 id="settings-title">Settings</h2>
<label style="font-weight:400"><input type="checkbox" id="notify"> Email notifications</label>
<p><button type="button" id="save">Save</button> <button type="button" class="secondary" id="cancel">Cancel</button></p></dialog>`, { script: `
const BUG = ${JSON.stringify(bug || "")};
const status = document.getElementById('status');
document.getElementById('team').addEventListener('click', (e) => {
  const name = e.target.dataset && e.target.dataset.name;
  if (!name) return;
  if (confirm('Delete ' + name + '?')) {
    if (BUG !== 'dialog-noop') e.target.parentElement.remove();
    status.textContent = 'Deleted ' + name;
  } else status.textContent = 'Kept ' + name;
});
const dlg = document.getElementById('settings');
document.getElementById('open').addEventListener('click', () => dlg.showModal());
document.getElementById('cancel').addEventListener('click', () => dlg.close());
document.getElementById('save').addEventListener('click', () => {
  if (BUG === 'settings-noop') return;
  status.textContent = 'Settings saved (notifications ' + (document.getElementById('notify').checked ? 'on' : 'off') + ')';
  dlg.close();
});
document.getElementById('alert').addEventListener('click', () => { alert('Tip: use getByRole first'); status.textContent = 'Tip shown'; });` }),

  "/frames": () => page("Payment", `<h1>Checkout</h1>
<div class="card"><p>Order total: $42.50</p>
<iframe title="Payment form" src="/frame/payment" style="width:100%;height:220px;border:1px solid #dde2ee;border-radius:8px"></iframe></div>`),

  "/frame/payment": (req, { bug }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Payment</title><style>${CSS}</style></head>
<body style="background:#fff;padding:12px"><form id="pay" novalidate>
<label for="card">Card number</label><input id="card" inputmode="numeric">
<p><button type="submit">Pay now</button></p><p id="msg" role="status"></p></form>
<script>
const BUG = ${JSON.stringify(bug || "")};
document.getElementById('pay').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = document.getElementById('card').value.replace(/\\s+/g, '');
  const msg = document.getElementById('msg');
  if (!/^\\d{16}$/.test(v)) msg.textContent = 'Card number must be 16 digits';
  else msg.textContent = BUG === 'frame-declined' ? 'Payment declined' : 'Payment accepted for card ending ' + v.slice(-4);
});
</script></body></html>`,

  "/newtab": () => page("Help link", `<h1>Need help?</h1>
<div class="card"><p>The help center opens in a new tab.</p>
<a href="/help" target="_blank" rel="noopener">Open help center</a></div>`),

  "/help": (req, { bug }) => page("Help", `<h1>${bug === "newtab-wrong" ? "Page not found" : "Help Center"}</h1>
<div class="card"><p>Search our guides or contact support.</p></div>`),

  "/upload": (req, { bug }) => page("Upload", `<h1>Upload a report</h1>
<div class="card"><label for="file">Attachment</label><input id="file" type="file" multiple>
<ul id="files" aria-label="Selected files"></ul><p id="upload-status" role="status"></p></div>`, { script: `
const BUG = ${JSON.stringify(bug || "")};
document.getElementById('file').addEventListener('change', (e) => {
  const files = BUG === 'upload-noop' ? [] : Array.from(e.target.files);
  document.getElementById('files').innerHTML = files.map((f) => '<li>' + f.name.replace(/</g, '&lt;') + ' (' + f.size + ' bytes)</li>').join('');
  document.getElementById('upload-status').textContent = files.length ? files.length + ' file(s) ready' : 'No file selected';
});` }),

  "/dashboard": (req, { user, bug }) => {
    if (!user) return null; // handled as redirect
    const name = bug === "welcome-name" ? "Guest" : user.name;
    return page("Dashboard", `<h1>Dashboard</h1>
<p>Welcome, ${esc(name)}</p>
<div class="stats ${bug === "visual-shift" ? "shifted" : ""}" aria-label="Stats">
<div class="stat"><strong>Open todos</strong><div>2</div></div>
<div class="stat"><strong>Orders</strong><div>3</div></div>
<div class="stat"><strong>Plan</strong><div>Pro</div></div></div>
<p>Session: <span data-testid="session-id">${crypto.randomBytes(6).toString("hex")}</span></p>
<p>Server time: <span data-testid="live-clock"></span></p>
<form method="post" action="/logout"><button type="submit">Sign out</button></form>`, { script: `
const c = document.querySelector('[data-testid=live-clock]');
setInterval(() => { c.textContent = new Date().toISOString(); }, 50);
c.textContent = new Date().toISOString();` });
  },
};

// ---------------------------------------------------------------- router

export async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const cookies = parseCookies(req.headers.cookie);
  const headerBug = String(req.headers["x-sut-bug"] || "");
  const bug = BUGS[headerBug] ? headerBug : BUGS[cookies.sut_bug] ? cookies.sut_bug : "";
  const setCookies = [];
  let ns = cookies.ns;
  if (!ns || !/^[a-f0-9]{16}$/.test(ns)) {
    ns = crypto.randomBytes(8).toString("hex");
    setCookies.push(`ns=${ns}; Path=/; SameSite=Lax`);
  }
  const extra = setCookies.length ? { "set-cookie": setCookies } : {};
  const state = getNamespace(ns);
  const user = currentUser(req, cookies);
  const path = url.pathname;
  const method = req.method || "GET";

  try {
    // ---- JSON API
    if (path === "/api/health") return json(res, 200, { ok: true, service: "pw-app", bugs: Object.keys(BUGS) });
    if (path === "/api/reset" && method === "POST") {
      resetState();
      return json(res, 200, { ok: true, message: "App under test reset to seed." });
    }
    if (path === "/api/products" && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const cat = url.searchParams.get("category") || "";
      const items = PRODUCTS.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!cat || p.category === cat));
      return json(res, 200, { total: items.length, items }, extra);
    }
    if (path === "/api/orders" && method === "GET") {
      const run = String(req.headers["x-hub-run"] || "global");
      const n = runCounters.get(run) || 0;
      runCounters.set(run, n + 1);
      if (runCounters.size > 1000) runCounters.delete(runCounters.keys().next().value);
      const delay = ORDER_DELAYS[n % ORDER_DELAYS.length];
      await new Promise((r) => setTimeout(r, delay));
      if (bug === "orders-empty") return json(res, 200, { pending: true, orders: [] }, extra);
      return json(res, 200, { orders: ORDERS, delayMs: delay }, extra);
    }
    if (path === "/api/todos" && method === "GET") return json(res, 200, { todos: state.todos }, extra);
    if (path === "/api/todos" && method === "POST") {
      const body = await readForm(req);
      const title = body && typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return json(res, 400, { error: "Title is required" }, extra);
      if (title.length > 100) return json(res, 400, { error: "Title must be 100 characters or fewer" }, extra);
      const todo = { id: state.nextId++, title, done: false };
      state.todos.push(todo);
      if (bug === "api-created") return json(res, 200, { ok: true }, extra);
      return json(res, 201, todo, extra);
    }
    const m = path.match(/^\/api\/todos\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      const before = state.todos.length;
      state.todos = state.todos.filter((t) => t.id !== id);
      if (state.todos.length === before) return json(res, 404, { error: `Todo ${id} not found` }, extra);
      res.writeHead(204, extra);
      return res.end();
    }
    if (path === "/api/login" && method === "POST") {
      const body = (await readForm(req)) || {};
      const u = USERS.find((x) => x.email === body.email && x.password === body.password);
      if (!u) return json(res, 401, { error: "Invalid email or password" }, extra);
      const token = crypto.randomBytes(16).toString("hex");
      sessions.set(token, u.email);
      return json(res, 200, { token, user: { email: u.email, name: u.name, role: u.role } }, {
        ...extra, "set-cookie": [...setCookies, `session=${token}; Path=/; HttpOnly; SameSite=Lax`],
      });
    }
    if (path === "/api/me" && method === "GET") {
      if (!user) return json(res, 401, { error: "Not signed in" }, extra);
      return json(res, 200, { email: user.email, name: user.name, role: user.role }, extra);
    }
    if (path.startsWith("/api/")) return json(res, 404, { error: "Not found" }, extra);

    // ---- form posts
    if (path === "/login" && method === "POST") {
      const body = (await readForm(req)) || {};
      const email = String(body.email || "").trim();
      const fail = (msg) => send(res, 303, "", { ...extra, location: `/login?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}` });
      if (!email) return fail("Email is required");
      if (!body.password) return fail("Password is required");
      const u = USERS.find((x) => x.email === email && x.password === body.password);
      if (!u) return fail("Invalid email or password");
      const token = crypto.randomBytes(16).toString("hex");
      sessions.set(token, u.email);
      return send(res, 303, "", {
        location: bug === "login-redirect" ? "/" : "/dashboard",
        "set-cookie": [...setCookies, `session=${token}; Path=/; HttpOnly; SameSite=Lax`],
      });
    }
    if (path === "/logout" && method === "POST") {
      if (bug !== "logout-noop" && cookies.session) sessions.delete(cookies.session);
      return send(res, 303, "", {
        location: "/login",
        "set-cookie": [...setCookies, ...(bug === "logout-noop" ? [] : ["session=; Path=/; Max-Age=0"])],
      });
    }

    // ---- pages
    const render = pages[path];
    if (render && method === "GET") {
      const html = render(req, { query: url.searchParams, user, bug });
      if (html === null) return send(res, 303, "", { ...extra, location: "/login?error=" + encodeURIComponent("Please sign in first") });
      return send(res, 200, html, extra);
    }
    if (path === "/favicon.ico") { res.writeHead(204); return res.end(); }
    return send(res, 404, page("Not found", "<h1>Page not found</h1>"), extra);
  } catch (err) {
    return json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
}

export function createServer() {
  return http.createServer((req, res) => { void handle(req, res); });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, "0.0.0.0", () => console.log(`pw-app (app under test) on :${PORT}`));
}
