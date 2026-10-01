import pytest

from app.runners.constrained import UnsafeCodeError, run_sqlalchemy_code


def test_rejects_forbidden_import():
    with pytest.raises(UnsafeCodeError, match="Import not allowed"):
        run_sqlalchemy_code("import os\nprint(os.getcwd())", execute=False)


def test_rejects_eval():
    with pytest.raises(UnsafeCodeError):
        run_sqlalchemy_code("eval('1+1')", execute=False)


def test_allows_sqlalchemy_validate_only():
    code = '''
class Widget(Base):
    __tablename__ = "lab_widgets"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
'''
    result = run_sqlalchemy_code(code, execute=False)
    assert result["ok"] is True
    assert result["executed"] is False
