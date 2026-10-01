from fastapi import APIRouter, HTTPException

from app.tracks_loader import get_track, list_track_manifests, load_lessons, load_track_tasks
from app.tasks.checkers import list_tasks as list_builtin_rel_tasks

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("")
def tracks():
    return list_track_manifests()


@router.get("/{track_id}")
def track_detail(track_id: str):
    t = get_track(track_id)
    if not t:
        raise HTTPException(404, f"Track not found: {track_id}")
    return t


@router.get("/{track_id}/lessons")
def track_lessons(track_id: str):
    if not get_track(track_id):
        raise HTTPException(404, f"Track not found: {track_id}")
    return load_lessons(track_id)


@router.get("/{track_id}/tasks")
def track_tasks(track_id: str):
    if not get_track(track_id):
        raise HTTPException(404, f"Track not found: {track_id}")
    # Python track uses built-in progressive relationship tasks; file tasks can extend
    file_tasks = load_track_tasks(track_id)
    if track_id == "python-sqlalchemy" or not file_tasks:
        builtin = list_builtin_rel_tasks()
        # merge by id preferring file overrides
        by_id = {t["id"]: t for t in builtin}
        for t in file_tasks:
            by_id[t["id"]] = t
        return sorted(by_id.values(), key=lambda x: x.get("order", 0))
    return file_tasks
