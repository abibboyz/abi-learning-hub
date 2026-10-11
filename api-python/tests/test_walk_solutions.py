"""Walk EVERY task and lesson exercise of the API-python tracks against a real Postgres:
the reference solution must pass, every wrong solution must fail with its expected rule ids,
and the starter code must not pass. Skipped when Postgres is not reachable."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import get_engine
from app.main import app

ROOT = Path(__file__).resolve().parents[2] / "tracks"
TRACKS = ["python-sqlalchemy", "sql-postgres"]


def _db_up() -> bool:
    try:
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="Postgres not reachable (set DATABASE_URL)")


def _items():
    for track in TRACKS:
        for f in sorted((ROOT / track / "tasks").glob("*.json")):
            t = json.loads(f.read_text())
            yield pytest.param(track, {"taskId": t["id"]}, t, id=f"{track}:task:{t['id']}")
        for f in sorted((ROOT / track / "lessons").glob("*.json")):
            lesson = json.loads(f.read_text())
            yield pytest.param(track, {"lessonId": lesson["id"]}, lesson["exercise"], id=f"{track}:lesson:{lesson['id']}")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs startup → meta tables + lab role
        yield c


def _run(client, track, target, code):
    r = client.post("/execute", json={"trackId": track, "code": code, **target})
    assert r.status_code == 200, r.text
    d = r.json()
    return d, sorted({f["rule"] for f in d["validation"]["failures"]})


@pytest.mark.parametrize("track,target,spec", list(_items()))
def test_reference_wrong_and_starter(client, track, target, spec):
    d, rules = _run(client, track, target, spec["solution"])
    assert d["success"], f"reference solution failed: {d['message']}"
    assert spec["wrongSolutions"], "every exercise needs at least one wrong solution"
    for w in spec["wrongSolutions"]:
        d, rules = _run(client, track, target, w["code"])
        assert not d["success"], f"wrong solution passed: {w['label']}"
        assert set(w["expect"]) <= set(rules), f"{w['label']}: expected {w['expect']}, got {rules}: {d['message']}"
        assert d["message"]
    if spec.get("starterCode"):
        d, _ = _run(client, track, target, spec["starterCode"])
        assert not d["success"], "starter code must not pass"


def test_public_payloads_hide_solutions_and_answer_keys(client):
    for track in TRACKS:
        blob = json.dumps(client.get(f"/tracks/{track}/tasks").json()) + json.dumps(client.get(f"/tracks/{track}/lessons").json())
        assert '"solution"' not in blob and '"wrongSolutions"' not in blob and '"correct"' not in blob
        sol = client.get(f"/tracks/{track}/lessons/02-tables-columns/solution").json()
        assert "CREATE TABLE" in sol["solution"] or "class " in sol["solution"]


def test_history_replay_detail(client):
    d, _ = _run(client, "sql-postgres", {"lessonId": "01-connections"}, "SELECT 1 AS ok;")
    hist = client.get("/history", params={"trackId": "sql-postgres", "limit": 1}).json()["history"][0]
    detail = client.get(f"/history/{hist['id']}").json()
    assert detail["code"] == "SELECT 1 AS ok;" and detail["mode"] == "lesson:01-connections"


def test_sql_lab_role_cannot_touch_hub_tables_or_create_non_lab_tables(client):
    d, rules = _run(client, "sql-postgres", {"lessonId": "01-connections"}, "SELECT count(*) FROM run_history;")
    assert not d["success"] and rules == ["runtime-error"] and "permission denied" in d["message"]
    d, rules = _run(client, "sql-postgres", {"lessonId": "01-connections"}, "CREATE TABLE sneaky (id int);")
    assert not d["success"] and rules == ["rejected"] and "lab_" in d["message"]
