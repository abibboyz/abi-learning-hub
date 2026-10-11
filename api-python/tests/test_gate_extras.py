import json

from app.task_checker import check_calls, check_data, check_probes, check_stdout, grade_quiz

QUIZ = [{"id": "q1", "prompt": "Pick b", "options": [{"id": "a", "text": "A", "why": "A is wrong because…"}, {"id": "b", "text": "B", "correct": True}]}]


def test_quiz_correct_wrong_unanswered_and_malformed():
    assert grade_quiz(QUIZ, json.dumps({"answers": {"q1": "b"}}))["ok"]
    wrong = grade_quiz(QUIZ, json.dumps({"answers": {"q1": "a"}}))
    assert [f["rule"] for f in wrong["failures"]] == ["wrong-answer"] and "A is wrong because" in wrong["message"]
    assert [f["rule"] for f in grade_quiz(QUIZ, "{}")["failures"]] == ["unanswered"]
    assert [f["rule"] for f in grade_quiz(QUIZ, "not json")["failures"]] == ["rejected"]


def test_probes():
    def ok(_):
        return 3

    def boom(_):
        raise RuntimeError('null value in column "parent_id" violates not-null constraint')

    assert check_probes([{"sql": ["x"], "message": "m"}], ok) == []
    assert [f["rule"] for f in check_probes([{"sql": ["x"], "message": "m"}], boom)] == ["probe-failed"]
    assert "not-null" in check_probes([{"sql": ["x"], "message": "m"}], boom)[0]["message"]
    assert [f["rule"] for f in check_probes([{"sql": ["x"], "expect": "error", "message": "m"}], ok)] == ["constraint-not-enforced"]
    assert check_probes([{"sql": ["x"], "expect": "error", "message": "m"}], boom) == []
    assert [f["rule"] for f in check_probes([{"sql": ["x"], "minRows": 5, "message": "m"}], ok)] == ["probe-failed"]


def test_calls_and_stdout_and_data():
    specs = [{"call": "M", "expect": "ok", "message": "good"}, {"call": "M", "expect": "raises", "message": "bad"}]
    assert check_calls(specs, [{"status": "ok"}, {"status": "raised"}]) == []
    assert [f["rule"] for f in check_calls(specs, [{"status": "raised", "error": "x"}, {"status": "ok"}])] == ["rejects-valid", "accepts-invalid"]
    assert [f["rule"] for f in check_calls(specs[:1], [{"status": "missing"}])] == ["missing-name"]
    assert check_stdout({"contains": "1", "message": "m"}, "1\n") == []
    assert [f["rule"] for f in check_stdout({"contains": "1", "message": "m"}, "")] == ["missing-output"]
    assert [f["rule"] for f in check_data([{"sql": "s", "min": 2, "message": "m"}], lambda _: 1)] == ["missing-data"]
    assert [f["rule"] for f in check_data([{"sql": "s", "max": 0, "message": "m"}], lambda _: 1)] == ["too-much-data"]
