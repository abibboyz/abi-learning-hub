"""Runnable lesson exercises for the database tracks.

LESSONS[lesson_id] = {
  "req": shared requirements (tables / uniqueTogether / probes),
  "python" | "prisma" | "sql": {"prompt", "hint", "starter", "solution", "wrong": [{label, expect, code}], "req": extra},
  or "quiz": [...questions] (all tracks),
}
`prisma` is used by node-typescript and node-javascript; `sql` by sql-postgres.
"""
from __future__ import annotations

from db_solutions import py

IMPORTS_VALIDATES = "from sqlalchemy.orm import validates\n"


def pyx(body: str, extra_imports: str = "", tail: str | None = None) -> str:
    code = py(body) if tail is None else py(body, tail)
    return code.replace("\n\nclass Base", extra_imports + "\n\nclass Base", 1) if extra_imports else code


LESSONS: dict[str, dict] = {}

# ------------------------------------------------------------------ 01 connections
LESSONS["01-connections"] = {
    "python": {
        "prompt": "Create an engine from DATABASE_URL, open a connection, run SELECT 1 and print the result.",
        "hint": "create_engine(DATABASE_URL) → engine.connect() → conn.execute(text('SELECT 1')).scalar().",
        "starter": "from sqlalchemy import create_engine, text\n\n# TODO: engine from DATABASE_URL, run SELECT 1, print the scalar result\n",
        "solution": "from sqlalchemy import create_engine, text\n\nengine = create_engine(DATABASE_URL, pool_pre_ping=True)\nwith engine.connect() as conn:\n    print(conn.execute(text(\"SELECT 1\")).scalar())\n",
        "req": {"stdout": {"contains": "1", "message": "Print the value SELECT 1 returns."}},
        "wrong": [
            {"label": "runs the query but never prints it", "expect": ["missing-output"],
             "code": "from sqlalchemy import create_engine, text\n\nengine = create_engine(DATABASE_URL)\nwith engine.connect() as conn:\n    conn.execute(text(\"SELECT 1\"))\n"},
            {"label": "hard-coded URL to a database that is not there", "expect": ["runtime-error"],
             "code": "from sqlalchemy import create_engine, text\n\nengine = create_engine(\"postgresql+psycopg://nobody:nopass@127.0.0.1:1/nowhere\")\nwith engine.connect() as conn:\n    print(conn.execute(text(\"SELECT 1\")).scalar())\n"},
        ],
    },
    "prisma": {
        "prompt": "Write the Prisma datasource block for this hub: PostgreSQL, URL from the DATABASE_URL environment variable.",
        "hint": "datasource db { provider = \"postgresql\"  url = env(\"DATABASE_URL\") }",
        "starter": "// TODO: datasource db { ... }\n\ngenerator client {\n  provider = \"prisma-client-js\"\n}\n",
        "solution": "datasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\ngenerator client {\n  provider = \"prisma-client-js\"\n}\n",
        "req": {"datasource": True},
        "wrong": [
            {"label": "password hard-coded in the schema", "expect": ["hardcoded-url"],
             "code": "datasource db {\n  provider = \"postgresql\"\n  url      = \"postgresql://hub:hub_secret@localhost:5432/learning_hub\"\n}\n"},
            {"label": "wrong provider", "expect": ["wrong-provider"],
             "code": "datasource db {\n  provider = \"mysql\"\n  url      = env(\"DATABASE_URL\")\n}\n"},
            {"label": "no datasource block at all", "expect": ["missing-datasource"],
             "code": "generator client {\n  provider = \"prisma-client-js\"\n}\n"},
        ],
    },
    "sql": {
        "prompt": "Run SELECT 1 — the lab prints every result set, so you will see the row come back.",
        "hint": "SELECT 1;",
        "starter": "-- TODO: ask Postgres for the number 1\n",
        "solution": "SELECT 1 AS ok;\n",
        "req": {"stdout": {"contains": "1", "message": "Return the value 1 from a SELECT."}},
        "wrong": [
            {"label": "typo in the keyword", "expect": ["runtime-error"], "code": "SELEC 1;\n"},
            {"label": "selects a different value", "expect": ["missing-output"], "code": "SELECT 'one' AS ok;\n"},
        ],
    },
}

# ------------------------------------------------------------------ 02 tables & columns
LESSONS["02-tables-columns"] = {
    "req": {"tables": [{"name": "lab_l02_authors", "columns": [
        {"name": "id", "pk": True, "type": "integer"},
        {"name": "name", "type": "text", "nullable": False},
        {"name": "bio", "type": "text", "nullable": True},
    ]}]},
    "python": {
        "prompt": "Declare lab_l02_authors: integer id (PK), required name (String(120)), optional bio (Text).",
        "hint": "Mapped[str] is NOT NULL; Mapped[str | None] is nullable.",
        "starter": py('''
# TODO: class LabL02Author(Base) with __tablename__ = "lab_l02_authors"
'''),
        "solution": py('''
from sqlalchemy import Text


class LabL02Author(Base):
    __tablename__ = "lab_l02_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    bio: Mapped[str | None] = mapped_column(Text)
'''),
        "wrong": [
            {"label": "name declared Optional (nullable)", "expect": ["must-be-not-null"], "code": py('''
class LabL02Author(Base):
    __tablename__ = "lab_l02_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(120))
    bio: Mapped[str | None] = mapped_column(String(500))
''')},
            {"label": "table name without the l02 prefix", "expect": ["missing-table"], "code": py('''
class LabL02Author(Base):
    __tablename__ = "lab_authors_l02"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
''')},
        ],
    },
    "prisma": {
        "prompt": "Model LabL02Author → lab_l02_authors: Int id (autoincrement PK), required name (VarChar 120), optional bio.",
        "hint": "A `?` after the type makes the column nullable.",
        "starter": "model LabL02Author {\n  id Int @id @default(autoincrement())\n  // TODO: name, bio\n  @@map(\"lab_l02_authors\")\n}\n",
        "solution": "model LabL02Author {\n  id   Int     @id @default(autoincrement())\n  name String  @db.VarChar(120)\n  bio  String?\n  @@map(\"lab_l02_authors\")\n}\n",
        "wrong": [
            {"label": "name optional", "expect": ["must-be-not-null"], "code": "model LabL02Author {\n  id   Int     @id @default(autoincrement())\n  name String? @db.VarChar(120)\n  bio  String?\n  @@map(\"lab_l02_authors\")\n}\n"},
            {"label": "bio required", "expect": ["must-be-nullable"], "code": "model LabL02Author {\n  id   Int    @id @default(autoincrement())\n  name String @db.VarChar(120)\n  bio  String\n  @@map(\"lab_l02_authors\")\n}\n"},
        ],
    },
    "sql": {
        "prompt": "CREATE TABLE lab_l02_authors: id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, bio TEXT (nullable).",
        "hint": "Columns are nullable unless you say NOT NULL.",
        "starter": "CREATE TABLE lab_l02_authors (\n  id SERIAL PRIMARY KEY\n  -- TODO: name, bio\n);\n",
        "solution": "CREATE TABLE lab_l02_authors (\n  id   SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL,\n  bio  TEXT\n);\n",
        "wrong": [
            {"label": "forgot NOT NULL on name", "expect": ["must-be-not-null"], "code": "CREATE TABLE lab_l02_authors (\n  id   SERIAL PRIMARY KEY,\n  name VARCHAR(120),\n  bio  TEXT\n);\n"},
            {"label": "missing comma", "expect": ["runtime-error"], "code": "CREATE TABLE lab_l02_authors (\n  id   SERIAL PRIMARY KEY\n  name VARCHAR(120) NOT NULL\n);\n"},
        ],
    },
}

