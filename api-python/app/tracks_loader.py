from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import settings


def tracks_root() -> Path:
    return Path(settings.tracks_dir)


def load_index() -> dict[str, Any]:
    path = tracks_root() / "index.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"tracks": []}


def _normalize_manifest(data: dict[str, Any], track_id: str) -> dict[str, Any]:
    prereq = data.get("prerequisites") or {}
    if prereq and "code" not in prereq and "setupCode" in prereq:
        data["prerequisites"] = {
            "title": f"{data.get('title', track_id)} setup",
            "lockedByDefault": True,
            "install": prereq.get("install", ""),
            "code": prereq.get("setupCode", ""),
            "connection": prereq.get("connection"),
            "notes": prereq.get("notes"),
        }
    elif prereq and "title" not in prereq:
        data["prerequisites"] = {
            "title": f"{data.get('title', track_id)} setup",
            "lockedByDefault": True,
            "install": prereq.get("install", ""),
            "code": prereq.get("code") or prereq.get("setupCode", ""),
        }
    return data


def list_tracks() -> list[dict[str, Any]]:
    indexed = load_index().get("tracks", [])
    out: list[dict[str, Any]] = []
    for t in indexed:
        man_path = tracks_root() / t["id"] / "manifest.json"
        if man_path.exists():
            man = _normalize_manifest(
                json.loads(man_path.read_text(encoding="utf-8")), t["id"]
            )
            out.append({**t, **man})
        else:
            out.append(t)
    return out


def load_manifest(track_id: str) -> dict[str, Any]:
    path = tracks_root() / track_id / "manifest.json"
    if not path.exists():
        raise FileNotFoundError(f"Track not found: {track_id}")
    return _normalize_manifest(
        json.loads(path.read_text(encoding="utf-8")), track_id
    )


def load_task(track_id: str, task_id: str) -> dict[str, Any]:
    tasks_dir = tracks_root() / track_id / "tasks"
    direct = tasks_dir / f"{task_id}.json"
    if direct.exists():
        return json.loads(direct.read_text(encoding="utf-8"))
    if not tasks_dir.exists():
        raise FileNotFoundError(f"Task not found: {track_id}/{task_id}")
    for path in sorted(tasks_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        stem = path.stem
        if (
            data.get("id") == task_id
            or stem == task_id
            or stem.endswith(task_id)
            or task_id in stem
        ):
            return data
    raise FileNotFoundError(f"Task not found: {track_id}/{task_id}")


def list_tasks(track_id: str) -> list[dict[str, Any]]:
    manifest = load_manifest(track_id)
    task_ids = manifest.get("taskIds")
    tasks: list[dict[str, Any]] = []
    if task_ids:
        for tid in task_ids:
            tasks.append(load_task(track_id, tid))
    else:
        tasks_dir = tracks_root() / track_id / "tasks"
        if tasks_dir.exists():
            for f in sorted(tasks_dir.glob("*.json")):
                tasks.append(json.loads(f.read_text(encoding="utf-8")))
    # dedupe by id, prefer entries that have requirements
    by_id: dict[str, dict[str, Any]] = {}
    for t in tasks:
        tid = t.get("id") or ""
        prev = by_id.get(tid)
        if prev is None or ("requirements" in t and "requirements" not in prev):
            by_id[tid] = t
    out = list(by_id.values())
    out.sort(key=lambda t: t.get("order", 0))
    return out


def load_lesson(track_id: str, lesson_id: str) -> dict[str, Any]:
    lessons_dir = tracks_root() / track_id / "lessons"
    direct = lessons_dir / f"{lesson_id}.json"
    if direct.exists():
        return json.loads(direct.read_text(encoding="utf-8"))
    if not lessons_dir.exists():
        raise FileNotFoundError(f"Lesson not found: {track_id}/{lesson_id}")
    for path in sorted(lessons_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("id") == lesson_id or path.stem == lesson_id or lesson_id in path.stem:
            return data
    raise FileNotFoundError(f"Lesson not found: {track_id}/{lesson_id}")


def list_lessons(track_id: str) -> list[dict[str, Any]]:
    manifest = load_manifest(track_id)
    lesson_ids = manifest.get("lessonIds")
    lessons: list[dict[str, Any]] = []
    if lesson_ids:
        for lid in lesson_ids:
            lessons.append(load_lesson(track_id, lid))
    else:
        lessons_dir = tracks_root() / track_id / "lessons"
        if lessons_dir.exists():
            for f in sorted(lessons_dir.glob("*.json")):
                lessons.append(json.loads(f.read_text(encoding="utf-8")))
    by_id: dict[str, dict[str, Any]] = {}
    for lesson in lessons:
        by_id[lesson.get("id") or ""] = lesson
    out = list(by_id.values())
    out.sort(key=lambda t: t.get("order", 0))
    return out
