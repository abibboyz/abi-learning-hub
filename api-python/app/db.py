from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ensure_meta_tables(engine: Engine | None = None) -> None:
    eng = engine or get_engine()
    with eng.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS run_history (
                    id SERIAL PRIMARY KEY,
                    track_id VARCHAR(64) NOT NULL,
                    task_id VARCHAR(64),
                    mode VARCHAR(32) NOT NULL DEFAULT 'execute',
                    code TEXT NOT NULL,
                    success BOOLEAN NOT NULL DEFAULT FALSE,
                    message TEXT,
                    schema_before JSONB,
                    schema_after JSONB,
                    validation JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS learner_progress (
                    id SERIAL PRIMARY KEY,
                    track_id VARCHAR(64) NOT NULL,
                    task_id VARCHAR(64) NOT NULL,
                    completed BOOLEAN NOT NULL DEFAULT FALSE,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_code TEXT,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (track_id, task_id)
                )
                """
            )
        )
        # Lab UX (hint ladder, per-run data snapshots). Additive, so older databases upgrade in place.
        conn.execute(text("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS data_before JSONB"))
        conn.execute(text("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS data_after JSONB"))
        conn.execute(text("ALTER TABLE run_history ADD COLUMN IF NOT EXISTS hint_level INTEGER NOT NULL DEFAULT 0"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS hint_usage (
                    id SERIAL PRIMARY KEY,
                    track_id VARCHAR(64) NOT NULL,
                    item_kind VARCHAR(16) NOT NULL,
                    item_id VARCHAR(64) NOT NULL,
                    level INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (track_id, item_kind, item_id, level)
                )
                """
            )
        )
