"""≥3 task checkers: reject without mutate evidence; accept with extra columns."""
from __future__ import annotations

from app.tasks.checkers import check_task


def _table(name, columns, fks=None):
    cols = []
    for c in columns:
        col = {
            "name": c["name"],
            "type": c.get("type", "integer"),
            "nullable": c.get("nullable", True),
            "isPrimaryKey": c.get("pk", False),
            "isForeignKey": c.get("fk", False),
        }
        if c.get("ref"):
            col["references"] = {"table": c["ref"], "column": c.get("ref_col", "id")}
            col["isForeignKey"] = True
        cols.append(col)
    return {"name": name, "columns": cols}


def _schema(tables, relationships=None):
    rels = relationships or []
    # auto relationships from column refs
    for t in tables:
        for c in t["columns"]:
            if c.get("isForeignKey") and c.get("references"):
                rels.append(
                    {
                        "fromTable": t["name"],
                        "fromColumn": c["name"],
                        "toTable": c["references"]["table"],
                        "toColumn": c["references"]["column"],
                        "onDelete": c.get("onDelete", "NO ACTION"),
                        "type": "many-to-one",
                    }
                )
    return {"tables": tables, "relationships": rels}


def test_create_connect_rejects_empty():
    result = check_task("rel-01-create-connect", {"tables": [], "relationships": []})
    assert result["passed"] is False
    assert "lab_widgets" in result["reason"]


def test_create_connect_accepts_with_extra_columns():
    schema = _schema(
        [
            _table(
                "lab_widgets",
                [
                    {"name": "id", "pk": True},
                    {"name": "name", "type": "varchar"},
                    {"name": "color", "type": "varchar"},  # extra — allowed
                    {"name": "notes", "type": "text"},  # extra — allowed
                ],
            )
        ]
    )
    result = check_task("rel-01-create-connect", schema)
    assert result["passed"] is True


def test_one_to_many_rejects_without_fk():
    schema = _schema(
        [
            _table("lab_publishers", [{"name": "id", "pk": True}, {"name": "name"}]),
            _table("lab_magazines", [{"name": "id", "pk": True}, {"name": "title"}]),
        ]
    )
    result = check_task("rel-03-one-to-many", schema)
    assert result["passed"] is False
    assert "foreign key" in result["reason"].lower() or "FK" in result["reason"] or "publisher" in result["reason"].lower()


def test_one_to_many_accepts_with_extra():
    schema = _schema(
        [
            _table("lab_publishers", [{"name": "id", "pk": True}, {"name": "name"}, {"name": "founded"}]),
            _table(
                "lab_magazines",
                [
                    {"name": "id", "pk": True},
                    {"name": "title"},
                    {"name": "publisher_id", "fk": True, "ref": "lab_publishers"},
                    {"name": "issue_number"},  # extra
                ],
            ),
        ]
    )
    result = check_task("rel-03-one-to-many", schema)
    assert result["passed"] is True


def test_many_to_many_rejects_missing_association():
    schema = _schema(
        [
            _table("lab_posts", [{"name": "id", "pk": True}]),
            _table("lab_tags", [{"name": "id", "pk": True}]),
        ]
    )
    result = check_task("rel-06-many-to-many", schema)
    assert result["passed"] is False
    assert "lab_post_tags" in result["reason"]


def test_cascades_requires_on_delete_cascade():
    tables = [
        _table("lab_orders", [{"name": "id", "pk": True}]),
        _table(
            "lab_order_items",
            [
                {"name": "id", "pk": True},
                {"name": "order_id", "fk": True, "ref": "lab_orders", "onDelete": "NO ACTION"},
            ],
        ),
    ]
    # manually set relationship without cascade
    schema = {
        "tables": tables,
        "relationships": [
            {
                "fromTable": "lab_order_items",
                "fromColumn": "order_id",
                "toTable": "lab_orders",
                "toColumn": "id",
                "onDelete": "NO ACTION",
            }
        ],
    }
    result = check_task("rel-08-cascades-loading", schema)
    assert result["passed"] is False
    assert "CASCADE" in result["reason"]

    schema["relationships"][0]["onDelete"] = "CASCADE"
    assert check_task("rel-08-cascades-loading", schema)["passed"] is True
