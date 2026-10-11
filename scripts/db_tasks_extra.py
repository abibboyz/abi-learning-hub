"""Raw-SQL solutions for rel-01..10 (sql-postgres track) and the advanced tasks rel-11 / rel-12 (all tracks)."""
from __future__ import annotations

import json
from pathlib import Path

from db_solutions import py

ROOT = Path(__file__).resolve().parents[1]


def sql_equivalent(task_id: str) -> str:
    for f in (ROOT / "tracks" / "python-sqlalchemy" / "tasks").glob("*.json"):
        d = json.loads(f.read_text())
        if d["id"] == task_id:
            return d["sqlEquivalent"].rstrip() + "\n"
    raise KeyError(task_id)


def SQL_TASKS() -> dict:
    s = {tid: sql_equivalent(tid) for tid in [
        "rel-01-create-connect", "rel-02-types-pks", "rel-03-one-to-many", "rel-04-many-to-one", "rel-05-one-to-one",
        "rel-06-many-to-many", "rel-07-self-referential", "rel-08-cascades-loading", "rel-09-insert-query", "rel-10-mini-domain"]}
    s["rel-09-insert-query"] += (
        "\nINSERT INTO lab_teams (name) VALUES ('Reds'), ('Blues');\n"
        "INSERT INTO lab_players (name, team_id)\n"
        "  SELECT p.name, t.id FROM (VALUES ('Ana', 'Reds'), ('Ben', 'Reds'), ('Chen', 'Blues')) AS p(name, team)\n"
        "  JOIN lab_teams t ON t.name = p.team;\n\n"
        "SELECT p.name AS player, t.name AS team FROM lab_players p JOIN lab_teams t ON t.id = p.team_id ORDER BY p.name;\n"
    )
    w = {
        "rel-01-create-connect": [
            {"label": "author_id without REFERENCES", "expect": ["not-foreign-key"], "code": s["rel-01-create-connect"].replace(" REFERENCES lab_authors(id)", "")},
            {"label": "books table created first (parent missing)", "expect": ["runtime-error"], "code": "CREATE TABLE lab_books (\n  id SERIAL PRIMARY KEY,\n  author_id INTEGER NOT NULL REFERENCES lab_authors(id)\n);\nCREATE TABLE lab_authors (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\n"},
        ],
        "rel-02-types-pks": [
            {"label": "price as REAL (float)", "expect": ["wrong-type"], "code": s["rel-02-types-pks"].replace("NUMERIC(10,2)", "REAL")},
            {"label": "sku without UNIQUE", "expect": ["not-unique"], "code": s["rel-02-types-pks"].replace(" UNIQUE NOT NULL", " NOT NULL")},
        ],
        "rel-03-one-to-many": [
            {"label": "UNIQUE publisher_id (1:1)", "expect": ["must-not-be-unique"], "code": s["rel-03-one-to-many"].replace("publisher_id INTEGER NOT NULL", "publisher_id INTEGER NOT NULL UNIQUE")},
        ],
        "rel-04-many-to-one": [
            {"label": "customer_id nullable", "expect": ["must-be-not-null"], "code": s["rel-04-many-to-one"].replace("customer_id INTEGER NOT NULL", "customer_id INTEGER")},
        ],
        "rel-05-one-to-one": [
            {"label": "account_id not UNIQUE", "expect": ["not-unique"], "code": s["rel-05-one-to-one"].replace("account_id INTEGER UNIQUE NOT NULL", "account_id INTEGER NOT NULL")},
        ],
        "rel-06-many-to-many": [
            {"label": "no composite primary key", "expect": ["missing-composite-key"], "code": s["rel-06-many-to-many"].replace(",\n  PRIMARY KEY (learner_id, class_id)", "")},
        ],
        "rel-07-self-referential": [
            {"label": "manager_id NOT NULL", "expect": ["must-be-nullable"], "code": s["rel-07-self-referential"].replace("manager_id INTEGER REFERENCES", "manager_id INTEGER NOT NULL REFERENCES").replace(" ON DELETE SET NULL", "")},
        ],
        "rel-08-cascades-loading": [
            {"label": "no ON DELETE CASCADE", "expect": ["wrong-on-delete"], "code": s["rel-08-cascades-loading"].replace(" ON DELETE CASCADE", "")},
        ],
        "rel-09-insert-query": [
            {"label": "tables only, no rows", "expect": ["missing-data"], "code": sql_equivalent("rel-09-insert-query")},
        ],
        "rel-10-mini-domain": [
            {"label": "post_tags without PK, handle not unique", "expect": ["missing-composite-key", "not-unique"],
             "code": s["rel-10-mini-domain"].replace(",\n  PRIMARY KEY (post_id, tag_id)", "").replace("handle VARCHAR(80) UNIQUE NOT NULL", "handle VARCHAR(80) NOT NULL")},
        ],
    }
    return {tid: {"solution": s[tid], "wrong": w[tid]} for tid in s}


