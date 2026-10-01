/**
 * Learning examples: Zod (primary), plus Valibot & ArkType snippets (documented).
 * Install optionally: npm install valibot arktype
 */
import { z } from "zod";

/** Zod — primary validation lib in Node track */
export const zodBookInsert = z.object({
  title: z.string().min(1).max(200),
  authorId: z.number().int().positive(),
  publishedYear: z.number().int().min(0).max(2100).optional(),
  isbn: z.string().max(32).optional(),
});

export type BookInsert = z.infer<typeof zodBookInsert>;

/** Valibot — alternate (install valibot to run live) */
export const VALIBOT_EXAMPLE = `
import * as v from "valibot";
export const bookInsert = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  authorId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
`;

/** ArkType — alternate (install arktype to run live) */
export const ARKTYPE_EXAMPLE = `
import { type } from "arktype";
export const bookInsert = type({
  title: "string>0",
  authorId: "number>0",
  "publishedYear?": "number",
});
`;

export function demoValidateAll(payload: unknown) {
  return {
    zod: zodBookInsert.safeParse(payload),
    valibot: { note: "See VALIBOT_EXAMPLE — npm install valibot", example: VALIBOT_EXAMPLE.trim() },
    arktype: { note: "See ARKTYPE_EXAMPLE — npm install arktype", example: ARKTYPE_EXAMPLE.trim() },
  };
}
