"""Constrained Python/SQLAlchemy lab runner — whitelist imports, no shell.

Learner code runs in a forked child process (hard timeout, killed on expiry) with restricted
builtins, an import allow-list and a static AST check. When the API can create it, the code connects
as a non-superuser lab role (see app/lab_role.py), so raw SQL cannot touch hub tables or the server.
"""
from __future__ import annotations

import ast
import builtins
import sys
import types
import contextlib
import io
import multiprocessing as mp
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
    "sqlalchemy.types",
    "sqlalchemy.schema",
    "datetime",
    "typing",
    "decimal",
    "enum",
    "__future__",
}
ALLOWED_IMPORT_ROOTS = {m.split(".")[0] for m in ALLOWED_IMPORT_MODULES}

ALLOWED_DUNDERS = {"__tablename__", "__table_args__", "__mapper_args__", "__name__", "__abstract__"}

# Attribute names that lead from an allowed module to the OS / interpreter (e.g. sqlalchemy.util.compat.os).
FORBIDDEN_ATTRIBUTES = {
    "os", "sys", "subprocess", "builtins", "importlib", "shutil", "socket", "pathlib", "io", "ctypes",
    "pickle", "marshal", "posix", "nt", "codecs", "inspect", "gc", "threading", "multiprocessing",
    "util", "compat", "langhelpers", "cextension", "dialects", "connectors", "pool", "testing",
    "f_globals", "f_locals", "f_back", "gi_frame", "cr_frame", "tb_frame", "co_code",
}



class UnsafeCodeError(ValueError):
    def __init__(self, message: str, line: int | None = None) -> None:
        super().__init__(message + (f" (line {line})" if line else ""))
        self.line = line


def _validate_ast(source: str) -> None:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise UnsafeCodeError(f"SyntaxError: {e.msg}", e.lineno) from e

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name not in ALLOWED_IMPORT_MODULES:
                        raise UnsafeCodeError(
                            f"Import not allowed: {alias.name}. The lab allows: "
                            + ", ".join(sorted(ALLOWED_IMPORT_MODULES - {"__future__"})),
                            node.lineno,
                        )
            else:
                mod = node.module or ""
                if node.level or mod not in ALLOWED_IMPORT_MODULES:
                    raise UnsafeCodeError(
                        f"Import not allowed: {'.' * node.level}{mod}. The lab allows: "
                        + ", ".join(sorted(ALLOWED_IMPORT_MODULES - {"__future__"})),
                            node.lineno,
                    )
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name in FORBIDDEN_ATTRIBUTES or alias.name.startswith("_") and alias.name != "annotations":
                    raise UnsafeCodeError(f"Import not allowed in the lab: {node.module}.{alias.name}", node.lineno)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in {"eval", "exec", "open", "__import__", "compile", "input"}:
                raise UnsafeCodeError(f"Call not allowed: {node.func.id}()", getattr(node, "lineno", None))
        if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_ATTRIBUTES:
            raise UnsafeCodeError(f"Attribute not allowed in the lab: .{node.attr}", getattr(node, "lineno", None))
        if isinstance(node, ast.Name) and node.id.startswith("__") and node.id not in ALLOWED_DUNDERS:
            raise UnsafeCodeError(f"Name not allowed: {node.id}", getattr(node, "lineno", None))
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            if node.attr not in ALLOWED_DUNDERS and node.attr.startswith("__"):
                if True:
                    raise UnsafeCodeError(f"Attribute not allowed: {node.attr}", getattr(node, "lineno", None))


def _safe_import(name: str, globals=None, locals=None, fromlist=(), level: int = 0):  # noqa: A002
    if level != 0 or name not in ALLOWED_IMPORT_MODULES:
        raise ImportError(f"Import not allowed in the lab: {name}")
    return builtins.__import__(name, globals, locals, fromlist, level)


def run_lab_code(
    code: str,
    database_url: str,
    timeout_sec: float | None = None,
    calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Validate, then execute in a child process. Returns {ok, stdout, error, line?, traceback?, calls?}.

    `calls` are trusted behaviour checks from the track JSON ({"call": "Name", "kwargs": {...}}): after the
    learner code ran, the child calls each name with those kwargs and reports whether it raised.
    """
    if len(code) > settings.max_code_chars:
        raise UnsafeCodeError("Code exceeds maximum length.")

    _validate_ast(code)

    timeout = timeout_sec or settings.runner_timeout_sec
    ctx = mp.get_context("fork")
    parent, child = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_child, args=(code, database_url, child, calls or []), daemon=True)
    proc.start()
    child.close()
    result: dict[str, Any] | None = None
    if parent.poll(timeout):
        try:
            result = parent.recv()
        except EOFError:
            result = None
    if proc.is_alive():
        proc.kill()
    proc.join(2)
    parent.close()
    if result is None:
        if proc.exitcode is None or proc.exitcode < 0:
            return {
                "ok": False,
                "stdout": "",
                "error": f"TimeoutError: the code ran longer than {timeout:g} s and was stopped "
                "(look for an endless loop or a query that waits on a lock).",
            }
        return {"ok": False, "stdout": "", "error": f"The lab process exited unexpectedly (code {proc.exitcode})."}
    return result


def _child(code: str, database_url: str, conn, calls: list[dict[str, Any]]) -> None:  # forked process
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            res = _exec_lab_code(code, database_url, calls)
    except BaseException as e:  # noqa: BLE001
        res = {"ok": False, "error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()[-2000:]}
    res["stdout"] = out.getvalue()[-4000:]
    try:
        conn.send(res)
    finally:
        conn.close()


def _exec_lab_code(code: str, database_url: str, calls: list[dict[str, Any]] | None = None) -> dict[str, Any]:
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
        "__import__": _safe_import,
        "__name__": "__lab__",
        "repr": repr,
        "round": round,
        "abs": abs,
        "any": any,
        "all": all,
        "map": map,
        "filter": filter,
        "reversed": reversed,
        "NotImplementedError": NotImplementedError,
        "RuntimeError": RuntimeError,
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

    # SQLAlchemy resolves Mapped[...] annotations through sys.modules[cls.__module__], so the learner
    # namespace must be a real (synthetic) module. This runs in the forked child only.
    lab_module = types.ModuleType("__lab__")
    lab_module.__dict__.update(g)
    sys.modules["__lab__"] = lab_module
    g = lab_module.__dict__

    try:
        compiled = compile(code, "<lab>", "exec")
        exec(compiled, g, g)  # noqa: S102 — intentional constrained exec
    except Exception as e:
        tb = traceback.extract_tb(e.__traceback__)
        line = next((f.lineno for f in reversed(tb) if f.filename == "<lab>"), None)
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}" + (f" (line {line})" if line else ""),
            "line": line,
            "traceback": traceback.format_exc()[-2000:],
        }
    return {"ok": True, "error": None, "calls": [_trusted_call(g, c) for c in calls or []]}


def _trusted_call(g: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    target = g.get(spec["call"])
    if not callable(target):
        return {"status": "missing"}
    try:
        target(**(spec.get("kwargs") or {}))
        return {"status": "ok"}
    except Exception as e:  # noqa: BLE001 — the learner's validator is expected to raise
        return {"status": "raised", "error": f"{type(e).__name__}: {e}"[:300]}
