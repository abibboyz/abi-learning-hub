# CONCEPTS — Database relationships learning guide

Structured like a focused SQLAlchemy / Prisma handbook: basics → advanced, with parallel **Node ORM**, **raw SQL**, and **validation** sections.

---

## 1. Tables, columns, types

A **table** is a named collection of rows. Each **column** has a type (`INTEGER`, `VARCHAR`, `BOOLEAN`, `NUMERIC`, `TIMESTAMPTZ`, …).

| Concept | SQLAlchemy 2 | Prisma | SQL |
|---------|--------------|--------|-----|
| Table | `class X(Base): __tablename__ = "lab_x"` | `model X { @@map("lab_x") }` | `CREATE TABLE lab_x (...)` |
| Column | `mapped_column(String(120))` | `name String` | `name VARCHAR(120)` |
| PK | `mapped_column(primary_key=True)` | `@id @default(autoincrement())` | `SERIAL PRIMARY KEY` |

---

## 2. Primary keys

Uniquely identify rows. Prefer surrogate `id` integers for labs; natural keys (email, sku) often get `UNIQUE` as well.

---

## 3. Foreign keys

A column that **references** another table’s key. This is the physical basis of relationships; diagram lines follow FKs.

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

---

## 4. One-to-many (1:N)

One parent, many children. **FK on the child.**

Example: Publisher → Magazines.

ORM: `relationship()` / Prisma `magazines LabMagazine[]` on the parent; scalar FK on the child.

---

## 5. Many-to-one (N:1)

Same FK pattern as 1:N, viewed from the child (“many orders belong to one customer”).

---

## 6. One-to-one (1:1)

Enforce with a **UNIQUE** foreign key (or shared primary key).

```sql
account_id INTEGER UNIQUE NOT NULL REFERENCES lab_accounts(id)
```

---

## 7. Many-to-many (M:N) + association table

No direct FK between the two principals — introduce an **association** (junction) table holding two FKs. Extra payload columns (`grade`, `enrolled_at`) live there.

---

## 8. Self-referential

FK to the **same** table (manager → reports). Root rows use `NULL`.

---

## 9. Cascades & loading

- **DB-level:** `ON DELETE CASCADE` / `SET NULL` / `RESTRICT`
- **ORM-level:** SQLAlchemy `cascade="all, delete-orphan"`; Prisma `onDelete: Cascade`
- **Loading:** avoid N+1 — SQLAlchemy `selectinload` / `joinedload`; Prisma `include` / `select`

---

## 10. Insert + query across relationships

```sql
SELECT p.name, t.name AS team
FROM lab_players p
JOIN lab_teams t ON t.id = p.team_id;
```

ORMs generate equivalent JOINs when you navigate relationships or use includes.

---

## 11. Mini domain models

Combine 1:N and M:N (blog: authors → posts; posts ↔ tags). Sketch the ER diagram before coding.

---

## Validation (Node ecosystem)

| Library | Role |
|---------|------|
| **Zod** | Runtime schemas for inserts/DTOs (`z.infer`) |
| **Valibot** | Modular alternative validators |
| **ArkType** | Type-syntax validators (see catalog examples) |
| **pg** | Raw driver under Prisma/Drizzle |

Validate **before** persistence. Never trust client JSON.

---

## ORM comparison (Node)

- **Prisma (primary in this hub):** schema DSL, generated client, migrations.
- **Drizzle (comparison):** schema-as-TypeScript, SQL-like query builder — see track `validationCatalog`.

---

## Runtimes: where DB code lives

1. **Plain Node API** — `PrismaClient` / `pg.Pool` in the server process; `DATABASE_URL` in env.
2. **React SPA** — **no** DB credentials in the browser; call your API.
3. **Next.js App Router** — DB in Server Components / Route Handlers (Node runtime). Edge runtimes may not support full `pg`/Prisma — prefer Node for DB.

---

## Python parallel: Pydantic

Use Pydantic models as DTOs at the FastAPI boundary (same idea as Zod).

---

## Hub pedagogy tips

1. Unlock prerequisites only after reading them.
2. Add **required** fields first; extras are allowed by the task gate.
3. Read the **Equivalent SQL** panel every time you change a model.
4. Watch the diagram highlights during/after a passing run.
