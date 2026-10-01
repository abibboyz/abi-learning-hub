# abi-learning-hub

Multi-stack **database relationships** learning hub: Python (SQLAlchemy 2.x), Node.js TypeScript & JavaScript (Prisma primary, Drizzle comparison), Zod/Valibot/`pg`, live schema diagram, task gate, topic mode, execute-only drills, history, and DB export/restore.

**Repo:** https://github.com/abibboyz/abi-learning-hub

## Quick start (Mac + Docker Desktop)

```bash
git clone https://github.com/abibboyz/abi-learning-hub.git
cd abi-learning-hub
cp .env.example .env
docker compose up --build
```

Open **http://localhost:3000**

Services:

| Service     | URL                   | Notes                          |
|-------------|-----------------------|--------------------------------|
| Next.js web | http://localhost:3000 | Learning hub UI                |
| Python API  | http://localhost:8000 | SQLAlchemy track + shared meta |
| Node API    | http://localhost:8001 | TS/JS Prisma schema labs       |
| Postgres 16 | localhost:5432        | user/pass/db from `.env`       |

Health: `GET /health` on each API.

Stop: `docker compose down` (named volumes keep data). Reset lab tables: UI **Reset lab to seed** or `make reset-db`.

## Export / restore

**Scripts (host with Compose running):**

```bash
./scripts/export-db.sh
# → snapshots/hub-YYYYMMDD-HHMMSS.dump

./scripts/restore-db.sh snapshots/hub-YYYYMMDD-HHMMSS.dump
# or: make restore-db FILE=snapshots/hub-....dump
```

**UI:** Lab sidebar → **Export snapshot** / **Restore** / **Reset lab to seed**.

Sample SQL reference: `snapshots/sample-seed.sql`.

## Modes

- **Topic-by-topic** — `/lab?mode=topics` — browse concepts with examples.
- **Execute-only** — `/lab?mode=execute` — 10 progressive relationship tasks with validation gate.

## Tracks (pluggable)

Tracks live under `tracks/<id>/` as data packages (`manifest.json`, `lessons/`, `tasks/`). Index: `tracks/index.json`.

1. `python-sqlalchemy` — FastAPI runner, constrained `exec`, SQLAlchemy 2 style.
2. `node-typescript` — Prisma model DSL → DDL runner.
3. `node-javascript` — same runner; UI highlights JS vs TS (Zod at boundaries).

Adding a track = new folder + index entry; hub shell does not need a rewrite.

## Task gate

1. Run learner code / schema.
2. Introspect Postgres.
3. Check requirements (extra columns **allowed**).
4. On fail → clear errors, no “success” animation.
5. On pass → execute path complete, diagram teach-along highlights (during + after).

## Local dev without full Compose

```bash
# Postgres must be reachable (Compose postgres-only or local install)
cp .env.example .env

# Python
cd api-python && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Node
cd api-node && npm install && npm run dev

# Web
cd web && npm install && npm run dev
```

## Tests (no Docker required for unit suite)

```bash
make test-python   # pytest — task checker, runner safety, tracks
cd api-node && npm install && npm test
cd web && npm install && npx tsc --noEmit
```

## Stack summary

- **Postgres 16** — demo seed (1:N, 1:1, M:N, self-ref, domain) + `run_history` / `learner_progress`
- **api-python** — FastAPI, SQLAlchemy 2, psycopg3, constrained runner
- **api-node** — Express, `pg`, Zod, Prisma-schema→SQL runner (Prisma client documented; Drizzle comparison panel)
- **web** — Next.js App Router, TypeScript, Tailwind, dark UI, keyboard shortcuts (`?`, ⌘/Ctrl+Enter)

## Docs

- [CONCEPTS.md](./CONCEPTS.md) — relationships, ORM↔SQL, validation, runtimes
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — pluggable tracks & services

## License

MIT
