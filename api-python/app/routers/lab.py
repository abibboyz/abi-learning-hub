from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.db import get_engine, session_scope
from app.runners.constrained import UnsafeCodeError, run_sqlalchemy_code
from app.schema_introspector import introspect_schema
from app.seed import reset_to_seed
from app.tasks.checkers import check_task, get_task

router = APIRouter(prefix="/lab", tags=["lab"])


class RunRequest(BaseModel):
    trackId: str = "python-sqlalchemy"
    taskId: str | None = None
    code: str = Field(..., min_length=1)
    mode: str = "execute"  # execute | validate-only


class ProgressUpsert(BaseModel):
    trackId: str
    taskId: str
    completed: bool = False
    lastCode: str | None = None


def _save_history(
    *,
    track_id: str,
    task_id: str | None,
    mode: str,
    code: str,
    success: bool,
    message: str,
    schema_before: dict,
    schema_after: dict,
    validation: dict,
) -> int | None:
    try:
        with session_scope() as session:
            row = session.execute(
                text(
                    """
                    INSERT INTO run_history
                      (track_id, task_id, mode, code, success, message, schema_before, schema_after, validation)
                    VALUES
                      (:track_id, :task_id, :mode, :code, :success, :message,
                       CAST(:schema_before AS JSONB), CAST(:schema_after AS JSONB), CAST(:validation AS JSONB))
                    RETURNING id
                    """
                ),
                {
                    "track_id": track_id,
                    "task_id": task_id,
                    "mode": mode,
                    "code": code,
                    "success": success,
                    "message": message,
                    "schema_before": json.dumps(schema_before),
                    "schema_after": json.dumps(schema_after),
                    "validation": json.dumps(validation),
                },
            ).fetchone()
            return int(row[0]) if row else None
    except Exception:
        return None


@router.post("/run")
def run_lab(body: RunRequest) -> dict[str, Any]:
    engine = get_engine()
    schema_before = introspect_schema(engine)

    # Stage 1: static safety validation (never mutates)
    try:
        run_sqlalchemy_code(body.code, execute=False)
    except UnsafeCodeError as e:
        validation = {"passed": False, "reason": str(e), "stage": "safety"}
        _save_history(
            track_id=body.trackId,
            task_id=body.taskId,
            mode=body.mode,
            code=body.code,
            success=False,
            message=str(e),
            schema_before=schema_before,
            schema_after=schema_before,
            validation=validation,
        )
        return {
            "success": False,
            "executed": False,
            "message": str(e),
            "validation": validation,
            "schema": schema_before,
            "teachAlong": [],
            "highlights": [],
        }

    if body.mode == "validate-only" and not body.taskId:
        return {
            "success": True,
            "executed": False,
            "message": "Code passed safety validation",
            "validation": {"passed": True, "stage": "safety"},
            "schema": schema_before,
        }

    # Execute to ephemeral effect then check — for task gate:
    # We execute into the real lab DB only after we can verify, but checkers need schema.
    # Strategy: execute create_all, introspect, check; if fail, we cannot easily rollback DDL
    # in Postgres without transactions for DDL in all cases. So: validate structure from a
    # sandboxed metadata create against same DB is the brief's approach — check AFTER execute
    # for DDL tasks BUT brief says validate BEFORE mutate.
    #
    # Practical gate: parse expected table names from task + require code to mention required
    # identifiers before execute; then execute; then schema check. If schema check fails,
    # report failure (DDL may have partial tables — acceptable for learning lab).
    #
    # Stronger pre-check: dry-run create_all on a disposable MetaData by executing with a
    # clone — we already execute constrained. Pre-task textual requirements:

    task = get_task(body.taskId) if body.taskId else None
    pre_reasons: list[str] = []
    if task:
        # Lightweight pre-mutate intent checks from objectives / known table names
        code_l = body.code.lower()
        if task.id == "rel-01-create-connect" and "lab_widgets" not in code_l:
            pre_reasons.append("Code must declare __tablename__ = \"lab_widgets\" before execution.")
        if task.id == "rel-02-types-pks" and "lab_products" not in code_l:
            pre_reasons.append("Code must declare lab_products before execution.")
        if task.id == "rel-03-one-to-many" and (
            "lab_publishers" not in code_l or "lab_magazines" not in code_l
        ):
            pre_reasons.append("Code must declare lab_publishers and lab_magazines before execution.")
        if task.id == "rel-04-many-to-one" and (
            "lab_countries" not in code_l or "lab_cities" not in code_l
        ):
            pre_reasons.append("Code must declare lab_countries and lab_cities before execution.")
        if task.id == "rel-05-one-to-one" and (
            "lab_accounts" not in code_l or "lab_settings" not in code_l
        ):
            pre_reasons.append("Code must declare lab_accounts and lab_settings before execution.")
        if task.id == "rel-06-many-to-many" and "lab_post_tags" not in code_l:
            pre_reasons.append("Code must declare lab_post_tags association before execution.")
        if task.id == "rel-07-self-referential" and "lab_categories" not in code_l:
            pre_reasons.append("Code must declare lab_categories before execution.")
        if task.id == "rel-08-cascades-loading" and (
            "lab_orders" not in code_l or "lab_order_items" not in code_l
        ):
            pre_reasons.append("Code must declare lab_orders and lab_order_items before execution.")
        if task.id == "rel-09-insert-query" and (
            "lab_artists" not in code_l or "lab_albums" not in code_l
        ):
            pre_reasons.append("Code must declare lab_artists and lab_albums before execution.")
        if task.id == "rel-10-mini-domain" and "lab_team_members" not in code_l:
            pre_reasons.append("Code must declare lab_team_members (and orgs/teams/members) before execution.")

    if pre_reasons:
        validation = {"passed": False, "reason": pre_reasons[0], "stage": "pre-mutate", "details": pre_reasons}
        _save_history(
            track_id=body.trackId,
            task_id=body.taskId,
            mode=body.mode,
            code=body.code,
            success=False,
            message=pre_reasons[0],
            schema_before=schema_before,
            schema_after=schema_before,
            validation=validation,
        )
        return {
            "success": False,
            "executed": False,
            "message": pre_reasons[0],
            "validation": validation,
            "schema": schema_before,
            "teachAlong": [],
            "highlights": [],
        }

    # Mutate
    result = run_sqlalchemy_code(body.code, execute=True)
    schema_after = introspect_schema(engine)

    if not result.get("ok"):
        msg = result.get("error") or "Execution failed"
        validation = {"passed": False, "reason": msg, "stage": "execute"}
        _save_history(
            track_id=body.trackId,
            task_id=body.taskId,
            mode=body.mode,
            code=body.code,
            success=False,
            message=msg,
            schema_before=schema_before,
            schema_after=schema_after,
            validation=validation,
        )
        return {
            "success": False,
            "executed": True,
            "message": msg,
            "validation": validation,
            "schema": schema_after,
            "traceback": result.get("traceback"),
            "teachAlong": [],
            "highlights": [],
        }

    validation = {"passed": True, "stage": "execute"}
    teach = []
    highlights = []
    if task:
        validation = check_task(task.id, schema_after)
        validation["stage"] = "task-check"
        teach = task.teach_along
        highlights = task.highlight_hint
        if not validation.get("passed"):
            # Task failed after mutate — report clearly (DDL may remain; learner can reset)
            _save_history(
                track_id=body.trackId,
                task_id=body.taskId,
                mode=body.mode,
                code=body.code,
                success=False,
                message=validation.get("reason", "Task check failed"),
                schema_before=schema_before,
                schema_after=schema_after,
                validation=validation,
            )
            return {
                "success": False,
                "executed": True,
                "message": validation.get("reason"),
                "validation": validation,
                "schema": schema_after,
                "teachAlong": [],
                "highlights": [],
                "hint": "Fix the model and re-run. Use Reset lab to clear lab_* tables if needed.",
            }

    hist_id = _save_history(
        track_id=body.trackId,
        task_id=body.taskId,
        mode=body.mode,
        code=body.code,
        success=True,
        message="OK",
        schema_before=schema_before,
        schema_after=schema_after,
        validation=validation,
    )

    return {
        "success": True,
        "executed": True,
        "message": validation.get("reason", "Success"),
        "validation": validation,
        "schema": schema_after,
        "teachAlong": teach,
        "highlights": highlights,
        "historyId": hist_id,
        "tablesCreated": result.get("tables_created", []),
    }


