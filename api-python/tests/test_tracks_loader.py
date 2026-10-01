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
