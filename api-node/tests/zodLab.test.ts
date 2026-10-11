import test from "node:test";
import assert from "node:assert/strict";
import { checkZodExercise } from "../src/lib/zodLab.ts";

const req = {
  name: "MagazineIn",
  cases: [
    { input: { title: "Monthly", publisherId: 1 }, expect: "valid" as const, message: "good" },
    { input: { title: " ", publisherId: 1 }, expect: "invalid" as const, message: "blank" },
    { input: { title: "X", publisherId: 1.5 }, expect: "invalid" as const, message: "int" },
  ],
};
const rules = (src: string, js = false) => checkZodExercise(src, req, js).failures.map((f) => f.rule);

test("a correct TS schema passes; a loose one names each accepted bad input", () => {
  assert.deepEqual(rules(`import { z } from "zod";\nexport const MagazineIn = z.object({ title: z.string().trim().min(1), publisherId: z.number().int().positive() });`), []);
  assert.deepEqual(rules(`import { z } from "zod";\nexport const MagazineIn = z.object({ title: z.string(), publisherId: z.number() });`), ["accepts-invalid", "accepts-invalid"]);
});

test("CommonJS + references between schemas work", () => {
  assert.deepEqual(rules(`const { z } = require("zod");\nconst Id = z.number().int().positive();\nconst MagazineIn = z.object({ title: z.string().trim().min(1), publisherId: Id });\nmodule.exports = { MagazineIn };`, true), []);
});

test("never executes learner code", () => {
  for (const src of [
    `import { z } from "zod";\nconst MagazineIn = z.object({ t: z.string().refine((s) => s.length > 0) });`,
    `import { z } from "zod";\nconst MagazineIn = z.object({ t: z.string().constructor });`,
    `import { z } from "zod";\nconst MagazineIn = ({}).constructor;`,
    `import { z } from "zod";\nconst MagazineIn = z.object({ "__proto__": z.string() });`,
    `import fs from "fs";`,
    `import { z } from "zod";\nprocess.exit(1);`,
  ]) {
    assert.deepEqual(rules(src), ["rejected"], src);
  }
});

test("missing schema name and syntax errors are specific", () => {
  assert.deepEqual(rules(`import { z } from "zod";\nconst Other = z.string();`), ["missing-name"]);
  const r = checkZodExercise("const a = (", req, false);
  assert.equal(r.failures[0].rule, "rejected");
  assert.match(r.failures[0].message, /SyntaxError.*line 1/);
});
