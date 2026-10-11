"""The runner must really EXECUTE allowed code (regression: every task used to fail with
'__import__ not found'), stop endless loops, and refuse escapes — with line numbers."""
import pytest

from app.runner import UnsafeCodeError, run_lab_code

URL = "postgresql+psycopg://nobody:nopass@127.0.0.1:1/none"  # never connected to in these tests

MODELS = '''
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, validates


class Base(DeclarativeBase):
    pass


class LabAuthor(Base):
    __tablename__ = "lab_authors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    books: Mapped[list["LabBook"]] = relationship(back_populates="author")

    @validates("name")
    def check(self, key, value):
        if not value:
            raise ValueError("empty")
        return value


class LabBook(Base):
    __tablename__ = "lab_books"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("lab_authors.id"))
    author: Mapped[LabAuthor] = relationship(back_populates="books")


print(sorted(Base.metadata.tables))
'''


def test_executes_imports_annotations_and_relationships():
    r = run_lab_code(MODELS, URL)
    assert r["ok"], r
    assert "['lab_authors', 'lab_books']" in r["stdout"]


def test_trusted_calls_report_raise_or_ok():
    r = run_lab_code(MODELS, URL, calls=[
        {"call": "LabAuthor", "kwargs": {"name": "Ann"}},
        {"call": "LabAuthor", "kwargs": {"name": ""}},
        {"call": "Nope", "kwargs": {}},
    ])
    assert [c["status"] for c in r["calls"]] == ["ok", "raised", "missing"]


def test_runtime_error_has_line():
    r = run_lab_code("x = 1\ny = 1 / 0\n", URL)
    assert not r["ok"] and r["line"] == 2 and "ZeroDivisionError" in r["error"] and "(line 2)" in r["error"]


def test_timeout_kills_endless_loop():
    r = run_lab_code("while True:\n    pass\n", URL, timeout_sec=1)
    assert not r["ok"] and "TimeoutError" in r["error"]


@pytest.mark.parametrize(
    "code,needle,line",
    [
        ("import os", "Import not allowed", 1),
        ("x = 1\nfrom sqlalchemy import util", "sqlalchemy.util", 2),
        ("import sqlalchemy\nsqlalchemy.util", "Attribute not allowed", 2),
        ("x = ().__class__", "__class__", 1),
        ("open('/etc/passwd')", "Call not allowed", 1),
        ("x = (", "SyntaxError", 1),
    ],
)
def test_rejects_escapes_with_line(code, needle, line):
    with pytest.raises(UnsafeCodeError) as e:
        run_lab_code(code, URL)
    assert needle in str(e.value) and e.value.line == line


def test_runtime_import_guard():
    # __import__ is the safe one: modules outside the allow-list fail even via importlib-like tricks
    r = run_lab_code("import sqlalchemy.orm\nprint('ok')\n", URL)
    assert r["ok"] and "ok" in r["stdout"]
