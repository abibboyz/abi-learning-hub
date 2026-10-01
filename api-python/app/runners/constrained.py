"""Constrained SQLAlchemy runner — whitelist imports, no unrestricted shell."""
from __future__ import annotations

import ast
import traceback
from typing import Any

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    Boolean,
    Float,
    create_engine,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

from app.config import settings

ALLOWED_IMPORT_MODULES = {
    "sqlalchemy",
    "sqlalchemy.orm",
    "sqlalchemy.sql",
    "datetime",
    "typing",
    "enum",
    "uuid",
    "decimal",
}

FORBIDDEN_NAMES = {
    "eval",
    "exec",
    "compile",
    "open",
    "__import__",
    "input",
    "breakpoint",
    "exit",
    "quit",
    "os",
    "sys",
    "subprocess",
    "socket",
    "pathlib",
    "shutil",
    "ctypes",
    "importlib",
}


class UnsafeCodeError(ValueError):
    pass


def _validate_ast(source: str) -> None:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise UnsafeCodeError(f"Syntax error: {e}") from e

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if alias.name not in ALLOWED_IMPORT_MODULES and root not in ALLOWED_IMPORT_MODULES:
                        raise UnsafeCodeError(f"Import not allowed: {alias.name}")
            else:
                mod = node.module or ""
                root = mod.split(".")[0] if mod else ""
                if mod and mod not in ALLOWED_IMPORT_MODULES and root not in ALLOWED_IMPORT_MODULES:
                    raise UnsafeCodeError(f"Import not allowed: {mod}")
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise UnsafeCodeError(f"Use of '{node.id}' is not allowed")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            # allow dunder only on Mapped annotations etc. — block __subclasses__ style
            if node.attr in {"__subclasses__", "__globals__", "__code__", "__class__"}:
                raise UnsafeCodeError(f"Attribute '{node.attr}' is not allowed")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_NAMES:
                raise UnsafeCodeError(f"Call to '{node.func.id}' is not allowed")


def run_sqlalchemy_code(
    code: str,
    database_url: str | None = None,
    *,
    execute: bool = True,
) -> dict[str, Any]:
    """Validate and optionally execute learner SQLAlchemy code against the lab DB."""
    if len(code) > settings.max_code_chars:
        raise UnsafeCodeError(f"Code exceeds {settings.max_code_chars} character limit")

    _validate_ast(code)

    if not execute:
        return {"ok": True, "validated": True, "executed": False}

    url = database_url or settings.database_url
    engine = create_engine(url, pool_pre_ping=True)
    metadata = MetaData()

    class Base(DeclarativeBase):
        metadata = metadata

    safe_globals: dict[str, Any] = {
        "__builtins__": {
            "True": True,
            "False": False,
            "None": None,
            "len": len,
            "range": range,
            "list": list,
            "dict": dict,
            "str": str,
            "int": int,
            "float": float,
            "bool": bool,
            "print": print,
            "Exception": Exception,
            "ValueError": ValueError,
            "TypeError": TypeError,
            "isinstance": isinstance,
            "getattr": getattr,
            "setattr": setattr,
            "hasattr": hasattr,
            "enumerate": enumerate,
            "zip": zip,
            "min": min,
            "max": max,
            "sum": sum,
            "sorted": sorted,
            "property": property,
            "staticmethod": staticmethod,
            "classmethod": classmethod,
            "super": super,
            "object": object,
            "type": type,
        },
        "Base": Base,
        "DeclarativeBase": DeclarativeBase,
        "Mapped": Mapped,
        "mapped_column": mapped_column,
        "relationship": relationship,
        "Column": Column,
        "Integer": Integer,
        "String": String,
        "Text": Text,
        "Boolean": Boolean,
        "Float": Float,
        "DateTime": DateTime,
        "ForeignKey": ForeignKey,
        "Table": Table,
        "MetaData": MetaData,
        "Session": Session,
        "sessionmaker": sessionmaker,
        "create_engine": create_engine,
        "text": text,
        "engine": engine,
        "metadata": metadata,
    }

    # Allow common import patterns by pre-seeding modules
    import sqlalchemy
    import sqlalchemy.orm as sa_orm

    safe_globals["sqlalchemy"] = sqlalchemy
    safe_globals["sa"] = sqlalchemy

    local_ns: dict[str, Any] = {}
    try:
        compiled = compile(code, "<learner>", "exec")
        exec(compiled, safe_globals, local_ns)  # noqa: S102 — intentional constrained exec
        # Prefer learner Base if they defined one
        learner_base = local_ns.get("Base") or safe_globals.get("Base")
        if learner_base is not None and hasattr(learner_base, "metadata"):
            learner_base.metadata.create_all(engine)
        else:
            metadata.create_all(engine)
        return {
            "ok": True,
            "validated": True,
            "executed": True,
            "tables_created": list(
                (learner_base.metadata.tables.keys() if learner_base and hasattr(learner_base, "metadata") else metadata.tables.keys())
            ),
        }
    except UnsafeCodeError:
        raise
    except Exception as e:
        return {
            "ok": False,
            "validated": True,
            "executed": False,
            "error": str(e),
            "traceback": traceback.format_exc()[-2000:],
        }
    finally:
        engine.dispose()
