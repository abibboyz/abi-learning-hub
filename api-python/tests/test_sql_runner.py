import pytest

from app.sql_runner import run_lab_sql


@pytest.mark.parametrize("sql,word", [("BEGIN; CREATE TABLE lab_x (id int);", "BEGIN"), ("CREATE TABLE lab_x (id int);\ncommit;", "COMMIT")])
def test_transaction_control_rejected_before_connecting(sql, word):
    r = run_lab_sql(sql, "postgresql://nobody:nopass@127.0.0.1:1/none")
    assert not r["ok"] and r["rejected"] and word in r["error"]


def test_dollar_quoted_blocks_are_not_transaction_control():
    r = run_lab_sql("DO $$ BEGIN PERFORM 1; END $$;", "postgresql://nobody:nopass@127.0.0.1:1/none")
    assert not r.get("rejected")  # it only fails because the URL is unreachable
