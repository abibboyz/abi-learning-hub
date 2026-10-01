/**
 * Drizzle ORM — comparison examples (not the primary runnable lab ORM).
 * Primary runnable ORM for Node labs: Prisma (+ raw pg SQL).
 *
 * Illustrative Drizzle-style declarations (do not execute without drizzle-orm installed):
 *
 * import { pgTable, serial, varchar, integer } from 'drizzle-orm/pg-core';
 * import { relations } from 'drizzle-orm';
 *
 * export const authors = pgTable('lab_authors', {
 *   id: serial('id').primaryKey(),
 *   name: varchar('name', { length: 120 }).notNull(),
 * });
 *
 * export const books = pgTable('lab_books', {
 *   id: serial('id').primaryKey(),
 *   title: varchar('title', { length: 200 }).notNull(),
 *   authorId: integer('author_id').references(() => authors.id),
 * });
 *
 * export const authorsRelations = relations(authors, ({ many }) => ({
 *   books: many(books),
 * }));
 *
 * Mapping vs Prisma:
 * - Prisma: schema.prisma model Author { books Book[] }
 * - Drizzle: TypeScript schema + relations() helper; SQL-like column builders
 * - Both emit similar CREATE TABLE / FK SQL under the hood
 */

export const DRIZZLE_VS_PRISMA = {
  primaryLabOrm: "prisma",
  comparisonOrm: "drizzle",
  notes: [
    "Prisma uses a dedicated schema DSL; Drizzle uses TypeScript table builders.",
    "Drizzle tends to feel closer to SQL; Prisma generates a rich client API.",
    "This hub runs Prisma + raw pg for tasks; Drizzle is documented for comparison.",
  ],
};
