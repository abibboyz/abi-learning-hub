# CONCEPTS — Database relationships learning guide

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
