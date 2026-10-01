"""Introspect Postgres schema into a diagram-friendly structure."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

SKIP_TABLES = {
    "run_history",
    "learner_progress",
    "alembic_version",
    "_prisma_migrations",
}


def introspect_schema(engine: Engine) -> dict[str, Any]:
    with engine.connect() as conn:
        return _introspect(conn)


def _introspect(conn: Connection) -> dict[str, Any]:
    tables_rows = conn.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        )
    ).fetchall()

    unique_cols = conn.execute(
        text(
            """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
            """
        )
    ).fetchall()
    unique_set = {(t, c) for t, c in unique_cols}

    tables: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []

    for (table_name,) in tables_rows:
        if table_name in SKIP_TABLES:
            continue

        cols = conn.execute(
            text(
                """
                SELECT
                    c.column_name,
                    c.data_type,
                    c.udt_name,
                    c.is_nullable,
                    c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = :table
                      AND tc.constraint_type = 'PRIMARY KEY'
                ) pk ON pk.column_name = c.column_name
                WHERE c.table_schema = 'public' AND c.table_name = :table
                ORDER BY c.ordinal_position
                """
            ),
            {"table": table_name},
        ).fetchall()

        columns = []
        for col_name, data_type, udt_name, is_nullable, default, is_pk in cols:
            type_label = udt_name if data_type == "USER-DEFINED" else data_type
            columns.append(
                {
                    "name": col_name,
                    "type": type_label,
                    "nullable": is_nullable == "YES",
                    "default": default,
                    "isPrimaryKey": bool(is_pk),
                    "isUnique": (table_name, col_name) in unique_set,
                    "isForeignKey": False,
                }
            )

        fks = conn.execute(
            text(
                """
                SELECT
                    kcu.column_name,
                    ccu.table_name AS foreign_table,
                    ccu.column_name AS foreign_column,
                    rc.delete_rule,
                    rc.update_rule,
                    tc.constraint_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
                JOIN information_schema.referential_constraints AS rc
                  ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = 'public'
                  AND tc.table_name = :table
                """
            ),
            {"table": table_name},
        ).fetchall()

        col_by_name = {c["name"]: c for c in columns}
        for (
            col_name,
            foreign_table,
            foreign_column,
            delete_rule,
            update_rule,
            constraint_name,
        ) in fks:
            if col_name in col_by_name:
                col_by_name[col_name]["isForeignKey"] = True
                col_by_name[col_name]["references"] = {
                    "table": foreign_table,
                    "column": foreign_column,
                }
            relationships.append(
                {
                    "fromTable": table_name,
                    "fromColumn": col_name,
                    "toTable": foreign_table,
                    "toColumn": foreign_column,
                    "onDelete": delete_rule,
                    "onUpdate": update_rule,
                    "constraint": constraint_name,
                    "type": "many-to-one",
                }
            )

        tables.append({"name": table_name, "columns": columns})

    return {"tables": tables, "relationships": relationships}
