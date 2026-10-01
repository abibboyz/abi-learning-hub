from fastapi import APIRouter
from sqlalchemy import text

from app.db import get_engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    db_ok = False
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        return {"status": "degraded", "db": False, "error": str(e), "service": "api-python"}
    return {"status": "ok", "db": db_ok, "service": "api-python"}