# ------------------------------------------------------------------ 03 primary keys
LESSONS["03-primary-keys"] = {
    "req": {"tables": [
        {"name": "lab_l03_countries", "columns": [{"name": "code", "pk": True, "type": "text"}, {"name": "name", "nullable": False}]},
        {"name": "lab_l03_cities", "columns": [{"name": "id", "pk": True, "type": "integer"}, {"name": "name"}]},
    ]},
    "python": {
        "prompt": "Natural vs surrogate keys: lab_l03_countries keyed by its 2-letter `code` (String(2) PK), lab_l03_cities keyed by an integer id.",
        "hint": "primary_key=True works on any column type — not only integers.",
        "starter": py('''
# TODO: LabL03Country (code is the PK), LabL03City (integer id PK)
'''),
        "solution": py('''
class LabL03Country(Base):
    __tablename__ = "lab_l03_countries"
    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))


class LabL03City(Base):
    __tablename__ = "lab_l03_cities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
'''),
        "wrong": [
            {"label": "surrogate id on countries, code only unique", "expect": ["not-primary-key"], "code": py('''
class LabL03Country(Base):
    __tablename__ = "lab_l03_countries"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(2), unique=True)
    name: Mapped[str] = mapped_column(String(80))


class LabL03City(Base):
    __tablename__ = "lab_l03_cities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
''')},
        ],
    },
    "prisma": {
        "prompt": "LabL03Country keyed by `code String @id @db.Char(2)`; LabL03City keyed by an autoincrement Int id.",
        "hint": "@id can sit on a String field.",
        "starter": "// TODO: model LabL03Country (lab_l03_countries) and LabL03City (lab_l03_cities)\n",
        "solution": "model LabL03Country {\n  code String @id @db.Char(2)\n  name String\n  @@map(\"lab_l03_countries\")\n}\n\nmodel LabL03City {\n  id   Int    @id @default(autoincrement())\n  name String\n  @@map(\"lab_l03_cities\")\n}\n",
        "wrong": [
            {"label": "code is @unique, not the @id", "expect": ["not-primary-key"], "code": "model LabL03Country {\n  id   Int    @id @default(autoincrement())\n  code String @unique @db.Char(2)\n  name String\n  @@map(\"lab_l03_countries\")\n}\n\nmodel LabL03City {\n  id   Int    @id @default(autoincrement())\n  name String\n  @@map(\"lab_l03_cities\")\n}\n"},
            {"label": "model without any @id", "expect": ["rejected"], "code": "model LabL03Country {\n  code String @db.Char(2)\n  name String\n  @@map(\"lab_l03_countries\")\n}\n"},
        ],
    },
    "sql": {
        "prompt": "lab_l03_countries with code CHAR(2) PRIMARY KEY; lab_l03_cities with id SERIAL PRIMARY KEY.",
        "hint": "PRIMARY KEY = UNIQUE + NOT NULL + the default target of foreign keys.",
        "starter": "-- TODO: lab_l03_countries (natural key), lab_l03_cities (surrogate key)\n",
        "solution": "CREATE TABLE lab_l03_countries (\n  code CHAR(2) PRIMARY KEY,\n  name VARCHAR(80) NOT NULL\n);\n\nCREATE TABLE lab_l03_cities (\n  id   SERIAL PRIMARY KEY,\n  name VARCHAR(80) NOT NULL\n);\n",
        "wrong": [
            {"label": "code only UNIQUE", "expect": ["not-primary-key"], "code": "CREATE TABLE lab_l03_countries (\n  id SERIAL PRIMARY KEY,\n  code CHAR(2) UNIQUE,\n  name VARCHAR(80) NOT NULL\n);\nCREATE TABLE lab_l03_cities (id SERIAL PRIMARY KEY, name VARCHAR(80));\n"},
        ],
    },
}


# ------------------------------------------------------------------ 04 foreign keys
LESSONS["04-foreign-keys"] = {
    "req": {"tables": [
        {"name": "lab_l04_publishers", "columns": [{"name": "id", "pk": True}]},
        {"name": "lab_l04_magazines", "columns": [{"name": "publisher_id", "nullable": False, "fk": {"table": "lab_l04_publishers", "column": "id"}}]},
    ]},
    "python": {
        "prompt": "lab_l04_magazines.publisher_id must be a real FOREIGN KEY to lab_l04_publishers.id (NOT NULL).",
        "hint": "mapped_column(ForeignKey(\"lab_l04_publishers.id\")) — a plain Integer is not a foreign key.",
        "starter": py('''
class LabL04Publisher(Base):
    __tablename__ = "lab_l04_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


# TODO: LabL04Magazine with publisher_id → lab_l04_publishers.id
'''),
        "solution": py('''
class LabL04Publisher(Base):
    __tablename__ = "lab_l04_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL04Magazine(Base):
    __tablename__ = "lab_l04_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(ForeignKey("lab_l04_publishers.id"))
'''),
        "wrong": [
            {"label": "publisher_id is just an Integer", "expect": ["not-foreign-key"], "code": py('''
class LabL04Publisher(Base):
    __tablename__ = "lab_l04_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL04Magazine(Base):
    __tablename__ = "lab_l04_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(Integer)
''')},
        ],
    },
    "prisma": {
        "prompt": "LabL04Magazine.publisherId (@map(\"publisher_id\")) with @relation to LabL04Publisher — required.",
        "hint": "The FK lives on the side with `@relation(fields: [...], references: [...])`.",
        "starter": "model LabL04Publisher {\n  id        Int              @id @default(autoincrement())\n  name      String\n  magazines LabL04Magazine[]\n  @@map(\"lab_l04_publishers\")\n}\n\n// TODO: model LabL04Magazine\n",
        "solution": "model LabL04Publisher {\n  id        Int              @id @default(autoincrement())\n  name      String\n  magazines LabL04Magazine[]\n  @@map(\"lab_l04_publishers\")\n}\n\nmodel LabL04Magazine {\n  id          Int             @id @default(autoincrement())\n  title       String\n  publisherId Int             @map(\"publisher_id\")\n  publisher   LabL04Publisher @relation(fields: [publisherId], references: [id])\n  @@map(\"lab_l04_magazines\")\n}\n",
        "wrong": [
            {"label": "forgot @map on publisherId (column is \"publisherId\")", "expect": ["missing-column"], "code": "model LabL04Publisher {\n  id        Int              @id @default(autoincrement())\n  name      String\n  magazines LabL04Magazine[]\n  @@map(\"lab_l04_publishers\")\n}\n\nmodel LabL04Magazine {\n  id          Int             @id @default(autoincrement())\n  title       String\n  publisherId Int\n  publisher   LabL04Publisher @relation(fields: [publisherId], references: [id])\n  @@map(\"lab_l04_magazines\")\n}\n"},
            {"label": "no @relation (plain Int)", "expect": ["not-foreign-key"], "code": "model LabL04Publisher {\n  id   Int    @id @default(autoincrement())\n  name String\n  @@map(\"lab_l04_publishers\")\n}\n\nmodel LabL04Magazine {\n  id          Int    @id @default(autoincrement())\n  title       String\n  publisherId Int    @map(\"publisher_id\")\n  @@map(\"lab_l04_magazines\")\n}\n"},
        ],
    },
    "sql": {
        "prompt": "Create lab_l04_publishers and lab_l04_magazines with publisher_id INTEGER NOT NULL REFERENCES lab_l04_publishers(id).",
        "hint": "REFERENCES parent(id) creates the FK constraint.",
        "starter": "CREATE TABLE lab_l04_publishers (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\n\n-- TODO: lab_l04_magazines\n",
        "solution": "CREATE TABLE lab_l04_publishers (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\n\nCREATE TABLE lab_l04_magazines (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  publisher_id INTEGER NOT NULL REFERENCES lab_l04_publishers(id)\n);\n",
        "wrong": [
            {"label": "no REFERENCES", "expect": ["not-foreign-key"], "code": "CREATE TABLE lab_l04_publishers (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l04_magazines (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  publisher_id INTEGER NOT NULL\n);\n"},
            {"label": "child created before the parent", "expect": ["runtime-error"], "code": "CREATE TABLE lab_l04_magazines (\n  id SERIAL PRIMARY KEY,\n  publisher_id INTEGER NOT NULL REFERENCES lab_l04_publishers(id)\n);\nCREATE TABLE lab_l04_publishers (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\n"},
        ],
    },
}


# ---------------------------------------------------------------- parent/child builders (lessons 05–09)
def cls_name(table: str) -> str:
    """lab_l05_teams -> LabL05Team"""
    words = table.split("_")
    words[-1] = words[-1][:-1] if words[-1].endswith("s") else words[-1]
    return "".join(w.capitalize() for w in words)

def py_pc(pc, ct, pt, fk="parent_id", target=None, unique=None, nullable=False, ondelete=None, child_extra=""):
    """Python: parent class name pc (table pt) + child Ct… returns full code."""
    target = target or f"{pt}.id"
    fk_args = f'"{target}"' + (f', ondelete="{ondelete}"' if ondelete else "")
    kw = (", unique=True" if unique else "")
    typ = "int | None" if nullable else "int"
    child_cls = cls_name(ct)
    parent_cls = cls_name(pt)
    return py(f'''
class {parent_cls}(Base):
    __tablename__ = "{pt}"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class {child_cls}(Base):
    __tablename__ = "{ct}"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    {fk}: Mapped[{typ}] = mapped_column(ForeignKey({fk_args}){kw})
{child_extra}''')


def camel(name: str) -> str:
    a, *rest = name.split("_")
    return a + "".join(w.capitalize() for w in rest)


