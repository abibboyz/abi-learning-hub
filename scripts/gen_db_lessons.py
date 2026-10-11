"""Write runnable lesson exercises, advanced lessons/tasks and the sql-postgres track. Idempotent.

Run after gen_db_tracks.py:  python3 scripts/gen_db_lessons.py
"""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))
from db_lessons import LESSONS  # noqa: E402
from db_solutions import PRISMA_JS_NOTE  # noqa: E402
from db_tasks_extra import R11, R12, SQL_TASKS  # noqa: E402

TRACKS = {
    "python-sqlalchemy": {"lang": "python", "src": "python"},
    "node-typescript": {"lang": "prisma", "src": "prisma"},
    "node-javascript": {"lang": "prisma", "src": "prisma"},
    "sql-postgres": {"lang": "sql", "src": "sql"},
}
LESSON_ORDER = sorted(LESSONS)

REF = {
    "pg_indexes": {"title": "PostgreSQL — Indexes", "url": "https://www.postgresql.org/docs/current/indexes.html"},
    "pg_multi": {"title": "PostgreSQL — Multicolumn Indexes", "url": "https://www.postgresql.org/docs/current/indexes-multicolumn.html"},
    "pg_constraints": {"title": "PostgreSQL — Constraints", "url": "https://www.postgresql.org/docs/current/ddl-constraints.html"},
    "pg_tx": {"title": "PostgreSQL — Transactions", "url": "https://www.postgresql.org/docs/current/tutorial-transactions.html"},
    "pg_alter": {"title": "PostgreSQL — ALTER TABLE", "url": "https://www.postgresql.org/docs/current/sql-altertable.html"},
    "sa_constraints": {"title": "SQLAlchemy — Constraints and Indexes", "url": "https://docs.sqlalchemy.org/en/20/core/constraints.html"},
    "sa_session_tx": {"title": "SQLAlchemy — Transactions and Connection Management", "url": "https://docs.sqlalchemy.org/en/20/orm/session_transaction.html"},
    "sa_loading": {"title": "SQLAlchemy — Relationship Loading Techniques", "url": "https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html"},
    "alembic": {"title": "Alembic — Tutorial", "url": "https://alembic.sqlalchemy.org/en/latest/tutorial.html"},
    "prisma_indexes": {"title": "Prisma — Indexes", "url": "https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes"},
    "prisma_tx": {"title": "Prisma — Transactions", "url": "https://www.prisma.io/docs/orm/prisma-client/queries/transactions"},
    "prisma_relq": {"title": "Prisma — Relation queries (include)", "url": "https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries"},
    "prisma_migrate": {"title": "Prisma Migrate — Getting started", "url": "https://www.prisma.io/docs/orm/prisma-migrate/getting-started"},
    "prisma_ds": {"title": "Prisma — Data sources", "url": "https://www.prisma.io/docs/orm/prisma-schema/overview/data-sources"},
    "zod": {"title": "Zod — Documentation", "url": "https://zod.dev/"},
    "sa_validates": {"title": "SQLAlchemy — Simple Validators (@validates)", "url": "https://docs.sqlalchemy.org/en/20/orm/mapped_attributes.html#simple-validators"},
    "next_env": {"title": "Next.js — Environment Variables", "url": "https://nextjs.org/docs/app/guides/environment-variables"},
    "next_server_client": {"title": "Next.js — Server and Client Components", "url": "https://nextjs.org/docs/app/getting-started/server-and-client-components"},
    "pg_select": {"title": "PostgreSQL — SELECT", "url": "https://www.postgresql.org/docs/current/sql-select.html"},
}

