"""Schema gate: compare the real Postgres schema (and, optionally, data) with a task's requirements.

Extra tables/columns are always allowed. Every failure carries a stable rule id and a message that
explains the cause and its effect. api-node/src/lib/taskChecker.ts implements the same rules with the
same ids; tests/fixtures/schema-gate-cases.json is run by both test suites to keep them in step.

Requirement shape (per table):
  {"name": "lab_x",
   "columns": [{"name": "c", "pk": true, "unique": true|false, "nullable": true|false,
                "type": "integer|text|numeric|boolean|timestamp|float",
                "fk": {"table": "lab_y", "column": "id", "onDelete": "CASCADE"}}],
   "uniqueTogether": [["a", "b"]]}
Column flags also include "indexed": true (leading column of some index/unique/PK).
Top-level "probes": trusted statements run in a rolled-back transaction (see check_probes).
Top-level "data": [{"sql": "SELECT count(*) ...", "min": 1, "max": null, "message": "..."}]
is evaluated by the API (it needs a DB connection) via check_data().
"""
from __future__ import annotations

from typing import Any, Callable

TYPE_FAMILIES: dict[str, set[str]] = {
    "integer": {"integer", "bigint", "smallint", "int4", "int8", "int2"},
    "text": {"character varying", "text", "character", "varchar", "bpchar"},
    "numeric": {"numeric", "decimal"},
    "boolean": {"boolean", "bool"},
    "timestamp": {
        "timestamp without time zone",
        "timestamp with time zone",
        "timestamp",
        "timestamptz",
        "date",
    },
    "float": {"double precision", "real", "float8", "float4"},
}

TYPE_HINT = {
    "integer": "Integer / Int",
    "text": "String / VARCHAR / TEXT",
    "numeric": "Numeric(10, 2) / Decimal — exact money, no float rounding",
    "boolean": "Boolean",
    "timestamp": "DateTime",
    "float": "Float",
}


def type_family(pg_type: str | None) -> str | None:
    t = (pg_type or "").lower()
    for fam, names in TYPE_FAMILIES.items():
        if t in names:
            return fam
    return None


def _fail(failures: list[dict[str, Any]], rule: str, message: str, **where: Any) -> None:
    failures.append({"rule": rule, "message": message, **where})