def prisma_pc(pt, ct, fk="parent_id", unique=False, optional=False, on_delete=None, list_side=True, map_fk=True):
    P = cls_name(pt)
    C = cls_name(ct)
    fkf = camel(fk)
    rel = "parent" if fk == "parent_id" else fk[:-3]
    q = "?" if optional else ""
    back = f"  children {C}[]\n" if list_side and not unique else (f"  child    {C}?\n" if list_side else "")
    od = f", onDelete: {on_delete}" if on_delete else ""
    attrs = (" @unique" if unique else "") + (f' @map("{fk}")' if map_fk else "")
    return (
        f"model {P} {{\n  id       Int    @id @default(autoincrement())\n  name     String\n{back}  @@map(\"{pt}\")\n}}\n\n"
        f"model {C} {{\n  id    Int    @id @default(autoincrement())\n  title String\n"
        f"  {fkf} Int{q}{attrs}\n  {rel} {P}{q} @relation(fields: [{fkf}], references: [id]{od})\n  @@map(\"{ct}\")\n}}\n"
    )


def sql_pc(pt, ct, fk="parent_id", unique=False, nullable=False, on_delete=None):
    cons = ("" if nullable else " NOT NULL") + (" UNIQUE" if unique else "")
    od = f" ON DELETE {on_delete}" if on_delete else ""
    return (
        f"CREATE TABLE {pt} (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\n\n"
        f"CREATE TABLE {ct} (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  {fk} INTEGER{cons} REFERENCES {pt}(id){od}\n);\n"
    )


def two_table_starter_py(pt):
    parent_cls = cls_name(pt)
    return py(f'''
class {parent_cls}(Base):
    __tablename__ = "{pt}"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


# TODO: the child model
''')


def two_table_starter_prisma(pt):
    P = cls_name(pt)
    return f"model {P} {{\n  id   Int    @id @default(autoincrement())\n  name String\n  @@map(\"{pt}\")\n}}\n\n// TODO: the child model\n"


def two_table_starter_sql(pt):
    return f"CREATE TABLE {pt} (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\n\n-- TODO: the child table\n"


# ------------------------------------------------------------------ 05 one-to-many
P, C = "lab_l05_teams", "lab_l05_players"
LESSONS["05-one-to-many"] = {
    "req": {"tables": [
        {"name": P, "columns": [{"name": "id", "pk": True}]},
        {"name": C, "columns": [{"name": "team_id", "nullable": False, "unique": False, "fk": {"table": P, "column": "id"}}]},
    ]},
    "python": {
        "prompt": "One team has many players: lab_l05_players.team_id → lab_l05_teams.id, NOT unique, NOT NULL.",
        "hint": "The FK goes on the MANY side. Do not mark it unique.",
        "starter": two_table_starter_py(P),
        "solution": py_pc(None, C, P, fk="team_id"),
        "wrong": [
            {"label": "unique=True on team_id (only one player per team)", "expect": ["must-not-be-unique"], "code": py_pc(None, C, P, fk="team_id", unique=True)},
            {"label": "FK on the team side instead", "expect": ["missing-column"], "code": py('''
class LabL05Player(Base):
    __tablename__ = "lab_l05_players"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabL05Team(Base):
    __tablename__ = "lab_l05_teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    player_id: Mapped[int] = mapped_column(ForeignKey("lab_l05_players.id"))
''')},
        ],
    },
    "prisma": {
        "prompt": "LabL05Team has `children LabL05Player[]`; LabL05Player has teamId (@map(\"team_id\")) + @relation. Not @unique.",
        "hint": "The list side (Team[]) has no column; the @relation side owns the FK.",
        "starter": two_table_starter_prisma(P),
        "solution": prisma_pc(P, C, fk="team_id"),
        "wrong": [
            {"label": "@unique on teamId", "expect": ["must-not-be-unique"], "code": prisma_pc(P, C, fk="team_id", unique=True)},
        ],
    },
    "sql": {
        "prompt": "lab_l05_players.team_id INTEGER NOT NULL REFERENCES lab_l05_teams(id) — no UNIQUE.",
        "hint": "Many rows may share the same team_id.",
        "starter": two_table_starter_sql(P),
        "solution": sql_pc(P, C, fk="team_id"),
        "wrong": [
            {"label": "UNIQUE team_id", "expect": ["must-not-be-unique"], "code": sql_pc(P, C, fk="team_id", unique=True)},
        ],
    },
}

# ------------------------------------------------------------------ 06 one-to-one
P, C = "lab_l06_users", "lab_l06_profiles"
LESSONS["06-one-to-one"] = {
    "req": {"tables": [
        {"name": P, "columns": [{"name": "id", "pk": True}]},
        {"name": C, "columns": [{"name": "user_id", "nullable": False, "unique": True, "fk": {"table": P, "column": "id"}}]},
    ]},
    "python": {
        "prompt": "Each user has at most one profile: lab_l06_profiles.user_id → lab_l06_users.id, UNIQUE and NOT NULL.",
        "hint": "1:1 = a foreign key + a UNIQUE constraint on it.",
        "starter": two_table_starter_py(P),
        "solution": py_pc(None, C, P, fk="user_id", unique=True),
        "wrong": [
            {"label": "FK without unique (that is 1:N)", "expect": ["not-unique"], "code": py_pc(None, C, P, fk="user_id")},
        ],
    },
    "prisma": {
        "prompt": "LabL06User has `child LabL06Profile?`; LabL06Profile.userId is @unique @map(\"user_id\") with @relation.",
        "hint": "Prisma requires @unique on the FK of a 1:1 relation.",
        "starter": two_table_starter_prisma(P),
        "solution": prisma_pc(P, C, fk="user_id", unique=True),
        "wrong": [
            {"label": "userId not @unique", "expect": ["not-unique"], "code": prisma_pc(P, C, fk="user_id", unique=False)},
        ],
    },
    "sql": {
        "prompt": "lab_l06_profiles.user_id INTEGER NOT NULL UNIQUE REFERENCES lab_l06_users(id).",
        "hint": "UNIQUE on the FK column turns 1:N into 1:1.",
        "starter": two_table_starter_sql(P),
        "solution": sql_pc(P, C, fk="user_id", unique=True),
        "wrong": [
            {"label": "no UNIQUE", "expect": ["not-unique"], "code": sql_pc(P, C, fk="user_id")},
        ],
    },
}

# ------------------------------------------------------------------ 07 many-to-many
LESSONS["07-many-to-many"] = {
    "req": {"tables": [
        {"name": "lab_l07_students", "columns": [{"name": "id", "pk": True}]},
        {"name": "lab_l07_courses", "columns": [{"name": "id", "pk": True}]},
        {"name": "lab_l07_enrollments", "columns": [
            {"name": "student_id", "nullable": False, "fk": {"table": "lab_l07_students", "column": "id"}},
            {"name": "course_id", "nullable": False, "fk": {"table": "lab_l07_courses", "column": "id"}},
        ], "uniqueTogether": [["student_id", "course_id"]]},
    ]},
    "python": {
        "prompt": "Students ↔ courses through lab_l07_enrollments with a composite primary key (student_id, course_id).",
        "hint": "primary_key=True on BOTH FK columns gives a composite PK.",
        "starter": py('''
class LabL07Student(Base):
    __tablename__ = "lab_l07_students"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL07Course(Base):
    __tablename__ = "lab_l07_courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


# TODO: LabL07Enrollment (lab_l07_enrollments)
'''),
        "solution": py('''
class LabL07Student(Base):
    __tablename__ = "lab_l07_students"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL07Course(Base):
    __tablename__ = "lab_l07_courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabL07Enrollment(Base):
    __tablename__ = "lab_l07_enrollments"
    student_id: Mapped[int] = mapped_column(ForeignKey("lab_l07_students.id"), primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("lab_l07_courses.id"), primary_key=True)
'''),
        "wrong": [
            {"label": "surrogate id only — the same pair can be inserted twice", "expect": ["missing-composite-key"], "code": py('''
class LabL07Student(Base):
    __tablename__ = "lab_l07_students"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL07Course(Base):
    __tablename__ = "lab_l07_courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))


class LabL07Enrollment(Base):
    __tablename__ = "lab_l07_enrollments"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("lab_l07_students.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("lab_l07_courses.id"))
''')},
        ],
    },
    "prisma": {
        "prompt": "Explicit M:N: model LabL07Enrollment (lab_l07_enrollments) with studentId + courseId relations and @@id([studentId, courseId]).",
        "hint": "Implicit `courses LabL07Course[]` on both sides makes Prisma create its own _CourseToStudent table — the lab wants an explicit junction.",
        "starter": "model LabL07Student {\n  id          Int                @id @default(autoincrement())\n  name        String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_students\")\n}\n\nmodel LabL07Course {\n  id          Int                @id @default(autoincrement())\n  title       String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_courses\")\n}\n\n// TODO: model LabL07Enrollment\n",
        "solution": "model LabL07Student {\n  id          Int                @id @default(autoincrement())\n  name        String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_students\")\n}\n\nmodel LabL07Course {\n  id          Int                @id @default(autoincrement())\n  title       String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_courses\")\n}\n\nmodel LabL07Enrollment {\n  studentId Int           @map(\"student_id\")\n  courseId  Int           @map(\"course_id\")\n  student   LabL07Student @relation(fields: [studentId], references: [id])\n  course    LabL07Course  @relation(fields: [courseId], references: [id])\n  @@id([studentId, courseId])\n  @@map(\"lab_l07_enrollments\")\n}\n",
        "wrong": [
            {"label": "implicit M:N (no explicit junction model)", "expect": ["missing-table"], "code": "model LabL07Student {\n  id      Int            @id @default(autoincrement())\n  name    String\n  courses LabL07Course[]\n  @@map(\"lab_l07_students\")\n}\n\nmodel LabL07Course {\n  id       Int             @id @default(autoincrement())\n  title    String\n  students LabL07Student[]\n  @@map(\"lab_l07_courses\")\n}\n"},
            {"label": "junction with its own id and no @@unique", "expect": ["missing-composite-key"], "code": "model LabL07Student {\n  id          Int                @id @default(autoincrement())\n  name        String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_students\")\n}\n\nmodel LabL07Course {\n  id          Int                @id @default(autoincrement())\n  title       String\n  enrollments LabL07Enrollment[]\n  @@map(\"lab_l07_courses\")\n}\n\nmodel LabL07Enrollment {\n  id        Int           @id @default(autoincrement())\n  studentId Int           @map(\"student_id\")\n  courseId  Int           @map(\"course_id\")\n  student   LabL07Student @relation(fields: [studentId], references: [id])\n  course    LabL07Course  @relation(fields: [courseId], references: [id])\n  @@map(\"lab_l07_enrollments\")\n}\n"},
        ],
    },
    "sql": {
        "prompt": "lab_l07_enrollments(student_id, course_id) — both FKs, PRIMARY KEY (student_id, course_id).",
        "hint": "A table-level PRIMARY KEY (a, b) makes the pair unique.",
        "starter": "CREATE TABLE lab_l07_students (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l07_courses (id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL);\n\n-- TODO: lab_l07_enrollments\n",
        "solution": "CREATE TABLE lab_l07_students (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l07_courses (id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL);\n\nCREATE TABLE lab_l07_enrollments (\n  student_id INTEGER NOT NULL REFERENCES lab_l07_students(id),\n  course_id  INTEGER NOT NULL REFERENCES lab_l07_courses(id),\n  PRIMARY KEY (student_id, course_id)\n);\n",
        "wrong": [
            {"label": "no composite key", "expect": ["missing-composite-key"], "code": "CREATE TABLE lab_l07_students (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l07_courses (id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL);\nCREATE TABLE lab_l07_enrollments (\n  id SERIAL PRIMARY KEY,\n  student_id INTEGER NOT NULL REFERENCES lab_l07_students(id),\n  course_id  INTEGER NOT NULL REFERENCES lab_l07_courses(id)\n);\n"},
        ],
    },
}

