from app.tracks_loader import list_tasks, list_tracks, load_task


def test_list_tracks():
    tracks = list_tracks()
    ids = {t["id"] for t in tracks}
    assert "python-sqlalchemy" in ids
    assert "node-typescript" in ids
    assert "node-javascript" in ids


def test_ten_tasks():
    tasks = list_tasks("python-sqlalchemy")
    assert len(tasks) == 10
    assert tasks[0]["order"] == 1
    assert tasks[-1]["order"] == 10


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


def test_existing_tracks_keep_their_kind_default():
    for tid in ("python-sqlalchemy", "node-typescript", "node-javascript"):
        assert len(list_tasks(tid)) == 10
