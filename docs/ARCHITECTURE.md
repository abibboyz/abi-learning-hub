# Architecture — one platform

```
docker compose (single project)
├── postgres          (lab data + progress)
├── api-python        INTERNAL runner (SQLAlchemy track)
├── api-node          INTERNAL runner (Prisma TS/JS tracks)
└── web :3000         PUBLIC entry + /api/* BFF
         │
         ├─ browser ──► http://localhost:3000
         └─ BFF /api/* ──► api-python:8000 or api-node:8001
```

Learners never choose which backend to start. **`docker compose up --build`** starts everything; **track selection is UI-only**.

## Public surface

| Path | Role |
|------|------|
| `/` | Home — one-platform onboarding + track cards |
| `/lab` | Topic / execute modes + track picker |
| `/api/*` | Same-origin BFF → internal runners |
| `/api/health` | Aggregated hub health |

Host ports **8000/8001 are not published**. Runners use Compose DNS (`api-python`, `api-node`).

## Pluggable tracks

`tracks/index.json` lists tracks. Each track directory:

- `manifest.json` — prerequisites, runtime panels, validation catalog, task/lesson ids
- `tasks/*.json` — requirements, starter code, SQL equivalent, why / pitfalls / references, animation hints
- `lessons/*.json` — topic mode: objectives, why, mapping notes, teach-along, references

APIs load tracks from `TRACKS_DIR` (Compose mounts `./tracks`).

## Task gate flow

Learner code → constrained runner → schema introspect → `check_requirements` (errors include **why**) → history + progress → UI teach-along.

## Runners (internal)

- Python: AST whitelist + restricted `exec` with SQLAlchemy symbols.
- Node: Prisma model parser → `CREATE TABLE` / `ALTER … FOREIGN KEY` via `pg` (no arbitrary shell).

## Design principles

1. One Compose project forever.
2. One learner URL.
3. Tracks are data packages + in-app selection — never per-track Docker.
