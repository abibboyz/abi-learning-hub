from app.tracks_loader import list_tasks, list_tracks, load_task


def test_list_tracks():
    tracks = list_tracks()
    ids = {t["id"] for t in tracks}
    assert "python-sqlalchemy" in ids
    assert "node-typescript" in ids
    assert "node-javascript" in ids


def test_twelve_tasks_in_order():
    tasks = list_tasks("python-sqlalchemy")
    assert len(tasks) == 12
    assert [t["order"] for t in tasks] == list(range(1, 13))


def test_task_has_requirements():
    t = load_task("python-sqlalchemy", "rel-01-create-connect")
    assert "requirements" in t
    assert t["starterCode"]
    assert t["requirements"]["tables"]


def test_playwright_track_is_listed_with_its_kind():
    """The Playwright track is served by pw-runner, but it lives in the same tracks/ index."""
    tracks = {t["id"]: t for t in list_tracks()}
    assert "playwright-typescript" in tracks
    assert tracks["playwright-typescript"].get("kind") == "playwright"
    assert tracks["playwright-typescript"].get("api") == "playwright"


def test_playwright_manifest_matches_files():
    from app.tracks_loader import list_lessons, load_manifest

    m = load_manifest("playwright-typescript")
    assert m["kind"] == "playwright"
    assert m["playwrightVersion"] == "1.64.0"
    tasks = list_tasks("playwright-typescript")
    lessons = list_lessons("playwright-typescript")
    assert [t["id"] for t in tasks] == m["taskIds"]
    assert [lesson["id"] for lesson in lessons] == m["lessonIds"]
    assert len(tasks) == 19 and len(lessons) == 27
    for t in tasks:
        assert t["solution"] and t["wrongSolutions"], t["id"]
        assert any(r["url"].startswith("https://playwright.dev/") for r in t["references"]), t["id"]


def test_db_tracks_have_the_same_tasks_and_runnable_lessons():
    from app.tracks_loader import list_lessons, load_manifest

    ids = None
    for tid in ("python-sqlalchemy", "node-typescript", "node-javascript", "sql-postgres"):
        m = load_manifest(tid)
        tasks, lessons = list_tasks(tid), list_lessons(tid)
        assert "kind" not in m  # default ORM lab
        assert [t["id"] for t in tasks] == m["taskIds"] and len(tasks) == 12
        assert [x["id"] for x in lessons] == m["lessonIds"] and len(lessons) == 17
        ids = ids or m["taskIds"]
        assert m["taskIds"] == ids
        for item in tasks + [x["exercise"] for x in lessons]:
            assert item["solution"] and item["wrongSolutions"], item.get("id") or item.get("prompt")
            for w in item["wrongSolutions"]:
                assert w["expect"] and w["label"]
        for x in lessons:
            assert x["exercise"]["runnable"] is True
            assert x["references"] and all(r["url"].startswith("https://") for r in x["references"])
