"""Capture what each reference solution produces → tracks/<track>/expected/<kind>s/<id>.json.

The lab's "Expected vs yours" view compares a learner's run with this file: schema (the exercise's tables
only), data (rows per table), SQL result sets and printed output. Run with both APIs up:

    python3 scripts/capture_expected.py [track ...]
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = {"python-sqlalchemy": 8000, "sql-postgres": 8000, "node-typescript": 8001, "node-javascript": 8001}


def run(track, body):
    r = urllib.request.Request(f"http://localhost:{API[track]}/execute", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=90))


def tables_of(req):
    return [t["name"] for t in (req or {}).get("tables", [])] + list((req or {}).get("resetTables") or [])


bad = 0
for track in sys.argv[1:] or list(API):
    n = 0
    for kind, sub in (("task", "tasks"), ("lesson", "lessons")):
        for f in sorted((ROOT / "tracks" / track / sub).glob("*.json")):
            item = json.loads(f.read_text())
            spec = item if kind == "task" else (item.get("exercise") or {})
            if not spec.get("solution") or spec.get("kind") == "quiz":
                continue
            body = {"trackId": track, "code": spec["solution"], ("taskId" if kind == "task" else "lessonId"): item["id"]}
            d = run(track, body)
            if not d.get("success"):
                bad += 1
                print("FAIL", track, item["id"], d.get("message", "")[:200])
                continue
            names = set(tables_of(spec.get("requirements")))
            schema = {
                "tables": [t for t in d["schema"]["tables"] if t["name"] in names],
                "relationships": [r for r in d["schema"].get("relationships", []) if r["fromTable"] in names],
            }
            out = {
                "trackId": track,
                "kind": kind,
                "id": item["id"],
                "schema": schema,
                "data": d.get("dataAfter") or {},
                "results": d.get("results") or [],
                "stdout": d.get("stdout") or "",
                "sql": d.get("sql") or [],
            }
            dest = ROOT / "tracks" / track / "expected" / sub / f"{item['id']}.json"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(out, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
            n += 1
    print(f"{track}: captured {n}")
print("BAD", bad)
sys.exit(1 if bad else 0)
