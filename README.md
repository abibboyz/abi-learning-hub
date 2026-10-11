# abi-learning-hub

**One learning platform** for database relationships and test automation — pick Python (SQLAlchemy 2.x), Node TypeScript, Node JavaScript, or **Playwright · TypeScript** **inside the app**. Live schema diagram, task gate, topic mode, execute-only drills, history, and DB export/restore — plus a real-browser Playwright lab with traces, screenshots and console/network logs.

**Repo:** https://github.com/abibboyz/abi-learning-hub

## One command → one hub

```bash
git clone https://github.com/abibboyz/abi-learning-hub.git
cd abi-learning-hub
cp .env.example .env
docker compose up --build
```

Open **http://localhost:3000** — that is the only learner entry point.

Then **pick a track in the UI** (Python · SQLAlchemy / Node · TypeScript / Node · JavaScript / Playwright · TypeScript).  
You never start a “Python stack” or “Node stack” separately. One Compose project brings up everything.

| What you use        | URL / action                          |
|---------------------|----------------------------------------|
| Learning hub (web)  | **http://localhost:3000**              |
| Track switching     | In-app track picker (lab / home)       |
| Stop                | `docker compose down`                  |
| Reset lab tables    | UI **Reset lab to seed** or `make reset-db` |

Internal runners (Python, Node, Playwright) and the Playwright practice app stay on the Compose network. The web app’s **`/api/*`** BFF fans out to them — the browser only talks to port 3000.

Health: `GET http://localhost:3000/api/health`

## Export / restore

**Scripts (Compose running):**

```bash
./scripts/export-db.sh
# → snapshots/hub-YYYYMMDD-HHMMSS.dump

./scripts/restore-db.sh snapshots/hub-YYYYMMDD-HHMMSS.dump
# or: make restore-db FILE=snapshots/hub-....dump
```

**UI:** Lab sidebar → **Export snapshot** / **Restore** / **Reset lab to seed**.

Sample SQL reference: `snapshots/sample-seed.sql`.

## Modes (in-app)

- **Topic-by-topic** — `/lab?mode=topics`: concepts with why, pitfalls, SQL↔ORM mapping and official references. **Every lesson has a runnable exercise** (code or a graded quiz) checked by the same gate as tasks, with Show solution and Reset.
- **Execute-only** — `/lab?mode=execute`: progressive relationship tasks (beginner → advanced) with a validation gate, Show solution and teach-along highlights.
- **History** — every run (pass or fail, task or lesson) is recorded. **Replay this code** loads it back into its task or lesson.

## Tracks (pluggable, in-app only)

Tracks live under `tracks/<id>/` (`manifest.json`, `lessons/`, `tasks/`). Index: `tracks/index.json`.

1. `python-sqlalchemy` — SQLAlchemy 2 style (internal Python runner). 17 lessons, 12 tasks.
2. `node-typescript` — Prisma schema → DDL following real Prisma mapping rules, plus a Zod lab (internal Node runner). 17 lessons, 12 tasks.
3. `node-javascript` — same runner; JS + Zod at boundaries. 17 lessons, 12 tasks.
4. `sql-postgres` — raw PostgreSQL DDL/DML, run as the restricted `hub_lab` role (internal Python runner). 17 lessons, 12 tasks.
5. `playwright-typescript` — Playwright Test **1.64.0** (pinned), manifest `kind: "playwright"`, internal `pw-runner` + `pw-app`. See below.

Adding a track = new folder + index entry — not a new Docker Compose file.

## Task gate (database tracks)

1. Clean slate: the exercise's tables are dropped, then your code / schema / SQL runs.
2. Postgres is introspected (columns, types, keys, unique/indexes, CHECKs).
3. Requirements are checked; extra columns are **allowed**. Then required rows, probes (trusted SQL in a rolled-back transaction), printed output, validator calls or Zod cases.
4. On fail: each reason has a **rule id**, the table/column and a line number where one applies, and **why**. No success animation.
5. On pass: teach-along diagram highlights.

Python and Node use the same rule ids and messages; a shared fixture test enforces this.

| Rule id | Meaning |
|---|---|
| `missing-table`, `missing-column` | required table / column not created |
| `not-primary-key`, `missing-composite-key` | wrong or missing (composite) primary/unique key |
| `wrong-type`, `must-be-nullable`, `must-be-not-null` | column type / NULL-ability |
| `not-unique`, `must-not-be-unique`, `missing-index` | uniqueness (1:1 vs 1:N) and indexes |
| `not-foreign-key`, `wrong-fk-target`, `wrong-on-delete` | foreign keys and referential actions |
| `missing-data`, `too-much-data` | required rows not inserted / duplicates |
| `probe-failed`, `constraint-not-enforced` | a behaviour check failed, e.g. a CHECK that lets bad data in |
| `missing-output` | expected printed / selected output not produced |
| `accepts-invalid`, `rejects-valid`, `missing-name` | validators (`@validates`, Zod) |
| `missing-datasource`, `wrong-provider`, `hardcoded-url`, `wrong-env-var` | Prisma `datasource` block |
| `unanswered`, `wrong-answer` | quizzes (graded server-side; answers never sent to the browser) |
| `rejected`, `runtime-error` | code refused before running (forbidden import/statement) or crashed, with its line |

Audit of every database track (gaps found, what was added and fixed): [docs/TRACK_AUDIT.md](./docs/TRACK_AUDIT.md).

## Playwright track (`playwright-typescript`)

