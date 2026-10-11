# CONCEPTS — Database relationships & test automation learning guide

Structured like a focused SQLAlchemy / Prisma handbook: basics → advanced, with parallel **Node ORM**, **raw SQL**, and **validation** sections. Every section answers **what**, **why**, and points to **official references**.

---

## 1. Tables, columns, types

A **table** is a named collection of rows. Each **column** has a type (`INTEGER`, `VARCHAR`, `BOOLEAN`, `NUMERIC`, `TIMESTAMPTZ`, …).

**Why:** Relationships are edges between tables; without clear columns and types you cannot place foreign keys or write meaningful JOINs.

| Concept | SQLAlchemy 2 | Prisma | SQL |
|---------|--------------|--------|-----|
| Table | `class X(Base): __tablename__ = "lab_x"` | `model X { @@map("lab_x") }` | `CREATE TABLE lab_x (...)` |
| Column | `mapped_column(String(120))` | `name String` | `name VARCHAR(120)` |
| PK | `mapped_column(primary_key=True)` | `@id @default(autoincrement())` | `SERIAL PRIMARY KEY` |

**References:** [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) · [SQLAlchemy Mapped columns](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html) · [Prisma schema](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)

---

## 2. Primary keys

Uniquely identify rows. Prefer surrogate `id` integers for labs; natural keys (email, sku) often get `UNIQUE` as well.

**Why:** Every foreign key must reference a primary or unique key. No stable PK → no safe relationships.

---

## 3. Foreign keys

A column that **references** another table’s key. This is the physical basis of relationships; diagram lines follow FKs.

**Why:** ORM `relationship` / `@relation` without a real FK is only application sugar — Postgres will not enforce it, and this hub’s task gate will fail.

```sql
author_id INTEGER NOT NULL REFERENCES lab_authors(id)
```

```python
author_id: Mapped[int] = mapped_column(ForeignKey("lab_authors.id"))
```

```prisma
authorId Int @map("author_id")
author   LabAuthor @relation(fields: [authorId], references: [id])
```

**References:** [PostgreSQL FK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK) · [SQLAlchemy relationships](https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html) · [Prisma relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)

---

## 4. One-to-many (1:N)

One parent, many children. **FK on the child.**

**Why:** Duplicating parent data into every child row wastes space and drifts; a single FK keeps one source of truth.

Example: Publisher → Magazines.

ORM: `relationship()` / Prisma `magazines LabMagazine[]` on the parent; scalar FK on the child.

---

## 5. Many-to-one (N:1)

Same FK pattern as 1:N, viewed from the child (“many orders belong to one customer”).

**Why:** Cardinality language changes; the physical FK does not.

---

## 6. One-to-one (1:1)

Enforce with a **UNIQUE** foreign key (or shared primary key).

**Why:** Without UNIQUE, the database allows multiple children — accidental 1:N.

```sql
account_id INTEGER UNIQUE NOT NULL REFERENCES lab_accounts(id)
```

---

## 7. Many-to-many (M:N) + association table

No direct FK between the two principals — introduce an **association** (junction) table holding two FKs. Extra payload columns (`grade`, `enrolled_at`) live there.

**Why:** A single FK can only point one way; M:N needs a first-class edge table for integrity.

---

## 8. Self-referential

FK to the **same** table (manager → reports). Root rows use `NULL`.

**Why:** Hierarchies share one entity type; a second “managers” table would duplicate the shape.

---

## 9. Cascades & loading

- **DB-level:** `ON DELETE CASCADE` / `SET NULL` / `RESTRICT`
- **ORM-level:** SQLAlchemy `cascade="all, delete-orphan"`; Prisma `onDelete: Cascade`
- **Loading:** avoid N+1 — SQLAlchemy `selectinload` / `joinedload`; Prisma `include` / `select`

**Why:** Delete policy belongs in the database for correctness under every client; loading strategy belongs in the query for performance.

---

## 10. Insert + query across relationships

```sql
SELECT p.name, t.name AS team
FROM lab_players p
JOIN lab_teams t ON t.id = p.team_id;
```

**Why:** Normalized schemas store facts once; JOINs/includes reassemble the graph for reading.