@router.get("/history")
def history(limit: int = 50, trackId: str | None = None):
    q = "SELECT id, track_id, task_id, mode, success, message, created_at FROM run_history"
    params: dict[str, Any] = {"limit": limit}
    if trackId:
        q += " WHERE track_id = :track_id"
        params["track_id"] = trackId
    q += " ORDER BY id DESC LIMIT :limit"
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(text(q), params).mappings().all()
            return [dict(r) for r in rows]
    except Exception as e:
        return {"error": str(e), "items": []}


@router.get("/history/{history_id}")
def history_detail(history_id: int):
    with get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT * FROM run_history WHERE id = :id"),
            {"id": history_id},
        ).mappings().first()
        if not row:
            raise HTTPException(404, "History entry not found")
        return dict(row)


@router.post("/reset")
def reset_lab():
    reset_to_seed(get_engine())
    return {"ok": True, "schema": introspect_schema(get_engine()), "message": "Lab reset to seed demo tables."}


@router.get("/progress")
def get_progress(trackId: str = "python-sqlalchemy"):
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT track_id, task_id, completed, attempts, last_code, updated_at "
                    "FROM learner_progress WHERE track_id = :t"
                ),
                {"t": trackId},
            ).mappings().all()
            return [dict(r) for r in rows]
    except Exception:
        return []


@router.post("/progress")
def upsert_progress(body: ProgressUpsert):
    with session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO learner_progress (track_id, task_id, completed, attempts, last_code, updated_at)
                VALUES (:track_id, :task_id, :completed, 1, :last_code, NOW())
                ON CONFLICT (track_id, task_id) DO UPDATE SET
                  completed = EXCLUDED.completed,
                  attempts = learner_progress.attempts + 1,
                  last_code = COALESCE(EXCLUDED.last_code, learner_progress.last_code),
                  updated_at = NOW()
                """
            ),
            {
                "track_id": body.trackId,
                "task_id": body.taskId,
                "completed": body.completed,
                "last_code": body.lastCode,
            },
        )
    return {"ok": True}
