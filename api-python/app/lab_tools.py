"""Lab execution helpers shared by every database track.

Pure helpers (unit-tested without a database):
  * split_statements: split a SQL script into statements (quotes, dollar quotes, comments aware)
  * explain_target: choose the statement to EXPLAIN (the selection, or the last statement)
  * hint_ladder / reveal_hints: progressive hints (nudge → concept → near-solution)
  * timeline_entry: compact per-run record for the replay timeline

Database helpers:
  * snapshot_tables: up to N rows per lab table, JSON-safe, for before/after data snapshots
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

LAB_TABLE = re.compile(r"^lab_[a-z0-9_]{1,58}$")
SNAPSHOT_ROWS = 50
HINT_LEVELS = ("nudge", "concept", "near-solution")
EXPLAINABLE = re.compile(r"^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|VALUES|TABLE)\b", re.I)


# ---------------------------------------------------------------- SQL statements
def split_statements(sql: str) -> list[dict[str, Any]]:
    """Split on top-level `;` → [{text, line, start, end}] (line is 1-based, of the first non-space char)."""
    out: list[dict[str, Any]] = []
    i, n, start = 0, len(sql), 0
    while i < n:
        c = sql[i]
        if c == "-" and sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c in ("'", '"'):
            j = i + 1
            while j < n:
                if sql[j] == c:
                    if j + 1 < n and sql[j + 1] == c:  # doubled quote escape
                        j += 2
                        continue
                    break
                j += 1
            i = j + 1
            continue
        if c == "$":
            m = re.match(r"\$(\w*)\$", sql[i:])
            if m:
                tag = m.group(0)
                j = sql.find(tag, i + len(tag))
                i = n if j < 0 else j + len(tag)
                continue
        if c == ";":
            _push(out, sql, start, i)
            start = i + 1
        i += 1
    _push(out, sql, start, n)
    return out


def _push(out: list[dict[str, Any]], sql: str, start: int, end: int) -> None:
    chunk = sql[start:end]
    body = _strip_leading_comments(chunk)
    if not body.strip():
        return
    lead = len(chunk) - len(chunk.lstrip())
    s = start + lead
    out.append({"text": chunk.strip(), "line": sql[:s].count("\n") + 1, "start": start, "end": end})


def _strip_leading_comments(s: str) -> str:
    prev = None
    while prev != s:
        prev = s
        s = s.lstrip()
        if s.startswith("--"):
            nl = s.find("\n")
            s = "" if nl < 0 else s[nl + 1 :]
        elif s.startswith("/*"):
            e = s.find("*/")
            s = "" if e < 0 else s[e + 2 :]
    return s


def explain_target(code: str, selection: str | None) -> dict[str, Any]:
    """Pick what to EXPLAIN. Returns {setup, query, line} or {error}.

    With a selection: it must be exactly one explainable statement; the rest of the script (minus the
    selected text) is the setup. Without one: the LAST statement is explained, the earlier ones are setup.
    """
    if selection and selection.strip():
        stmts = split_statements(selection)
        if len(stmts) != 1:
            return {"error": f"Select exactly one statement to explain (the selection has {len(stmts)})."}
        query = _strip_leading_comments(stmts[0]["text"]).strip()
        idx = code.rfind(selection)
        setup = code[:idx] + code[idx + len(selection) :] if idx >= 0 else code
        line = code[:idx].count("\n") + stmts[0]["line"] if idx >= 0 else None
    else:
        stmts = split_statements(code)
        if not stmts:
            return {"error": "Nothing to explain: write a SELECT (or select one statement) first."}
        last = stmts[-1]
        query = _strip_leading_comments(last["text"]).strip()
        setup = code[: last["start"]]
        line = last["line"]
    if not EXPLAINABLE.match(query):
        word = (query.split() or ["?"])[0].upper()
        return {
            "error": f"EXPLAIN works on SELECT / INSERT / UPDATE / DELETE / WITH, not `{word}`. "
            "Put your query last, or select it in the editor.",
            "line": line,
        }
    return {"setup": setup, "query": query, "line": line}


# ---------------------------------------------------------------- hints
def _mask_line(line: str) -> str:
    """Near-solution: keep the structure, blank out the part that carries the answer."""
    patterns = [
        (r"(ForeignKey\()([^)]*)(\))", r"\1____\3"),
        (r"(REFERENCES\s+)(\w+\s*\([^)]*\))", r"\1____(____)"),
        (r"(@relation\()([^)]*)(\))", r"\1fields: [____], references: [____]\3"),
        (r"(ondelete\s*=\s*)(\"[^\"]*\"|'[^']*')", r'\1"____"'),
        (r"(ON DELETE\s+)(CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)", r"\1____", ),
        (r"(onDelete:\s*)(\w+)", r"\1____"),
        (r"(unique\s*=\s*)(True|False)", r"\1____"),
        (r"(CHECK\s*)\((.*)\)", r"\1(____)"),
        (r"(secondary\s*=\s*)(\w+)", r"\1____"),
        (r"(back_populates\s*=\s*)(\"[^\"]*\"|'[^']*')", r'\1"____"'),
    ]
    for pat, rep in patterns:  # every pattern: one line can hold several answers (REFERENCES … ON DELETE …)
        line = re.sub(pat, rep, line, flags=re.I)
    return line


def near_solution(solution: str) -> str:
    return "\n".join(_mask_line(ln) for ln in solution.splitlines())


def hint_ladder(item: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    """Three-step ladder from the item's own content (authored `hintLadder` wins when present)."""
    ex = item.get("exercise") if kind == "lesson" and isinstance(item.get("exercise"), dict) else item
    if isinstance(ex.get("hintLadder"), list) and ex["hintLadder"]:
        return ex["hintLadder"]
    hints = [h for h in (ex.get("hints") or item.get("hints") or []) if isinstance(h, str)]
    if ex.get("hint"):
        hints = [ex["hint"], *hints]
    nudge = hints[0] if hints else (item.get("summary") or ex.get("prompt") or "Re-read the task: which table or column is the gate asking for?")
    why = item.get("why") or item.get("summary") or ""
    refs = item.get("references") or []
    concept = why if isinstance(why, str) else " ".join(why)
    if len(hints) > 1:
        concept = f"{concept}\n\n{hints[1]}".strip()
    ladder: list[dict[str, Any]] = [
        {"level": 1, "kind": "nudge", "text": nudge},
        {"level": 2, "kind": "concept", "text": concept or nudge, "links": refs[:2]},
    ]
    if kind == "lesson" and ex.get("kind") == "quiz":
        qs = ex.get("questions") or []
        ladder.append(
            {
                "level": 3,
                "kind": "near-solution",
                "text": "For each question, rule out the options that put database access or secrets where they "
                "cannot be protected; the remaining option is the answer.",
                "questions": [q.get("prompt") or q.get("text") for q in qs],
            }
        )
    elif ex.get("solution"):
        ladder.append(
            {
                "level": 3,
                "kind": "near-solution",
                "text": "Here is the reference shape with the key parts blanked out (____). Fill them in.",
                "code": near_solution(ex["solution"]),
            }
        )
    return ladder


