"""abi-learning-hub — Python / SQLAlchemy API."""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.config import settings
from app.db import ensure_meta_tables, get_engine, session_scope
import re

from app.lab_role import ensure_lab_role, lab_database_url
from app.runner import UnsafeCodeError, run_lab_code
from app.schema_introspector import introspect_schema
from app.seed import reset_to_seed, seed_database
from app.sql_runner import run_lab_sql
from app.task_checker import (
    check_calls,
    check_data,
    check_probes,
    check_requirements,
    check_stdout,
    grade_quiz,
    merge,
)
from app import tracks_loader as tracks

PRIVATE_KEYS = ("solution", "wrongSolutions")
LAB_TABLE = re.compile(r"^lab_[a-z0-9_]{1,58}$")


def _public(item: dict[str, Any]) -> dict[str, Any]:
    """Strip reference/wrong solutions from task or lesson payloads (served only on request)."""
    out = {k: v for k, v in item.items() if k not in PRIVATE_KEYS}
    ex = out.get("exercise")
    if isinstance(ex, dict):
        ex = {k: v for k, v in ex.items() if k not in PRIVATE_KEYS}
        if ex.get("kind") == "quiz":  # never ship the answer key
            ex["questions"] = [
                {**q, "options": [{"id": o["id"], "text": o["text"]} for o in q["options"]]} for q in ex.get("questions", [])
            ]
        out["exercise"] = ex
    return out

