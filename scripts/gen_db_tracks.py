"""Apply the track audit to the database tracks (python-sqlalchemy, node-typescript, node-javascript).

Idempotent: edits the existing task/lesson JSON in place.
  * tightens task requirements (types, UNIQUE, NULL-ability, composite keys, data) so plausible wrong
    answers fail with a specific rule,
  * adds reference solutions + wrong solutions (with the rule ids they must fail with),
  * replaces Node starters that contained the full answer with TODO skeletons,
  * adds new advanced tasks/lessons and runnable lesson exercises (scripts/db_lessons.py).
Run: python3 scripts/gen_db_tracks.py
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))
from db_solutions import NODE_TASKS, PRISMA_JS_NOTE, PY_TASKS  # noqa: E402

TRACKS = ["python-sqlalchemy", "node-typescript", "node-javascript"]


def col(table: dict, name: str) -> dict:
    for c in table["columns"]:
        if c["name"] == name:
            return c
    c = {"name": name}
    table["columns"].append(c)
    return c


def table(req: dict, name: str) -> dict:
    return next(t for t in req["tables"] if t["name"] == name)


def tighten(task_id: str, req: dict, track: str) -> dict:
    req = copy.deepcopy(req)
    req.pop("probe", None)
    if task_id == "rel-02-types-pks":
        t = table(req, "lab_products")
        col(t, "id")["type"] = "integer"
        col(t, "sku").update({"type": "text", "unique": True})
        col(t, "price")["type"] = "numeric"
        col(t, "in_stock")["type"] = "boolean"
    elif task_id == "rel-03-one-to-many":
        col(table(req, "lab_magazines"), "publisher_id")["unique"] = False
    elif task_id == "rel-04-many-to-one":
        t = table(req, "lab_orders")
        col(t, "customer_id")["nullable"] = False
        col(t, "total")["type"] = "numeric"
    elif task_id == "rel-05-one-to-one":
        col(table(req, "lab_settings"), "account_id")["unique"] = True
    elif task_id == "rel-06-many-to-many":
        table(req, "lab_class_enrollments")["uniqueTogether"] = [["learner_id", "class_id"]]
    elif task_id == "rel-07-self-referential":
        col(table(req, "lab_staff"), "manager_id")["nullable"] = True
    elif task_id == "rel-09-insert-query":
        col(table(req, "lab_players"), "team_id")["nullable"] = False
        if track == "python-sqlalchemy":
            req["data"] = [
                {
                    "sql": "SELECT count(*) FROM lab_teams",
                    "min": 2,
                    "message": "Insert at least two teams (and commit the session).",
                },
                {
                    "sql": "SELECT count(*) FROM lab_players p JOIN lab_teams t ON t.id = p.team_id",
                    "min": 3,
                    "message": "Insert at least three players that belong to a team — the JOIN must return them.",
                },
            ]
        else:
            # Node's lab runs a Prisma schema, not client code: the gate inserts sample rows itself and
            # runs the JOIN against your schema (inside a transaction that is rolled back).
            req["probes"] = [
                {
                    "sql": [
                        "INSERT INTO lab_teams (id, name) VALUES (9001, 'Reds'), (9002, 'Blues')",
                        "INSERT INTO lab_players (name, team_id) VALUES ('Ana', 9001), ('Ben', 9001), ('Chen', 9002)",
                        "SELECT p.name, t.name FROM lab_players p JOIN lab_teams t ON t.id = p.team_id",
                    ],
                    "minRows": 3,
                    "message": "The gate inserts 2 teams + 3 players into your schema (rolled back afterwards) and "
                    "joins them — the JOIN must return all 3 players.",
                }
            ]
    elif task_id == "rel-10-mini-domain":
        col(table(req, "lab_bloggers"), "handle")["unique"] = True
        table(req, "lab_post_tags")["uniqueTogether"] = [["post_id", "tag_id"]]
    return req


def write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    for track in TRACKS:
        tdir = ROOT / "tracks" / track / "tasks"
        for f in sorted(tdir.glob("*.json")):
            task = json.loads(f.read_text())
            tid = task["id"]
            task.pop("requirementsBase", None)
            task["requirements"] = tighten(tid, task["requirements"], track)  # idempotent: only sets keys
            if track == "python-sqlalchemy":
                src = PY_TASKS[tid]
                task["solution"] = src["solution"]
                task["wrongSolutions"] = [{"label": w["label"], "expect": w["expect"], "code": w["code"]} for w in src["wrong"]]
            else:
                src = NODE_TASKS[tid]
                prefix = PRISMA_JS_NOTE if track == "node-javascript" else ""
                task["starterCode"] = prefix + src["starter"]
                task["starterCodePrisma"] = task["starterCode"]
                task["solution"] = prefix + src["solution"]
                task["wrongSolutions"] = [
                    {"label": w["label"], "expect": w["expect"], "code": prefix + w["code"]} for w in src["wrong"]
                ]
            write(f, task)
    print("tasks updated")


if __name__ == "__main__":
    main()