NEW_LESSONS = {
    "13-indexes": {
        "title": "Indexes (advanced)", "summary": "Why foreign keys need an index and how composite index order matters.",
        "why": "Postgres creates indexes for PRIMARY KEY and UNIQUE automatically — never for foreign keys. Every join, every `WHERE author_id = ?` and every ON DELETE check on the parent then scans the child table.",
        "objectives": ["Index FK columns explicitly.", "Know that only the LEADING column of a composite index serves single-column lookups.", "Read an index from the schema diagram."],
        "pitfalls": ["Assuming REFERENCES creates an index.", "Composite index (title, author_id) for lookups by author_id.", "Indexing every column — each index slows writes."],
        "mapping": "SQLAlchemy mapped_column(..., index=True) / Index(...). Prisma @@index([field]). SQL CREATE INDEX name ON table (col).",
        "refs": ["pg_indexes", "pg_multi", "sa_constraints", "prisma_indexes"],
        "example": {"python": "author_id: Mapped[int] = mapped_column(ForeignKey(\"lab_authors.id\"), index=True)",
                    "prisma": "@@index([authorId])", "sql": "CREATE INDEX lab_books_author_id_idx ON lab_books (author_id);"},
    },
    "14-constraints": {
        "title": "CHECK, UNIQUE & defaults (advanced)", "summary": "Put business rules where every writer must obey them.",
        "why": "App-side validation protects one code path. Constraints protect the data from every path — scripts, other services, a psql session, a buggy migration.",
        "objectives": ["Write CHECK constraints (Python/SQL).", "Use composite UNIQUE for 'one per parent' rules.", "Know what Prisma can and cannot express (no CHECK — use a SQL migration)."],
        "pitfalls": ["Validating only in the API.", "A global UNIQUE where the rule is per parent.", "Unnamed constraints — error messages become cryptic."],
        "mapping": "SQLAlchemy CheckConstraint/UniqueConstraint in __table_args__. Prisma @@unique([a, b]), @default(...); CHECK via a SQL migration. SQL: CHECK (...), UNIQUE (a, b), DEFAULT.",
        "refs": ["pg_constraints", "sa_constraints", "prisma_indexes"],
        "example": {"python": "__table_args__ = (CheckConstraint(\"price >= 0\", name=\"ck_price\"),)",
                    "prisma": "@@unique([storeId, sku])", "sql": "price NUMERIC(10,2) NOT NULL CHECK (price >= 0)"},
    },
    "15-transactions": {
        "title": "Transactions (advanced)", "summary": "All-or-nothing changes: commit, rollback and why two writes must share one transaction.",
        "why": "A transfer is two writes. If only one lands, money is created or destroyed. A transaction makes the pair atomic: both commit, or a failure rolls both back.",
        "objectives": ["Group related writes in one transaction.", "Understand rollback on error.", "Python: `with Session(engine) as s, s.begin():` — Prisma: `$transaction` — SQL: BEGIN/COMMIT."],
        "pitfalls": ["Two separate sessions/calls for one logical change.", "Forgetting to commit.", "Using the global client inside a Prisma interactive transaction."],
        "mapping": "SQLAlchemy Session.begin() context. Prisma $transaction([...]) or $transaction(async (tx) => …). SQL BEGIN … COMMIT (the lab wraps your script for you).",
        "refs": ["pg_tx", "sa_session_tx", "prisma_tx"],
        "example": {"python": "with Session(engine) as s, s.begin():\n    alice.balance -= 30\n    bob.balance += 30",
                    "prisma": "await prisma.$transaction([debit, credit])", "sql": "BEGIN;\nUPDATE accounts SET balance = balance - 30 WHERE owner = 'alice';\nUPDATE accounts SET balance = balance + 30 WHERE owner = 'bob';\nCOMMIT;"},
    },
    "16-n-plus-one": {
        "title": "N+1 queries & eager loading (advanced)", "summary": "Why lazy relationship access in a loop explodes into N+1 queries — and the fixes.",
        "why": "ORMs make relationships look like attributes. Touching one in a loop silently runs one query per row; at 1 000 rows that is 1 001 round-trips.",
        "objectives": ["Spot the N+1 pattern.", "Use selectinload/joinedload or Prisma include.", "Know when a JOIN duplicates parent rows."],
        "pitfalls": ["Accessing relationships in templates/serializers.", "joinedload on big collections.", "Fixing N+1 with an index (it only makes each query faster)."],
        "mapping": "SQLAlchemy selectinload/joinedload. Prisma include/select. SQL: one JOIN or WHERE id = ANY(...).",
        "refs": ["sa_loading", "prisma_relq", "pg_select"],
        "example": {"python": "select(Author).options(selectinload(Author.books))", "prisma": "prisma.author.findMany({ include: { books: true } })",
                    "sql": "SELECT a.name, b.title FROM authors a JOIN books b ON b.author_id = a.id;"},
    },
    "17-migrations": {
        "title": "Migrations (advanced)", "summary": "Evolving a live schema safely: versioned migrations instead of create_all / db push.",
        "why": "create_all and db push are great for labs. In production the schema changes while data exists — you need ordered, reviewed, repeatable migration files.",
        "objectives": ["Know why create_all never alters tables.", "Create versioned migrations (Alembic / prisma migrate).", "Add NOT NULL columns safely (default/backfill)."],
        "pitfalls": ["prisma db push in production.", "Adding NOT NULL without a default to a full table.", "Editing an already-applied migration."],
        "mapping": "Python: alembic revision --autogenerate + alembic upgrade head. Node: prisma migrate dev / migrate deploy. SQL: numbered .sql files applied in order.",
        "refs": ["alembic", "prisma_migrate", "pg_alter"],
        "example": {"python": "alembic revision --autogenerate -m \"add bio\"\nalembic upgrade head", "prisma": "npx prisma migrate dev --name add_bio",
                    "sql": "ALTER TABLE lab_authors ADD COLUMN bio TEXT NOT NULL DEFAULT '';"},
    },
}