A UI + API test-automation track on **Playwright Test 1.64.0** — the `latest` dist-tag on npm and the latest GitHub release ([v1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0), 7 Oct 2026) when this track was written. The version is pinned exactly in `pw-runner/package.json` and in the runner image `mcr.microsoft.com/playwright:v1.64.0-noble`, so the npm package and the bundled browsers always match.

**Content:** 27 lessons (17 runnable in the lab, 10 reference topics: config, debugging, flakiness, parallelism/sharding, projects, reporters, CI, component testing, agents/MCP/CLI) and 19 gated tasks, TypeScript first with an optional JavaScript variant (task 10). Open it from the home page or `/lab?track=playwright-typescript`.

**What you test:** *QA Practice Shop* (`pw-app/`), a small seeded app with login + session cookie, register form with validation, sortable/filterable product table, todos backed by a JSON API, async loading with variable latency, native dialogs + a modal, an iframe, a new-tab link, file upload and an authenticated dashboard. Accounts: `qa@example.com / Passw0rd!`, `admin@example.com / Adm1n!pass`.

**The lab:** editor with line numbers, **Run** (Ctrl+Enter), TS/JS toggle, per-test results (passed / failed / flaky with each repetition), the failing line highlighted in the editor, screenshots, **trace viewer** (Playwright's own viewer, served offline by the runner) + `trace.zip`, console and network logs, gate reasons and suggestions, **history with replay**, read-only provided files and prerequisites with unlock-to-edit, export/restore of drafts (JSON), reset of the app under test and of progress.

**The gate** combines static analysis of your file (TypeScript AST) with the real run:

| Reason (rule id) | When |
|---|---|
| `prefer-user-facing-locators` | CSS / XPath selectors (`locator('#id')`, `//div`, `page.click('sel')`) where the task asks for role/label/text locators |
| `missing-await` | an unawaited `expect(...).toX()`, action, `test.step` or API call |
| `no-wait-for-timeout` | `page.waitForTimeout()` (fixed sleeps) |
| `weak-assertion` / `non-retrying-assertion` | `expect(locator).toBeTruthy()`, `expect(await el.isVisible()).toBe(true)`, `expect(page.url())…` |
| `test-failed` / `test-timeout` | a test fails — with its line number |
| `flaky` | a task test is run 3× (`repeatEach: 3`) and passes only some of the time |
| `weak-test` | your tests pass, but **also pass when the gate plants a bug** in the app (mutation check) |
| `requires-new-LoginPage`, `requires-fixture-…`, `requires-extend` | no page object / no custom fixture where the task is about them |
| `requires-route`, `requires-fulfill` | no network mock in the mocking task |
| `requires-storageState`, `forbidden-pattern` | no saved auth state / logging in through the UI where state should be reused |
| `forbidden-import`, `forbidden-api` | anything outside `@playwright/test` (no `fs`, `child_process`, `process`, `require`, `eval`, launch options): rejected before running |

**Runner safety:** each run gets its own temp directory with a generated config (1 worker, 0 retries, test + run timeouts, process-group kill), runs as `pwuser` in a CPU/memory/pid-limited container, never through a shell; file paths are sanitised, artifacts are served only from the run directory with an extension allowlist, concurrency is capped (`PW_MAX_CONCURRENCY`, extra requests queue up to `PW_MAX_QUEUE`, then 429). `pw-app` sits on an `internal: true` network that only `pw-runner` joins.

## Local contributor workflow (optional)

Day-to-day learning uses Compose only. For hacking on services without rebuilding images:

```bash
cp .env.example .env
# Postgres reachable (Compose postgres service or local install)

# Terminal A — Python runner (internal; not the learner entry)
cd api-python && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Terminal B — Node runner (internal)
cd api-node && npm install && npm run dev

# Terminal C — Web + BFF (learner entry still http://localhost:3000)
cd web && npm install && npm run dev
```

Set `PYTHON_API_INTERNAL` / `NODE_API_INTERNAL` if your runners are not on 8000/8001.

Playwright track without Docker:

```bash
cd pw-app && node src/server.js                                  # app under test on :4000
cd pw-runner && npm ci && npx playwright install chromium && npm start   # runner on :8002
# web picks it up via PW_RUNNER_INTERNAL (default http://localhost:8002)
```

## Tests

```bash
make test-python   # pytest: gate parity, runners, SQL runner, and a walk of every DB reference/wrong/starter (needs Postgres)
make test-node     # node:test: gate parity, Prisma translator, Zod lab, and the same walk for the Node tracks
                   # run these two one after the other, not in parallel (they share the lab_* tables)
make walk          # HTTP walk of all DB tracks against running APIs (add ARGS=--via-bff to go through the web proxy)
cd web && npm install && npx tsc --noEmit
make test-pw       # pw-runner gate/evaluate/runner/API tests + typecheck, pw-app tests
make test-pw-e2e   # every Playwright task solution, wrong solution and lesson example in real Chromium
```

## Platform summary

- **One Compose project** — postgres + internal runners (Python, Node, Playwright) + practice app + Next.js web
- **One public URL** — http://localhost:3000 (`/api/*` BFF)
- **In-app tracks** — Python / Node TS / Node JS / raw SQL / Playwright TS
- **Postgres 16** — demo seed + `run_history` / `learner_progress`
- **Pedagogy** — why, pitfalls, references, teach-along, SQL↔ORM panels

## Docs

- [CONCEPTS.md](./CONCEPTS.md) — relationships, ORM↔SQL, validation, runtimes, references
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — one platform, BFF, internal services
- [docs/TRACK_AUDIT.md](./docs/TRACK_AUDIT.md) — database-track audit: gaps, fixes, limitations

## License

MIT