def check_requirements(schema: dict[str, Any], requirements: dict[str, Any]) -> dict[str, Any]:
    """Return {ok, errors[], failures[{rule, message, table, column}], matched[], message}. Read-only."""
    failures: list[dict[str, Any]] = []
    matched: list[str] = []
    tables_by_name = {t["name"]: t for t in schema.get("tables", [])}
    rels = schema.get("relationships", [])

    for req_table in requirements.get("tables", []):
        name = req_table["name"]
        actual = tables_by_name.get(name)
        if actual is None:
            _fail(
                failures,
                "missing-table",
                f"Missing required table `{name}`. Why: later foreign keys and joins need this relation "
                f"to exist in Postgres — declare it (exact table name `{name}`) and re-run.",
                table=name,
            )
            continue
        matched.append(f"table:{name}")
        cols = {c["name"]: c for c in actual.get("columns", [])}

        for req_col in req_table.get("columns", []):
            cname = req_col["name"]
            ref = f"{name}.{cname}"
            col = cols.get(cname)
            if col is None:
                _fail(
                    failures,
                    "missing-column",
                    f"Table `{name}` is missing column `{cname}`. Why: the gate reads the real columns in "
                    f"Postgres; extras are fine, but `{cname}` must exist (check the spelling and which side of "
                    f"the relationship it belongs on).",
                    table=name,
                    column=cname,
                )
                continue
            matched.append(f"column:{ref}")

            if req_col.get("pk") and not col.get("isPrimaryKey"):
                _fail(
                    failures,
                    "not-primary-key",
                    f"Column `{ref}` must be the primary key. Why: foreign keys reference primary (or unique) "
                    f"keys — without a PK, child tables cannot attach a valid REFERENCES constraint.",
                    table=name,
                    column=cname,
                )

            want_type = req_col.get("type")
            if want_type:
                got = type_family(col.get("type"))
                if got != want_type:
                    _fail(
                        failures,
                        "wrong-type",
                        f"Column `{ref}` is `{col.get('type')}` but should be a {want_type} type "
                        f"({TYPE_HINT.get(want_type, want_type)}). Why: the column type decides what Postgres "
                        f"accepts and how values compare, sum and sort.",
                        table=name,
                        column=cname,
                    )

            if "nullable" in req_col:
                if req_col["nullable"] and not col.get("nullable"):
                    _fail(
                        failures,
                        "must-be-nullable",
                        f"Column `{ref}` must allow NULL. Why: some rows legitimately have no value here "
                        f"(e.g. the top of a hierarchy has no parent) — NOT NULL makes those rows impossible "
                        f"to insert. Use `Mapped[int | None]` / `Int?`.",
                        table=name,
                        column=cname,
                    )
                if not req_col["nullable"] and col.get("nullable"):
                    _fail(
                        failures,
                        "must-be-not-null",
                        f"Column `{ref}` must be NOT NULL. Why: every row needs this value — a nullable column "
                        f"lets orphan/incomplete rows in. Use `Mapped[int]` (not Optional) / a non-`?` field.",
                        table=name,
                        column=cname,
                    )

            if req_col.get("unique") is True and not col.get("isUnique"):
                _fail(
                    failures,
                    "not-unique",
                    f"Column `{ref}` must be UNIQUE. Why: without a unique constraint Postgres accepts duplicates"
                    f" — for a foreign key that silently turns 1:1 into 1:N. Add `unique=True` / `@unique`.",
                    table=name,
                    column=cname,
                )
            if req_col.get("unique") is False and col.get("isUnique") and not col.get("isPrimaryKey"):
                _fail(
                    failures,
                    "must-not-be-unique",
                    f"Column `{ref}` must NOT be unique. Why: a UNIQUE foreign key allows only one child per "
                    f"parent, which makes this relationship 1:1 instead of the one-to-many the task asks for.",
                    table=name,
                    column=cname,
                )

            if req_col.get("indexed") and not _is_indexed(actual, cname):
                _fail(
                    failures,
                    "missing-index",
                    f"Column `{ref}` needs an index (it may be the first column of a composite one). Why: "
                    f"Postgres does not index foreign keys automatically — joins and ON DELETE checks on this "
                    f"column scan the whole table. Use `index=True` / `@@index([...])` / CREATE INDEX.",
                    table=name,
                    column=cname,
                )

            fk = req_col.get("fk")
            if fk:
                target = f"{fk['table']}.{fk['column']}"
                if not col.get("isForeignKey"):
                    _fail(
                        failures,
                        "not-foreign-key",
                        f"Column `{ref}` must be a foreign key to `{target}`. Why: relationships are enforced by "
                        f"FK constraints — an ORM `relationship`/`@relation` or a plain integer column without a "
                        f"real FK lets rows point at parents that do not exist.",
                        table=name,
                        column=cname,
                    )
                else:
                    got_ref = col.get("references") or {}
                    if got_ref.get("table") != fk["table"] or got_ref.get("column") != fk["column"]:
                        _fail(
                            failures,
                            "wrong-fk-target",
                            f"Column `{ref}` must reference `{target}`, found "
                            f"`{got_ref.get('table')}.{got_ref.get('column')}`. Why: the FK target defines the "
                            f"parent side of the relationship.",
                            table=name,
                            column=cname,
                        )
                    else:
                        matched.append(f"fk:{ref}->{target}")
                    want_del = (fk.get("onDelete") or "").upper()
                    if want_del:
                        found = next(
                            (
                                (r.get("onDelete") or "").upper()
                                for r in rels
                                if r.get("fromTable") == name and r.get("fromColumn") == cname
                            ),
                            None,
                        )
                        if found != want_del:
                            _fail(
                                failures,
                                "wrong-on-delete",
                                f"FK `{ref}` must have ON DELETE {want_del} (found {found or 'NONE'}). Why: the "
                                f"delete policy lives in the database — an ORM-only cascade does nothing for SQL "
                                f"deletes or other apps, and children would block (or be orphaned by) the delete.",
                                table=name,
                                column=cname,
                            )
                        else:
                            matched.append(f"onDelete:{ref}:{want_del}")

        pk = actual.get("primaryKey") or []
        uniques = actual.get("uniqueConstraints") or []
        for group in req_table.get("uniqueTogether", []):
            want = sorted(group)
            covered = sorted(pk) == want or any(sorted(u) == want for u in uniques)
            if not covered:
                _fail(
                    failures,
                    "missing-composite-key",
                    f"Table `{name}` needs a composite PRIMARY KEY or UNIQUE over ({', '.join(group)}). Why: "
                    f"without it the same pair can be inserted twice — a learner enrolled in a class twice. Use "
                    f"`primary_key=True` on both columns / `@@id([...])`.",
                    table=name,
                )
            else:
                matched.append(f"key:{name}({','.join(group)})")

    errors = [f["message"] for f in failures]
    return {
        "ok": not failures,
        "errors": errors,
        "failures": failures,
        "matched": matched,
        "message": "All requirements satisfied — extras are allowed." if not failures else "; ".join(errors),
    }


def _is_indexed(table: dict[str, Any], column: str) -> bool:
    groups = [table.get("primaryKey") or []] + (table.get("uniqueConstraints") or []) + (table.get("indexes") or [])
    return any(g and g[0] == column for g in groups)


