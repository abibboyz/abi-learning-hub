from app.task_checker import check_requirements


def _schema(tables, rels=None):
    return {"tables": tables, "relationships": rels or []}


def test_reject_missing_table():
    req = {"tables": [{"name": "lab_authors", "columns": [{"name": "id", "pk": True}]}]}
    result = check_requirements(_schema([]), req)
    assert result["ok"] is False
    assert "lab_authors" in result["message"]


def test_reject_missing_fk():
    schema = _schema(
        [
            {
                "name": "lab_authors",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "name", "isPrimaryKey": False, "isForeignKey": False},
                ],
            },
            {
                "name": "lab_books",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "title", "isPrimaryKey": False, "isForeignKey": False},
                    {"name": "author_id", "isPrimaryKey": False, "isForeignKey": False},
                ],
            },
        ]
    )
    req = {
        "tables": [
            {"name": "lab_authors", "columns": [{"name": "id", "pk": True}, {"name": "name"}]},
            {
                "name": "lab_books",
                "columns": [
                    {"name": "id", "pk": True},
                    {"name": "title"},
                    {"name": "author_id", "fk": {"table": "lab_authors", "column": "id"}},
                ],
            },
        ]
    }
    result = check_requirements(schema, req)
    assert result["ok"] is False
    assert "foreign key" in result["message"].lower()


def test_accept_with_extra_columns():
    schema = _schema(
        [
            {
                "name": "lab_authors",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "name", "isPrimaryKey": False, "isForeignKey": False},
                    {"name": "email", "isPrimaryKey": False, "isForeignKey": False},  # extra
                ],
            },
            {
                "name": "lab_books",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "title", "isPrimaryKey": False, "isForeignKey": False},
                    {
                        "name": "author_id",
                        "isPrimaryKey": False,
                        "isForeignKey": True,
                        "references": {"table": "lab_authors", "column": "id"},
                    },
                    {"name": "isbn", "isPrimaryKey": False, "isForeignKey": False},  # extra
                ],
            },
        ],
        [
            {
                "fromTable": "lab_books",
                "fromColumn": "author_id",
                "toTable": "lab_authors",
                "toColumn": "id",
                "onDelete": "NO ACTION",
            }
        ],
    )
    req = {
        "tables": [
            {"name": "lab_authors", "columns": [{"name": "id", "pk": True}, {"name": "name"}]},
            {
                "name": "lab_books",
                "columns": [
                    {"name": "id", "pk": True},
                    {"name": "title"},
                    {"name": "author_id", "fk": {"table": "lab_authors", "column": "id"}},
                ],
            },
        ]
    }
    result = check_requirements(schema, req)
    assert result["ok"] is True
    assert any("fk:lab_books.author_id" in m for m in result["matched"])


def test_cascade_requirement():
    schema = _schema(
        [
            {
                "name": "lab_categories",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "name", "isPrimaryKey": False, "isForeignKey": False},
                ],
            },
            {
                "name": "lab_items",
                "columns": [
                    {"name": "id", "isPrimaryKey": True, "isForeignKey": False},
                    {"name": "label", "isPrimaryKey": False, "isForeignKey": False},
                    {
                        "name": "category_id",
                        "isPrimaryKey": False,
                        "isForeignKey": True,
                        "references": {"table": "lab_categories", "column": "id"},
                    },
                ],
            },
        ],
        [
            {
                "fromTable": "lab_items",
                "fromColumn": "category_id",
                "toTable": "lab_categories",
                "toColumn": "id",
                "onDelete": "CASCADE",
            }
        ],
    )
    req = {
        "tables": [
            {"name": "lab_categories", "columns": [{"name": "id", "pk": True}, {"name": "name"}]},
            {
                "name": "lab_items",
                "columns": [
                    {"name": "id", "pk": True},
                    {"name": "label"},
                    {
                        "name": "category_id",
                        "fk": {"table": "lab_categories", "column": "id", "onDelete": "CASCADE"},
                    },
                ],
            },
        ]
    }
    assert check_requirements(schema, req)["ok"] is True
