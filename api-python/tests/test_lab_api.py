"""/lab endpoints and Run (scratch) mode against a real Postgres. Skipped when it is not reachable."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app

ROOT = Path(__file__).resolve().parents[2] / "tracks"
TRACK = "sql-postgres"
LESSON = "10-query-joins"


def _db_up() -> bool:
    try:
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="Postgres not reachable (set DATABASE_URL)")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _lesson():
    return json.loads((ROOT / TRACK / "lessons" / f"{LESSON}.json").read_text())


def _table_exists(name: str) -> bool:
    with get_engine().connect() as c:
        return bool(c.execute(text("SELECT to_regclass(:n)"), {"n": f"public.{name}"}).scalar())


def test_run_is_scratch_rolled_back_and_returns_rows(client):
    with get_engine().begin() as c:
        c.execute(text("DROP TABLE IF EXISTS lab_zz_probe"))
    code = "CREATE TABLE lab_zz_probe (id int);\nINSERT INTO lab_zz_probe VALUES (1),(2);\nSELECT id FROM lab_zz_probe ORDER BY id;"
    d = client.post("/execute", json={"trackId": TRACK, "lessonId": LESSON, "code": code, "scratch": True}).json()
    assert d["gate"] == "ran" and d["checked"] is False and d["success"] is True
    assert d["results"][-1]["rows"] == [[1], [2]]
    assert not _table_exists("lab_zz_probe"), "Run must not leave tables behind"


def test_run_reports_the_error_line(client):
    d = client.post("/execute", json={"trackId": TRACK, "lessonId": LESSON, "code": "SELECT 1;\nSELEC 2;", "scratch": True}).json()
    assert d["success"] is False and d["gate"] in ("runtime_error", "rejected")
    assert any(f.get("line") == 2 for f in d["validation"]["failures"]) or "line 2" in d["message"]


def test_check_returns_results_and_data_snapshots_matching_expected(client):
    sol = _lesson()["exercise"]["solution"]
    d = client.post("/execute", json={"trackId": TRACK, "lessonId": LESSON, "code": sol}).json()
    assert d["success"], d["message"]
    assert d["dataAfter"], "Check returns the exercise tables after the run"
    assert "dataBefore" in d
    exp = client.get("/lab/expected", params={"trackId": TRACK, "kind": "lesson", "id": LESSON}).json()
    assert [r["rows"] for r in d["results"]][-1] == exp["results"][-1]["rows"]
    assert set(exp["data"]) <= set(d["dataAfter"])


def test_hints_are_recorded_and_counted_on_runs(client):
    r = client.post("/lab/hints", json={"trackId": TRACK, "kind": "lesson", "id": LESSON, "level": 2}).json()
    assert [h["level"] for h in r["hints"]] == [1, 2] and r["total"] == 3
    used = client.get("/lab/hints", params={"trackId": TRACK, "kind": "lesson", "id": LESSON}).json()
    assert used["used"] >= 2 and len(used["hints"]) == used["used"]
    d = client.post("/execute", json={"trackId": TRACK, "lessonId": LESSON, "code": "SELECT 1;", "scratch": True}).json()
    assert d["hintsUsed"] >= 2


def test_timeline_lists_runs_oldest_first(client):
    t = client.get("/lab/timeline", params={"trackId": TRACK, "kind": "lesson", "id": LESSON}).json()
    assert t["attempts"] >= 2
    ids = [r["id"] for r in t["runs"]]
    assert ids == sorted(ids)
    assert any(r["mode"].startswith("run") for r in t["runs"]) and t["firstPassId"]


def test_expected_unknown_item_is_404(client):
    assert client.get("/lab/expected", params={"trackId": TRACK, "kind": "lesson", "id": "nope"}).status_code == 404


def test_reset_task_drops_tables_and_returns_starter(client):
    lesson = _lesson()
    client.post("/execute", json={"trackId": TRACK, "lessonId": LESSON, "code": lesson["exercise"]["solution"]})
    r = client.post("/lab/reset-task", json={"trackId": TRACK, "kind": "lesson", "id": LESSON}).json()
    assert r["ok"] and r["dropped"] and r["starterCode"] == lesson["exercise"].get("starterCode", "")
    assert not any(_table_exists(n) for n in r["dropped"])


def test_explain_and_explain_analyze_are_rolled_back(client):
    code = "CREATE TABLE lab_zz_x (id int);\nINSERT INTO lab_zz_x SELECT generate_series(1, 50);\nSELECT * FROM lab_zz_x WHERE id > 10 ORDER BY id DESC;"
    plain = client.post("/lab/explain", json={"code": code}).json()
    assert plain["ok"] and plain["plan"][0]["Plan"]["Node Type"] == "Sort" and plain["line"] == 3
    an = client.post("/lab/explain", json={"code": code, "analyze": True}).json()
    assert an["ok"] and an["plan"][0]["Plan"]["Actual Rows"] == 40
    assert not _table_exists("lab_zz_x")
    sel = client.post("/lab/explain", json={"code": code, "selection": "INSERT INTO lab_zz_x SELECT generate_series(1, 50)"}).json()
    assert sel["ok"] and sel["plan"][0]["Plan"]["Node Type"] == "ModifyTable"


def test_explain_errors(client):
    assert client.post("/lab/explain", json={"code": "CREATE TABLE a (id int);"}).json()["ok"] is False
    bad = client.post("/lab/explain", json={"code": "SELECT * FROM lab_does_not_exist;"}).json()
    assert bad["ok"] is False and "lab_does_not_exist" in bad["error"]
    assert client.post("/lab/explain", json={"trackId": "python-sqlalchemy", "code": "SELECT 1"}).status_code == 400
