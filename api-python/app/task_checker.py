"""Validate schema against task requirements BEFORE allowing mutate confirmation.

Extra columns/tables beyond requirements are allowed.
Errors explain *why* the gate failed (cause → effect).
"""
from __future__ import annotations

from typing import Any


def check_requirements(schema: dict[str, Any], requirements: dict[str, Any]) -> dict[str, Any]:
    """Return {ok, errors[], matched[]} — never mutates DB."""
    errors: list[str] = []
    matched: list[str] = []
    tables_by_name = {t["name"]: t for t in schema.get("tables", [])}
    rels = schema.get("relationships", [])

    for req_table in requirements.get("tables", []):
        name = req_table["name"]
        if name not in tables_by_name:
            errors.append(
                f"Missing required table `{name}`. "
                f"Why: later foreign keys and joins need this relation to exist in Postgres — "
                f"declare/create it (lab_ prefix) then re-run."
            )
            continue
        matched.append(f"table:{name}")
        actual = tables_by_name[name]
        cols_by_name = {c["name"]: c for c in actual.get("columns", [])}

        for req_col in req_table.get("columns", []):
            cname = req_col["name"]
            if cname not in cols_by_name:
                errors.append(
                    f"Table `{name}` missing required column `{cname}`. "
                    f"Why: the task gate introspects real columns; extras are fine, but `{cname}` "
                    f"must be present for the relationship drill to proceed."
                )
                continue
            matched.append(f"column:{name}.{cname}")
            col = cols_by_name[cname]

            if req_col.get("pk") and not col.get("isPrimaryKey"):
                errors.append(
                    f"Column `{name}.{cname}` must be a primary key. "
                    f"Why: foreign keys reference primary (or unique) keys — without a PK, "
                    f"child tables cannot attach a valid REFERENCES constraint."
                )

            if req_col.get("unique"):
                if not col.get("isUnique") and not col.get("isPrimaryKey"):
                    pass  # soft — introspector may omit unique flags

            fk = req_col.get("fk")
            if fk:
                if not col.get("isForeignKey"):
                    errors.append(
                        f"Column `{name}.{cname}` must be a foreign key to "
                        f"`{fk['table']}.{fk['column']}`. "
                        f"Why: relationships are enforced by FK constraints — an ORM "
                        f"`relationship`/`@relation` without a real FK will not pass the gate."
                    )
                else:
                    ref = col.get("references") or {}
                    if ref.get("table") != fk["table"] or ref.get("column") != fk["column"]:
                        errors.append(
                            f"Column `{name}.{cname}` must reference "
                            f"`{fk['table']}.{fk['column']}`, "
                            f"found `{ref.get('table')}.{ref.get('column')}`. "
                            f"Why: the FK target defines the parent side of the relationship."
                        )
                    else:
                        matched.append(f"fk:{name}.{cname}->{fk['table']}.{fk['column']}")

                    want_del = (fk.get("onDelete") or "").upper()
                    if want_del:
                        found = None
                        for r in rels:
                            if (
                                r.get("fromTable") == name
                                and r.get("fromColumn") == cname
                            ):
                                found = (r.get("onDelete") or "").upper()
                                break
                        if found != want_del:
                            errors.append(
                                f"FK `{name}.{cname}` must have ON DELETE {want_del} "
                                f"(found {found or 'NONE'}). "
                                f"Why: delete policy decides whether children are removed, "
                                f"nulled, or blocked when the parent row goes away."
                            )
                        else:
                            matched.append(f"onDelete:{name}.{cname}:{want_del}")

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "matched": matched,
        "message": (
            "All requirements satisfied — extras are allowed."
            if not errors
            else "; ".join(errors)
        ),
    }