# ------------------------------------------------------------------------------------------ rel-11
R11_REQ = {"tables": [
    {"name": "lab_members", "columns": [{"name": "id", "pk": True}]},
    {"name": "lab_projects", "columns": [{"name": "id", "pk": True}]},
    {"name": "lab_memberships", "columns": [
        {"name": "member_id", "nullable": False, "fk": {"table": "lab_members", "column": "id", "onDelete": "CASCADE"}},
        {"name": "project_id", "nullable": False, "fk": {"table": "lab_projects", "column": "id", "onDelete": "CASCADE"}},
        {"name": "role", "type": "text", "nullable": False},
        {"name": "joined_at", "type": "timestamp", "nullable": False},
    ], "uniqueTogether": [["member_id", "project_id"]]},
]}
R11_PY = '''
from datetime import datetime
from sqlalchemy import DateTime, func


class LabMember(Base):
    __tablename__ = "lab_members"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    memberships: Mapped[list["LabMembership"]] = relationship(back_populates="member", cascade="all, delete-orphan")


class LabProject(Base):
    __tablename__ = "lab_projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    memberships: Mapped[list["LabMembership"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class LabMembership(Base):
    """Association OBJECT: the link itself carries data (role, joined_at)."""
    __tablename__ = "lab_memberships"
    member_id: Mapped[int] = mapped_column(ForeignKey("lab_members.id", ondelete="CASCADE"), primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("lab_projects.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[{role_t}] = mapped_column(String(40))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    member: Mapped[LabMember] = relationship(back_populates="memberships")
    project: Mapped[LabProject] = relationship(back_populates="memberships")
'''
R11_PY_SECONDARY = '''
from sqlalchemy import Column, Table

lab_memberships = Table(
    "lab_memberships",
    Base.metadata,
    Column("member_id", ForeignKey("lab_members.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", ForeignKey("lab_projects.id", ondelete="CASCADE"), primary_key=True),
)


class LabMember(Base):
    __tablename__ = "lab_members"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    projects: Mapped[list["LabProject"]] = relationship(secondary=lab_memberships)


class LabProject(Base):
    __tablename__ = "lab_projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
'''
R11_PRISMA = '''model LabMember {{
  id          Int             @id @default(autoincrement())
  name        String
  memberships LabMembership[]
  @@map("lab_members")
}}

model LabProject {{
  id          Int             @id @default(autoincrement())
  title       String
  memberships LabMembership[]
  @@map("lab_projects")
}}

model LabMembership {{
  memberId  Int        @map("member_id")
  projectId Int        @map("project_id")
  role      String{role_q}    @db.VarChar(40)
  joinedAt  DateTime   @default(now()) @map("joined_at")
  member    LabMember  @relation(fields: [memberId], references: [id], onDelete: Cascade)
  project   LabProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
{key}  @@map("lab_memberships")
}}
'''
R11_SQL = '''CREATE TABLE lab_members (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);
CREATE TABLE lab_projects (id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL);
CREATE TABLE lab_memberships (
  member_id  INTEGER NOT NULL REFERENCES lab_members(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES lab_projects(id) ON DELETE CASCADE,
  role       VARCHAR(40){role_nn},
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(){key}
);
'''
R11 = {
    "meta": {
        "id": "rel-11-association-object", "order": 11, "title": "Association object (M:N with payload)",
        "summary": "Members ↔ projects where the link itself has data: role and joined_at.",
        "why": "A plain junction only says *that* two rows are linked. As soon as the link has attributes (role, date, grade, quantity) it becomes a model of its own — an association object — with a composite key and its own columns.",
        "objectives": ["lab_members and lab_projects", "lab_memberships: member_id + project_id FKs (ON DELETE CASCADE), composite key", "role (NOT NULL text) and joined_at (NOT NULL timestamp, default now())"],
        "hints": ["Model the junction as a class/model, not a bare secondary table.", "The pair (member_id, project_id) is the key; role and joined_at are payload."],
        "pitfalls": ["Using relationship(secondary=...) — there is nowhere to store the role.", "Giving the junction a surrogate id and forgetting the composite UNIQUE."],
        "teachAlong": ["Cause: the link needs data.", "Effect: the junction becomes an entity with a composite key.", "Diagram: two FK arrows into lab_memberships plus its own columns."],
        "animation": {"highlightTables": ["lab_members", "lab_projects", "lab_memberships"], "highlightRels": ["lab_memberships.member_id", "lab_memberships.project_id"]},
        "references": [
            {"title": "SQLAlchemy 2.0 — Association Object", "url": "https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html#association-object"},
            {"title": "Prisma — Many-to-many relations (explicit)", "url": "https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations"},
            {"title": "PostgreSQL — Constraints", "url": "https://www.postgresql.org/docs/current/ddl-constraints.html"},
        ],
        "requirements": R11_REQ,
        "sqlEquivalent": R11_SQL.format(role_nn=" NOT NULL", key=",\n  PRIMARY KEY (member_id, project_id)"),
    },
    "python": {
        "starter": py('''
# TODO: LabMember (lab_members), LabProject (lab_projects)
# TODO: LabMembership (lab_memberships) — composite PK, role, joined_at
'''),
        "solution": py(R11_PY.format(role_t="str")),
        "wrong": [
            {"label": "plain secondary table — no role / joined_at", "expect": ["missing-column"], "code": py(R11_PY_SECONDARY)},
            {"label": "role optional", "expect": ["must-be-not-null"], "code": py(R11_PY.format(role_t="str | None"))},
        ],
    },
    "prisma": {
        "starter": "// TODO: LabMember, LabProject and the association model LabMembership (lab_memberships)\n",
        "solution": R11_PRISMA.format(role_q=" ", key="  @@id([memberId, projectId])\n"),
        "wrong": [
            {"label": "role optional", "expect": ["must-be-not-null"], "code": R11_PRISMA.format(role_q="?", key="  @@id([memberId, projectId])\n")},
            {"label": "no composite key (Prisma would also demand an @id)", "expect": ["rejected"], "code": R11_PRISMA.format(role_q=" ", key="")},
        ],
    },
    "sql": {
        "starter": "-- TODO: lab_members, lab_projects, lab_memberships (role, joined_at, composite key)\n",
        "solution": R11_SQL.format(role_nn=" NOT NULL", key=",\n  PRIMARY KEY (member_id, project_id)"),
        "wrong": [
            {"label": "no composite key", "expect": ["missing-composite-key"], "code": R11_SQL.format(role_nn=" NOT NULL", key="")},
            {"label": "role nullable", "expect": ["must-be-not-null"], "code": R11_SQL.format(role_nn="", key=",\n  PRIMARY KEY (member_id, project_id)")},
        ],
    },
}