# ------------------------------------------------------------------ 08 self-referential
SELF_PY = '''
class LabL08Category(Base):
    __tablename__ = "lab_l08_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[{typ}] = mapped_column(ForeignKey("lab_l08_categories.id"))
    parent: Mapped["LabL08Category | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["LabL08Category"]] = relationship(back_populates="parent")
'''
SELF_PRISMA = "model LabL08Category {{\n  id       Int              @id @default(autoincrement())\n  name     String\n  parentId Int{q}             @map(\"parent_id\")\n  parent   LabL08Category{q}  @relation(\"Tree\", fields: [parentId], references: [id])\n  children LabL08Category[] @relation(\"Tree\")\n  @@map(\"lab_l08_categories\")\n}}\n"
LESSONS["08-self-ref"] = {
    "req": {"tables": [{"name": "lab_l08_categories", "columns": [
        {"name": "parent_id", "nullable": True, "fk": {"table": "lab_l08_categories", "column": "id"}},
    ]}], "probes": [{
        "sql": ["INSERT INTO lab_l08_categories (id, name, parent_id) VALUES (1, 'Root', NULL), (2, 'Child', 1)"],
        "message": "The gate inserts a root category (parent_id NULL) and a child under it.",
    }]},
    "python": {
        "prompt": "A category tree: lab_l08_categories.parent_id → lab_l08_categories.id, nullable (the root has no parent).",
        "hint": "Mapped[int | None]; relationship(remote_side=[id]) for the parent side.",
        "starter": py('''
class LabL08Category(Base):
    __tablename__ = "lab_l08_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # TODO: parent_id (self FK), parent, children
'''),
        "solution": py(SELF_PY.format(typ="int | None")),
        "wrong": [
            {"label": "parent_id NOT NULL — the root cannot be inserted", "expect": ["must-be-nullable", "probe-failed"], "code": py(SELF_PY.format(typ="int"))},
        ],
    },
    "prisma": {
        "prompt": "Self-relation on LabL08Category: optional parentId (@map(\"parent_id\")), parent and children with a named relation.",
        "hint": "Both sides of a self-relation need the same @relation(\"Name\").",
        "starter": "model LabL08Category {\n  id   Int    @id @default(autoincrement())\n  name String\n  // TODO: parentId, parent, children\n  @@map(\"lab_l08_categories\")\n}\n",
        "solution": SELF_PRISMA.format(q="?"),
        "wrong": [
            {"label": "parentId required", "expect": ["must-be-nullable", "probe-failed"], "code": SELF_PRISMA.format(q="")},
        ],
    },
    "sql": {
        "prompt": "lab_l08_categories.parent_id INTEGER REFERENCES lab_l08_categories(id) — nullable.",
        "hint": "A table may reference itself.",
        "starter": "CREATE TABLE lab_l08_categories (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n  -- TODO: parent_id\n);\n",
        "solution": "CREATE TABLE lab_l08_categories (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL,\n  parent_id INTEGER REFERENCES lab_l08_categories(id)\n);\n",
        "wrong": [
            {"label": "parent_id NOT NULL", "expect": ["must-be-nullable", "probe-failed"], "code": "CREATE TABLE lab_l08_categories (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL,\n  parent_id INTEGER NOT NULL REFERENCES lab_l08_categories(id)\n);\n"},
        ],
    },
}

# ------------------------------------------------------------------ 09 cascades
P, C = "lab_l09_posts", "lab_l09_comments"
LESSONS["09-cascades"] = {
    "req": {"tables": [
        {"name": P, "columns": [{"name": "id", "pk": True}]},
        {"name": C, "columns": [{"name": "post_id", "nullable": False, "fk": {"table": P, "column": "id", "onDelete": "CASCADE"}}]},
    ], "probes": [{
        "sql": [
            f"INSERT INTO {P} (id, name) VALUES (1, 'Hello')",
            f"INSERT INTO {C} (title, post_id) VALUES ('First!', 1)",
            f"DELETE FROM {P} WHERE id = 1",
        ],
        "message": "The gate deletes a post that has a comment — the database must remove the comment with it.",
    }]},
    "python": {
        "prompt": "Deleting a post must delete its comments IN THE DATABASE: ForeignKey(..., ondelete=\"CASCADE\").",
        "hint": "relationship(cascade=\"all, delete-orphan\") only affects the ORM session — the FK needs ondelete.",
        "starter": two_table_starter_py(P),
        "solution": py_pc(None, C, P, fk="post_id", ondelete="CASCADE"),
        "wrong": [
            {"label": "no ON DELETE", "expect": ["wrong-on-delete", "probe-failed"], "code": py_pc(None, C, P, fk="post_id")},
            {"label": "SET NULL on a NOT NULL column", "expect": ["wrong-on-delete", "probe-failed"], "code": py_pc(None, C, P, fk="post_id", ondelete="SET NULL")},
        ],
    },
    "prisma": {
        "prompt": "LabL09Comment.postId → LabL09Post with onDelete: Cascade.",
        "hint": "@relation(fields: [postId], references: [id], onDelete: Cascade)",
        "starter": two_table_starter_prisma(P),
        "solution": prisma_pc(P, C, fk="post_id", on_delete="Cascade"),
        "wrong": [
            {"label": "default referential action", "expect": ["wrong-on-delete", "probe-failed"], "code": prisma_pc(P, C, fk="post_id")},
            {"label": "Restrict", "expect": ["wrong-on-delete", "probe-failed"], "code": prisma_pc(P, C, fk="post_id", on_delete="Restrict")},
        ],
    },
    "sql": {
        "prompt": "lab_l09_comments.post_id ... REFERENCES lab_l09_posts(id) ON DELETE CASCADE.",
        "hint": "Without ON DELETE the parent delete fails while children exist.",
        "starter": two_table_starter_sql(P),
        "solution": sql_pc(P, C, fk="post_id", on_delete="CASCADE"),
        "wrong": [
            {"label": "no ON DELETE", "expect": ["wrong-on-delete", "probe-failed"], "code": sql_pc(P, C, fk="post_id")},
        ],
    },
}