EXTRA_LESSON_REFS = {
    "01-connections": ["prisma_ds"],
    "11-validation": ["sa_validates", "zod", "pg_constraints"],
    "12-frameworks": ["next_server_client", "next_env"],
}


def read(p: Path) -> dict:
    return json.loads(p.read_text())


def write(p: Path, d: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


def tables_of(req: dict) -> list[str]:
    return [t["name"] for t in (req or {}).get("tables", [])]


def merged_req(lesson: dict, lang_block: dict) -> dict:
    req = copy.deepcopy(lesson.get("req") or {})
    for k, v in (lang_block.get("req") or {}).items():
        req[k] = copy.deepcopy(v)
    return req


def pick(v, track):
    return v[track] if isinstance(v, dict) and track in v else v


def exercise_for(track: str, lid: str) -> dict:
    lang = TRACKS[track]["lang"]
    L = LESSONS[lid]
    quiz = L.get("quiz") or (L.get("quiz_prisma") if lang == "prisma" else None)
    if quiz and (lang not in L):
        return {
            "kind": "quiz",
            "runnable": True,
            "prompt": "Answer every question — each wrong option explains why it is wrong.",
            "questions": quiz,
            "solution": json.dumps({"answers": {q["id"]: next(o["id"] for o in q["options"] if o.get("correct")) for q in quiz}}),
            "wrongSolutions": [
                {"label": "first option everywhere", "expect": ["wrong-answer"] if any(not q["options"][0].get("correct") for q in quiz) else [],
                 "code": json.dumps({"answers": {q["id"]: q["options"][0]["id"] for q in quiz}})},
                {"label": "nothing answered", "expect": ["unanswered"], "code": json.dumps({"answers": {}})},
            ],
        }
    b = L[lang]
    req = merged_req(L, b)
    js = track == "node-javascript"
    prefix = PRISMA_JS_NOTE if js and lang == "prisma" and not req.get("zod") else ""
    language = {"python": "python", "sql": "sql"}.get(lang) or (pick(b.get("lang"), track) if req.get("zod") else "prisma")
    wrong = pick(b["wrong"], track)
    return {
        "kind": "code",
        "runnable": True,
        "language": language,
        "prompt": b["prompt"],
        "hint": b["hint"],
        "starterCode": prefix + pick(b["starter"], track),
        "solution": prefix + pick(b["solution"], track),
        "wrongSolutions": [{"label": w["label"], "expect": w["expect"], "code": prefix + w["code"]} for w in wrong],
        "requirements": req,
        "animation": {"highlightTables": tables_of(req), "highlightRels": []},
    }


def lesson_example(track: str, lid: str, base: dict | None) -> dict:
    lang = TRACKS[track]["lang"]
    if lid in NEW_LESSONS:
        ex = NEW_LESSONS[lid]["example"]
        return {"language": {"prisma": "prisma"}.get(lang, lang), "code": ex[lang] if lang in ex else ex["prisma"], "sql": ex["sql"]}
    if track == "sql-postgres":
        return {"language": "sql", "code": (base or {}).get("sql") or "", "sql": (base or {}).get("sql") or ""}
    return base


def build_lessons(track: str) -> list[str]:
    ldir = ROOT / "tracks" / track / "lessons"
    src_dir = ROOT / "tracks" / ("python-sqlalchemy" if track == "sql-postgres" else track) / "lessons"
    ids = []
    for order, lid in enumerate(LESSON_ORDER, start=1):
        existing = next((p for p in src_dir.glob("*.json") if read(p)["id"] == lid), None)
        if lid in NEW_LESSONS:
            m = NEW_LESSONS[lid]
            data = {
                "id": lid, "order": order, "title": m["title"], "summary": m["summary"],
                "body": f"{m['summary']}\n\nWhy it matters: {m['why']}\n\nSQL ↔ ORM: {m['mapping']}",
                "why": m["why"], "objectives": m["objectives"], "pitfalls": m["pitfalls"], "mappingNotes": m["mapping"],
                "teachAlong": [f"Cause: {m['summary']}", "Effect: run the exercise and read the gate's rule ids.", "Replay any run from History."],
                "references": [REF[r] for r in m["refs"]],
                "level": "advanced",
            }
        else:
            data = read(existing)
            data["order"] = order
            data.setdefault("level", "beginner" if order <= 6 else "intermediate")
            if existing.parent != ldir:  # sql track copies the python lesson text
                data = copy.deepcopy(data)
        data["example"] = lesson_example(track, lid, data.get("example"))
        refs = data.get("references", [])
        for r in EXTRA_LESSON_REFS.get(lid, []):
            if REF[r]["url"] not in {x["url"] for x in refs}:
                refs.append(REF[r])
        data["references"] = refs
        data["exercise"] = exercise_for(track, lid)
        out = ldir / f"{lid}.json"
        for stale in ldir.glob("*.json"):
            if stale != out and read(stale)["id"] == lid:
                stale.unlink()
        write(out, data)
        ids.append(lid)
    return ids


def task_file(track: str, meta: dict) -> Path:
    return ROOT / "tracks" / track / "tasks" / f"{meta['order']:02d}-{meta['id']}.json"


def build_advanced_tasks(track: str) -> None:
    lang = TRACKS[track]["lang"]
    js = track == "node-javascript"
    prefix = PRISMA_JS_NOTE if js else ""
    for T in (R11, R12):
        m = T["meta"]
        req = copy.deepcopy(T["req"][lang] if "req" in T else m["requirements"])
        b = T[lang]
        data = {
            "id": m["id"], "order": m["order"], "title": m["title"], "summary": m["summary"],
            "description": f"{m['summary']}\n\nWhy: {m['why']}", "objectives": m["objectives"], "hints": m["hints"],
            "sqlEquivalent": m["sqlEquivalent"], "requirements": req, "animation": m["animation"],
            "highlightHint": m["animation"]["highlightTables"], "starterCode": prefix + b["starter"],
            "language": {"python": "python", "sql": "sql"}.get(lang, "prisma"), "trackId": track,
            "why": m["why"], "pitfalls": m["pitfalls"], "teachAlong": m["teachAlong"], "references": m["references"],
            "mappingNotes": "Compare your code with the Equivalent SQL panel. The gate introspects Postgres and runs rolled-back probe INSERTs.",
            "level": "advanced",
            "solution": prefix + b["solution"],
            "wrongSolutions": [{"label": w["label"], "expect": w["expect"], "code": prefix + w["code"]} for w in b["wrong"]],
        }
        if lang == "prisma":
            data["starterCodePrisma"] = data["starterCode"]
        write(task_file(track, m), data)


def build_sql_tasks() -> None:
    sql = SQL_TASKS()
    for f in sorted((ROOT / "tracks" / "python-sqlalchemy" / "tasks").glob("*.json")):
        d = read(f)
        if d["id"] not in sql:
            continue
        d = copy.deepcopy(d)
        d["trackId"] = "sql-postgres"
        d["language"] = "sql"
        d["starterCode"] = "-- Write the CREATE TABLE statements (and INSERTs where asked) for this task.\n-- Tables must be named exactly as in the objectives.\n"
        d["solution"] = sql[d["id"]]["solution"]
        d["wrongSolutions"] = sql[d["id"]]["wrong"]
        d["mappingNotes"] = "Raw SQL is what every ORM generates. The gate introspects the same Postgres catalog for all tracks."
        write(ROOT / "tracks" / "sql-postgres" / "tasks" / f.name, d)


def update_manifest(track: str, lesson_ids: list[str]) -> None:
    p = ROOT / "tracks" / track / "manifest.json"
    if track == "sql-postgres" and not p.exists():
        base = read(ROOT / "tracks" / "python-sqlalchemy" / "manifest.json")
        base.update({
            "id": "sql-postgres", "title": "Raw SQL · PostgreSQL", "language": "sql", "variant": "sql", "runtime": "postgres",
            "api": "python", "order": 4, "icon": "🐘",
            "description": "Write the DDL and queries yourself — CREATE TABLE, REFERENCES, constraints, indexes, JOINs, transactions — executed as a restricted lab role.",
            "prerequisites": {
                "title": "Raw SQL setup", "lockedByDefault": True,
                "install": "psql \"$DATABASE_URL\"   # or any SQL client",
                "code": "-- Your script runs as ONE transaction as the non-superuser role hub_lab.\n-- Tables must be named lab_…; SELECT results are shown below the editor.\nSELECT current_user, version();\n",
                "connection": None, "notes": None,
            },
            "runtimePanels": {"psql": {"title": "Postgres directly", "points": [
                "Every ORM in this hub emits this SQL.", "Constraints live in the database, not in app code.", "The lab rolls back the whole script on any error."]}},
            "validationCatalog": [{"id": "check", "title": "CHECK constraints", "example": "price NUMERIC(10,2) NOT NULL CHECK (price >= 0)"}],
        })
        m = base
    else:
        m = read(p)
    tasks = sorted(read(f) for f in (ROOT / "tracks" / track / "tasks").glob("*.json")) if False else sorted(
        (read(f) for f in (ROOT / "tracks" / track / "tasks").glob("*.json")), key=lambda d: d["order"])
    m["taskIds"] = [t["id"] for t in tasks]
    m["lessonIds"] = lesson_ids
    write(p, m)


def update_index() -> None:
    p = ROOT / "tracks" / "index.json"
    idx = read(p)
    if not any(t["id"] == "sql-postgres" for t in idx["tracks"]):
        man = read(ROOT / "tracks" / "sql-postgres" / "manifest.json")
        entry = {k: man[k] for k in ("id", "title", "language", "variant", "runtime", "api", "description", "icon")}
        entry["order"] = 4
        for t in idx["tracks"]:
            if t["id"] == "playwright-typescript":
                t["order"] = 5
        idx["tracks"].insert(3, entry)
    write(p, idx)


CREATES = re.compile(
    r'__tablename__\s*=\s*"(lab_[a-z0-9_]+)"|@@map\("(lab_[a-z0-9_]+)"\)|CREATE TABLE (?:IF NOT EXISTS )?(lab_[a-z0-9_]+)'
    r'|Table\(\s*"(lab_[a-z0-9_]+)"',
    re.I,
)


def created_tables(spec: dict) -> list[str]:
    codes = [spec.get("solution") or ""] + [w["code"] for w in spec.get("wrongSolutions", [])]
    return sorted({next(g for g in m.groups() if g) for c in codes for m in CREATES.finditer(c)})


def add_reset_tables(track: str) -> None:
    """Clean slate: every table the reference/wrong answers create is dropped before a run, so a
    leftover from an earlier attempt can neither break a correct answer nor rescue a wrong one."""
    for f in list((ROOT / "tracks" / track / "tasks").glob("*.json")) + list((ROOT / "tracks" / track / "lessons").glob("*.json")):
        d = read(f)
        spec = d.get("exercise") if "exercise" in d else d
        req = spec.get("requirements") if isinstance(spec, dict) else None
        if not req:
            continue
        extra = [t for t in created_tables(spec) if t not in tables_of(req)]
        if extra:
            req["resetTables"] = extra
        else:
            req.pop("resetTables", None)
        write(f, d)


def main() -> None:
    build_sql_tasks()
    for track in TRACKS:
        build_advanced_tasks(track)
        ids = build_lessons(track)
        update_manifest(track, ids)
        add_reset_tables(track)
    update_index()
    print("lessons + advanced tasks + sql-postgres written")


if __name__ == "__main__":
    main()
