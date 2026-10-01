import test from "node:test";
import assert from "node:assert/strict";
import { prismaModelsToSql } from "../src/runners/prismaSchemaRunner.ts";

test("translates simple 1:N models", () => {
  const src = `
model LabAuthor {
  id    Int      @id @default(autoincrement())
  name  String
  books LabBook[]
  @@map("lab_authors")
}
model LabBook {
  id       Int       @id @default(autoincrement())
  title    String
  authorId Int       @map("author_id")
  author   LabAuthor @relation(fields: [authorId], references: [id])
  @@map("lab_books")
}
`;
  const r = prismaModelsToSql(src);
  assert.equal(r.ok, true);
  assert.ok(r.sql.some((s) => /lab_authors/.test(s)));
  assert.ok(r.sql.some((s) => /lab_books/.test(s)));
  assert.ok(r.sql.some((s) => /FOREIGN KEY/i.test(s)));
});

test("rejects non-lab table maps", () => {
  const r = prismaModelsToSql(`model X { id Int @id @@map("users") }`);
  assert.equal(r.ok, false);
});
