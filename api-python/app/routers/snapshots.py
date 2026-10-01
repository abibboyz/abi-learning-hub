from __future__ import annotations

import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


def _snap_dir() -> Path:
    p = Path(settings.snapshots_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("")
def list_snapshots():
    d = _snap_dir()
    items = []
    for f in sorted(d.glob("*"), reverse=True):
        if f.is_file() and f.name != ".gitkeep":
            items.append(
                {
                    "name": f.name,
                    "size": f.stat().st_size,
                    "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
                }
            )
    return items


@router.post("/export")
def export_snapshot():
    """Best-effort pg_dump into snapshots/. Works when pg_dump is on PATH or via docker."""
    d = _snap_dir()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = d / f"hub-{stamp}.dump"
    # Prefer invoking repo script if present
    script = Path(settings.tracks_dir).parent / "scripts" / "export-db.sh"
    if script.exists():
        try:
            subprocess.run(["bash", str(script)], check=True, capture_output=True, text=True, timeout=120)
            newest = max(d.glob("hub-*.dump"), key=lambda p: p.stat().st_mtime, default=None)
            if newest:
                return {"ok": True, "file": newest.name, "message": "Export complete"}
        except Exception as e:
            return {"ok": False, "message": f"Export script failed: {e}", "hint": "Use ./scripts/export-db.sh from the host with Docker running."}
    return {
        "ok": False,
        "message": "pg_dump not available inside API container without docker socket.",
        "hint": "From the host: ./scripts/export-db.sh  OR use the download of sample-seed.sql",
        "sample": "sample-seed.sql",
    }


@router.get("/download/{name}")
def download_snapshot(name: str):
    path = _snap_dir() / name
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Snapshot not found")
    return FileResponse(path, filename=name)


@router.post("/import")
async def import_snapshot(file: UploadFile = File(...)):
    d = _snap_dir()
    dest = d / file.filename
    content = await file.read()
    dest.write_bytes(content)
    return {
        "ok": True,
        "file": dest.name,
        "message": "Snapshot uploaded. Restore with ./scripts/restore-db.sh snapshots/<file> on the host.",
    }
