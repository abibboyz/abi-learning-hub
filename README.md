# abi-learning-hub

**One learning platform** for database relationships — pick Python (SQLAlchemy 2.x), Node TypeScript, or Node JavaScript **inside the app**. Live schema diagram, task gate, topic mode, execute-only drills, history, and DB export/restore.

**Repo:** https://github.com/abibboyz/abi-learning-hub

## One command → one hub

```bash
git clone https://github.com/abibboyz/abi-learning-hub.git
cd abi-learning-hub
cp .env.example .env
docker compose up --build
```

Open **http://localhost:3000** — that is the only learner entry point.

Then **pick a track in the UI** (Python · SQLAlchemy / Node · TypeScript / Node · JavaScript).  
You never start a “Python stack” or “Node stack” separately. One Compose project brings up everything.

| What you use        | URL / action                          |
|---------------------|----------------------------------------|
| Learning hub (web)  | **http://localhost:3000**              |
| Track switching     | In-app track picker (lab / home)       |
| Stop                | `docker compose down`                  |
| Reset lab tables    | UI **Reset lab to seed** or `make reset-db` |

Internal runners (Python + Node) and Postgres stay on the Compose network. The web app’s **`/api/*`** BFF fans out to them — the browser only talks to port 3000.

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

- **Topic-by-topic** — `/lab?mode=topics` — concepts with why, pitfalls, SQL↔ORM mapping, and official references.
- **Execute-only** — `/lab?mode=execute` — progressive relationship tasks with a validation gate and teach-along highlights.

## Tracks (pluggable, in-app only)

Tracks live under `tracks/<id>/` (`manifest.json`, `lessons/`, `tasks/`). Index: `tracks/index.json`.

1. `python-sqlalchemy` — SQLAlchemy 2 style (internal Python runner).
2. `node-typescript` — Prisma model DSL → DDL (internal Node runner).
3. `node-javascript` — same runner; JS + Zod at boundaries.

Adding a track = new folder + index entry — not a new Docker Compose file.

## Task gate

1. Run learner code / schema.
2. Introspect Postgres.
3. Check requirements (extra columns **allowed**).
4. On fail → clear errors that explain **why**, no success animation.
5. On pass → teach-along diagram highlights (during + after).

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

## Tests

```bash
make test-python   # pytest — task checker, runner safety, tracks
cd api-node && npm install && npm test
cd web && npm install && npx tsc --noEmit
```

## Platform summary

- **One Compose project** — postgres + internal runners + Next.js web
- **One public URL** — http://localhost:3000 (`/api/*` BFF)
- **In-app tracks** — Python / Node TS / Node JS
- **Postgres 16** — demo seed + `run_history` / `learner_progress`
- **Pedagogy** — why, pitfalls, references, teach-along, SQL↔ORM panels

## Docs

- [CONCEPTS.md](./CONCEPTS.md) — relationships, ORM↔SQL, validation, runtimes, references
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — one platform, BFF, internal services

## License

MIT