# ------------------------------------------------------------------ 10 query & joins
L10_MODELS = '''
class LabL10Publisher(Base):
    __tablename__ = "lab_l10_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    magazines: Mapped[list["LabL10Magazine"]] = relationship(back_populates="publisher")


class LabL10Magazine(Base):
    __tablename__ = "lab_l10_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(ForeignKey("lab_l10_publishers.id"))
    publisher: Mapped[LabL10Publisher] = relationship(back_populates="magazines")
'''
L10_INSERT = '''
from sqlalchemy import select
from sqlalchemy.orm import Session

engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)

with Session(engine) as session:
    acme = LabL10Publisher(name="Acme")
    globex = LabL10Publisher(name="Globex")
    session.add_all([
        LabL10Magazine(title="Monthly Review", publisher=acme),
        LabL10Magazine(title="Data Weekly", publisher=acme),
        LabL10Magazine(title="Outdoor Life", publisher=globex),
    ])
    session.commit()
{query}'''
L10_QUERY = '''
    stmt = select(LabL10Magazine.title, LabL10Publisher.name).join(LabL10Magazine.publisher).order_by(LabL10Magazine.title)
    for title, publisher in session.execute(stmt):
        print(f"{title} | {publisher}")
'''
L10_DATA = [{
    "sql": "SELECT count(*) FROM lab_l10_magazines m JOIN lab_l10_publishers p ON p.id = m.publisher_id",
    "min": 3,
    "message": "Insert 3 magazines that belong to publishers (and commit) — the JOIN must find them.",
}]
L10_PRISMA = "model LabL10Publisher {{\n  id        Int              @id @default(autoincrement())\n  name      String\n  magazines LabL10Magazine[]\n  @@map(\"lab_l10_publishers\")\n}}\n\nmodel LabL10Magazine {{\n  id          Int             @id @default(autoincrement())\n  title       String\n  publisherId Int             {map}\n  publisher   LabL10Publisher @relation(fields: [publisherId], references: [id])\n  @@map(\"lab_l10_magazines\")\n}}\n"
L10_SQL_SCHEMA = "CREATE TABLE lab_l10_publishers (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l10_magazines (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  publisher_id INTEGER NOT NULL REFERENCES lab_l10_publishers(id)\n);\n"
L10_SQL_INSERT = "\nINSERT INTO lab_l10_publishers (id, name) VALUES (1, 'Acme'), (2, 'Globex');\nINSERT INTO lab_l10_magazines (title, publisher_id) VALUES\n  ('Monthly Review', 1), ('Data Weekly', 1), ('Outdoor Life', 2);\n"
L10_SQL_SELECT = "\nSELECT m.title, p.name AS publisher\nFROM lab_l10_magazines m\nJOIN lab_l10_publishers p ON p.id = m.publisher_id\nORDER BY m.title;\n"
LESSONS["10-query-joins"] = {
    "req": {"tables": [
        {"name": "lab_l10_publishers", "columns": [{"name": "id", "pk": True}]},
        {"name": "lab_l10_magazines", "columns": [{"name": "publisher_id", "nullable": False, "fk": {"table": "lab_l10_publishers", "column": "id"}}]},
    ]},
    "python": {
        "prompt": "Insert 2 publishers and 3 magazines, commit, then SELECT magazine titles JOINed with publisher names and print them.",
        "hint": "session.commit() makes the rows visible to everyone else; select(...).join(LabL10Magazine.publisher).",
        "starter": py(L10_MODELS) + "\n# TODO: insert rows with a Session, commit, then run a JOIN and print each row\n",
        "solution": py(L10_MODELS, L10_INSERT.format(query=L10_QUERY)),
        "req": {"data": L10_DATA, "stdout": {"contains": "Monthly Review | Acme", "message": "Print each row as `title | publisher`."}},
        "wrong": [
            {"label": "never commits (rows vanish when the session closes)", "expect": ["missing-data"],
             "code": py(L10_MODELS, L10_INSERT.replace("    session.commit()\n", "    session.flush()\n").format(query=L10_QUERY))},
            {"label": "inserts but prints nothing", "expect": ["missing-output"], "code": py(L10_MODELS, L10_INSERT.format(query=""))},
        ],
    },
    "prisma": {
        "prompt": "Model publishers ← magazines so this JOIN works: SELECT m.title, p.name FROM lab_l10_magazines m JOIN lab_l10_publishers p ON p.id = m.publisher_id.",
        "hint": "The gate inserts sample rows and runs that exact JOIN (rolled back). In app code: prisma.labL10Magazine.findMany({ include: { publisher: true } }).",
        "starter": "model LabL10Publisher {\n  id   Int    @id @default(autoincrement())\n  name String\n  @@map(\"lab_l10_publishers\")\n}\n\n// TODO: model LabL10Magazine\n",
        "solution": L10_PRISMA.format(map='@map("publisher_id")'),
        "req": {"probes": [{
            "sql": [
                "INSERT INTO lab_l10_publishers (id, name) VALUES (1, 'Acme'), (2, 'Globex')",
                "INSERT INTO lab_l10_magazines (title, publisher_id) VALUES ('Monthly Review', 1), ('Data Weekly', 1), ('Outdoor Life', 2)",
                "SELECT m.title, p.name FROM lab_l10_magazines m JOIN lab_l10_publishers p ON p.id = m.publisher_id",
            ],
            "minRows": 3,
            "message": "The gate inserts 2 publishers + 3 magazines and runs the JOIN.",
        }]},
        "wrong": [
            {"label": "publisherId without @map — the JOIN on publisher_id fails", "expect": ["missing-column", "probe-failed"], "code": L10_PRISMA.format(map="")},
        ],
    },
    "sql": {
        "prompt": "Create both tables, insert 2 publishers + 3 magazines, then SELECT title + publisher name with a JOIN.",
        "hint": "JOIN lab_l10_publishers p ON p.id = m.publisher_id",
        "starter": L10_SQL_SCHEMA + "\n-- TODO: INSERT rows, then SELECT with a JOIN\n",
        "solution": L10_SQL_SCHEMA + L10_SQL_INSERT + L10_SQL_SELECT,
        "req": {"data": L10_DATA, "stdout": {"contains": "Monthly Review | Acme", "message": "SELECT title and publisher name, joined."}},
        "wrong": [
            {"label": "SELECT without inserting rows", "expect": ["missing-data", "missing-output"], "code": L10_SQL_SCHEMA + L10_SQL_SELECT},
            {"label": "cross join (no ON) — every magazine paired with every publisher", "expect": ["runtime-error"],
             "code": L10_SQL_SCHEMA + L10_SQL_INSERT + "\nSELECT m.title, p.name FROM lab_l10_magazines m JOIN lab_l10_publishers p;\n"},
        ],
    },
}

