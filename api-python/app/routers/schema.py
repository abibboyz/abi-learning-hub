from fastapi import APIRouter

from app.db import get_engine
from app.schema_introspector import introspect_schema

router = APIRouter(prefix="/schema", tags=["schema"])


@router.get("")
def get_schema():
    return introspect_schema(get_engine())