def reveal_hints(ladder: list[dict[str, Any]], level: int) -> list[dict[str, Any]]:
    level = max(0, min(level, len(ladder)))
    return ladder[:level]


# ---------------------------------------------------------------- snapshots
def _cell(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return str(v)


def snapshot_tables(engine: Engine, names: list[str], limit: int = SNAPSHOT_ROWS) -> dict[str, Any]:
    """{table: {columns, rows, total, primaryKey}} for each existing lab table (ordered by PK / first column)."""
    out: dict[str, Any] = {}
    safe = sorted({n for n in names if LAB_TABLE.match(n)})
    if not safe:
        return out
    with engine.connect() as conn:
        for name in safe:
            if not conn.execute(text("SELECT to_regclass(:n) IS NOT NULL"), {"n": f'public."{name}"'}).scalar():
                continue
            pk = [
                r[0]
                for r in conn.execute(
                    text(
                        "SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid "
                        "AND a.attnum = ANY(i.indkey) WHERE i.indrelid = CAST(:t AS regclass) AND i.indisprimary "
                        "ORDER BY array_position(i.indkey, a.attnum)"
                    ),
                    {"t": f'public."{name}"'},
                )
            ]
            order = ", ".join(f'"{c}"' for c in pk) or "1"
            res = conn.execute(text(f'SELECT * FROM "{name}" ORDER BY {order} LIMIT {int(limit)}'))
            cols = list(res.keys())
            rows = [[_cell(v) for v in r] for r in res.fetchall()]
            total = conn.execute(text(f'SELECT count(*) FROM "{name}"')).scalar()
            out[name] = {"columns": cols, "rows": rows, "total": int(total or 0), "primaryKey": pk}
    return out


def exercise_tables(requirements: dict[str, Any] | None) -> list[str]:
    if not requirements:
        return []
    return [t["name"] for t in requirements.get("tables", [])] + list(requirements.get("resetTables") or [])


# ---------------------------------------------------------------- timeline
def timeline_entry(row: dict[str, Any]) -> dict[str, Any]:
    v = row.get("validation") or {}
    failures = v.get("failures") or []
    return {
        "id": row["id"],
        "createdAt": row["created_at"].isoformat() if hasattr(row.get("created_at"), "isoformat") else row.get("created_at"),
        "success": bool(row.get("success")),
        "mode": row.get("mode"),
        "message": (row.get("message") or "")[:300],
        "rules": sorted({f.get("rule") for f in failures if f.get("rule")}),
        "failureCount": len(failures),
        "hintLevel": row.get("hint_level") or 0,
        "codeLines": (row.get("code") or "").count("\n") + 1,
    }
