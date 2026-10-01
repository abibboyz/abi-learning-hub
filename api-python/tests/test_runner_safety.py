import pytest

from app.runner import UnsafeCodeError, run_lab_code, _validate_ast


def test_blocks_os_import():
    with pytest.raises(UnsafeCodeError, match="Import not allowed"):
        _validate_ast("import os\nos.system('ls')")


def test_blocks_eval():
    with pytest.raises(UnsafeCodeError):
        _validate_ast("eval('1+1')")


def test_allows_sqlalchemy_style():
    code = '''
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer

class Base(DeclarativeBase):
    pass

class LabAuthor(Base):
    __tablename__ = "lab_authors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
'''
    _validate_ast(code)  # should not raise