# ------------------------------------------------------------------ 11 validation
L11_PY = '''
class LabL11Magazine(Base):
    __tablename__ = "lab_l11_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    publisher_id: Mapped[int] = mapped_column(Integer)
{validators}'''
L11_VALIDATORS = '''
    @validates("title")
    def check_title(self, key, value):
        if not value or not value.strip():
            raise ValueError("title must not be empty")
        return value.strip()

    @validates("publisher_id")
    def check_publisher(self, key, value):
        if not isinstance(value, int) or value <= 0:
            raise ValueError("publisher_id must be a positive integer")
        return value
'''
L11_CALLS = [
    {"call": "LabL11Magazine", "kwargs": {"title": "Monthly Review", "publisher_id": 1}, "expect": "ok", "message": "A normal magazine must be accepted."},
    {"call": "LabL11Magazine", "kwargs": {"title": "   ", "publisher_id": 1}, "expect": "raises", "message": "A blank title must be rejected."},
    {"call": "LabL11Magazine", "kwargs": {"title": "Data Weekly", "publisher_id": 0}, "expect": "raises", "message": "publisher_id 0 must be rejected."},
]
ZOD_CASES = [
    {"input": {"title": "Monthly Review", "publisherId": 1}, "expect": "valid", "message": "A normal magazine must pass."},
    {"input": {"title": "", "publisherId": 1}, "expect": "invalid", "message": "An empty title must be rejected."},
    {"input": {"title": "   ", "publisherId": 1}, "expect": "invalid", "message": "A blank title (only spaces) must be rejected — trim before min(1)."},
    {"input": {"title": "Data Weekly", "publisherId": 1.5}, "expect": "invalid", "message": "publisherId must be an integer."},
    {"input": {"title": "Data Weekly", "publisherId": -3}, "expect": "invalid", "message": "publisherId must be positive."},
    {"input": {"title": "Data Weekly"}, "expect": "invalid", "message": "publisherId is required."},
]
ZOD_TS = 'import {{ z }} from "zod";\n\nexport const MagazineIn = z.object({{\n  title: {title},\n  publisherId: {pid},\n}});\n\nexport type MagazineIn = z.infer<typeof MagazineIn>;\n'
ZOD_JS = 'const {{ z }} = require("zod");\n\nconst MagazineIn = z.object({{\n  title: {title},\n  publisherId: {pid},\n}});\n\nmodule.exports = {{ MagazineIn }};\n'
L11_SQL = "CREATE TABLE lab_l11_magazines (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL{c1},\n  publisher_id INTEGER NOT NULL{c2}\n);\n"
LESSONS["11-validation"] = {
    "python": {
        "prompt": "Validate in the model: @validates rejects a blank title and a publisher_id ≤ 0 with ValueError.",
        "hint": "from sqlalchemy.orm import validates — the gate constructs LabL11Magazine(...) with good and bad values.",
        "starter": pyx(L11_PY.format(validators="    # TODO: @validates(\"title\") and @validates(\"publisher_id\")\n"), IMPORTS_VALIDATES),
        "solution": pyx(L11_PY.format(validators=L11_VALIDATORS), IMPORTS_VALIDATES),
        "req": {"tables": [{"name": "lab_l11_magazines", "columns": [{"name": "title"}, {"name": "publisher_id"}]}], "calls": L11_CALLS},
        "wrong": [
            {"label": "no validators", "expect": ["accepts-invalid"], "code": pyx(L11_PY.format(validators=""), IMPORTS_VALIDATES)},
            {"label": "checks `if not value` only (spaces pass)", "expect": ["accepts-invalid"], "code": pyx(L11_PY.format(
                validators=L11_VALIDATORS.replace("if not value or not value.strip():", "if not value:")), IMPORTS_VALIDATES)},
        ],
    },
    "prisma": {
        "prompt": "Write a Zod schema `MagazineIn`: title is a trimmed non-empty string, publisherId a positive integer.",
        "hint": "z.string().trim().min(1), z.number().int().positive(). The gate runs safeParse on good and bad inputs.",
        "lang": {"node-typescript": "typescript", "node-javascript": "javascript"},
        "starter": {"node-typescript": ZOD_TS.format(title="z.string() /* TODO */", pid="z.number() /* TODO */"),
                    "node-javascript": ZOD_JS.format(title="z.string() /* TODO */", pid="z.number() /* TODO */")},
        "solution": {"node-typescript": ZOD_TS.format(title="z.string().trim().min(1)", pid="z.number().int().positive()"),
                     "node-javascript": ZOD_JS.format(title="z.string().trim().min(1)", pid="z.number().int().positive()")},
        "req": {"zod": {"name": "MagazineIn", "cases": ZOD_CASES}},
        "wrong": {
            "node-typescript": [
                {"label": "min(1) without trim — spaces pass", "expect": ["accepts-invalid"], "code": ZOD_TS.format(title="z.string().min(1)", pid="z.number().int().positive()")},
                {"label": "publisherId any number", "expect": ["accepts-invalid"], "code": ZOD_TS.format(title="z.string().trim().min(1)", pid="z.number()")},
                {"label": "custom refine (not run by the lab)", "expect": ["rejected"], "code": ZOD_TS.format(title="z.string().refine((s) => s.trim().length > 0)", pid="z.number().int().positive()")},
            ],
            "node-javascript": [
                {"label": "min(1) without trim — spaces pass", "expect": ["accepts-invalid"], "code": ZOD_JS.format(title="z.string().min(1)", pid="z.number().int().positive()")},
                {"label": "publisherId optional", "expect": ["accepts-invalid"], "code": ZOD_JS.format(title="z.string().trim().min(1)", pid="z.number().int().positive().optional()")},
            ],
        },
    },
    "sql": {
        "prompt": "Make the DATABASE validate: CHECK constraints so a blank title and a publisher_id ≤ 0 are rejected.",
        "hint": "CHECK (length(trim(title)) > 0), CHECK (publisher_id > 0). The gate tries good and bad INSERTs (rolled back).",
        "starter": L11_SQL.format(c1=" /* TODO: CHECK */", c2=" /* TODO: CHECK */"),
        "solution": L11_SQL.format(c1=" CHECK (length(trim(title)) > 0)", c2=" CHECK (publisher_id > 0)"),
        "req": {"tables": [{"name": "lab_l11_magazines", "columns": [{"name": "title"}, {"name": "publisher_id"}]}], "probes": [
            {"sql": ["INSERT INTO lab_l11_magazines (title, publisher_id) VALUES ('Monthly Review', 1)"], "message": "A normal magazine must be accepted."},
            {"sql": ["INSERT INTO lab_l11_magazines (title, publisher_id) VALUES ('   ', 1)"], "expect": "error", "message": "A blank title must be rejected."},
            {"sql": ["INSERT INTO lab_l11_magazines (title, publisher_id) VALUES ('Data Weekly', 0)"], "expect": "error", "message": "publisher_id 0 must be rejected."},
        ]},
        "wrong": [
            {"label": "NOT NULL only (empty strings still pass)", "expect": ["constraint-not-enforced"], "code": L11_SQL.format(c1="", c2="")},
            {"label": "CHECK (title <> '') — spaces still pass", "expect": ["constraint-not-enforced"], "code": L11_SQL.format(c1=" CHECK (title <> '')", c2=" CHECK (publisher_id > 0)")},
        ],
    },
}

# ------------------------------------------------------------------ 12 frameworks (quiz)
LESSONS["12-frameworks"] = {"quiz": [
    {"id": "q1", "prompt": "A React SPA (Vite) shows a list of magazines. Where does the ORM / SQL query run?", "options": [
        {"id": "a", "text": "Inside the React component, in useEffect", "why": "That code runs in the browser: DATABASE_URL would ship in the JS bundle, and browsers cannot open a Postgres connection anyway."},
        {"id": "b", "text": "In an API (Node/Express, FastAPI, a Next.js route handler) that the SPA calls over HTTP", "correct": True},
        {"id": "c", "text": "In a service worker", "why": "A service worker is still the user's browser — same credential leak, no TCP to Postgres."},
    ]},
    {"id": "q2", "prompt": "Next.js App Router: which file may import PrismaClient / a DB pool?", "options": [
        {"id": "a", "text": "A component starting with 'use client'", "why": "'use client' components are bundled for the browser; Next.js refuses server-only modules there."},
        {"id": "b", "text": "A Server Component or app/api/…/route.ts route handler", "correct": True},
        {"id": "c", "text": "next.config.js", "why": "That is build configuration, not request-time code — it never serves data."},
    ]},
    {"id": "q3", "prompt": "Where should the database URL live in a Next.js app?", "options": [
        {"id": "a", "text": "NEXT_PUBLIC_DATABASE_URL", "why": "NEXT_PUBLIC_* variables are inlined into the client bundle — anyone can read the password."},
        {"id": "b", "text": "DATABASE_URL, read only in server code", "correct": True},
        {"id": "c", "text": "Hard-coded in lib/db.ts", "why": "It ends up in git history and in any bundle that imports the file."},
    ]},
    {"id": "q4", "prompt": "Plain Node vs React vs Next: which one is a runtime, which a UI library, which a framework?", "options": [
        {"id": "a", "text": "Node = JS runtime (servers, scripts); React = UI library; Next.js = React framework with a server", "correct": True},
        {"id": "b", "text": "All three are interchangeable web frameworks", "why": "Node runs JavaScript outside the browser, React only renders UI, Next.js combines React with server rendering and routes."},
        {"id": "c", "text": "React can talk to Postgres directly because it is JavaScript", "why": "React code runs where it is rendered; in the browser it has no DB access and must call an API."},
    ]},
]}


