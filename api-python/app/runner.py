"""Constrained Python/SQLAlchemy lab runner — whitelist imports, no shell."""
from __future__ import annotations

import ast
import traceback
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    create_engine,
    select,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
)

from app.config import settings

ALLOWED_IMPORT_MODULES = {
    "sqlalchemy",
    "sqlalchemy.orm",
    "sqlalchemy.sql",
    "datetime",
    "typing",
    "decimal",
    "enum",
}

FORBIDDEN_NAMES = {
    "eval",
    "exec",
    "open",
    "__import__",
    "compile",
    "input",
    "breakpoint",
    "memoryview",
    "globals",
    "locals",
    "vars",
    "getattr",
    "setattr",
    "delattr",
    "classmethod",  # ok actually but keep tight
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
                    if alias.name not in ALLOWED_IMPORT_MODULES and root not in {
                        "sqlalchemy",
                        "datetime",
                        "typing",
                        "decimal",
                        "enum",
                    }:
                        raise UnsafeCodeError(f"Import not allowed: {alias.name}")
            else:
                mod = node.module or ""
                root = mod.split(".")[0] if mod else ""
                if mod not in ALLOWED_IMPORT_MODULES and root not in {
                    "sqlalchemy",
                    "datetime",
                    "typing",
                    "decimal",
                    "enum",
                    "",
                }:
                    raise UnsafeCodeError(f"Import not allowed: {mod}")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in {"eval", "exec", "open", "__import__", "compile", "input"}:
                raise UnsafeCodeError(f"Call not allowed: {node.func.id}()")
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            # allow __tablename__ etc on classes via Assign targets differently
            if node.attr not in {"__tablename__", "__table_args__", "__mapper_args__"}:
                if node.attr.startswith("__"):
                    raise UnsafeCodeError(f"Attribute not allowed: {node.attr}")


def run_lab_code(code: str, database_url: str) -> dict[str, Any]:
    if len(code) > settings.max_code_chars:
        raise UnsafeCodeError("Code exceeds maximum length.")

    _validate_ast(code)

    # Build restricted globals
    safe_builtins = {
        "True": True,
        "False": False,
        "None": None,
        "print": print,
        "len": len,
        "range": range,
        "list": list,
        "dict": dict,
        "set": set,
        "tuple": tuple,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "min": min,
        "max": max,
        "sum": sum,
        "enumerate": enumerate,
        "zip": zip,
        "sorted": sorted,
        "isinstance": isinstance,
        "type": type,
        "property": property,
        "staticmethod": staticmethod,
        "classmethod": classmethod,
        "object": object,
        "Exception": Exception,
        "ValueError": ValueError,
        "TypeError": TypeError,
        "KeyError": KeyError,
        "AttributeError": AttributeError,
        "__build_class__": __build_class__,
        "__name__": "__lab__",
    }

    g: dict[str, Any] = {
        "__builtins__": safe_builtins,
        "DATABASE_URL": database_url,
        "create_engine": create_engine,
        "Column": Column,
        "Integer": Integer,
        "String": String,
        "Text": Text,
        "Boolean": Boolean,
        "Float": Float,
        "Numeric": Numeric,
        "DateTime": DateTime,
        "ForeignKey": ForeignKey,
        "Table": Table,
        "MetaData": MetaData,
        "UniqueConstraint": UniqueConstraint,
        "select": select,
        "text": text,
        "DeclarativeBase": DeclarativeBase,
        "Mapped": Mapped,
        "mapped_column": mapped_column,
        "relationship": relationship,
        "Session": Session,
    }

    # Pre-inject common sqlalchemy modules as if imported
    import sqlalchemy
    import sqlalchemy.orm as sa_orm

    g["sqlalchemy"] = sqlalchemy

    try:
        compiled = compile(code, "<lab>", "exec")
        exec(compiled, g, g)  # noqa: S102 — intentional constrained exec
        return {"ok": True, "stdout": "", "error": None}
    except UnsafeCodeError:
        raise
    except Exception as e:
        return {
            "ok": False,
            "stdout": "",
            "error": f"{type(e).__name__}: {e}",
            "traceback": traceback.format_exc()[-2000:],
        }