**References:** [PostgreSQL joins](https://www.postgresql.org/docs/current/tutorial-join.html) · [Prisma Client](https://www.prisma.io/docs/orm/prisma-client)

---

## 11. Mini domain models

Combine 1:N and M:N (blog: authors → posts; posts ↔ tags). Sketch the ER diagram before coding.

**Why:** Real features mix patterns; designing first prevents thrashing the schema.

---

## Validation (Node ecosystem)

| Library | Role |
|---------|------|
| **Zod** | Runtime schemas for inserts/DTOs (`z.infer`) — [zod.dev](https://zod.dev/) |
| **Valibot** | Modular alternative validators |
| **ArkType** | Type-syntax validators (see catalog examples) |
| **pg** | Raw driver under Prisma/Drizzle — [node-postgres](https://node-postgres.com/) |

Validate **before** persistence. Never trust client JSON.

---

## ORM comparison (Node)

- **Prisma (primary in this hub):** schema DSL, generated client, migrations — [docs](https://www.prisma.io/docs)
- **Drizzle (comparison):** schema-as-TypeScript, SQL-like query builder — [relations](https://orm.drizzle.team/docs/relations)

---

## Runtimes: where DB code lives

1. **Plain Node / Python API** — `PrismaClient` / SQLAlchemy `Session` in the server process; `DATABASE_URL` in env.
2. **React SPA** — **no** DB credentials in the browser; call your API.
3. **Next.js App Router** — DB in Server Components / Route Handlers (Node runtime). This hub’s **`/api/*` BFF** is the learner-facing example — [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

**Why:** Secrets in client bundles are production incidents.

---

## Python parallel: Pydantic

Use Pydantic models as DTOs at the FastAPI boundary (same idea as Zod).

---

## Hub pedagogy tips

1. One platform: `docker compose up --build` → http://localhost:3000 → pick a track in the UI.
2. Unlock prerequisites only after reading them.
3. Add **required** fields first; extras are allowed by the task gate.
4. Read the **Equivalent SQL** panel and **Why** / **Pitfalls** every time you change a model.
5. Watch teach-along diagram highlights during/after a passing run.
6. Gate errors explain **why** — treat them as the next lesson, not just a red banner.

---

## Playwright test automation (Playwright Test 1.64)

The `playwright-typescript` track teaches UI + API automation against the hub's practice app. Short version of the ideas the gate enforces:

| Concept | What | Why | Reference |
|---|---|---|---|
| **Locators** | `getByRole`, `getByLabel`, `getByText`, `getByTestId`; chain/filter (`filter({ hasText })`, `locator.within()` new in 1.64) | Match what users see; survive markup/CSS refactors. CSS/XPath couple tests to implementation | [Locators](https://playwright.dev/docs/locators) |
| **Auto-waiting** | Actions wait for the element to be attached, visible, stable, enabled | No manual waits before clicks | [Actionability](https://playwright.dev/docs/actionability) |
| **Web-first assertions** | `await expect(locator).toBeVisible()/toHaveText()/toHaveURL()` retry until timeout | `expect(await el.isVisible())` checks once and races the page; `waitForTimeout` is either too slow or flaky | [Assertions](https://playwright.dev/docs/test-assertions) |
| **Always await** | Every action/assertion returns a promise | A missing `await` lets the test end before the check runs — it "passes" without checking | [Writing tests](https://playwright.dev/docs/writing-tests) |
| **Isolation** | Each test gets a fresh `BrowserContext` | No shared cookies/state; tests can run in any order and in parallel | [Isolation](https://playwright.dev/docs/browser-contexts) |
| **Fixtures & hooks** | `page`, `context`, `request`; `test.extend()` for your own; `beforeEach` | Setup is declared once and composed, not copy-pasted | [Fixtures](https://playwright.dev/docs/test-fixtures) |
| **Page Object Model** | Class wrapping locators + actions of one page | One place to update when the UI changes; tests read like the test case | [POM](https://playwright.dev/docs/pom) |
| **Auth state** | Setup project logs in once, `storageState` saved and reused | UI login per test is slow and makes every test fail when login breaks | [Authentication](https://playwright.dev/docs/auth) |
| **API testing** | `request` fixture / `page.request` (shares cookies) | Fast setup/teardown and backend checks without the UI | [API testing](https://playwright.dev/docs/api-testing) |
| **Network mocking** | `page.route()` + `route.fulfill()`; `waitForResponse()` | Deterministic edge cases (empty, error, slow) without a special backend | [Mock APIs](https://playwright.dev/docs/mock) |
| **Visual comparisons** | `toHaveScreenshot()` with `mask` for dynamic parts | Catches layout/styling regressions functional checks miss | [Visual comparisons](https://playwright.dev/docs/test-snapshots) |
| **Flakiness** | Same test, different results on identical runs | Usually a race (sleep, non-retrying check, shared state). Fix the wait; retries only hide it | [Retries](https://playwright.dev/docs/test-retries) |
| **Trace viewer** | Recorded actions, DOM snapshots, console, network per test | Debug a CI failure without re-running it | [Trace viewer](https://playwright.dev/docs/trace-viewer) |
| **Agents, MCP, CLI** | `npx playwright init-agents` (planner/generator/healer, since 1.56), bundled `npx playwright mcp` / `cli` (1.62), WebMCP (1.64) | AI-assisted planning/generation/healing — the output still has to pass the same review as hand-written tests | [Test agents](https://playwright.dev/docs/test-agents) · [Release notes](https://playwright.dev/docs/release-notes) |

**How the hub checks a "good" test (mutation idea):** a test that passes is not enough. For many tasks the runner re-runs your green tests against the app with a planted bug (`x-sut-bug` header, e.g. the welcome heading shows the wrong name). If your test still passes, it is too weak (`weak-test`). Task tests also run 3× (`repeatEach: 3`); `/api/orders` answers with varying latency per run, so a fixed sleep is flaky and a web-first assertion is not.

**Manual test case → automated test:** each step becomes an action with a user-facing locator; each expected result becomes a web-first assertion; preconditions become fixtures/hooks or API setup; test data becomes parameters (`for (const row of rows) test(...)`).

---

## Official references (index)

- [SQLAlchemy 2.0 ORM relationships](https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html)
- [SQLAlchemy Engine](https://docs.sqlalchemy.org/en/20/core/engines.html)
- [Prisma schema reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)
- [Drizzle relations](https://orm.drizzle.team/docs/relations)
- [Zod](https://zod.dev/)
- [PostgreSQL foreign keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
- [PostgreSQL joins](https://www.postgresql.org/docs/current/tutorial-join.html)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Playwright: [Docs](https://playwright.dev/docs/intro) · [Best practices](https://playwright.dev/docs/best-practices) · [Release notes](https://playwright.dev/docs/release-notes) · [v1.64.0 release](https://github.com/microsoft/playwright/releases/tag/v1.64.0) · [Docker image](https://playwright.dev/docs/docker)
