"""/lab/* — execution helpers for every track (the web BFF routes /api/lab/* here for all tracks).

  POST /lab/hints          reveal the hint ladder up to a level (usage is recorded)
  GET  /lab/hints          hint level used so far for an item
  GET  /lab/timeline       all runs of one task / lesson, oldest first (replay timeline)
  POST /lab/reset-task     drop one exercise's tables, forget its progress, return the starter
  GET  /lab/expected       expected schema / data / output captured from the reference solution
  POST /lab/explain        EXPLAIN [ANALYZE] (FORMAT JSON) for the sql-postgres track, always rolled back
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app import tracks_loader as tracks
from app.config import settings
from app.db import get_engine, session_scope
from app.lab_role import lab_database_url
from app.lab_tools import LAB_TABLE, exercise_tables, explain_target, hint_ladder, reveal_hints, timeline_entry
from app.schema_introspector import introspect_schema
from app.sql_runner import TX_CONTROL, _strip_comments, run_lab_sql

router = APIRouter(prefix="/lab")
Kind = Literal["task", "lesson"]


def _load(track_id: str, kind: str, item_id: str) -> dict[str, Any]:
    try:
        return tracks.load_task(track_id, item_id) if kind == "task" else tracks.load_lesson(track_id, item_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


def hint_level_used(track_id: str, kind: str, item_id: str) -> int:
    try:
        with get_engine().connect() as conn:
            return int(
                conn.execute(
                    text("SELECT COALESCE(MAX(level),0) FROM hint_usage WHERE track_id=:t AND item_kind=:k AND item_id=:i"),
                    {"t": track_id, "k": kind, "i": item_id},
                ).scalar()
                or 0
            )
    except Exception:  # noqa: BLE001
        return 0


class HintBody(BaseModel):
    trackId: str
    kind: Kind = "task"
    id: str
    level: int = Field(1, ge=1, le=3)


@router.post("/hints")
def reveal(body: HintBody) -> dict[str, Any]:
    ladder = hint_ladder(_load(body.trackId, body.kind, body.id), body.kind)
    shown = reveal_hints(ladder, body.level)
    with session_scope() as s:
        for h in shown:
            s.execute(
                text("INSERT INTO hint_usage (track_id,item_kind,item_id,level) VALUES (:t,:k,:i,:l) ON CONFLICT DO NOTHING"),
                {"t": body.trackId, "k": body.kind, "i": body.id, "l": h["level"]},
            )
    return {"hints": shown, "total": len(ladder), "used": len(shown)}


@router.get("/hints")
def hints_used(trackId: str, kind: Kind, id: str) -> dict[str, Any]:
    ladder = hint_ladder(_load(trackId, kind, id), kind)
    used = hint_level_used(trackId, kind, id)
    return {"used": used, "total": len(ladder), "hints": reveal_hints(ladder, used) if used else []}


@router.get("/timeline")
def timeline(trackId: str, kind: Kind, id: str, limit: int = 100) -> dict[str, Any]:
    where = "task_id = :i" if kind == "task" else "task_id IS NULL AND mode = :m"
    with get_engine().connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, created_at, success, mode, message, validation, hint_level, code FROM run_history "
                f"WHERE track_id = :t AND {where} ORDER BY id DESC LIMIT :limit"
            ),
            {"t": trackId, "i": id, "m": f"lesson:{id}"[:32], "limit": min(limit, 500)},
        ).mappings().all()
    runs = [timeline_entry(dict(r)) for r in reversed(rows)]
    return {"runs": runs, "firstPassId": next((r["id"] for r in runs if r["success"]), None), "attempts": len(runs)}


class ResetTaskBody(BaseModel):
    trackId: str
    kind: Kind = "task"
    id: str


@router.post("/reset-task")
def reset_task(body: ResetTaskBody) -> dict[str, Any]:
    item = _load(body.trackId, body.kind, body.id)
    ex = item if body.kind == "task" else (item.get("exercise") or {})
    names = sorted({n for n in exercise_tables(ex.get("requirements")) if LAB_TABLE.match(n)})
    eng = get_engine()
    with eng.begin() as conn:
        for n in names:
            conn.execute(text(f'DROP TABLE IF EXISTS "{n}" CASCADE'))
        if body.kind == "task":
            conn.execute(text("DELETE FROM learner_progress WHERE track_id=:t AND task_id=:i"), {"t": body.trackId, "i": body.id})
    return {
        "ok": True,
        "dropped": names,
        "starterCode": ex.get("starterCode") or "",
        "schema": introspect_schema(eng),
        "message": f"Reset: dropped {len(names)} table(s) and cleared this item's progress. Hint history is kept.",
    }


def expected_path(track_id: str, kind: str, item_id: str) -> Path:
    return Path(settings.tracks_dir) / track_id / "expected" / f"{kind}s" / f"{item_id}.json"


@router.get("/expected")
def expected(trackId: str, kind: Kind, id: str) -> dict[str, Any]:
    item = _load(trackId, kind, id)
    p = expected_path(trackId, kind, item["id"])
    if not p.exists():
        raise HTTPException(404, "No expected result for this item (quiz, or not captured yet).")
    return json.loads(p.read_text())


class ExplainBody(BaseModel):
    trackId: str = "sql-postgres"
    taskId: str | None = None
    lessonId: str | None = None
    code: str = Field(..., min_length=1, max_length=20_000)
    selection: str | None = Field(None, max_length=20_000)
    analyze: bool = False


@router.post("/explain")
def explain(body: ExplainBody) -> dict[str, Any]:
    if body.trackId != "sql-postgres":
        raise HTTPException(400, "EXPLAIN is available on the raw SQL track (sql-postgres).")
    tgt = explain_target(body.code, body.selection)
    if "error" in tgt:
        return {"ok": False, "error": tgt["error"], "line": tgt.get("line")}
    if TX_CONTROL.search(_strip_comments(tgt["query"])):
        return {"ok": False, "error": "Transaction control cannot be explained.", "line": tgt.get("line")}
    reset: list[str] = []
    if body.taskId or body.lessonId:
        item = _load(body.trackId, "task" if body.taskId else "lesson", body.taskId or body.lessonId or "")
        ex = item if body.taskId else (item.get("exercise") or {})
        reset = exercise_tables(ex.get("requirements"))
    r = run_lab_sql(tgt["setup"], lab_database_url(settings.database_url), reset_tables=reset, explain=("ANALYZE " if body.analyze else "") + tgt["query"])
    if not r.get("ok"):
        return {"ok": False, "error": r.get("error"), "line": r.get("line")}
    return {
        "ok": True,
        "query": tgt["query"],
        "line": tgt["line"],
        "analyze": body.analyze,
        "plan": r["plan"],
        "note": "Ran in a transaction that was rolled back: EXPLAIN ANALYZE executed the statement, nothing was kept.",
    }
