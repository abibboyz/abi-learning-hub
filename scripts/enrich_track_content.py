#!/usr/bin/env python3
"""Enrich lessons/tasks with why, objectives, pitfalls, mapping, references, teach-along."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKS = ROOT / "tracks"

REFS = {
    "sqlalchemy_orm": {
        "title": "SQLAlchemy 2.0 — ORM Relationship Patterns",
        "url": "https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html",
    },
    "sqlalchemy_engine": {
        "title": "SQLAlchemy — Engine Configuration",
        "url": "https://docs.sqlalchemy.org/en/20/core/engines.html",
    },
    "sqlalchemy_mapped": {
        "title": "SQLAlchemy — Mapped Column Declarative",
        "url": "https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html",
    },
    "prisma_schema": {
        "title": "Prisma — Schema Reference",
        "url": "https://www.prisma.io/docs/orm/reference/prisma-schema-reference",
    },
    "prisma_relations": {
        "title": "Prisma — Relations",
        "url": "https://www.prisma.io/docs/orm/prisma-schema/data-model/relations",
    },
    "prisma_client": {
        "title": "Prisma Client API",
        "url": "https://www.prisma.io/docs/orm/prisma-client",
    },
    "drizzle": {
        "title": "Drizzle ORM — Relations",
        "url": "https://orm.drizzle.team/docs/relations",
    },
    "zod": {
        "title": "Zod — Schema validation",
        "url": "https://zod.dev/",
    },
    "postgres_fk": {
        "title": "PostgreSQL — Foreign Keys",
        "url": "https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK",
    },
    "postgres_create": {
        "title": "PostgreSQL — CREATE TABLE",
        "url": "https://www.postgresql.org/docs/current/sql-createtable.html",
    },
    "postgres_join": {
        "title": "PostgreSQL — Joins",
        "url": "https://www.postgresql.org/docs/current/tutorial-join.html",
    },
    "next_route": {
        "title": "Next.js — Route Handlers",
        "url": "https://nextjs.org/docs/app/building-your-application/routing/route-handlers",
    },
    "pg_node": {
        "title": "node-postgres (pg)",
        "url": "https://node-postgres.com/",
    },
}

LESSON_BANK = {
    "01-connections": {
        "title": "Connections & engines",
        "summary": "How applications open a durable channel to Postgres before any ORM work.",
        "why": (
            "Without a connection (engine/client/pool), every model definition is just text. "
            "The connection string decides host, database, credentials, and SSL — get this wrong "
            "and relationship labs fail before you write a single FK."
        ),
        "objectives": [
            "Explain what a DATABASE_URL encodes (user, password, host, port, database).",
            "Create an engine (SQLAlchemy) or PrismaClient / pg Pool (Node).",
            "Keep credentials server-side — never in browser bundles.",
        ],
        "pitfalls": [
            "Hard-coding passwords in committed files.",
            "Pointing the ORM at the wrong database (empty schema looks like 'broken' relationships).",
            "Opening a new connection per query instead of pooling.",
        ],
        "mappingNotes": (
            "SQLAlchemy: create_engine(DATABASE_URL) + Session. "
            "Prisma: datasource db { url = env(\"DATABASE_URL\") } + PrismaClient. "
            "Raw SQL: psql or pg.Pool with the same URL."
        ),
        "teachAlong": [
            "Cause: app needs to talk to Postgres.",
            "Effect: engine/client parses DATABASE_URL and opens TCP + auth.",
            "Next: metadata/models can CREATE TABLE against that live database.",
        ],
        "refs": ["sqlalchemy_engine", "prisma_client", "postgres_create", "pg_node", "next_route"],
        "examples": {
            "python": {
                "language": "python",
                "code": (
                    "from sqlalchemy import create_engine, text\n"
                    "from sqlalchemy.orm import Session\n\n"
                    "engine = create_engine(DATABASE_URL, pool_pre_ping=True)\n"
                    "with Session(engine) as session:\n"
                    "    session.execute(text('SELECT 1'))\n"
                ),
                "sql": "-- connection string shape\n-- postgresql://USER:PASSWORD@HOST:5432/DBNAME",
            },
            "typescript": {
                "language": "typescript",
                "code": (
                    "import { PrismaClient } from '@prisma/client'\n\n"
                    "const prisma = new PrismaClient()\n"
                    "await prisma.$queryRaw`SELECT 1`\n"
                ),
                "sql": "-- datasource url = env(\"DATABASE_URL\") in schema.prisma",
            },
            "javascript": {
                "language": "javascript",
                "code": (
                    "import { PrismaClient } from '@prisma/client'\n\n"
                    "const prisma = new PrismaClient()\n"
                    "await prisma.$queryRaw`SELECT 1`\n"
                ),
                "sql": "-- same Prisma client; validate inputs with Zod at boundaries",
            },
        },
        "exercise": {
            "prompt": "Create a client/engine from DATABASE_URL and run SELECT 1.",
            "hint": "SQLAlchemy Session or PrismaClient — credentials stay on the server.",
        },
    },
    "02-tables-columns": {
        "title": "Tables, columns & types",
        "summary": "Tables are named row collections; columns carry typed attributes.",
        "why": (
            "Relationships only make sense once tables and columns exist. Choosing VARCHAR vs TEXT, "
            "INTEGER vs UUID, and NOT NULL vs nullable shapes every FK and join you write later."
        ),
        "objectives": [
            "Map ORM field types to Postgres column types.",
            "Name tables intentionally (this hub uses lab_ prefixes for learner tables).",
            "Distinguish required vs optional columns.",
        ],
        "pitfalls": [
            "Mixing camelCase columns in DB with snake_case FKs without @map / key naming.",
            "Using overly wide TEXT everywhere — loses intent and check constraints.",
        ],
        "mappingNotes": (
            "SQLAlchemy mapped_column(String(120)) ↔ VARCHAR(120). "
            "Prisma String @db.VarChar(120) ↔ VARCHAR(120). "
            "@@map(\"lab_x\") / __tablename__ keep physical names stable."
        ),
        "teachAlong": [
            "Cause: you declare a model/table with typed fields.",
            "Effect: CREATE TABLE materializes columns in Postgres.",
            "Diagram: each table box lists those columns.",
        ],
        "refs": ["sqlalchemy_mapped", "prisma_schema", "postgres_create"],
        "examples": {
            "python": {
                "language": "python",
                "code": (
                    "class LabAuthor(Base):\n"
                    "    __tablename__ = 'lab_authors'\n"
                    "    id: Mapped[int] = mapped_column(primary_key=True)\n"
                    "    name: Mapped[str] = mapped_column(String(120))\n"
                ),
                "sql": "CREATE TABLE lab_authors (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);",
            },
            "typescript": {
                "language": "prisma",
                "code": (
                    "model LabAuthor {\n"
                    "  id   Int    @id @default(autoincrement())\n"
                    "  name String @db.VarChar(120)\n"
                    "  @@map(\"lab_authors\")\n"
                    "}\n"
                ),
                "sql": "CREATE TABLE lab_authors (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);",
            },
            "javascript": {
                "language": "prisma",
                "code": (
                    "model LabAuthor {\n"
                    "  id   Int    @id @default(autoincrement())\n"
                    "  name String @db.VarChar(120)\n"
                    "  @@map(\"lab_authors\")\n"
                    "}\n"
                ),
                "sql": "CREATE TABLE lab_authors (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);",
            },
        },
        "exercise": {
            "prompt": "Declare a lab_ table with at least id + one typed column.",
            "hint": "Match the physical table name the task gate expects.",
        },
    },
    "03-primary-keys": {
        "title": "Primary keys",
        "summary": "A PK uniquely identifies each row — the target of every foreign key.",
        "why": (
            "Foreign keys point at primary (or unique) keys. Without a stable PK, you cannot "
            "express 1:N, 1:1, or M:N safely, and ON DELETE behavior becomes undefined."
        ),
        "objectives": [
            "Mark a surrogate integer id as PRIMARY KEY.",
            "Explain why FKs reference PKs.",
            "Prefer stable surrogate keys in labs; add UNIQUE for natural keys separately.",
        ],
        "pitfalls": [
            "Forgetting @id / primary_key=True — table exists but relationships cannot attach.",
            "Composite PKs too early — fine in production, noisy while learning basics.",
        ],
        "mappingNotes": "SQLAlchemy primary_key=True ↔ Prisma @id ↔ SQL PRIMARY KEY.",
        "teachAlong": [
            "Cause: row needs a durable identity.",
            "Effect: PK constraint + index created.",
            "Later: child.publisher_id REFERENCES parent(id).",
        ],
        "refs": ["postgres_create", "sqlalchemy_mapped", "prisma_schema"],
        "examples": {
            "python": {
                "language": "python",
                "code": "id: Mapped[int] = mapped_column(primary_key=True)",
                "sql": "id SERIAL PRIMARY KEY",
            },
            "typescript": {
                "language": "prisma",
                "code": "id Int @id @default(autoincrement())",
                "sql": "id SERIAL PRIMARY KEY",
            },
            "javascript": {
                "language": "prisma",
                "code": "id Int @id @default(autoincrement())",
                "sql": "id SERIAL PRIMARY KEY",
            },
        },
        "exercise": {
            "prompt": "Ensure your lab table has an integer primary key named id.",
            "hint": "Task gate checks isPrimaryKey on id.",
        },
    },
    "04-foreign-keys": {
        "title": "Foreign keys",
        "summary": "An FK column stores the parent PK — the physical basis of relationships.",
        "why": (
            "Diagram lines and ORM relationship() / @relation are sugar over foreign keys. "
            "If the FK column (and constraint) is missing, joins and cascades have nothing to enforce."
        ),
        "objectives": [
            "Place the FK on the correct side (usually the 'many' / child).",
            "Reference parent_table(parent_pk).",
            "Read FK errors as 'relationship not yet real in the database'.",
        ],
        "pitfalls": [
            "Putting the FK on the parent for 1:N (backwards).",
            "ORM relationship without an actual FK column — looks fine in code, fails the gate.",
        ],
        "mappingNotes": (
            "SQLAlchemy ForeignKey('lab_authors.id') ↔ Prisma fields/references ↔ "
            "SQL REFERENCES lab_authors(id)."
        ),
        "teachAlong": [
            "Cause: child row must belong to a parent.",
            "Effect: child gets parent_id + FK constraint.",
            "Diagram: arrow from child column to parent PK.",
        ],
        "refs": ["postgres_fk", "sqlalchemy_orm", "prisma_relations"],
        "examples": {
            "python": {
                "language": "python",
                "code": "author_id: Mapped[int] = mapped_column(ForeignKey('lab_authors.id'))",
                "sql": "author_id INTEGER NOT NULL REFERENCES lab_authors(id)",
            },
            "typescript": {
                "language": "prisma",
                "code": (
                    "authorId Int @map(\"author_id\")\n"
                    "author   LabAuthor @relation(fields: [authorId], references: [id])"
                ),
                "sql": "author_id INTEGER NOT NULL REFERENCES lab_authors(id)",
            },
            "javascript": {
                "language": "prisma",
                "code": (
                    "authorId Int @map(\"author_id\")\n"
                    "author   LabAuthor @relation(fields: [authorId], references: [id])"
                ),
                "sql": "author_id INTEGER NOT NULL REFERENCES lab_authors(id)",
            },
        },
        "exercise": {
            "prompt": "Add a foreign key column that references another lab_ table's id.",
            "hint": "FK lives on the child / many side.",
        },
    },
    "05-one-to-many": {
        "title": "One-to-many (1:N)",
        "summary": "One parent owns many children — FK on the child.",
        "why": (
            "1:N is the most common business relationship (publisher→magazines, customer→orders). "
            "Modeling it correctly prevents duplicate parent rows and enables simple JOINs."
        ),
        "objectives": [
            "Create parent + child tables.",
            "Put publisher_id (or equivalent) on the child with FK.",
            "Optional: declare ORM collection on the parent (relationship / magazines Mag[]).",
        ],
        "pitfalls": [
            "Unique constraint on the FK accidentally turning 1:N into 1:1.",
            "Nullable FK when the domain requires every child to have a parent.",
        ],
        "mappingNotes": "Child FK + parent collection. SQL only needs the FK; ORM adds navigation.",
        "teachAlong": [
            "Cause: one publisher publishes many magazines.",
            "Effect: lab_magazines.publisher_id → lab_publishers.id.",
            "Gate: both tables + FK must exist; extras allowed.",
        ],
        "refs": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
        "examples": {
            "python": {
                "language": "python",
                "code": (
                    "class LabPublisher(Base):\n"
                    "    __tablename__ = 'lab_publishers'\n"
                    "    id: Mapped[int] = mapped_column(primary_key=True)\n"
                    "    name: Mapped[str] = mapped_column(String(120))\n"
                    "    magazines: Mapped[list['LabMagazine']] = relationship(back_populates='publisher')\n\n"
                    "class LabMagazine(Base):\n"
                    "    __tablename__ = 'lab_magazines'\n"
                    "    id: Mapped[int] = mapped_column(primary_key=True)\n"
                    "    title: Mapped[str] = mapped_column(String(200))\n"
                    "    publisher_id: Mapped[int] = mapped_column(ForeignKey('lab_publishers.id'))\n"
                    "    publisher: Mapped['LabPublisher'] = relationship(back_populates='magazines')\n"
                ),
                "sql": "FK publisher_id ON lab_magazines REFERENCES lab_publishers(id)",
            },
            "typescript": {
                "language": "prisma",
                "code": (
                    "model LabPublisher {\n  id Int @id @default(autoincrement())\n"
                    "  name String\n  magazines LabMagazine[]\n  @@map(\"lab_publishers\")\n}\n"
                    "model LabMagazine {\n  id Int @id @default(autoincrement())\n"
                    "  title String\n  publisherId Int @map(\"publisher_id\")\n"
                    "  publisher LabPublisher @relation(fields: [publisherId], references: [id])\n"
                    "  @@map(\"lab_magazines\")\n}\n"
                ),
                "sql": "FK publisher_id ON lab_magazines REFERENCES lab_publishers(id)",
            },
            "javascript": {
                "language": "prisma",
                "code": (
                    "model LabPublisher {\n  id Int @id @default(autoincrement())\n"
                    "  name String\n  magazines LabMagazine[]\n  @@map(\"lab_publishers\")\n}\n"
                    "model LabMagazine {\n  id Int @id @default(autoincrement())\n"
                    "  title String\n  publisherId Int @map(\"publisher_id\")\n"
                    "  publisher LabPublisher @relation(fields: [publisherId], references: [id])\n"
                    "  @@map(\"lab_magazines\")\n}\n"
                ),
                "sql": "FK publisher_id ON lab_magazines REFERENCES lab_publishers(id)",
            },
        },
        "exercise": {
            "prompt": "Model publishers that own many magazines (FK on magazines).",
            "hint": "Do not put a unique constraint on publisher_id.",
        },
    },
    "06-one-to-one": {
        "title": "One-to-one (1:1)",
        "summary": "Each parent pairs with at most one child — usually a UNIQUE FK.",
        "why": (
            "Profiles, settings, and credentials often share a 1:1 with a user/account. "
            "Without UNIQUE on the FK, the database silently allows multiple children (accidental 1:N)."
        ),
        "objectives": [
            "Implement 1:1 with a UNIQUE foreign key on the dependent table.",
            "Explain how UNIQUE changes cardinality vs plain 1:N.",
        ],
        "pitfalls": [
            "Forgetting UNIQUE — tests may pass until duplicate inserts appear.",
            "Shared primary key 1:1 is valid but harder to migrate; labs prefer UNIQUE FK.",
        ],
        "mappingNotes": "UNIQUE FK ↔ Prisma @unique on the FK field ↔ SQL UNIQUE.",
        "teachAlong": [
            "Cause: each account may have only one profile.",
            "Effect: profile.account_id UNIQUE REFERENCES accounts(id).",
            "Diagram: 1:1 line instead of 1:N fan-out.",
        ],
        "refs": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
        "examples": {
            "python": {
                "language": "python",
                "code": "account_id: Mapped[int] = mapped_column(ForeignKey('lab_accounts.id'), unique=True)",
                "sql": "account_id INTEGER UNIQUE NOT NULL REFERENCES lab_accounts(id)",
            },
            "typescript": {
                "language": "prisma",
                "code": "accountId Int @unique @map(\"account_id\")",
                "sql": "account_id INTEGER UNIQUE NOT NULL REFERENCES lab_accounts(id)",
            },
            "javascript": {
                "language": "prisma",
                "code": "accountId Int @unique @map(\"account_id\")",
                "sql": "account_id INTEGER UNIQUE NOT NULL REFERENCES lab_accounts(id)",
            },
        },
        "exercise": {
            "prompt": "Model a 1:1 with a UNIQUE foreign key.",
            "hint": "UNIQUE on the FK is what enforces one child per parent.",
        },
    },
    "07-many-to-many": {
        "title": "Many-to-many (M:N)",
        "summary": "Two principals associate via a junction table holding two FKs.",
        "why": (
            "Posts↔tags, students↔courses need M:N. A direct FK cannot express 'many on both sides' — "
            "the association table is the relational answer and can carry payload columns (grade, enrolled_at)."
        ),
        "objectives": [
            "Create two entity tables plus a junction with two FKs.",
            "Optionally add a composite PK or unique pair on (left_id, right_id).",
        ],
        "pitfalls": [
            "Trying to store arrays of ids in a column — loses referential integrity.",
            "Missing one of the two FKs so the gate fails.",
        ],
        "mappingNotes": (
            "SQLAlchemy secondary= / association object ↔ Prisma implicit/explicit m:n ↔ "
            "junction CREATE TABLE with two REFERENCES."
        ),
        "teachAlong": [
            "Cause: many posts share many tags.",
            "Effect: lab_post_tags(post_id, tag_id) with two FKs.",
            "Diagram: two lines into the junction.",
        ],
        "refs": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
        "examples": {
            "python": {
                "language": "python",
                "code": "# association table with post_id + tag_id foreign keys",
                "sql": "CREATE TABLE lab_post_tags (\n  post_id INT REFERENCES lab_posts(id),\n  tag_id INT REFERENCES lab_tags(id),\n  PRIMARY KEY (post_id, tag_id)\n);",
            },
            "typescript": {
                "language": "prisma",
                "code": "// explicit junction model or implicit many-to-many",
                "sql": "junction table with two FOREIGN KEYs",
            },
            "javascript": {
                "language": "prisma",
                "code": "// explicit junction model or implicit many-to-many",
                "sql": "junction table with two FOREIGN KEYs",
            },
        },
        "exercise": {
            "prompt": "Add a junction table with two foreign keys.",
            "hint": "Both FKs are required for M:N integrity.",
        },
    },
    "08-self-ref": {
        "title": "Self-referential relationships",
        "summary": "A table FK-references itself (manager → reports, category trees).",
        "why": (
            "Org charts and nested categories live in one table. A self-FK (nullable for roots) "
            "models hierarchy without inventing extra tables."
        ),
        "objectives": [
            "Add nullable parent_id / manager_id referencing the same table's id.",
            "Explain why roots use NULL.",
        ],
        "pitfalls": [
            "NOT NULL on parent_id — then you cannot insert the root row.",
            "Cycles without application checks.",
        ],
        "mappingNotes": "Same-table ForeignKey / Prisma self relation names (fields + references).",
        "teachAlong": [
            "Cause: employee reports to another employee.",
            "Effect: manager_id NULL REFERENCES lab_employees(id).",
            "Roots: manager_id IS NULL.",
        ],
        "refs": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
        "examples": {
            "python": {
                "language": "python",
                "code": "manager_id: Mapped[int | None] = mapped_column(ForeignKey('lab_employees.id'))",
                "sql": "manager_id INTEGER NULL REFERENCES lab_employees(id)",
            },
            "typescript": {
                "language": "prisma",
                "code": "managerId Int? @map(\"manager_id\")\nmanager LabEmployee? @relation(\"EmpTree\", fields: [managerId], references: [id])\nreports LabEmployee[] @relation(\"EmpTree\")",
                "sql": "manager_id INTEGER NULL REFERENCES lab_employees(id)",
            },
            "javascript": {
                "language": "prisma",
                "code": "managerId Int? @map(\"manager_id\")\nmanager LabEmployee? @relation(\"EmpTree\", fields: [managerId], references: [id])\nreports LabEmployee[] @relation(\"EmpTree\")",
                "sql": "manager_id INTEGER NULL REFERENCES lab_employees(id)",
            },
        },
        "exercise": {
            "prompt": "Add a self-referential nullable FK.",
            "hint": "Root rows need NULL.",
        },
    },
    "09-cascades": {
        "title": "Cascades & loading",
        "summary": "ON DELETE / ORM cascade and how you load related rows.",
        "why": (
            "Deleting a parent without a plan orphans children or fails the DELETE. "
            "Loading without include/selectinload causes N+1 queries in real apps."
        ),
        "objectives": [
            "Choose ON DELETE CASCADE vs SET NULL vs RESTRICT intentionally.",
            "Contrast DB-level ON DELETE with ORM cascade flags.",
            "Prefer explicit loading strategies for related collections.",
        ],
        "pitfalls": [
            "CASCADE everywhere — easy demos, dangerous production defaults.",
            "N+1 queries from lazy loads in a loop.",
        ],
        "mappingNotes": (
            "SQL ON DELETE CASCADE ↔ Prisma onDelete: Cascade ↔ SQLAlchemy "
            "ForeignKey(..., ondelete='CASCADE') / relationship cascade options."
        ),
        "teachAlong": [
            "Cause: parent row deleted.",
            "Effect: DB applies ON DELETE policy to child FKs.",
            "Loading: ask for related rows in one query when you need them.",
        ],
        "refs": ["postgres_fk", "sqlalchemy_orm", "prisma_relations"],
        "examples": {
            "python": {
                "language": "python",
                "code": "mapped_column(ForeignKey('lab_categories.id', ondelete='CASCADE'))",
                "sql": "category_id INTEGER REFERENCES lab_categories(id) ON DELETE CASCADE",
            },
            "typescript": {
                "language": "prisma",
                "code": "category LabCategory @relation(..., onDelete: Cascade)",
                "sql": "ON DELETE CASCADE",
            },
            "javascript": {
                "language": "prisma",
                "code": "category LabCategory @relation(..., onDelete: Cascade)",
                "sql": "ON DELETE CASCADE",
            },
        },
        "exercise": {
            "prompt": "Add an FK with an explicit ON DELETE policy.",
            "hint": "Match the task's required onDelete value.",
        },
    },
    "10-query-joins": {
        "title": "Insert & query across relationships",
        "summary": "Write rows that respect FKs, then JOIN / include to read graphs.",
        "why": (
            "Schema without queries is incomplete. Inserts must satisfy FKs; reads use JOINs "
            "(or ORM include) to reassemble the relationship graph you modeled."
        ),
        "objectives": [
            "Insert parent before child when FKs are required.",
            "Read across a relationship with JOIN or ORM navigation.",
        ],
        "pitfalls": [
            "Inserting child first → FK violation.",
            "Selecting only one table and wondering where related fields went.",
        ],
        "mappingNotes": "SQL JOIN ↔ SQLAlchemy selectinload/joinedload ↔ Prisma include/select.",
        "teachAlong": [
            "Cause: data is normalized across tables.",
            "Effect: JOIN/include reconstitutes the object graph.",
            "Validate: row counts and FK values match your intent.",
        ],
        "refs": ["postgres_join", "sqlalchemy_orm", "prisma_client"],
        "examples": {
            "python": {
                "language": "python",
                "code": "session.execute(select(LabMagazine).options(selectinload(LabMagazine.publisher)))",
                "sql": "SELECT m.title, p.name FROM lab_magazines m JOIN lab_publishers p ON p.id = m.publisher_id;",
            },
            "typescript": {
                "language": "typescript",
                "code": "prisma.labMagazine.findMany({ include: { publisher: true } })",
                "sql": "SELECT m.title, p.name FROM lab_magazines m JOIN lab_publishers p ON p.id = m.publisher_id;",
            },
            "javascript": {
                "language": "javascript",
                "code": "prisma.labMagazine.findMany({ include: { publisher: true } })",
                "sql": "SELECT m.title, p.name FROM lab_magazines m JOIN lab_publishers p ON p.id = m.publisher_id;",
            },
        },
        "exercise": {
            "prompt": "Sketch a JOIN that returns child rows with parent names.",
            "hint": "Join on the FK column you created earlier.",
        },
    },
    "11-validation": {
        "title": "Validation at boundaries",
        "summary": "Validate payloads before persistence — Zod / Pydantic / DB constraints.",
        "why": (
            "ORMs trust your inputs. Runtime schemas catch bad types and missing fields before "
            "they become integrity errors — or worse, corrupt data."
        ),
        "objectives": [
            "Validate DTOs with Zod (Node) or Pydantic (Python) before write.",
            "Treat DB constraints as the last line of defense, not the first.",
        ],
        "pitfalls": [
            "Trusting req.body / form JSON without parsing.",
            "Duplicating every DB rule in app code unnecessarily — prefer complementary checks.",
        ],
        "mappingNotes": "Zod z.infer ↔ Pydantic models ↔ DB NOT NULL / CHECK / FK.",
        "teachAlong": [
            "Cause: client sends untrusted JSON.",
            "Effect: schema parse succeeds → safe object; else 400 with details.",
            "Then: ORM/SQL write runs under constraints.",
        ],
        "refs": ["zod", "drizzle", "prisma_client"],
        "examples": {
            "python": {
                "language": "python",
                "code": "from pydantic import BaseModel\nclass MagazineIn(BaseModel):\n    title: str\n    publisher_id: int\n",
                "sql": "-- DB still enforces NOT NULL / FK",
            },
            "typescript": {
                "language": "typescript",
                "code": "import { z } from 'zod'\nconst MagazineIn = z.object({ title: z.string(), publisherId: z.number().int() })\n",
                "sql": "-- DB still enforces NOT NULL / FK",
            },
            "javascript": {
                "language": "javascript",
                "code": "import { z } from 'zod'\nconst MagazineIn = z.object({ title: z.string(), publisherId: z.number().int() })\n",
                "sql": "-- DB still enforces NOT NULL / FK",
            },
        },
        "exercise": {
            "prompt": "Define a small input schema for a child row (title + parent id).",
            "hint": "Validate before calling the ORM.",
        },
    },
    "12-frameworks": {
        "title": "Where DB code lives (runtimes)",
        "summary": "APIs, Next.js server routes, and SPAs — credentials never ship to the browser.",
        "why": (
            "Putting DATABASE_URL in client JS leaks secrets. Production hubs keep runners and "
            "queries on the server (this app's /api BFF is the learner-facing example)."
        ),
        "objectives": [
            "List safe places for DB access (API process, Next route handlers, workers).",
            "Explain why SPAs must call an API instead of opening Postgres.",
        ],
        "pitfalls": [
            "Importing Prisma/pg into Client Components.",
            "Edge runtimes without native driver support — prefer Node for DB labs.",
        ],
        "mappingNotes": "Browser → https://localhost:3000/api/* → internal runners → Postgres.",
        "teachAlong": [
            "Cause: learner picks a track in the UI.",
            "Effect: BFF routes to python or node runner internally.",
            "You never start a separate 'Python stack' or 'Node stack'.",
        ],
        "refs": ["next_route", "prisma_client", "sqlalchemy_engine"],
        "examples": {
            "python": {
                "language": "python",
                "code": "# FastAPI router uses SessionLocal — not exposed to the browser",
                "sql": "-- Postgres only reachable from compose network / server",
            },
            "typescript": {
                "language": "typescript",
                "code": "// Next.js Route Handler proxies /api/* to internal runners",
                "sql": "-- same database, one platform",
            },
            "javascript": {
                "language": "javascript",
                "code": "// Next.js Route Handler proxies /api/* to internal runners",
                "sql": "-- same database, one platform",
            },
        },
        "exercise": {
            "prompt": "Name three places DB credentials must never appear.",
            "hint": "Client bundles, public env without server-only prefix, screenshots of .env.",
        },
    },
}

TASK_WHY = {
    "rel-01": (
        "You need a connected schema baseline before relationship drills. "
        "Creating the first lab table proves the runner, database, and gate are wired."
    ),
    "rel-02": (
        "Types and primary keys are the anchors every FK will reference. "
        "Get PKs wrong and later relationship tasks cannot attach constraints."
    ),
    "rel-03": (
        "1:N is the workhorse relationship. Putting the FK on the magazine (child) "
        "is what lets one publisher own many magazines without duplicating publisher rows."
    ),
    "rel-04": (
        "Many-to-one is the same FK pattern viewed from the child — reinforcing that "
        "cardinality is about perspective, not a different physical mechanism."
    ),
    "rel-05": (
        "1:1 needs an extra UNIQUE on the FK. Without it the database allows accidental 1:N, "
        "which breaks profile/settings style domains."
    ),
    "rel-06": (
        "M:N cannot be a single FK. The junction table with two FKs preserves integrity "
        "and leaves room for association attributes."
    ),
    "rel-07": (
        "Hierarchies live in one table via a self-FK. Nullable manager_id is what allows root rows."
    ),
    "rel-08": (
        "Cascades encode delete policy in the database so apps do not leave orphans "
        "or rely only on ORM memory."
    ),
    "rel-09": (
        "Inserts must respect FKs; queries must JOIN/include to reassemble the graph — "
        "schema alone is not enough for production thinking."
    ),
    "rel-10": (
        "A mini domain combines 1:N and M:N so you practice designing before coding — "
        "the skill used on real features."
    ),
}

TASK_PITFALLS = {
    "rel-01": ["Wrong table name prefix — gate looks for lab_ tables.", "Forgetting create_all / migration so nothing appears in Postgres."],
    "rel-02": ["Column exists but is not marked PK.", "Using a non-integer id when the task expects SERIAL/Int @id."],
    "rel-03": ["FK on the parent instead of the child.", "UNIQUE on publisher_id accidentally making it 1:1."],
    "rel-04": ["Thinking N:1 needs a different FK placement than 1:N — it does not."],
    "rel-05": ["Missing UNIQUE on the FK column."],
    "rel-06": ["Only one FK on the junction table.", "Storing tag ids as a CSV/array column."],
    "rel-07": ["NOT NULL self-FK so the root cannot be inserted."],
    "rel-08": ["Relying on ORM cascade without setting DB ON DELETE when the task requires it."],
    "rel-09": ["Inserting child before parent.", "Forgetting to expose the FK column the JOIN needs."],
    "rel-10": ["Modeling M:N as a single FK.", "Skipping the association table."],
}

TASK_TEACH = {
    "rel-01": ["Cause: empty lab schema.", "Effect: first lab_ table appears in the diagram.", "Gate: required columns matched; extras allowed."],
    "rel-02": ["Cause: need stable row identity.", "Effect: PK constraint created.", "Next tasks will REFERENCE this id."],
    "rel-03": ["Cause: one publisher, many magazines.", "Effect: child.publisher_id FK → parent.id.", "Diagram highlights both tables + the FK line."],
    "rel-04": ["Cause: many children point at one parent.", "Effect: same FK pattern; wording is from the child view."],
    "rel-05": ["Cause: at most one child per parent.", "Effect: UNIQUE FK.", "Without UNIQUE, duplicates slip through."],
    "rel-06": ["Cause: many↔many.", "Effect: junction with two FKs.", "Diagram shows two arrows into the junction."],
    "rel-07": ["Cause: hierarchy in one entity.", "Effect: nullable self-FK.", "NULL = root."],
    "rel-08": ["Cause: parent deleted.", "Effect: ON DELETE policy runs.", "Match the required cascade exactly."],
    "rel-09": ["Cause: normalized data.", "Effect: INSERT order + JOIN/include to read."],
    "rel-10": ["Cause: realistic feature domain.", "Effect: combine patterns; sketch ER first."],
}

TASK_REFS = {
    "rel-01": ["postgres_create", "sqlalchemy_mapped", "prisma_schema"],
    "rel-02": ["postgres_create", "sqlalchemy_mapped", "prisma_schema"],
    "rel-03": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
    "rel-04": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
    "rel-05": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
    "rel-06": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
    "rel-07": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
    "rel-08": ["postgres_fk", "sqlalchemy_orm", "prisma_relations"],
    "rel-09": ["postgres_join", "prisma_client", "sqlalchemy_orm"],
    "rel-10": ["sqlalchemy_orm", "prisma_relations", "postgres_fk"],
}


def lang_for_track(track_id: str) -> str:
    if "typescript" in track_id:
        return "typescript"
    if "javascript" in track_id:
        return "javascript"
    return "python"


def refs_list(keys: list[str]) -> list[dict]:
    out = []
    for k in keys:
        if k in REFS:
            out.append(REFS[k])
    return out


def task_key(task_id: str) -> str:
    # rel-03-one-to-many → rel-03
    parts = task_id.split("-")
    if len(parts) >= 2 and parts[0] == "rel":
        return f"{parts[0]}-{parts[1]}"
    return task_id


def enrich_lesson(path: Path, track_id: str) -> None:
    data = json.loads(path.read_text())
    lid = data.get("id") or path.stem
    # normalize id like 05-one-to-many
    bank_key = lid if lid in LESSON_BANK else path.stem
    bank = LESSON_BANK.get(bank_key)
    if not bank:
        # soft enrich
        data.setdefault("why", data.get("summary") or data.get("title"))
        data.setdefault("objectives", [f"Understand {data.get('title')}"])
        data.setdefault("pitfalls", ["Skipping the equivalent SQL panel."])
        data.setdefault("references", refs_list(["postgres_fk"]))
        path.write_text(json.dumps(data, indent=2) + "\n")
        return

    lang = lang_for_track(track_id)
    example = bank["examples"].get(lang) or bank["examples"]["python"]
    data["title"] = bank["title"]
    data["summary"] = bank["summary"]
    data["body"] = (
        f"{bank['summary']}\n\n"
        f"Why it matters: {bank['why']}\n\n"
        f"SQL ↔ ORM: {bank['mappingNotes']}"
    )
    data["why"] = bank["why"]
    data["objectives"] = bank["objectives"]
    data["pitfalls"] = bank["pitfalls"]
    data["mappingNotes"] = bank["mappingNotes"]
    data["teachAlong"] = bank["teachAlong"]
    data["references"] = refs_list(bank["refs"])
    data["example"] = example
    data["exercise"] = bank["exercise"]
    path.write_text(json.dumps(data, indent=2) + "\n")


def enrich_task(path: Path, track_id: str) -> None:
    data = json.loads(path.read_text())
    tid = data.get("id", "")
    key = task_key(tid)
    why = TASK_WHY.get(key)
    if why:
        data["why"] = why
        # Expand description with why
        base = data.get("description") or data.get("summary") or data.get("title")
        data["description"] = f"{base}\n\nWhy: {why}"
        data["summary"] = data.get("summary") or base
    data["pitfalls"] = TASK_PITFALLS.get(key, data.get("pitfalls") or [
        "Missing required FK or PK the gate expects.",
        "Creating tables with names that do not match lab_ requirements.",
    ])
    data["teachAlong"] = TASK_TEACH.get(key, data.get("teachAlong") or [
        "Cause: incomplete schema vs requirements.",
        "Effect: gate lists precise missing pieces — fix those, extras are fine.",
    ])
    data["references"] = refs_list(TASK_REFS.get(key, ["postgres_fk", "sqlalchemy_orm", "prisma_relations"]))
    if not data.get("mappingNotes"):
        data["mappingNotes"] = (
            "Compare your ORM/schema code with the Equivalent SQL panel. "
            "The task gate introspects Postgres — only real tables/FKs count."
        )
    # Enrich hints with why-oriented tip
    hints = list(data.get("hints") or [])
    tip = "Read gate errors as cause→effect: each message names what Postgres still lacks."
    if tip not in hints:
        hints.append(tip)
    data["hints"] = hints
    path.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    for track_dir in sorted(TRACKS.iterdir()):
        if not track_dir.is_dir() or track_dir.name.startswith("."):
            continue
        if track_dir.name == "README.md":
            continue
        track_id = track_dir.name
        for lesson in sorted((track_dir / "lessons").glob("*.json")):
            enrich_lesson(lesson, track_id)
            print("lesson", lesson)
        for task in sorted((track_dir / "tasks").glob("*.json")):
            enrich_task(task, track_id)
            print("task", task)


if __name__ == "__main__":
    main()
