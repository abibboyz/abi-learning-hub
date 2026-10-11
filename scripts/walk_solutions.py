"""Walk every task + lesson exercise (reference solution, wrong solutions, starter) against the running APIs.

python3 scripts/walk_solutions.py [track ...]   (api-python on :8000, api-node on :8001)
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = {"python-sqlalchemy": 8000, "sql-postgres": 8000, "node-typescript": 8001, "node-javascript": 8001}


def run(track, code, task=None, lesson=None):
    body = {"trackId": track, "code": code, **({"taskId": task} if task else {}), **({"lessonId": lesson} if lesson else {})}
    r = urllib.request.Request(f"http://localhost:{API[track]}/execute", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    d = json.load(urllib.request.urlopen(r, timeout=90))
    rules = sorted({f["rule"] for f in (d.get("validation") or {}).get("failures", [])})
    return d["success"], rules, d.get("message", "")


bad = 0
for track in sys.argv[1:] or list(API):
    items = []
    for f in sorted((ROOT / "tracks" / track / "tasks").glob("*.json")):
        t = json.loads(f.read_text())
        items.append(("task", t["id"], t, t.get("starterCode")))
    for f in sorted((ROOT / "tracks" / track / "lessons").glob("*.json")):
        l = json.loads(f.read_text())
        ex = l.get("exercise") or {}
        items.append(("lesson", l["id"], ex, ex.get("starterCode")))
    for kind, iid, spec, starter in items:
        kw = {"task": iid} if kind == "task" else {"lesson": iid}
        ok, rules, msg = run(track, spec["solution"], **kw)
        if not ok:
            bad += 1
            print(f"FAIL {track} {kind} {iid} solution → {rules} {msg[:300]}")
        for w in spec.get("wrongSolutions", []):
            ok, rules, msg = run(track, w["code"], **kw)
            if ok or not set(w["expect"]) <= set(rules):
                bad += 1
                print(f"FAIL {track} {kind} {iid} wrong '{w['label']}' expected {w['expect']} got ok={ok} {rules} {msg[:300]}")
        if starter:
            ok, rules, msg = run(track, starter, **kw)
            if ok:
                bad += 1
                print(f"FAIL {track} {kind} {iid} starter passes")
    print(f"{track}: walked {len(items)} items")
print("BAD", bad)
sys.exit(1 if bad else 0)