# ------------------------------------------------------------------------------------------ rel-12
R12_BASE_TABLES = [
    {"name": "lab_stores", "columns": [{"name": "id", "pk": True}]},
    {"name": "lab_inventory", "columns": [
        {"name": "store_id", "nullable": False, "indexed": True, "fk": {"table": "lab_stores", "column": "id"}},
        {"name": "sku", "type": "text", "nullable": False, "unique": False},
        {"name": "quantity", "type": "integer", "nullable": False},
    ], "uniqueTogether": [["store_id", "sku"]]},
]
R12_PROBES_COMMON = [
    {"sql": ["INSERT INTO lab_stores (id, name) VALUES (1, 'North'), (2, 'South')",
             "INSERT INTO lab_inventory (store_id, sku, quantity) VALUES (1, 'A-1', 5), (2, 'A-1', 0)"],
     "message": "The same SKU in two stores (and a quantity of 0) must be accepted."},
    {"sql": ["INSERT INTO lab_stores (id, name) VALUES (1, 'North')",
             "INSERT INTO lab_inventory (store_id, sku, quantity) VALUES (1, 'A-1', 5), (1, 'A-1', 3)"],
     "expect": "error", "message": "The same SKU twice in one store must be rejected."},
]
R12_PROBE_CHECK = {"sql": ["INSERT INTO lab_stores (id, name) VALUES (1, 'North')",
                           "INSERT INTO lab_inventory (store_id, sku, quantity) VALUES (1, 'A-1', -1)"],
                   "expect": "error", "message": "A negative quantity must be rejected by a CHECK constraint."}
