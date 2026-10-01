import test from "node:test";
import assert from "node:assert/strict";
import { checkRequirements } from "../src/lib/taskChecker.ts";

test("rejects missing table without mutate side effects", () => {
  const result = checkRequirements(
    { tables: [], relationships: [] },
    { tables: [{ name: "lab_authors", columns: [{ name: "id", pk: true }] }] }
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /lab_authors/);
});

test("rejects missing FK", () => {
  const schema = {
    tables: [
      {
        name: "lab_books",
        columns: [
          { name: "id", isPrimaryKey: true },
          { name: "author_id", isForeignKey: false },
        ],
      },
    ],
    relationships: [],
  };
  const result = checkRequirements(schema, {
    tables: [
      {
        name: "lab_books",
        columns: [{ name: "author_id", fk: { table: "lab_authors", column: "id" } }],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("accepts extras", () => {
  const schema = {
    tables: [
      {
        name: "lab_authors",
        columns: [
          { name: "id", isPrimaryKey: true },
          { name: "name" },
          { name: "extra" },
        ],
      },
      {
        name: "lab_books",
        columns: [
          { name: "id", isPrimaryKey: true },
          { name: "title" },
          {
            name: "author_id",
            isForeignKey: true,
            references: { table: "lab_authors", column: "id" },
          },
        ],
      },
    ],
    relationships: [
      {
        fromTable: "lab_books",
        fromColumn: "author_id",
        toTable: "lab_authors",
        toColumn: "id",
      },
    ],
  };
  const result = checkRequirements(schema, {
    tables: [
      { name: "lab_authors", columns: [{ name: "id", pk: true }, { name: "name" }] },
      {
        name: "lab_books",
        columns: [
          { name: "id", pk: true },
          { name: "title" },
          { name: "author_id", fk: { table: "lab_authors", column: "id" } },
        ],
      },
    ],
  });
  assert.equal(result.ok, true);
});
