# Architecture

```
docker compose
├── postgres (volume abi-learning-hub-pgdata)
├── api-python :8000  ──┐
├── api-node   :8001  ──┼── shared DATABASE + tracks/ mount
└── web        :3000  ──┘
```

## Pluggable tracks

`tracks/index.json` lists tracks. Each track directory:

- `manifest.json` — prerequisites, runtime panels, validation catalog, task/lesson ids
- `tasks/*.json` — requirements (schema checks), starter code, SQL equivalent, animation hints
- `lessons/*.json` — topic mode content

APIs load tracks from `TRACKS_DIR` (Compose mounts `./tracks`).

## Task gate flow

Learner code → constrained runner → schema introspect → `check_requirements` → history + progress → UI animation.

## Runners

- Python: AST whitelist + restricted `exec` with SQLAlchemy symbols.
- Node: Prisma model parser → `CREATE TABLE` / `ALTER … FOREIGN KEY` via `pg` (no arbitrary shell).
