import test from "node:test";
import assert from "node:assert/strict";
import { prismaModelsToSql } from "../src/runners/prismaSchemaRunner.ts";

const ONE_TO_MANY = `
model LabAuthor {
  id    Int       @id @default(autoincrement())
  name  String    @db.VarChar(120)
  books LabBook[]
  @@map("lab_authors")
}
model LabBook {
  id       Int       @id @default(autoincrement())
  title    String
  authorId Int       @map("author_id")
  author   LabAuthor @relation(fields: [authorId], references: [id], onDelete: Restrict)
  @@index([authorId])
  @@map("lab_books")
}
`;

test("translates 1:N with native types, referential action and @@index", () => {
  const r = prismaModelsToSql(ONE_TO_MANY);
  assert.equal(r.ok, true, r.error);
  const all = r.sql.join("\n");
  assert.match(all, /"name" VARCHAR\(120\) NOT NULL/);
  assert.match(all, /"title" TEXT NOT NULL/); // Prisma maps String to text
  assert.match(all, /FOREIGN KEY \("author_id"\) REFERENCES "lab_authors" \("id"\) ON DELETE RESTRICT/);
  assert.match(all, /CREATE INDEX "lab_books_author_id_idx"/);
  assert.deepEqual(r.tables, ["lab_authors", "lab_books"]);
});

test("column names follow Prisma: field name unless @map (no silent snake_case)", () => {
  const r = prismaModelsToSql(ONE_TO_MANY.replace(' @map("author_id")', ""));
  assert.equal(r.ok, true);
  assert.match(r.sql.join("\n"), /"authorId" INTEGER NOT NULL/);
});

test("@@unique and @@id produce composite keys", () => {
  const r = prismaModelsToSql(`model LabPostTag {
  postId Int @map("post_id")
  tagId  Int @map("tag_id")
  label  String
  @@id([postId, tagId])
  @@unique([label, postId])
  @@map("lab_post_tags")
}`);
  assert.equal(r.ok, true, r.error);
  assert.match(r.sql.join("\n"), /PRIMARY KEY \("post_id", "tag_id"\)/);
  assert.match(r.sql.join("\n"), /CREATE UNIQUE INDEX "lab_post_tags_label_post_id_key"/);
});

const rejects: Array<[string, string, RegExp]> = [
  ["non-lab table", `model X {\n  id Int @id\n  @@map("users")\n}`, /must start with lab_/],
  ["missing @@map", `model LabX {\n  id Int @id\n}`, /must start with lab_/],
  ["misspelled relation target", `model LabA {\n  id Int @id\n  b LabBB @relation(fields: [id], references: [id])\n  @@map("lab_a")\n}`, /Unknown type `LabBB`.*\(line 3\)/],
  ["unknown attribute", `model LabA {\n  id Int @id @primary\n  @@map("lab_a")\n}`, /Unknown attribute @primary/],
  ["bad referential action", `model LabA {\n  id Int @id\n  pid Int\n  p LabA @relation(fields: [pid], references: [id], onDelete: Delete)\n  @@map("lab_a")\n}`, /not a referential action/],
  ["no id", `model LabA {\n  name String\n  @@map("lab_a")\n}`, /no @id or @@id/],
  ["dbgenerated", `model LabA {\n  id Int @id @default(dbgenerated("1; DROP TABLE x"))\n  @@map("lab_a")\n}`, /not allowed/],
  ["identifier injection", `model LabA {\n  id Int @id @map("id\\"; DROP")\n  @@map("lab_a")\n}`, /Use @map|Invalid identifier/],
  ["enum block", `enum Role {\n  A\n}`, /not supported/],
  ["unclosed block", `model LabA {\n  id Int @id`, /closing/],
];
for (const [name, src, re] of rejects) {
  test(`rejects: ${name}`, () => {
    const r = prismaModelsToSql(src);
    assert.equal(r.ok, false);
    assert.match(r.error || "", re);
  });
}

test("reads the datasource block", () => {
  const r = prismaModelsToSql(`datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}`);
  assert.equal(r.ok, true);
  assert.deepEqual(r.datasource?.url, { env: "DATABASE_URL" });
  assert.equal(r.datasource?.provider, "postgresql");
});
