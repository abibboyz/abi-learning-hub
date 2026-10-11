# Track audit — database tracks (Python SQLAlchemy, Node TypeScript, Node JavaScript, raw SQL)

Audit of every non-Playwright track against one standard. Every lesson and task:

- runs in the lab: code or a quiz, with feedback, Show solution and history replay
- passes with its reference solution
- fails with a specific rule id, and a line number where one applies, on each listed wrong answer and on the untouched starter
- links to the official docs

The tests enforce this, so it can't silently regress.

## State before the audit (base: `feat/playwright-track`)

| Area | Before | After |
|---|---|---|
| Tracks | 3 DB tracks (python-sqlalchemy, node-typescript, node-javascript) | 4: adds **sql-postgres** (raw PostgreSQL DDL/DML) |
| Lessons | 12 per track, text only. `exercise` was a prompt + hint; nothing ran or was checked | 17 per track, **all runnable** through the same gate as tasks (code or graded quiz), labelled beginner / intermediate / advanced |
| Tasks | 10 per track (rel-01..rel-10) | 12 per track: adds rel-11 *association object* and rel-12 *constraints & indexes* (advanced) |
| Gate checks | table/column exist, `pk`, `unique`, `nullable`, `fk` target, `onDelete` | adds column `type`, `indexed`, composite keys (`uniqueTogether`), required rows (`data`), CHECK/behaviour `probes`, printed output (`stdout`), Python `calls` (@validates), Zod accept/reject cases, Prisma `datasource` |
| Data tasks | rel-09 "Insert + query" never checked a single row | rows are required (`missing-data`) and probes check the join |
| Failure messages | free text | stable **rule ids** shared by Python and Node, with table / column / **line** / question |
| Python and Node gates | two separate implementations | same rule ids and messages, enforced by a shared fixture (`tests/fixtures/schema-gate-cases.json`) that both test suites run |
| Prisma translator | silently snake_cased field names (`authorId` → `author_id`; real Prisma keeps `authorId` unless `@map`), so code passing here could fail in a real project | follows real Prisma mapping (`String`→`TEXT`, `DateTime`→`TIMESTAMP(3)`, `Decimal`→`DECIMAL(65,30)`, `@map`, `@@map`, `@db.*`, `@@id`, `@@unique`, `@@index`, all five referential actions), with line-numbered errors for unknown types/attributes/relation targets, missing `@id`, enums, `dbgenerated` |
| Reference solutions | none stored | every task/lesson has `solution`, ≥1 `wrongSolutions[]` (with the rule ids it must fail with) and a starter that must fail |
| Answer leakage | n/a | `solution`, `wrongSolutions` and quiz `correct`/`why` are stripped from public payloads; solutions only via explicit "Show solution" endpoints, quizzes graded server-side |
| History | stored, list only | rejected runs recorded too; **Replay this code** reloads any run into its task or lesson |
| Tests over content | loader tests only | every reference / wrong / starter walked against real Postgres in pytest **and** node:test |

## Per track

### Python · SQLAlchemy (`python-sqlalchemy`)
- **Gaps:** lessons not runnable; no advanced topics; rel-09 didn't check data; validation lesson (11) only described `@validates`; runner errors had no line numbers.
- **Fixed / added:**
  - All 17 lessons runnable:
    - 01 prints `SELECT 1` and is checked by `stdout`
    - 11 calls your `@validates` method with good and bad input (`calls`)
    - 13 indexes and 14 CHECK/UNIQUE/defaults (`probes` insert a bad row inside a rolled-back transaction)
    - 15 transactions (rollback on error)
    - 12, 16 and 17 are quizzes
  - Tasks rel-11 and rel-12 added.
  - Runner:
    - forked child process with a timeout
    - import allow-list, also covering `from x import name` aliases
    - learner code runs as module `__lab__` so SQLAlchemy can resolve `Mapped[...]` annotations
    - line numbers on errors

### Node · TypeScript (`node-typescript`)
- **Gaps:** lessons not runnable; the translator's naming differed from real Prisma; unknown Prisma syntax gave no line-numbered error; Zod lesson was a prompt only.
- **Fixed / added:**
  - Lessons:
    - 01 checks the `datasource` block (provider, `env("DATABASE_URL")`, no hard-coded URL)
    - 11 is a Zod lab: your schema must accept the valid cases and reject the invalid ones (`accepts-invalid` / `rejects-valid`)
    - 13 and 14 cover indexes/unique
    - 12 and 15–17 are quizzes (the lab doesn't run Prisma Client code)
  - Translator rewritten (see table).
  - Tasks rel-11 and rel-12 added.
  - The schema is applied in one transaction, so a failing run leaves the previous lab tables intact.

### Node · JavaScript (`node-javascript`)
- Same gaps and fixes as TypeScript (same runner and gate).
- JS-specific notes (Zod at JS boundaries, no `z.infer`) in starters and lesson text.

### Zod / validation (lesson 11 of both Node tracks + manifest validation catalog)
- **Gap:** description only.
- **Fix:** runnable Zod lab. It interprets a whitelisted subset of Zod builder calls (`z.object/string/number/int/email/min/max/optional/nullable/enum/array/boolean/date/...`) from the TypeScript AST and **never executes learner code**. It rejects `refine`/`transform`/functions, uses own-property access only and blocks prototype keys.

### Raw SQL (`sql-postgres`, new)
- **Gap:** SQL appeared only as "Equivalent SQL" panels, so there was no way to practise it.
- **Added:** 17 lessons and 12 tasks mirroring the ORM tracks. They are written as DDL/DML and run in one transaction as the non-superuser role `hub_lab`. Explicit `BEGIN`/`COMMIT`/`ROLLBACK` and stray non-`lab_` tables are rejected, there is a statement timeout, and error positions are turned into line numbers.

### Node vs React vs Next notes (lesson 12 "Where DB code lives", all 4 tracks)
- **Gap:** text only.
- **Fix:** graded quiz (where `PrismaClient`/sessions may live, `DATABASE_URL` exposure, Route Handlers vs Client Components). Each wrong answer explains why (`wrong-answer`), and the lesson links to the Next.js docs.

## Verified (see PR description for the exact runs)
- pytest (api-python) and node:test (api-node) both walk every reference, wrong solution and starter on all 4 tracks against Postgres.
- `python3 scripts/walk_solutions.py --via-bff` does the same over HTTP through the web proxy (4 × 29 items, 0 bad).
- Web: `tsc` + `next build`, plus a browser smoke test: lesson run (fail → solution → pass), quiz, task show-solution, history replay within a mode and across modes.

## Known limitations
- The DB tracks share one set of `lab_*` tables per database. Two runs at the same moment (two tabs, or pytest and node tests in parallel) can collide. Run the suites one after another.
- Prisma has no CHECK constraints, so lesson 14 on the Node tracks checks UNIQUE/defaults only; CHECK is covered in the Python and SQL tracks.
- The Node lab translates Prisma schema to DDL and doesn't run Prisma Client queries, so transactions, N+1 and migrations are quizzes there.
- The Zod lab supports a whitelisted subset of Zod, not the full library.
- The SQL track runs as `hub_lab` only when the API's database user can create roles (true in Compose). Otherwise it falls back to the API user, still inside a rolled-back-on-error transaction.