R12_PY = '''
from sqlalchemy import CheckConstraint, Index


class LabStore(Base):
    __tablename__ = "lab_stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabInventory(Base):
    __tablename__ = "lab_inventory"
    __table_args__ = (
{args}    )
    id: Mapped[int] = mapped_column(primary_key=True)
    store_id: Mapped[int] = mapped_column(ForeignKey("lab_stores.id"))
    sku: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[int] = mapped_column(Integer)
'''
R12_PY_ARGS = '''        UniqueConstraint("store_id", "sku", name="uq_inventory_store_sku"),
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity"),
'''
R12_PRISMA = '''model LabStore {{
  id        Int            @id @default(autoincrement())
  name      String
  inventory LabInventory[]
  @@map("lab_stores")
}}

model LabInventory {{
  id       Int      @id @default(autoincrement())
  storeId  Int      @map("store_id")
  sku      String   @db.VarChar(32)
  quantity Int
  store    LabStore @relation(fields: [storeId], references: [id])
{attrs}  @@map("lab_inventory")
}}
'''
R12_SQL = '''CREATE TABLE lab_stores (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);
CREATE TABLE lab_inventory (
  id       SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES lab_stores(id),
  sku      VARCHAR(32) NOT NULL,
  quantity INTEGER NOT NULL{check}{uniq}
);
{idx}'''
R12 = {
    "meta": {
        "id": "rel-12-constraints-indexes", "order": 12, "title": "Constraints & indexes",
        "summary": "Inventory per store: one row per (store, sku), never negative, fast lookups by store.",
        "why": "Business rules that every writer must respect belong in the database, not only in app code: a composite UNIQUE prevents duplicate stock rows, a CHECK stops negative quantities, and the composite UNIQUE's index (store_id first) also serves 'all items in a store' queries.",
        "objectives": ["lab_stores, lab_inventory (store_id FK, sku, quantity)", "UNIQUE (store_id, sku) — sku alone is NOT unique", "store_id indexed (leading column of an index)", "CHECK quantity >= 0 (Python/SQL; Prisma has no CHECK — see the lesson)"],
        "hints": ["A composite UNIQUE (store_id, sku) creates an index whose first column is store_id.", "The gate tries real INSERTs (rolled back) to prove the rules are enforced."],
        "pitfalls": ["UNIQUE on sku alone — the same SKU can no longer exist in two stores.", "Validating quantity only in app code — other writers bypass it."],
        "teachAlong": ["Cause: rules must hold for every writer.", "Effect: constraints + an index in Postgres.", "The gate inserts good and bad rows to prove it."],
        "animation": {"highlightTables": ["lab_stores", "lab_inventory"], "highlightRels": ["lab_inventory.store_id"]},
        "references": [
            {"title": "PostgreSQL — Constraints (CHECK, UNIQUE)", "url": "https://www.postgresql.org/docs/current/ddl-constraints.html"},
            {"title": "PostgreSQL — Multicolumn Indexes", "url": "https://www.postgresql.org/docs/current/indexes-multicolumn.html"},
            {"title": "SQLAlchemy — Constraints and Indexes", "url": "https://docs.sqlalchemy.org/en/20/core/constraints.html"},
            {"title": "Prisma — Indexes and @@unique", "url": "https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes"},
        ],
        "sqlEquivalent": R12_SQL.format(check=" CHECK (quantity >= 0)", uniq=",\n  UNIQUE (store_id, sku)", idx=""),
    },
    "req": {
        "python": {"tables": R12_BASE_TABLES, "probes": R12_PROBES_COMMON + [R12_PROBE_CHECK]},
        "sql": {"tables": R12_BASE_TABLES, "probes": R12_PROBES_COMMON + [R12_PROBE_CHECK]},
        "prisma": {"tables": R12_BASE_TABLES, "probes": R12_PROBES_COMMON},
    },
    "python": {
        "starter": py(R12_PY.format(args="        # TODO: composite UNIQUE and a CHECK\n")),
        "solution": py(R12_PY.format(args=R12_PY_ARGS)),
        "wrong": [
            {"label": "no CHECK — negative quantity accepted", "expect": ["constraint-not-enforced"], "code": py(R12_PY.format(args='        UniqueConstraint("store_id", "sku", name="uq_inventory_store_sku"),\n'))},
            {"label": "sku globally unique instead of per store", "expect": ["must-not-be-unique", "missing-composite-key", "probe-failed"],
             "code": py(R12_PY.format(args='        UniqueConstraint("sku", name="uq_inventory_sku"),\n        CheckConstraint("quantity >= 0", name="ck_inventory_quantity"),\n'))},
        ],
    },
    "prisma": {
        "starter": R12_PRISMA.format(attrs="  // TODO: one row per (store, sku)\n"),
        "solution": R12_PRISMA.format(attrs="  @@unique([storeId, sku])\n"),
        "wrong": [
            {"label": "@@unique([sku, storeId]) — store_id is not the leading index column", "expect": ["missing-index"], "code": R12_PRISMA.format(attrs="  @@unique([sku, storeId])\n")},
            {"label": "no uniqueness", "expect": ["missing-composite-key", "constraint-not-enforced", "missing-index"], "code": R12_PRISMA.format(attrs="")},
        ],
    },
    "sql": {
        "starter": R12_SQL.format(check=" /* TODO */", uniq="", idx="-- TODO: keep one row per (store, sku)\n"),
        "solution": R12_SQL.format(check=" CHECK (quantity >= 0)", uniq=",\n  UNIQUE (store_id, sku)", idx=""),
        "wrong": [
            {"label": "UNIQUE (sku, store_id) and no index on store_id", "expect": ["missing-index"], "code": R12_SQL.format(check=" CHECK (quantity >= 0)", uniq=",\n  UNIQUE (sku, store_id)", idx="")},
            {"label": "no CHECK", "expect": ["constraint-not-enforced"], "code": R12_SQL.format(check="", uniq=",\n  UNIQUE (store_id, sku)", idx="")},
        ],
    },
}
