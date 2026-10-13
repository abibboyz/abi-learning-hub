"""Raw SQL lab runner (track sql-postgres).

Learner SQL runs as the non-superuser lab role (app/lab_role.py) in ONE transaction:
  * a client-side watchdog cancels the statement after the timeout (the learner could `SET
    statement_timeout = 0`, so the role default alone is not enough),
  * after the script, any table the lab role created outside the `lab_` namespace rolls the whole
    transaction back,
  * the error position Postgres reports is turned into a line number for the editor.
The lab role has no privileges on hub tables and no superuser features (COPY ... PROGRAM, file access).
"""
from __future__ import annotations

import re
import threading
from typing import Any

import psycopg

from app.config import settings


def _plain(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://")


def _line_of(sql: str, position: Any) -> int | None:
    try:
        pos = int(position)
    except (TypeError, ValueError):
        return None
    return sql[: max(pos - 1, 0)].count("\n") + 1


TX_CONTROL = re.compile(r"(?:^|;)\s*(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION)\b", re.I)


def _strip_comments(sql: str) -> str:
    sql = re.sub(r"\$(\w*)\$.*?\$\1\$", " ", sql, flags=re.S)  # dollar-quoted bodies (DO / functions)
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)  # string literals
    return re.sub(r"/\*.*?\*/", " ", re.sub(r"--[^\n]*", " ", sql), flags=re.S)


MAX_RESULT_ROWS = 50


def _cell(v: Any) -> Any:
    """JSON-safe cell value for result tables (dates, decimals, bytes → text)."""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)


def run_lab_sql(
    sql: str,
    database_url: str,
    timeout_sec: float | None = None,
    commit: bool = True,
    explain: str | None = None,
    reset_tables: list[str] | None = None,
) -> dict[str, Any]:
    """Run learner SQL in one transaction.

    commit=False is the scratch mode ("run selection"): same checks, but always rolled back.
    explain=<statement> runs the script as setup, then `EXPLAIN (FORMAT JSON …)` of that statement, and
    always rolls back (EXPLAIN ANALYZE really executes the statement; nothing is kept).
    """
    timeout = timeout_sec or settings.runner_timeout_sec
    m = TX_CONTROL.search(_strip_comments(sql))
    if m:
        return {
            "ok": False,
            "rejected": True,
            "stdout": "",
            "error": f"Remove `{m.group(1).upper()}` — the lab already wraps your whole script in one transaction "
            "(and rolls it back if anything fails).",
        }
    out: list[str] = []
    results: list[dict[str, Any]] = []
    plan: Any = None
    try:
        conn = psycopg.connect(_plain(database_url), connect_timeout=5, autocommit=False)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stdout": "", "error": f"Could not connect to the lab database: {e}"}
    timer = threading.Timer(timeout, conn.cancel)
    timer.start()
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '3s'")
            for t in reset_tables or []:  # clean slate inside the same transaction (separate statement → lines stay)
                if re.fullmatch(r"lab_[a-z0-9_]{1,58}", t):
                    cur.execute("SAVEPOINT hub_reset")
                    try:  # a table owned by another role (e.g. created by api-node) is left alone
                        cur.execute(f'DROP TABLE IF EXISTS "{t}" CASCADE')
                        cur.execute("RELEASE SAVEPOINT hub_reset")
                    except psycopg.Error:
                        cur.execute("ROLLBACK TO SAVEPOINT hub_reset")
            if sql.strip():
                cur.execute(sql.encode("utf-8"))  # bytes → simple query protocol, so several statements are allowed
            while sql.strip():  # collect every result set: a text preview ("stdout") + structured tables
                if cur.description:
                    cols = [d.name for d in cur.description]
                    rows = cur.fetchmany(MAX_RESULT_ROWS)
                    out.append(" | ".join(cols))
                    out.extend(" | ".join("NULL" if v is None else str(v) for v in r) for r in rows[:20])
                    out.append(f"({cur.rowcount} row{'s' if cur.rowcount != 1 else ''})")
                    results.append(
                        {"columns": cols, "rows": [[_cell(v) for v in r] for r in rows], "rowCount": cur.rowcount}
                    )
                if not cur.nextset():
                    break
            if explain is not None:
                analyze = explain.startswith("ANALYZE ")
                stmt = explain[len("ANALYZE "):] if analyze else explain
                cur.execute(
                    f"EXPLAIN (FORMAT JSON, VERBOSE FALSE, COSTS TRUE{', ANALYZE TRUE, TIMING TRUE' if analyze else ''}) "
                    + stmt
                )
                plan = cur.fetchone()[0]
                conn.rollback()
                return {"ok": True, "stdout": "\n".join(out)[-4000:], "error": None, "results": results, "plan": plan}
            cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user "
                "AND tablename NOT LIKE 'lab\\_%'"
            )
            stray = [r[0] for r in cur.fetchall()]
            if stray:
                conn.rollback()
                return {
                    "ok": False,
                    "rejected": True,
                    "stdout": "",
                    "error": f"Lab tables must be named lab_… (found {', '.join(stray)}). Nothing was committed.",
                }
        if commit:
            conn.commit()
        else:
            conn.rollback()
        return {"ok": True, "stdout": "\n".join(out)[-4000:], "error": None, "results": results}
    except psycopg.errors.QueryCanceled:
        conn.rollback()
        return {
            "ok": False,
            "stdout": "",
            "error": f"TimeoutError: the SQL ran longer than {timeout:g} s and was cancelled. Nothing was committed.",
        }
    except psycopg.Error as e:
        conn.rollback()
        line = _line_of(sql, getattr(e.diag, "statement_position", None))
        first = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
        return {
            "ok": False,
            "stdout": "",
            "error": f"{type(e).__name__}: {first}" + (f" (line {line})" if line else "") + " — nothing was committed.",
            "line": line,
        }
    finally:
        timer.cancel()
        conn.close()