def check_probes(probes: list[dict[str, Any]], run: Callable[[list[str]], int]) -> list[dict[str, Any]]:
    """Behaviour checks written by the track author (never learner SQL).

    Each probe: {"sql": [statements], "expect": "ok"|"error", "minRows": N, "message": "..."}.
    `run` executes the statements in ONE transaction that is always rolled back and returns the row
    count of the last statement; it raises on a database error.
    """
    failures: list[dict[str, Any]] = []
    for p in probes or []:
        expect = p.get("expect", "ok")
        try:
            rows = run(list(p["sql"]))
            err = None
        except Exception as e:  # noqa: BLE001
            rows, err = None, str(e).strip().splitlines()[0][:300]
        if expect == "error":
            if err is None:
                _fail(failures, "constraint-not-enforced", f"{p['message']} The database accepted it.")
        elif err is not None:
            _fail(failures, "probe-failed", f"{p['message']} Postgres said: {err}")
        elif p.get("minRows") is not None and (rows or 0) < p["minRows"]:
            _fail(failures, "probe-failed", f"{p['message']} Got {rows} row(s), expected at least {p['minRows']}.")
    return failures


def check_data(
    data_reqs: list[dict[str, Any]], scalar: Callable[[str], Any]
) -> list[dict[str, Any]]:
    """Evaluate trusted, author-written count queries from the track JSON (never learner SQL)."""
    failures: list[dict[str, Any]] = []
    for d in data_reqs or []:
        try:
            n = int(scalar(d["sql"]) or 0)
        except Exception as e:  # noqa: BLE001 — table missing etc. is reported as missing data
            n = None
            err = str(e).splitlines()[0]
        if n is None:
            _fail(failures, "missing-data", f"{d['message']} (the check query failed: {err})")
        elif d.get("min") is not None and n < d["min"]:
            _fail(failures, "missing-data", f"{d['message']} Found {n} row(s), expected at least {d['min']}.")
        elif d.get("max") is not None and n > d["max"]:
            _fail(failures, "too-much-data", f"{d['message']} Found {n} row(s), expected at most {d['max']}.")
    return failures


def merge(validation: dict[str, Any], extra: list[dict[str, Any]]) -> dict[str, Any]:
    if not extra:
        return validation
    failures = validation["failures"] + extra
    errors = [f["message"] for f in failures]
    return {**validation, "ok": False, "failures": failures, "errors": errors, "message": "; ".join(errors)}


def check_calls(specs: list[dict[str, Any]], results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compare trusted behaviour calls ({"call", "kwargs", "expect": "ok"|"raises", "message"}) with what
    the learner's code did when the runner called it."""
    failures: list[dict[str, Any]] = []
    for spec, res in zip(specs or [], results or []):
        status = res.get("status")
        if status == "missing":
            _fail(
                failures,
                "missing-name",
                f"`{spec['call']}` is not defined. Why: the gate calls it to test your validation — keep that exact name.",
            )
        elif spec.get("expect") == "raises" and status != "raised":
            _fail(failures, "accepts-invalid", f"{spec['message']} Your code accepted it without raising an error.")
        elif spec.get("expect", "ok") == "ok" and status == "raised":
            _fail(failures, "rejects-valid", f"{spec['message']} Your code raised: {res.get('error')}")
    return failures


def check_stdout(spec: dict[str, Any] | None, stdout: str) -> list[dict[str, Any]]:
    if not spec:
        return []
    lines = [ln.strip() for ln in (stdout or "").splitlines()]
    if spec["contains"] in lines:
        return []
    return [
        {
            "rule": "missing-output",
            "message": f"{spec['message']} Expected a printed line `{spec['contains']}`, got "
            + (f"`{' | '.join(lines[:5])}`." if any(lines) else "no output."),
        }
    ]


def grade_quiz(questions: list[dict[str, Any]], code: str) -> dict[str, Any]:
    """Quiz exercise: `code` is JSON {"answers": {questionId: optionId}}. Every wrong option carries the
    reason it is wrong, which becomes the failure message."""
    import json

    try:
        answers = json.loads(code).get("answers") or {}
        if not isinstance(answers, dict):
            raise ValueError
    except (ValueError, AttributeError):
        f = {"rule": "rejected", "message": 'Quiz answers must be JSON like {"answers": {"q1": "b"}}.'}
        return {"ok": False, "errors": [f["message"]], "failures": [f], "matched": [], "message": f["message"]}
    failures: list[dict[str, Any]] = []
    matched: list[str] = []
    for q in questions:
        picked = answers.get(q["id"])
        opt = next((o for o in q["options"] if o["id"] == picked), None)
        if opt is None:
            _fail(failures, "unanswered", f"Question “{q['prompt']}” has no answer yet.", question=q["id"])
        elif not opt.get("correct"):
            _fail(failures, "wrong-answer", f"“{q['prompt']}” — {opt['why']}", question=q["id"])
        else:
            matched.append(f"question:{q['id']}")
    errors = [f["message"] for f in failures]
    return {
        "ok": not failures,
        "errors": errors,
        "failures": failures,
        "matched": matched,
        "message": "All answers correct." if not failures else "; ".join(errors),
    }
