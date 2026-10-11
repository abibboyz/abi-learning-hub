"""Non-superuser Postgres role for learner code.

The hub's own DATABASE_URL user owns run_history/learner_progress (and in Compose it is the Postgres
superuser). Learner code must not run as that user: raw `text()` SQL could read or drop hub tables, or
use superuser-only features. At startup the API (re)creates `hub_lab` with a fresh random password,
lets it create tables in `public`, and hands learner code a DATABASE_URL for that role. If the API user
cannot manage roles, learner code falls back to the main URL and a warning is logged.
"""
from __future__ import annotations

import secrets

from sqlalchemy import text
from sqlalchemy.engine import Engine, make_url

LAB_ROLE = "hub_lab"
_lab_url: str | None = None


def ensure_lab_role(engine: Engine, database_url: str, statement_timeout_ms: int = 10_000) -> str | None:
    """Create/refresh the lab role; return the learner DATABASE_URL (or None if not possible)."""
    global _lab_url
    password = secrets.token_urlsafe(24)
    try:
        with engine.begin() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": LAB_ROLE}).first()
            if not exists:
                conn.execute(text(f'CREATE ROLE "{LAB_ROLE}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'))
            conn.execute(text(f"ALTER ROLE \"{LAB_ROLE}\" WITH LOGIN PASSWORD '{password}'"))
            conn.execute(text(f'ALTER ROLE "{LAB_ROLE}" SET statement_timeout = {int(statement_timeout_ms)}'))
            conn.execute(text(f'GRANT USAGE, CREATE ON SCHEMA public TO "{LAB_ROLE}"'))
            for t in ("run_history", "learner_progress"):
                conn.execute(text(f'REVOKE ALL ON TABLE {t} FROM "{LAB_ROLE}"')) if _table_exists(conn, t) else None
    except Exception as e:  # noqa: BLE001
        print(f"[lab-role] not available, learner code uses the main DB user: {e}")
        _lab_url = None
        return None
    url = make_url(database_url).set(username=LAB_ROLE, password=password)
    # psycopg (v3) understands the "+psycopg" driver; learner code calls create_engine(DATABASE_URL).
    _lab_url = url.render_as_string(hide_password=False)
    return _lab_url


def _table_exists(conn, name: str) -> bool:
    return conn.execute(text("SELECT to_regclass(:n) IS NOT NULL"), {"n": f"public.{name}"}).scalar()


def lab_database_url(default: str) -> str:
    return _lab_url or default
