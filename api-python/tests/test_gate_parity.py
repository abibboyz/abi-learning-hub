"""The same fixture is run by api-node/tests/gateParity.test.ts — both gates must agree rule for rule."""
import json
from pathlib import Path

import pytest

from app.task_checker import check_requirements

CASES = json.loads((Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "schema-gate-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_gate_case(case):
    result = check_requirements(case["schema"], case["requirements"])
    assert sorted(f["rule"] for f in result["failures"]) == sorted(case["expectRules"])
    assert result["ok"] is (not case["expectRules"])
    for f in result["failures"]:
        assert "Why" in f["message"] or f["rule"] == "wrong-type", f  # every schema failure explains cause → effect
