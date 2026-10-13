"""Pure helpers behind /lab: statement splitting, EXPLAIN target, hint ladder, timeline rows."""
from datetime import datetime, timezone

from app.lab_tools import explain_target, hint_ladder, near_solution, reveal_hints, split_statements, timeline_entry


def test_split_statements_respects_quotes_dollar_quotes_and_comments():
    sql = (
        "-- setup; not a split\n"
        "CREATE TABLE t (s text DEFAULT ';');\n"
        "CREATE FUNCTION f() RETURNS int AS $$ SELECT 1; $$ LANGUAGE sql;\n"
        "/* a; b */ SELECT 'x;y' AS v"
    )
    parts = split_statements(sql)
    assert len(parts) == 3
    assert parts[1]["text"].startswith("CREATE FUNCTION") and "$$ SELECT 1; $$" in parts[1]["text"]
    assert parts[0]["line"] == 1 or parts[0]["line"] == 2
    assert parts[2]["line"] == 4


def test_explain_target_last_statement_or_selection():
    code = "CREATE TEMP TABLE a (id int);\nINSERT INTO a VALUES (1);\nSELECT * FROM a;"
    t = explain_target(code, None)
    assert t["query"].startswith("SELECT * FROM a")
    assert "INSERT INTO a" in t["setup"] and t["line"] == 3
    sel = explain_target(code, "INSERT INTO a VALUES (1)")
    assert sel["query"].startswith("INSERT")
    assert "error" in explain_target("CREATE TABLE x (id int);", None), "DDL cannot be explained"
    assert "error" in explain_target("   ", None)


def test_near_solution_masks_the_key_parts_only():
    sol = "CREATE TABLE b (\n  id SERIAL PRIMARY KEY,\n  a_id INT NOT NULL REFERENCES a(id) ON DELETE CASCADE\n);"
    masked = near_solution(sol)
    assert "REFERENCES ____(____)" in masked or "REFERENCES ____" in masked
    assert "CASCADE" not in masked
    assert "id SERIAL PRIMARY KEY" in masked, "unrelated lines stay readable"


def test_hint_ladder_three_tiers_and_authored_override():
    task = {"hints": ["Look at the FK.", "Use REFERENCES."], "why": "FKs keep rows consistent.", "references": [{"title": "PG", "url": "https://x"}], "solution": "CREATE TABLE b (a_id INT REFERENCES a(id));"}
    ladder = hint_ladder(task, "task")
    assert [h["kind"] for h in ladder] == ["nudge", "concept", "near-solution"]
    assert ladder[0]["text"] == "Look at the FK."
    assert "____" in ladder[2]["code"]
    assert [h["level"] for h in reveal_hints(ladder, 2)] == [1, 2]
    assert reveal_hints(ladder, 0) == []
    authored = [{"level": 1, "kind": "nudge", "text": "custom"}]
    assert hint_ladder({**task, "hintLadder": authored}, "task") == authored


def test_quiz_ladder_never_leaks_the_answer():
    lesson = {"exercise": {"kind": "quiz", "hint": "Think server-side.", "questions": [{"id": "q1", "prompt": "Where?", "correct": "b"}]}}
    ladder = hint_ladder(lesson, "lesson")
    assert ladder[-1]["kind"] == "near-solution" and "code" not in ladder[-1]
    assert "correct" not in str(ladder)


def test_timeline_entry_shape():
    row = {"id": 7, "created_at": datetime(2026, 10, 13, tzinfo=timezone.utc), "success": False, "mode": "task", "message": "m", "validation": {"failures": [{"rule": "missing-table"}, {"rule": "missing-table"}]}, "hint_level": 2, "code": "a\nb"}
    e = timeline_entry(row)
    assert e == {"id": 7, "createdAt": "2026-10-13T00:00:00+00:00", "success": False, "mode": "task", "message": "m", "rules": ["missing-table"], "failureCount": 2, "hintLevel": 2, "codeLines": 2}