# ------------------------------------------------------------------ 13 indexes (advanced)
L13_PY = '''
class LabL13Author(Base):
    __tablename__ = "lab_l13_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))


class LabL13Book(Base):
    __tablename__ = "lab_l13_books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    author_id: Mapped[int] = mapped_column(ForeignKey("lab_l13_authors.id"){idx})
'''
L13_PRISMA = "model LabL13Author {{\n  id    Int          @id @default(autoincrement())\n  name  String\n  books LabL13Book[]\n  @@map(\"lab_l13_authors\")\n}}\n\nmodel LabL13Book {{\n  id       Int          @id @default(autoincrement())\n  title    String\n  authorId Int          @map(\"author_id\")\n  author   LabL13Author @relation(fields: [authorId], references: [id])\n{idx}  @@map(\"lab_l13_books\")\n}}\n"
L13_SQL = "CREATE TABLE lab_l13_authors (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);\nCREATE TABLE lab_l13_books (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  author_id INTEGER NOT NULL REFERENCES lab_l13_authors(id)\n);\n{idx}"
LESSONS["13-indexes"] = {
    "req": {"tables": [{"name": "lab_l13_books", "columns": [
        {"name": "author_id", "indexed": True, "fk": {"table": "lab_l13_authors", "column": "id"}},
    ]}]},
    "python": {
        "prompt": "Postgres does NOT index foreign keys for you. Index lab_l13_books.author_id.",
        "hint": "mapped_column(ForeignKey(...), index=True)",
        "starter": py(L13_PY.format(idx="")).replace("engine = create_engine", "# TODO: index author_id\n\nengine = create_engine"),
        "solution": py(L13_PY.format(idx=", index=True")),
        "wrong": [{"label": "FK without an index", "expect": ["missing-index"], "code": py(L13_PY.format(idx=""))}],
    },
    "prisma": {
        "prompt": "Add @@index([authorId]) so lookups and joins on author_id do not scan the whole table.",
        "hint": "Prisma does not create FK indexes on PostgreSQL either — add @@index explicitly.",
        "starter": L13_PRISMA.format(idx="  // TODO: index authorId\n"),
        "solution": L13_PRISMA.format(idx="  @@index([authorId])\n"),
        "wrong": [{"label": "no @@index", "expect": ["missing-index"], "code": L13_PRISMA.format(idx="")}],
    },
    "sql": {
        "prompt": "CREATE INDEX on lab_l13_books(author_id).",
        "hint": "CREATE INDEX lab_l13_books_author_id_idx ON lab_l13_books (author_id);",
        "starter": L13_SQL.format(idx="\n-- TODO: index author_id\n"),
        "solution": L13_SQL.format(idx="\nCREATE INDEX lab_l13_books_author_id_idx ON lab_l13_books (author_id);\n"),
        "wrong": [
            {"label": "no index", "expect": ["missing-index"], "code": L13_SQL.format(idx="")},
            {"label": "index on (title, author_id) — author_id is not the leading column", "expect": ["missing-index"],
             "code": L13_SQL.format(idx="\nCREATE INDEX lab_l13_books_title_idx ON lab_l13_books (title, author_id);\n")},
        ],
    },
}

# ------------------------------------------------------------------ 14 constraints (advanced)
L14_PY = '''
from sqlalchemy import CheckConstraint


class LabL14Product(Base):
    __tablename__ = "lab_l14_products"
{args}    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), unique=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    stock: Mapped[int] = mapped_column(Integer, server_default="0")
'''
L14_CHECKS = '''    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_l14_price_non_negative"),
        CheckConstraint("stock >= 0", name="ck_l14_stock_non_negative"),
    )
'''
L14_PROBES_CHECK = [
    {"sql": ["INSERT INTO lab_l14_products (sku, price) VALUES ('A-1', 9.99)"], "message": "A normal product (stock defaulting to 0) must be accepted."},
    {"sql": ["INSERT INTO lab_l14_products (sku, price, stock) VALUES ('A-2', -1, 1)"], "expect": "error", "message": "A negative price must be rejected by the database."},
    {"sql": ["INSERT INTO lab_l14_products (sku, price, stock) VALUES ('A-3', 1, -5)"], "expect": "error", "message": "Negative stock must be rejected by the database."},
]
L14_SQL = "CREATE TABLE lab_l14_products (\n  id SERIAL PRIMARY KEY,\n  sku VARCHAR(32) NOT NULL UNIQUE,\n  price NUMERIC(10,2) NOT NULL{c1},\n  stock INTEGER NOT NULL DEFAULT 0{c2}\n);\n"
L14_PRISMA = "model LabL14Store {{\n  id    Int                @id @default(autoincrement())\n  name  String\n  items LabL14Inventory[]\n  @@map(\"lab_l14_stores\")\n}}\n\nmodel LabL14Inventory {{\n  id      Int         @id @default(autoincrement())\n  storeId Int         @map(\"store_id\")\n  sku     String      @db.VarChar(32){sku}\n  stock   Int         @default(0)\n  store   LabL14Store @relation(fields: [storeId], references: [id])\n{uniq}  @@map(\"lab_l14_inventory\")\n}}\n"
LESSONS["14-constraints"] = {
    "python": {
        "prompt": "Rules that must hold for EVERY writer belong in the database: CHECK price >= 0 and stock >= 0 on lab_l14_products.",
        "hint": "__table_args__ = (CheckConstraint(\"price >= 0\", name=...), ...). The gate tries good and bad INSERTs (rolled back).",
        "starter": py(L14_PY.format(args="    # TODO: __table_args__ with CheckConstraint(...)\n")),
        "solution": py(L14_PY.format(args=L14_CHECKS)),
        "req": {"tables": [{"name": "lab_l14_products", "columns": [{"name": "sku", "unique": True}, {"name": "price", "type": "numeric"}]}], "probes": L14_PROBES_CHECK},
        "wrong": [
            {"label": "no CHECK constraints", "expect": ["constraint-not-enforced"], "code": py(L14_PY.format(args=""))},
            {"label": "only price is checked", "expect": ["constraint-not-enforced"], "code": py(L14_PY.format(args=L14_CHECKS.replace('        CheckConstraint("stock >= 0", name="ck_l14_stock_non_negative"),\n', "")))},
        ],
    },
    "prisma": {
        "prompt": "Prisma has no CHECK attribute, but it has composite uniques and defaults: the same SKU may exist once PER STORE (@@unique([storeId, sku])), stock defaults to 0.",
        "hint": "A global @unique on sku would forbid the same SKU in two stores. (CHECK constraints need a SQL migration in Prisma.)",
        "starter": L14_PRISMA.format(sku="", uniq="  // TODO: one row per (store, sku)\n"),
        "solution": L14_PRISMA.format(sku="", uniq="  @@unique([storeId, sku])\n"),
        "req": {"tables": [{"name": "lab_l14_inventory", "columns": [{"name": "sku", "unique": False}], "uniqueTogether": [["store_id", "sku"]]}], "probes": [
            {"sql": ["INSERT INTO lab_l14_stores (id, name) VALUES (1, 'North'), (2, 'South')",
                     "INSERT INTO lab_l14_inventory (store_id, sku) VALUES (1, 'A-1'), (2, 'A-1')"],
             "message": "The same SKU in two different stores must be allowed (stock defaults to 0)."},
            {"sql": ["INSERT INTO lab_l14_stores (id, name) VALUES (1, 'North')",
                     "INSERT INTO lab_l14_inventory (store_id, sku) VALUES (1, 'A-1'), (1, 'A-1')"],
             "expect": "error", "message": "The same SKU twice in ONE store must be rejected."},
        ]},
        "wrong": [
            {"label": "global @unique on sku", "expect": ["must-not-be-unique", "probe-failed", "missing-composite-key"], "code": L14_PRISMA.format(sku=" @unique", uniq="")},
            {"label": "no uniqueness at all", "expect": ["missing-composite-key", "constraint-not-enforced"], "code": L14_PRISMA.format(sku="", uniq="")},
        ],
    },
    "sql": {
        "prompt": "Add CHECK (price >= 0) and CHECK (stock >= 0) to lab_l14_products.",
        "hint": "Column-level CHECK (…) or a table-level CONSTRAINT name CHECK (…).",
        "starter": L14_SQL.format(c1=" /* TODO */", c2=" /* TODO */"),
        "solution": L14_SQL.format(c1=" CHECK (price >= 0)", c2=" CHECK (stock >= 0)"),
        "req": {"tables": [{"name": "lab_l14_products", "columns": [{"name": "sku", "unique": True}, {"name": "price", "type": "numeric"}]}], "probes": L14_PROBES_CHECK},
        "wrong": [
            {"label": "no CHECKs", "expect": ["constraint-not-enforced"], "code": L14_SQL.format(c1="", c2="")},
            {"label": "CHECK (price > -100) — still allows negatives", "expect": ["constraint-not-enforced"], "code": L14_SQL.format(c1=" CHECK (price > -100)", c2=" CHECK (stock >= 0)")},
        ],
    },
}

