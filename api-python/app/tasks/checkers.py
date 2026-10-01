"""10 progressive relationship tasks + schema-based checkers.

Validate BEFORE mutate: checkers inspect proposed schema / AST intent,
or compare expected schema shape after a dry structural analysis.
For lab safety we introspect schema only after validation of code intent,
and for checker unit tests we can pass schema snapshots directly.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class TaskSpec:
    id: str
    order: int
    title: str
    description: str
    objectives: list[str]
    starter_code: str
    sql_equivalent: str
    highlight_hint: list[str] = field(default_factory=list)
    teach_along: list[dict[str, str]] = field(default_factory=list)


def _table_map(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {t["name"]: t for t in schema.get("tables", [])}


def _col_map(table: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["name"]: c for c in table.get("columns", [])}


def _has_pk(table: dict[str, Any]) -> bool:
    return any(c.get("isPrimaryKey") for c in table.get("columns", []))


def _fk_to(schema: dict[str, Any], from_table: str, to_table: str) -> bool:
    for rel in schema.get("relationships", []):
        if rel["fromTable"] == from_table and rel["toTable"] == to_table:
            return True
    # also check column references
    tmap = _table_map(schema)
    if from_table not in tmap:
        return False
    for c in tmap[from_table]["columns"]:
        ref = c.get("references") or {}
        if c.get("isForeignKey") and ref.get("table") == to_table:
            return True
    return False


def _fail(reason: str) -> dict[str, Any]:
    return {"passed": False, "reason": reason}


def _pass(message: str = "Requirements met") -> dict[str, Any]:
    return {"passed": True, "reason": message}


# --- Checkers operate on schema dicts (extra columns always OK) ---

def check_create_connect(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    if "lab_widgets" not in tmap:
        return _fail("Missing table 'lab_widgets'. Create it with at least an id primary key and a name column.")
    cols = _col_map(tmap["lab_widgets"])
    if "id" not in cols or not cols["id"].get("isPrimaryKey"):
        return _fail("lab_widgets.id must be a primary key.")
    if "name" not in cols:
        return _fail("lab_widgets must have a 'name' column.")
    return _pass("lab_widgets created with id PK and name.")


def check_types_pks(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    if "lab_products" not in tmap:
        return _fail("Missing table 'lab_products'.")
    cols = _col_map(tmap["lab_products"])
    required = {"id", "sku", "price"}
    missing = required - set(cols)
    if missing:
        return _fail(f"lab_products missing columns: {', '.join(sorted(missing))}")
    if not cols["id"].get("isPrimaryKey"):
        return _fail("lab_products.id must be the primary key.")
    return _pass("lab_products has typed columns and PK.")


def check_one_to_many(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    for name in ("lab_publishers", "lab_magazines"):
        if name not in tmap:
            return _fail(f"Missing table '{name}'.")
        if not _has_pk(tmap[name]):
            return _fail(f"Table '{name}' needs a primary key.")
    if not _fk_to(schema, "lab_magazines", "lab_publishers"):
        return _fail(
            "lab_magazines must have a foreign key to lab_publishers (one publisher → many magazines)."
        )
    return _pass("1:N publishers→magazines established.")


def check_many_to_one(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    for name in ("lab_countries", "lab_cities"):
        if name not in tmap:
            return _fail(f"Missing table '{name}'.")
    if not _fk_to(schema, "lab_cities", "lab_countries"):
        return _fail("lab_cities must FK to lab_countries (many cities → one country / N:1).")
    return _pass("N:1 cities→countries established.")


def check_one_to_one(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    for name in ("lab_accounts", "lab_settings"):
        if name not in tmap:
            return _fail(f"Missing table '{name}'.")
    if not _fk_to(schema, "lab_settings", "lab_accounts"):
        return _fail("lab_settings must FK to lab_accounts.")
    # uniqueness of FK for 1:1 — check unique constraint via column name convention account_id
    cols = _col_map(tmap["lab_settings"])
    fk_cols = [c for c in cols.values() if c.get("isForeignKey")]
    if not fk_cols:
        return _fail("lab_settings needs a foreign key column to lab_accounts.")
    # Accept if any FK exists; prefer account_id unique — we check name contains account
    if not any("account" in c["name"] for c in fk_cols):
        return _fail("Name the FK column with 'account' (e.g. account_id) for the 1:1 link.")
    return _pass("1:1 accounts↔settings established (ensure account_id is UNIQUE in real schemas).")


def check_many_to_many(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    for name in ("lab_tags", "lab_posts", "lab_post_tags"):
        if name not in tmap:
            return _fail(f"Missing table '{name}' (association table required for M:N).")
    if not _fk_to(schema, "lab_post_tags", "lab_posts"):
        return _fail("lab_post_tags must FK to lab_posts.")
    if not _fk_to(schema, "lab_post_tags", "lab_tags"):
        return _fail("lab_post_tags must FK to lab_tags.")
    return _pass("M:N posts↔tags via lab_post_tags association.")


def check_self_ref(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    if "lab_categories" not in tmap:
        return _fail("Missing table 'lab_categories'.")
    if not _fk_to(schema, "lab_categories", "lab_categories"):
        return _fail("lab_categories must have a self-referential FK (e.g. parent_id → lab_categories.id).")
    return _pass("Self-referential categories hierarchy established.")


def check_cascades(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    for name in ("lab_orders", "lab_order_items"):
        if name not in tmap:
            return _fail(f"Missing table '{name}'.")
    if not _fk_to(schema, "lab_order_items", "lab_orders"):
        return _fail("lab_order_items must FK to lab_orders.")
    # Look for ON DELETE CASCADE in relationships
    cascaded = False
    for rel in schema.get("relationships", []):
        if rel["fromTable"] == "lab_order_items" and rel["toTable"] == "lab_orders":
            if str(rel.get("onDelete", "")).upper() == "CASCADE":
                cascaded = True
    if not cascaded:
        return _fail("FK from lab_order_items → lab_orders must use ON DELETE CASCADE.")
    return _pass("Cascading order→items relationship OK.")


def check_insert_query(schema: dict[str, Any]) -> dict[str, Any]:
    # Structural: need lab_artists and lab_albums with FK; data insert verified separately via runner flag
    tmap = _table_map(schema)
    for name in ("lab_artists", "lab_albums"):
        if name not in tmap:
            return _fail(f"Missing table '{name}'.")
    if not _fk_to(schema, "lab_albums", "lab_artists"):
        return _fail("lab_albums must FK to lab_artists.")
    return _pass("Schema ready for insert+query across artists→albums.")


def check_mini_domain(schema: dict[str, Any]) -> dict[str, Any]:
    tmap = _table_map(schema)
    required = ("lab_orgs", "lab_teams", "lab_members", "lab_team_members")
    for name in required:
        if name not in tmap:
            return _fail(f"Mini domain missing '{name}'. Need orgs, teams, members, and team_members.")
    if not _fk_to(schema, "lab_teams", "lab_orgs"):
        return _fail("lab_teams must belong to lab_orgs (FK).")
    if not _fk_to(schema, "lab_team_members", "lab_teams"):
        return _fail("lab_team_members must FK to lab_teams.")
    if not _fk_to(schema, "lab_team_members", "lab_members"):
        return _fail("lab_team_members must FK to lab_members.")
    return _pass("Mini multi-relationship domain complete.")


CHECKERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "rel-01-create-connect": check_create_connect,
    "rel-02-types-pks": check_types_pks,
    "rel-03-one-to-many": check_one_to_many,
    "rel-04-many-to-one": check_many_to_one,
    "rel-05-one-to-one": check_one_to_one,
    "rel-06-many-to-many": check_many_to_many,
    "rel-07-self-referential": check_self_ref,
    "rel-08-cascades-loading": check_cascades,
    "rel-09-insert-query": check_insert_query,
    "rel-10-mini-domain": check_mini_domain,
}


STARTER_BASE = '''from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, ForeignKey, UniqueConstraint


class Base(DeclarativeBase):
    pass

'''


TASKS: list[TaskSpec] = [
    TaskSpec(
        id="rel-01-create-connect",
        order=1,
        title="Create & connect",
        description="Create your first lab table and connect to the database metadata.",
        objectives=[
            "Declare Base",
            "Create lab_widgets with id PK and name",
            "Call Base.metadata.create_all(engine)",
        ],
        starter_code=STARTER_BASE
        + '''class Widget(Base):
    __tablename__ = "lab_widgets"
    # TODO: id: Mapped[int] = mapped_column(primary_key=True)
    # TODO: name: Mapped[str] = mapped_column(String(120))

Base.metadata.create_all(engine)
''',
        sql_equivalent="CREATE TABLE lab_widgets (id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL);",
        highlight_hint=["lab_widgets"],
        teach_along=[
            {"line": "class Widget", "mapsTo": "table lab_widgets"},
            {"line": "mapped_column(primary_key=True)", "mapsTo": "PRIMARY KEY"},
        ],
    ),
    TaskSpec(
        id="rel-02-types-pks",
        order=2,
        title="Types & primary keys",
        description="Model typed columns and a clear primary key on lab_products.",
        objectives=["id PK", "sku String", "price numeric/int"],
        starter_code=STARTER_BASE
        + '''class Product(Base):
    __tablename__ = "lab_products"
    # TODO: id, sku, price

Base.metadata.create_all(engine)
''',
        sql_equivalent="CREATE TABLE lab_products (id SERIAL PRIMARY KEY, sku VARCHAR(...), price INTEGER);",
        highlight_hint=["lab_products"],
    ),
    TaskSpec(
        id="rel-03-one-to-many",
        order=3,
        title="One-to-many (1:N)",
        description="One publisher has many magazines.",
        objectives=["lab_publishers", "lab_magazines.publisher_id FK"],
        starter_code=STARTER_BASE
        + '''class Publisher(Base):
    __tablename__ = "lab_publishers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # magazines: Mapped[list["Magazine"]] = relationship(back_populates="publisher")

class Magazine(Base):
    __tablename__ = "lab_magazines"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # TODO: publisher_id FK + relationship

Base.metadata.create_all(engine)
''',
        sql_equivalent="ALTER / CREATE with magazines.publisher_id REFERENCES publishers(id);",
        highlight_hint=["lab_publishers", "lab_magazines"],
    ),
    TaskSpec(
        id="rel-04-many-to-one",
        order=4,
        title="Many-to-one (N:1)",
        description="Many cities belong to one country.",
        objectives=["lab_countries", "lab_cities.country_id FK"],
        starter_code=STARTER_BASE
        + '''class Country(Base):
    __tablename__ = "lab_countries"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(3))

class City(Base):
    __tablename__ = "lab_cities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # TODO: country_id

Base.metadata.create_all(engine)
''',
        sql_equivalent="CREATE TABLE lab_cities (..., country_id INT REFERENCES lab_countries(id));",
        highlight_hint=["lab_countries", "lab_cities"],
    ),
    TaskSpec(
        id="rel-05-one-to-one",
        order=5,
        title="One-to-one (1:1)",
        description="Each account has exactly one settings row (unique FK).",
        objectives=["lab_accounts", "lab_settings.account_id UNIQUE FK"],
        starter_code=STARTER_BASE
        + '''class Account(Base):
    __tablename__ = "lab_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)

class Settings(Base):
    __tablename__ = "lab_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    # TODO: account_id unique FK
    theme: Mapped[str] = mapped_column(String(40), default="dark")

Base.metadata.create_all(engine)
''',
        sql_equivalent="account_id INTEGER UNIQUE REFERENCES lab_accounts(id);",
        highlight_hint=["lab_accounts", "lab_settings"],
    ),
    TaskSpec(
        id="rel-06-many-to-many",
        order=6,
        title="Many-to-many + association",
        description="Posts and tags linked through lab_post_tags.",
        objectives=["lab_posts", "lab_tags", "lab_post_tags with two FKs"],
        starter_code=STARTER_BASE
        + '''class Post(Base):
    __tablename__ = "lab_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))

class Tag(Base):
    __tablename__ = "lab_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)

class PostTag(Base):
    __tablename__ = "lab_post_tags"
    # TODO: post_id + tag_id composite / FKs
    pass

Base.metadata.create_all(engine)
''',
        sql_equivalent="CREATE TABLE lab_post_tags (post_id INT REFERENCES lab_posts, tag_id INT REFERENCES lab_tags, PRIMARY KEY(...));",
        highlight_hint=["lab_posts", "lab_tags", "lab_post_tags"],
    ),
    TaskSpec(
        id="rel-07-self-referential",
        order=7,
        title="Self-referential",
        description="Categories with optional parent_id pointing at the same table.",
        objectives=["lab_categories.parent_id → lab_categories.id"],
        starter_code=STARTER_BASE
        + '''class Category(Base):
    __tablename__ = "lab_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # TODO: parent_id self FK

Base.metadata.create_all(engine)
''',
        sql_equivalent="parent_id INT REFERENCES lab_categories(id);",
        highlight_hint=["lab_categories"],
    ),
    TaskSpec(
        id="rel-08-cascades-loading",
        order=8,
        title="Cascades & loading",
        description="Order items cascade-delete with their order; think about lazy vs selectin load.",
        objectives=["lab_orders", "lab_order_items ON DELETE CASCADE"],
        starter_code=STARTER_BASE
        + '''class Order(Base):
    __tablename__ = "lab_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    # items = relationship(..., cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "lab_order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    # TODO: order_id with ondelete="CASCADE"

Base.metadata.create_all(engine)
''',
        sql_equivalent="order_id INT REFERENCES lab_orders(id) ON DELETE CASCADE;",
        highlight_hint=["lab_orders", "lab_order_items"],
    ),
    TaskSpec(
        id="rel-09-insert-query",
        order=9,
        title="Insert + query across relationships",
        description="Model artists→albums then insert and join-query (session code optional).",
        objectives=["lab_artists", "lab_albums FK"],
        starter_code=STARTER_BASE
        + '''class Artist(Base):
    __tablename__ = "lab_artists"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))

class Album(Base):
    __tablename__ = "lab_albums"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # TODO: artist_id

Base.metadata.create_all(engine)
# Optional: Session(engine) insert + select with join
''',
        sql_equivalent="INSERT ...; SELECT a.title, ar.name FROM lab_albums a JOIN lab_artists ar ON ...;",
        highlight_hint=["lab_artists", "lab_albums"],
    ),
    TaskSpec(
        id="rel-10-mini-domain",
        order=10,
        title="Mini multi-relationship domain",
        description="Orgs → teams, members, and M:N team_members.",
        objectives=["lab_orgs", "lab_teams", "lab_members", "lab_team_members"],
        starter_code=STARTER_BASE
        + '''class Org(Base):
    __tablename__ = "lab_orgs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))

# TODO: Team (FK org), Member, TeamMember association

Base.metadata.create_all(engine)
''',
        sql_equivalent="Multiple CREATE TABLE + FKs for org/team/member domain.",
        highlight_hint=["lab_orgs", "lab_teams", "lab_members", "lab_team_members"],
    ),
]


def list_tasks() -> list[dict[str, Any]]:
    return [
        {
            "id": t.id,
            "order": t.order,
            "title": t.title,
            "description": t.description,
            "objectives": t.objectives,
            "starterCode": t.starter_code,
            "sqlEquivalent": t.sql_equivalent,
            "highlightHint": t.highlight_hint,
            "teachAlong": t.teach_along,
        }
        for t in sorted(TASKS, key=lambda x: x.order)
    ]


def get_task(task_id: str) -> TaskSpec | None:
    for t in TASKS:
        if t.id == task_id:
            return t
    return None


def check_task(task_id: str, schema: dict[str, Any]) -> dict[str, Any]:
    checker = CHECKERS.get(task_id)
    if not checker:
        return _fail(f"Unknown task: {task_id}")
    return checker(schema)