app = FastAPI(title="abi-learning-hub Python API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExecuteBody(BaseModel):
    trackId: str = "python-sqlalchemy"
    taskId: str | None = None
    lessonId: str | None = None
    code: str = Field(..., min_length=1, max_length=20_000)
    mode: str = "execute"  # execute | dry-run
    validateOnly: bool = False


class ProgressBody(BaseModel):
    trackId: str
    taskId: str
    completed: bool = False
    lastCode: str | None = None


@app.on_event("startup")
def on_startup() -> None:
    try:
        engine = get_engine()
        ensure_meta_tables(engine)
        seed_database(engine)
        ensure_lab_role(engine, settings.database_url)
    except Exception as e:  # noqa: BLE001 — allow API up without DB for unit tests
        print(f"[startup] DB not ready yet: {e}")


@app.get("/health")
def health() -> dict[str, Any]:
    db_ok = False
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "ok": True,
        "service": "api-python",
        "database": db_ok,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/tracks")
def get_tracks() -> dict[str, Any]:
    return {"tracks": tracks.list_tracks()}


@app.get("/tracks/{track_id}")
def get_track(track_id: str) -> dict[str, Any]:
    try:
        manifest = tracks.load_manifest(track_id)
        index = next(t for t in tracks.list_tracks() if t["id"] == track_id)
    except (FileNotFoundError, StopIteration) as e:
        raise HTTPException(404, str(e)) from e
    return {**index, **manifest}


@app.get("/tracks/{track_id}/tasks")
def get_tasks(track_id: str) -> dict[str, Any]:
    try:
        return {"tasks": [_public(t) for t in tracks.list_tasks(track_id)]}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/tracks/{track_id}/tasks/{task_id}")
def get_task(track_id: str, task_id: str) -> dict[str, Any]:
    try:
        return _public(tracks.load_task(track_id, task_id))
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/tracks/{track_id}/tasks/{task_id}/solution")
def get_task_solution(track_id: str, task_id: str) -> dict[str, Any]:
    try:
        t = tracks.load_task(track_id, task_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    if not t.get("solution"):
        raise HTTPException(404, "No reference solution for this task")
    return {"solution": t["solution"]}


@app.get("/tracks/{track_id}/lessons/{lesson_id}/solution")
def get_lesson_solution(track_id: str, lesson_id: str) -> dict[str, Any]:
    try:
        lesson = tracks.load_lesson(track_id, lesson_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    ex = lesson.get("exercise") if isinstance(lesson.get("exercise"), dict) else {}
    if not ex.get("solution"):
        raise HTTPException(404, "No reference solution for this lesson")
    return {"solution": ex["solution"]}


@app.get("/tracks/{track_id}/lessons")
def get_lessons(track_id: str) -> dict[str, Any]:
    try:
        return {"lessons": [_public(x) for x in tracks.list_lessons(track_id)]}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/tracks/{track_id}/lessons/{lesson_id}")
def get_lesson(track_id: str, lesson_id: str) -> dict[str, Any]:
    try:
        return _public(tracks.load_lesson(track_id, lesson_id))
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/schema")
def get_schema() -> dict[str, Any]:
    try:
        return introspect_schema(get_engine())
    except Exception as e:
        raise HTTPException(503, f"Database unavailable: {e}") from e


PYTHON_API_TRACKS = {"python-sqlalchemy": "python", "sql-postgres": "sql"}


def _validation(failures: list[dict[str, Any]], matched: list[str] | None = None) -> dict[str, Any]:
    errors = [f["message"] for f in failures]
    return {
        "ok": not failures,
        "errors": errors,
        "failures": failures,
        "matched": matched or [],
        "message": "; ".join(errors) if failures else "All requirements satisfied — extras are allowed.",
    }


@app.post("/execute")
def execute(body: ExecuteBody) -> dict[str, Any]:
    """Gate: (clean slate) → run learner code → introspect → check schema, data, probes, calls, output.

    Every failure is {rule, message, table?, column?, line?}; the same rule ids are used by api-node.
    """
    language = PYTHON_API_TRACKS.get(body.trackId)
    if language is None:
        raise HTTPException(400, f"This API handles {', '.join(PYTHON_API_TRACKS)}. Use api-node for {body.trackId}.")

    engine = get_engine()
    requirements: dict[str, Any] | None = None
    animation: Any = None
    quiz: list[dict[str, Any]] | None = None
    try:
        if body.taskId:
            task = tracks.load_task(body.trackId, body.taskId)
            requirements = task.get("requirements")
            animation = task.get("animation")
        elif body.lessonId:
            lesson = tracks.load_lesson(body.trackId, body.lessonId)
            ex = lesson.get("exercise") if isinstance(lesson.get("exercise"), dict) else {}
            if ex.get("kind") == "quiz":
                quiz = ex.get("questions") or []
            else:
                requirements = ex.get("requirements")
                animation = ex.get("animation")
                if not requirements:
                    raise HTTPException(400, f"Lesson {body.lessonId} has no runnable exercise.")
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    if body.lessonId and not body.taskId:
        body.mode = f"lesson:{body.lessonId}"[:32]

    if quiz is not None:
        schema = introspect_schema(engine)
        validation = grade_quiz(quiz, body.code)
        msg = "Quiz passed!" if validation["ok"] else validation["message"]
        _record_history(body, validation["ok"], msg, schema, schema, validation)
        return {
            "success": validation["ok"],
            "gate": "passed" if validation["ok"] else ("rejected" if validation["failures"][0]["rule"] == "rejected" else "validation_failed"),
            "message": msg,
            "schema": schema,
            "validation": validation,
            "animation": None,
        }

    # Clean slate: drop the tables this exercise checks, so leftovers from an earlier attempt can neither
    # make a wrong answer pass nor make a right one fail (create_all never alters an existing table).
    if requirements:
        _drop_lab_tables([t["name"] for t in requirements.get("tables", [])] + requirements.get("resetTables", []))
    schema_before = introspect_schema(engine)

    calls = (requirements or {}).get("calls") or []
    try:
        if language == "sql":
            result = run_lab_sql(body.code, lab_database_url(settings.database_url))
        else:
            result = run_lab_code(body.code, lab_database_url(settings.database_url), calls=calls)
    except UnsafeCodeError as e:
        result = {"ok": False, "rejected": True, "error": str(e), "line": getattr(e, "line", None)}

    if not result.get("ok"):
        err = result.get("error") or "Runtime error"
        rule = "rejected" if result.get("rejected") else "runtime-error"
        validation = _validation([{"rule": rule, "message": err, "line": result.get("line")}])
        validation["message"] = err
        schema_after = introspect_schema(engine)
        _record_history(body, False, err, schema_before, schema_after, validation)
        return {
            "success": False,
            "gate": "rejected" if rule == "rejected" else "runtime_error",
            "message": err,
            "traceback": result.get("traceback"),
            "stdout": result.get("stdout") or "",
            "schema": schema_after,
            "validation": validation,
            "animation": None,
        }

    schema_after = introspect_schema(engine)
    stdout = result.get("stdout") or ""
    validation = None
    if requirements:
        validation = check_requirements(schema_after, requirements)
        extra: list[dict[str, Any]] = []
        extra += check_data(requirements.get("data") or [], _scalar)
        extra += check_probes(requirements.get("probes") or [], _run_probe)
        extra += check_calls(calls, result.get("calls") or [])
        extra += check_stdout(requirements.get("stdout"), stdout)
        validation = merge(validation, extra)
        if not validation["ok"]:
            _record_history(body, False, validation["message"], schema_before, schema_after, validation)
            return {
                "success": False,
                "gate": "validation_failed",
                "message": validation["message"],
                "schema": schema_after,
                "validation": validation,
                "stdout": stdout,
                "animation": None,
                "note": "Requirements not met. Extra tables/columns are OK; the listed rules are not.",
            }

    msg = "Executed successfully."
    if validation and validation["ok"]:
        msg = "Lesson exercise passed!" if body.lessonId and not body.taskId else (
            "Task passed! Schema updated — watch the diagram highlight."
        )
    _record_history(body, True, msg, schema_before, schema_after, validation)
    if body.taskId and validation and validation["ok"]:
        _upsert_progress(body.trackId, body.taskId, True, body.code)

    return {
        "success": True,
        "gate": "passed",
        "message": msg,
        "schema": schema_after,
        "validation": validation,
        "stdout": stdout,
        "animation": animation,
        "schemaBefore": schema_before,
    }


def _drop_lab_tables(names: list[str]) -> None:
    safe = sorted({n for n in names if LAB_TABLE.match(n)})
    if not safe:
        return
    with get_engine().begin() as conn:
        for n in safe:
            conn.execute(text(f'DROP TABLE IF EXISTS "{n}" CASCADE'))


def _scalar(sql: str) -> Any:
    with get_engine().connect() as conn:
        return conn.execute(text(sql)).scalar()


def _run_probe(statements: list[str]) -> int:
    """Run trusted probe SQL in one transaction that is always rolled back; return the last row count."""
    conn = get_engine().connect()
    trans = conn.begin()
    try:
        conn.execute(text("SET LOCAL statement_timeout = 5000"))
        rows = 0
        for st in statements:
            res = conn.execute(text(st))
            rows = len(res.fetchall()) if res.returns_rows else (res.rowcount or 0)
        return rows
    finally:
        trans.rollback()
        conn.close()


def _record_history(
    body: ExecuteBody,
    success: bool,
    message: str,
    before: dict,
    after: dict,
    validation: dict | None,
) -> None:
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO run_history
                      (track_id, task_id, mode, code, success, message,
                       schema_before, schema_after, validation)
                    VALUES
                      (:track_id, :task_id, :mode, :code, :success, :message,
                       CAST(:schema_before AS JSONB), CAST(:schema_after AS JSONB),
                       CAST(:validation AS JSONB))
                    """
                ),
                {
                    "track_id": body.trackId,
                    "task_id": body.taskId,
                    "mode": body.mode,
                    "code": body.code,
                    "success": success,
                    "message": message,
                    "schema_before": json.dumps(before),
                    "schema_after": json.dumps(after),
                    "validation": json.dumps(validation) if validation else None,
                },
            )
    except Exception as e:  # noqa: BLE001
        print(f"[history] skip: {e}")


def _upsert_progress(track_id: str, task_id: str, completed: bool, code: str) -> None:
    try:
        with session_scope() as session:
            session.execute(
                text(
                    """
                    INSERT INTO learner_progress (track_id, task_id, completed, attempts, last_code)
                    VALUES (:t, :k, :c, 1, :code)
                    ON CONFLICT (track_id, task_id) DO UPDATE SET
                      completed = EXCLUDED.completed OR learner_progress.completed,
                      attempts = learner_progress.attempts + 1,
                      last_code = EXCLUDED.last_code,
                      updated_at = NOW()
                    """
                ),
                {"t": track_id, "k": task_id, "c": completed, "code": code},
            )
    except Exception as e:  # noqa: BLE001
        print(f"[progress] skip: {e}")


@app.get("/history")
def history(limit: int = 50, trackId: str | None = None) -> dict[str, Any]:
    q = """
        SELECT id, track_id, task_id, mode, success, message, created_at,
               LEFT(code, 500) AS code_preview
        FROM run_history
    """
    params: dict[str, Any] = {"limit": limit}
    if trackId:
        q += " WHERE track_id = :track"
        params["track"] = trackId
    q += " ORDER BY id DESC LIMIT :limit"
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(text(q), params).mappings().all()
        return {"history": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(503, str(e)) from e


@app.get("/history/{run_id}")
def history_detail(run_id: int) -> dict[str, Any]:
    try:
        with get_engine().connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM run_history WHERE id = :id"), {"id": run_id}
                )
                .mappings()
                .first()
            )
        if not row:
            raise HTTPException(404, "Run not found")
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, str(e)) from e


@app.get("/progress/{track_id}")
def progress(track_id: str) -> dict[str, Any]:
    try:
        with get_engine().connect() as conn:
            rows = (
                conn.execute(
                    text(
                        "SELECT task_id, completed, attempts, last_code, updated_at "
                        "FROM learner_progress WHERE track_id = :t"
                    ),
                    {"t": track_id},
                )
                .mappings()
                .all()
            )
        return {"progress": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(503, str(e)) from e


@app.post("/lab/reset")
def lab_reset() -> dict[str, Any]:
    reset_to_seed(get_engine())
    return {"ok": True, "message": "Lab tables cleared; demo seed restored.", "schema": introspect_schema(get_engine())}


@app.post("/db/export")
def db_export() -> dict[str, Any]:
    """Trigger pg_dump into snapshots/ via subprocess (works in compose)."""
    snap = Path(settings.snapshots_dir)
    snap.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = snap / f"hub-{stamp}.dump"
    # Prefer docker exec style isn't available inside container — use pg_dump if present
    url = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
    try:
        subprocess.run(
            ["pg_dump", url, "-Fc", "-f", str(out)],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        # Fallback: SQL plain dump via SQLAlchemy for demo tables + meta
        sql_path = snap / f"hub-{stamp}.sql"
        schema = introspect_schema(get_engine())
        sql_path.write_text(
            "-- Logical export (pg_dump not installed in image)\n"
            + json.dumps(schema, indent=2)
        )
        return {
            "ok": True,
            "file": str(sql_path.name),
            "format": "schema-json-fallback",
            "message": "pg_dump not available; wrote schema JSON snapshot.",
        }
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, e.stderr or str(e)) from e
    return {"ok": True, "file": out.name, "format": "custom"}


@app.get("/db/snapshots")
def list_snapshots() -> dict[str, Any]:
    snap = Path(settings.snapshots_dir)
    snap.mkdir(parents=True, exist_ok=True)
    files = []
    for p in sorted(snap.iterdir()):
        if p.name.startswith("."):
            continue
        files.append(
            {
                "name": p.name,
                "size": p.stat().st_size,
                "mtime": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return {"snapshots": files}


@app.post("/db/restore")
def db_restore(body: dict[str, str]) -> dict[str, Any]:
    name = body.get("file") or body.get("name")
    if not name:
        raise HTTPException(400, "Provide file name")
    path = Path(settings.snapshots_dir) / Path(name).name
    if not path.exists():
        raise HTTPException(404, f"Snapshot not found: {name}")
    if path.suffix == ".sql" and "sample-seed" in path.name:
        reset_to_seed(get_engine())
        return {"ok": True, "message": "Restored sample seed."}
    url = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
    try:
        subprocess.run(
            ["pg_restore", "-d", url, "--clean", "--if-exists", str(path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except FileNotFoundError:
        raise HTTPException(
            501,
            "pg_restore not installed in this image. Use scripts/restore-db.sh from the host.",
        ) from None
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, e.stderr or str(e)) from e
    return {"ok": True, "message": f"Restored {name}", "schema": introspect_schema(get_engine())}
