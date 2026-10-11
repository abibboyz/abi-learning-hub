# Architecture — one platform

```
docker compose (single project)
├── postgres          (lab data + progress)
├── api-python        INTERNAL runner (SQLAlchemy track)
├── api-node          INTERNAL runner (Prisma TS/JS tracks)
├── pw-runner         INTERNAL Playwright runner :8002 (mcr.microsoft.com/playwright:v1.64.0-noble)
├── pw-app            INTERNAL app under test :4000 (network pw_sut, internal: true)
└── web :3000         PUBLIC entry + /api/* BFF
         │
         ├─ browser ──► http://localhost:3000
         └─ BFF /api/* ──► api-python:8000, api-node:8001 or pw-runner:8002
                                                     └── Chromium ──► pw-app:4000
```

Learners never choose which backend to start. **`docker compose up --build`** starts everything; **track selection is UI-only**.

## Public surface

| Path | Role |
|------|------|
| `/` | Home — one-platform onboarding + track cards |
| `/lab` | Topic / execute modes + track picker |
| `/api/*` | Same-origin BFF → internal runners |
| `/api/health` | Aggregated hub health |

Host ports **8000/8001/8002/4000 are not published**. Runners use Compose DNS (`api-python`, `api-node`, `pw-runner`, `pw-app`).

BFF routing: `playwright-*` track ids (in the path, `?trackId=` or the JSON body) and every `/api/pw/*` path go to `pw-runner`; `node-*` to `api-node`; the rest to `api-python`. Binary responses (screenshots, `trace.zip`, trace-viewer assets) are passed through byte-for-byte.

## Pluggable tracks

`tracks/index.json` lists tracks. Each track directory:

- `manifest.json` — prerequisites, runtime panels, validation catalog, task/lesson ids
- `tasks/*.json` — requirements, starter code, SQL equivalent, why / pitfalls / references, animation hints
- `lessons/*.json` — topic mode: objectives, why, mapping notes, teach-along, references

APIs load tracks from `TRACKS_DIR` (Compose mounts `./tracks`).

## Task gate flow

Learner code → constrained runner → schema introspect → `check_requirements` (errors include **why**) → history + progress → UI teach-along.

## Track kinds

`manifest.kind` selects the lab: ORM tracks (default) render the schema lab; `kind: "playwright"` renders the Playwright lab (`web/src/components/playwright/`). A new kind = a manifest kind + a runner service + a lab component; tracks themselves stay data.

## Playwright runner (`pw-runner/`)

```
POST /execute ─► zod body check ─► gate.analyze (TS AST)
                   │ rejected? ─► return reasons, nothing runs
                   ▼
           semaphore (cap, else 429)
                   ▼
  temp run dir: tests/<file> + support files + hub/test.ts (log fixture) + generated config
                   ▼
  node @playwright/test/cli.js test   (no shell, scrubbed env, timeout → kill process group)
     projects: [setup?] → chromium (repeatEach 3 for tasks) → mutant:<bug>… (x-sut-bug header)
                   ▼
  JSON report ─► parseReport (fold repeats, flaky, errors+lines, screenshots, trace, logs, mutants)
                   ▼
  evaluateGate ─► verdict + reasons ─► run_history / learner_progress (shared Postgres)
```

- `src/gate.ts` static rules; `src/evaluate.ts` verdict; `src/runner.ts` run dir, config, process, report parsing; `src/server.ts` HTTP API; `src/history.ts` shared tables (in-memory fallback).
- Learner imports of `@playwright/test` are rewritten (same line count) to `hub/test.ts`, which re-exports Playwright and adds an auto fixture recording console/page errors/network into a `hub-log` attachment.
- Mutation check: the app under test honours an `x-sut-bug` header; a task lists bugs a good test must catch. Mutant projects depend on the main project, so they only run when the learner's tests are green.
- Determinism: `/api/orders` latency cycles 250/1600/700 ms per run id, so a fixed sleep is reliably flaky across `repeatEach: 3` and a web-first assertion is reliably green.

## Runners (internal)

- Python: AST whitelist + restricted `exec` with SQLAlchemy symbols.
- Node: Prisma model parser → `CREATE TABLE` / `ALTER … FOREIGN KEY` via `pg` (no arbitrary shell).
- Playwright: AST allow-list (only `@playwright/test` + provided support files; no `process`/`require`/`eval`/dynamic import/launch options) → Playwright Test in a per-run temp dir, as `pwuser`, resource-limited container.

## Design principles

1. One Compose project forever.
2. One learner URL.
3. Tracks are data packages + in-app selection — never per-track Docker.