# ------------------------------------------------------------------ 15 transactions (advanced)
L15_PY = '''
from decimal import Decimal
from sqlalchemy import CheckConstraint, select
from sqlalchemy.orm import Session


class LabL15Account(Base):
    __tablename__ = "lab_l15_accounts"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_l15_balance"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(40), unique=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(10, 2))


engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)

with Session(engine) as session, session.begin():
    session.add_all([LabL15Account(owner="alice", balance=Decimal("100")), LabL15Account(owner="bob", balance=Decimal("0"))])

{transfer}'''
L15_TRANSFER = '''# Move 30 from alice to bob: both updates commit together, or neither does.
with Session(engine) as session, session.begin():
    alice = session.scalars(select(LabL15Account).where(LabL15Account.owner == "alice")).one()
    bob = session.scalars(select(LabL15Account).where(LabL15Account.owner == "bob")).one()
    alice.balance -= Decimal("30")
    bob.balance += Decimal("30")

# A transfer that would overdraw alice fails as a whole — bob must not receive anything.
try:
    with Session(engine) as session, session.begin():
        alice = session.scalars(select(LabL15Account).where(LabL15Account.owner == "alice")).one()
        bob = session.scalars(select(LabL15Account).where(LabL15Account.owner == "bob")).one()
        bob.balance += Decimal("500")
        alice.balance -= Decimal("500")
except Exception as e:
    print("rolled back:", type(e).__name__)
'''
L15_DATA = [
    {"sql": "SELECT count(*) FROM lab_l15_accounts WHERE owner = 'alice' AND balance = 70", "min": 1, "message": "alice must end with 70 (100 − 30)."},
    {"sql": "SELECT count(*) FROM lab_l15_accounts WHERE owner = 'bob' AND balance = 30", "min": 1, "message": "bob must end with exactly 30 — the failed 500 transfer must leave no trace."},
]
L15_SQL = "CREATE TABLE lab_l15_accounts (\n  id SERIAL PRIMARY KEY,\n  owner VARCHAR(40) NOT NULL UNIQUE,\n  balance NUMERIC(10,2) NOT NULL CHECK (balance >= 0)\n);\nINSERT INTO lab_l15_accounts (owner, balance) VALUES ('alice', 100), ('bob', 0);\n\n{transfer}"
LESSONS["15-transactions"] = {
    "python": {
        "prompt": "Transfer 30 from alice to bob atomically, then attempt a 500 transfer that must roll back completely.",
        "hint": "`with Session(engine) as s, s.begin():` commits on success and rolls back on any exception.",
        "starter": py("", L15_PY.format(transfer="# TODO: transfer 30 alice → bob in one transaction\n# TODO: try a 500 transfer that fails and rolls back\n")),
        "solution": py("", L15_PY.format(transfer=L15_TRANSFER)),
        "req": {"tables": [{"name": "lab_l15_accounts", "columns": [{"name": "balance", "type": "numeric"}]}], "data": L15_DATA},
        "wrong": [
            {"label": "credit and debit in separate transactions (bob keeps the 500)", "expect": ["missing-data"], "code": py("", L15_PY.format(transfer=L15_TRANSFER.replace(
                '''        bob.balance += Decimal("500")
        alice.balance -= Decimal("500")''',
                '''        bob.balance += Decimal("500")
    with Session(engine) as session, session.begin():
        alice = session.scalars(select(LabL15Account).where(LabL15Account.owner == "alice")).one()
        alice.balance -= Decimal("500")''')))},
            {"label": "forgets to commit the first transfer", "expect": ["missing-data"], "code": py("", L15_PY.format(transfer=L15_TRANSFER.replace(
                "with Session(engine) as session, session.begin():\n    alice", "with Session(engine) as session:\n    alice", 1)))},
        ],
    },
    "sql": {
        "prompt": "Transfer 30 from alice to bob with two UPDATEs. The lab runs your script as ONE transaction, so both land or neither.",
        "hint": "UPDATE … SET balance = balance - 30 WHERE owner = 'alice'; then the matching credit.",
        "starter": L15_SQL.format(transfer="-- TODO: move 30 from alice to bob\n"),
        "solution": L15_SQL.format(transfer="UPDATE lab_l15_accounts SET balance = balance - 30 WHERE owner = 'alice';\nUPDATE lab_l15_accounts SET balance = balance + 30 WHERE owner = 'bob';\n"),
        "req": {"tables": [{"name": "lab_l15_accounts", "columns": [{"name": "balance", "type": "numeric"}]}], "data": L15_DATA},
        "wrong": [
            {"label": "debit only — money disappears", "expect": ["missing-data"], "code": L15_SQL.format(transfer="UPDATE lab_l15_accounts SET balance = balance - 30 WHERE owner = 'alice';\n")},
            {"label": "overdraws alice — the CHECK aborts the whole script", "expect": ["runtime-error"], "code": L15_SQL.format(transfer="UPDATE lab_l15_accounts SET balance = balance - 130 WHERE owner = 'alice';\nUPDATE lab_l15_accounts SET balance = balance + 130 WHERE owner = 'bob';\n")},
        ],
    },
    "quiz_prisma": [
        {"id": "q1", "prompt": "You move money between two accounts with Prisma. Which call keeps both updates atomic?", "options": [
            {"id": "a", "text": "Two awaited prisma.account.update() calls in a row", "why": "Each call is its own transaction — if the second fails, the first is already committed."},
            {"id": "b", "text": "prisma.$transaction([debit, credit]) or an interactive prisma.$transaction(async (tx) => …)", "correct": True},
            {"id": "c", "text": "Promise.all([debit, credit])", "why": "Promise.all only runs them concurrently; they are still separate transactions."},
        ]},
        {"id": "q2", "prompt": "Inside prisma.$transaction(async (tx) => …) the credit throws. What happens to the debit?", "options": [
            {"id": "a", "text": "It is rolled back together with everything else in the callback", "correct": True},
            {"id": "b", "text": "It stays committed", "why": "The interactive transaction only commits when the callback resolves; a throw rolls it all back."},
            {"id": "c", "text": "Prisma retries the credit automatically", "why": "Prisma does not retry; you decide (e.g. on serialization failures)."},
        ]},
        {"id": "q3", "prompt": "Inside an interactive transaction you call prisma.user.update (not tx.user.update). Why is that a bug?", "options": [
            {"id": "a", "text": "It runs on a different connection, outside the transaction", "correct": True},
            {"id": "b", "text": "It is fine — Prisma detects the surrounding transaction", "why": "Only the `tx` client is bound to the transaction; the global client is not."},
            {"id": "c", "text": "It throws a TypeScript error", "why": "It compiles fine — which is exactly why this bug is easy to ship."},
        ]},
    ],
}

# ------------------------------------------------------------------ 16 N+1 & loading (quiz, all tracks)
LESSONS["16-n-plus-one"] = {"quiz": [
    {"id": "q1", "prompt": "You load 50 authors, then access author.books in a loop. With lazy loading, how many queries run?", "options": [
        {"id": "a", "text": "1", "why": "Only if the books were eager-loaded; lazy loading fetches each author's books on first access."},
        {"id": "b", "text": "51 — one for the authors plus one per author (the N+1 problem)", "correct": True},
        {"id": "c", "text": "2", "why": "That is what selectinload / include gives you — not the lazy default."},
    ]},
    {"id": "q2", "prompt": "Which call loads authors AND their books in a fixed number of queries?", "options": [
        {"id": "a", "text": "SQLAlchemy: select(Author).options(selectinload(Author.books)); Prisma: findMany({ include: { books: true } }); SQL: one JOIN", "correct": True},
        {"id": "b", "text": "Calling session.refresh(author) for each author", "why": "That is still one query per author."},
        {"id": "c", "text": "Adding an index on books.author_id", "why": "An index makes each query faster but does not reduce the number of queries."},
    ]},
    {"id": "q3", "prompt": "When is joinedload (one JOIN) worse than selectinload (two queries)?", "options": [
        {"id": "a", "text": "For one-to-many collections: the JOIN repeats every author column for each book row", "correct": True},
        {"id": "b", "text": "Never", "why": "Large collections multiply rows in a JOIN; selectinload avoids that duplication."},
        {"id": "c", "text": "Only on SQLite", "why": "Row duplication happens on every database."},
    ]},
]}

# ------------------------------------------------------------------ 17 migrations (quiz, all tracks)
LESSONS["17-migrations"] = {"quiz": [
    {"id": "q1", "prompt": "Your app is live. You add a column to a model. Why is Base.metadata.create_all() not enough?", "options": [
        {"id": "a", "text": "create_all only creates missing tables — it never ALTERs an existing one", "correct": True},
        {"id": "b", "text": "It drops and recreates the table, losing data", "why": "It is the opposite: create_all skips tables that exist, so the new column is never added."},
        {"id": "c", "text": "It works, but slowly", "why": "It does nothing for existing tables — use Alembic (Python) or prisma migrate (Node)."},
    ]},
    {"id": "q2", "prompt": "Which command creates a versioned migration file you commit to git?", "options": [
        {"id": "a", "text": "prisma db push", "why": "db push syncs the schema without a migration history — fine for prototypes, not for production."},
        {"id": "b", "text": "prisma migrate dev --name add_bio (or alembic revision --autogenerate)", "correct": True},
        {"id": "c", "text": "prisma generate", "why": "generate only regenerates the TypeScript client; it does not touch the database."},
    ]},
    {"id": "q3", "prompt": "You add a NOT NULL column to a table that already has rows. What must the migration do?", "options": [
        {"id": "a", "text": "Provide a DEFAULT or backfill existing rows before setting NOT NULL", "correct": True},
        {"id": "b", "text": "Nothing — Postgres fills it with NULL", "why": "NULL violates NOT NULL, so ALTER TABLE fails on a non-empty table."},
        {"id": "c", "text": "Drop the table first", "why": "That loses production data; add a default or backfill instead."},
    ]},
]}
