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


def run_lab_sql(sql: str, database_url: str, timeout_sec: float | None = None) -> dict[str, Any]:
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
    try:
        conn = psycopg.connect(_plain(database_url), connect_timeout=5, autocommit=False)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stdout": "", "error": f"Could not connect to the lab database: {e}"}
    timer = threading.Timer(timeout, conn.cancel)
    timer.start()
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout = '3s'")
            cur.execute(sql.encode("utf-8"))  # bytes → simple query protocol, so several statements are allowed
            while True:  # collect a small preview of every result set (SELECT output) as "stdout"
                if cur.description:
                    cols = [d.name for d in cur.description]
                    rows = cur.fetchmany(20)
                    out.append(" | ".join(cols))
                    out.extend(" | ".join("NULL" if v is None else str(v) for v in r) for r in rows)
                    out.append(f"({cur.rowcount} row{'s' if cur.rowcount != 1 else ''})")
                if not cur.nextset():
                    break
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
        conn.commit()
        return {"ok": True, "stdout": "\n".join(out)[-4000:], "error": None}
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
