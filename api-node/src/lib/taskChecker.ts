/**
 * Schema gate — TypeScript twin of api-python/app/task_checker.py.
 * Same rule ids, same messages; tests/fixtures/schema-gate-cases.json (repo root) is run by both suites.
 */

export type SchemaColumn = {
  name: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  references?: { table: string; column: string };
};

export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
  primaryKey?: string[];
  uniqueConstraints?: string[][];
  indexes?: string[][];
};
export type SchemaRel = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete?: string;
  onUpdate?: string;
};
export type Schema = { tables: SchemaTable[]; relationships: SchemaRel[] };

export type ColumnReq = {
  name: string;
  pk?: boolean;
  unique?: boolean;
  nullable?: boolean;
  indexed?: boolean;
  type?: string;
  fk?: { table: string; column: string; onDelete?: string };
};
export type Probe = { sql: string[]; expect?: "ok" | "error"; minRows?: number; message: string };
export type Requirements = {
  tables?: Array<{ name: string; columns?: ColumnReq[]; uniqueTogether?: string[][] }>;
  data?: Array<{ sql: string; min?: number; max?: number; message: string }>;
  probes?: Probe[];
  resetTables?: string[];
  datasource?: boolean;
  zod?: ZodRequirement;
};
export type ZodRequirement = {
  name: string;
  cases: Array<{ input: unknown; expect: "valid" | "invalid"; message: string }>;
};

export type Failure = { rule: string; message: string; table?: string; column?: string; line?: number; question?: string };
export type Validation = { ok: boolean; errors: string[]; failures: Failure[]; matched: string[]; message: string };

export const TYPE_FAMILIES: Record<string, string[]> = {
  integer: ["integer", "bigint", "smallint", "int4", "int8", "int2"],
  text: ["character varying", "text", "character", "varchar", "bpchar"],
  numeric: ["numeric", "decimal"],
  boolean: ["boolean", "bool"],
  timestamp: ["timestamp without time zone", "timestamp with time zone", "timestamp", "timestamptz", "date"],
  float: ["double precision", "real", "float8", "float4"],
};

const TYPE_HINT: Record<string, string> = {
  integer: "Integer / Int",
  text: "String / VARCHAR / TEXT",
  numeric: "Numeric(10, 2) / Decimal — exact money, no float rounding",
  boolean: "Boolean",
  timestamp: "DateTime",
  float: "Float",
};

export function typeFamily(pgType?: string | null): string | null {
  const t = (pgType || "").toLowerCase();
  for (const [fam, names] of Object.entries(TYPE_FAMILIES)) if (names.includes(t)) return fam;
  return null;
}

export function validation(failures: Failure[], matched: string[] = []): Validation {
  const errors = failures.map((f) => f.message);
  return {
    ok: failures.length === 0,
    errors,
    failures,
    matched,
    message: failures.length ? errors.join("; ") : "All requirements satisfied — extras are allowed.",
  };
}

function isIndexed(t: SchemaTable, column: string) {
  const groups = [t.primaryKey || [], ...(t.uniqueConstraints || []), ...(t.indexes || [])];
  return groups.some((g) => g.length > 0 && g[0] === column);
}

export function checkRequirements(schema: Schema, requirements: Requirements): Validation {
  const failures: Failure[] = [];
  const matched: string[] = [];
  const fail = (rule: string, message: string, table?: string, column?: string) =>
    failures.push({ rule, message, ...(table ? { table } : {}), ...(column ? { column } : {}) });
  const tablesByName = new Map(schema.tables.map((t) => [t.name, t]));
  const rels = schema.relationships || [];

  for (const reqTable of requirements.tables || []) {
    const name = reqTable.name;
    const actual = tablesByName.get(name);
    if (!actual) {
      fail(
        "missing-table",
        `Missing required table \`${name}\`. Why: later foreign keys and joins need this relation ` +
          `to exist in Postgres — declare it (exact table name \`${name}\`) and re-run.`,
        name
      );
      continue;
    }
    matched.push(`table:${name}`);
    const cols = new Map(actual.columns.map((c) => [c.name, c]));

    for (const reqCol of reqTable.columns || []) {
      const cname = reqCol.name;
      const ref = `${name}.${cname}`;
      const col = cols.get(cname);
      if (!col) {
        fail(
          "missing-column",
          `Table \`${name}\` is missing column \`${cname}\`. Why: the gate reads the real columns in ` +
            `Postgres; extras are fine, but \`${cname}\` must exist (check the spelling and which side of ` +
            `the relationship it belongs on).`,
          name,
          cname
        );
        continue;
      }
      matched.push(`column:${ref}`);

      if (reqCol.pk && !col.isPrimaryKey) {
        fail(
          "not-primary-key",
          `Column \`${ref}\` must be the primary key. Why: foreign keys reference primary (or unique) ` +
            `keys — without a PK, child tables cannot attach a valid REFERENCES constraint.`,
          name,
          cname
        );
      }

      if (reqCol.type) {
        const got = typeFamily(col.type);
        if (got !== reqCol.type) {
          fail(
            "wrong-type",
            `Column \`${ref}\` is \`${col.type}\` but should be a ${reqCol.type} type ` +
              `(${TYPE_HINT[reqCol.type] || reqCol.type}). Why: the column type decides what Postgres ` +
              `accepts and how values compare, sum and sort.`,
            name,
            cname
          );
        }
      }

      if (reqCol.nullable !== undefined) {
        if (reqCol.nullable && !col.nullable) {
          fail(
            "must-be-nullable",
            `Column \`${ref}\` must allow NULL. Why: some rows legitimately have no value here ` +
              `(e.g. the top of a hierarchy has no parent) — NOT NULL makes those rows impossible ` +
              `to insert. Use \`Mapped[int | None]\` / \`Int?\`.`,
            name,
            cname
          );
        }
        if (!reqCol.nullable && col.nullable) {
          fail(
            "must-be-not-null",
            `Column \`${ref}\` must be NOT NULL. Why: every row needs this value — a nullable column ` +
              `lets orphan/incomplete rows in. Use \`Mapped[int]\` (not Optional) / a non-\`?\` field.`,
            name,
            cname
          );
        }
      }

      if (reqCol.unique === true && !col.isUnique) {
        fail(
          "not-unique",
          `Column \`${ref}\` must be UNIQUE. Why: without a unique constraint Postgres accepts duplicates` +
            ` — for a foreign key that silently turns 1:1 into 1:N. Add \`unique=True\` / \`@unique\`.`,
          name,
          cname
        );
      }
      if (reqCol.unique === false && col.isUnique && !col.isPrimaryKey) {
        fail(
          "must-not-be-unique",
          `Column \`${ref}\` must NOT be unique. Why: a UNIQUE foreign key allows only one child per ` +
            `parent, which makes this relationship 1:1 instead of the one-to-many the task asks for.`,
          name,
          cname
        );
      }

      if (reqCol.indexed && !isIndexed(actual, cname)) {
        fail(
          "missing-index",
          `Column \`${ref}\` needs an index (it may be the first column of a composite one). Why: ` +
            `Postgres does not index foreign keys automatically — joins and ON DELETE checks on this ` +
            `column scan the whole table. Use \`index=True\` / \`@@index([...])\` / CREATE INDEX.`,
          name,
          cname
        );
      }

      const fk = reqCol.fk;
      if (fk) {
        const target = `${fk.table}.${fk.column}`;
        if (!col.isForeignKey) {
          fail(
            "not-foreign-key",
            `Column \`${ref}\` must be a foreign key to \`${target}\`. Why: relationships are enforced by ` +
              `FK constraints — an ORM \`relationship\`/\`@relation\` or a plain integer column without a ` +
              `real FK lets rows point at parents that do not exist.`,
            name,
            cname
          );
        } else {
          const got = col.references || ({} as { table?: string; column?: string });
          if (got.table !== fk.table || got.column !== fk.column) {
            fail(
              "wrong-fk-target",
              `Column \`${ref}\` must reference \`${target}\`, found ` +
                `\`${got.table}.${got.column}\`. Why: the FK target defines the ` +
                `parent side of the relationship.`,
              name,
              cname
            );
          } else {
            matched.push(`fk:${ref}->${target}`);
          }
          const want = (fk.onDelete || "").toUpperCase();
          if (want) {
            const rel = rels.find((r) => r.fromTable === name && r.fromColumn === cname);
            const found = rel ? (rel.onDelete || "").toUpperCase() : null;
            if (found !== want) {
              fail(
                "wrong-on-delete",
                `FK \`${ref}\` must have ON DELETE ${want} (found ${found || "NONE"}). Why: the ` +
                  `delete policy lives in the database — an ORM-only cascade does nothing for SQL ` +
                  `deletes or other apps, and children would block (or be orphaned by) the delete.`,
                name,
                cname
              );
            } else {
              matched.push(`onDelete:${ref}:${want}`);
            }
          }
        }
      }
    }

    const pk = actual.primaryKey || [];
    const uniques = actual.uniqueConstraints || [];
    const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
    for (const group of reqTable.uniqueTogether || []) {
      if (!(same(pk, group) || uniques.some((u) => same(u, group)))) {
        fail(
          "missing-composite-key",
          `Table \`${name}\` needs a composite PRIMARY KEY or UNIQUE over (${group.join(", ")}). Why: ` +
            `without it the same pair can be inserted twice — a learner enrolled in a class twice. Use ` +
            `\`primary_key=True\` on both columns / \`@@id([...])\`.`,
          name
        );
      } else {
        matched.push(`key:${name}(${group.join(",")})`);
      }
    }
  }
  return validation(failures, matched);
}

/** Trusted, author-written count queries (never learner SQL). */
export async function checkData(
  reqs: Requirements["data"],
  scalar: (sql: string) => Promise<unknown>
): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (const d of reqs || []) {
    let n: number | null = null;
    let err = "";
    try {
      n = Number((await scalar(d.sql)) ?? 0);
    } catch (e) {
      err = String(e instanceof Error ? e.message : e).split("\n")[0];
    }
    if (n === null) failures.push({ rule: "missing-data", message: `${d.message} (the check query failed: ${err})` });
    else if (d.min != null && n < d.min)
      failures.push({ rule: "missing-data", message: `${d.message} Found ${n} row(s), expected at least ${d.min}.` });
    else if (d.max != null && n > d.max)
      failures.push({ rule: "too-much-data", message: `${d.message} Found ${n} row(s), expected at most ${d.max}.` });
  }
  return failures;
}

/** Behaviour probes: trusted statements run in a transaction that is always rolled back. */
export async function checkProbes(probes: Probe[] | undefined, run: (sql: string[]) => Promise<number>): Promise<Failure[]> {
  const failures: Failure[] = [];
  for (const p of probes || []) {
    let rows: number | null = null;
    let err: string | null = null;
    try {
      rows = await run(p.sql);
    } catch (e) {
      err = String(e instanceof Error ? e.message : e).trim().split("\n")[0].slice(0, 300);
    }
    if ((p.expect || "ok") === "error") {
      if (err === null) failures.push({ rule: "constraint-not-enforced", message: `${p.message} The database accepted it.` });
    } else if (err !== null) {
      failures.push({ rule: "probe-failed", message: `${p.message} Postgres said: ${err}` });
    } else if (p.minRows != null && (rows || 0) < p.minRows) {
      failures.push({ rule: "probe-failed", message: `${p.message} Got ${rows} row(s), expected at least ${p.minRows}.` });
    }
  }
  return failures;
}

export function merge(v: Validation, extra: Failure[]): Validation {
  if (!extra.length) return v;
  return { ...validation([...v.failures, ...extra], v.matched) };
}

export type QuizQuestion = { id: string; prompt: string; options: Array<{ id: string; text: string; correct?: boolean; why?: string }> };

export function gradeQuiz(questions: QuizQuestion[], code: string): Validation {
  let answers: Record<string, string>;
  try {
    const parsed = JSON.parse(code);
    answers = parsed?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error();
  } catch {
    return validation([{ rule: "rejected", message: 'Quiz answers must be JSON like {"answers": {"q1": "b"}}.' }]);
  }
  const failures: Failure[] = [];
  const matched: string[] = [];
  for (const q of questions) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (!opt) failures.push({ rule: "unanswered", message: `Question “${q.prompt}” has no answer yet.`, question: q.id });
    else if (!opt.correct) failures.push({ rule: "wrong-answer", message: `“${q.prompt}” — ${opt.why}`, question: q.id });
    else matched.push(`question:${q.id}`);
  }
  const v = validation(failures, matched);
  return failures.length ? v : { ...v, message: "All answers correct." };
}

export function checkDatasource(ds: { provider: string | null; url: { env?: string; literal?: string } | null; line: number } | null): Failure[] {
  if (!ds) {
    return [
      {
        rule: "missing-datasource",
        message:
          "No `datasource db { … }` block. Why: Prisma reads the provider and connection URL from it — without one, " +
          "`prisma generate`/`migrate` stop before any model is used.",
      },
    ];
  }
  const out: Failure[] = [];
  if (ds.provider !== "postgresql") {
    out.push({
      rule: "wrong-provider",
      message: `provider is \`${ds.provider ?? "missing"}\` — this hub runs PostgreSQL, so use provider = "postgresql". ` +
        "Why: the provider decides the SQL dialect and native types Prisma generates.",
      line: ds.line,
    });
  }
  if (!ds.url || ds.url.literal !== undefined) {
    out.push({
      rule: "hardcoded-url",
      message: ds.url?.literal !== undefined
        ? 'url is a hard-coded string. Why: it puts the database password in git and in every copy of the schema — use url = env("DATABASE_URL").'
        : 'url is missing — use url = env("DATABASE_URL").',
      line: ds.line,
    });
  } else if (ds.url.env !== "DATABASE_URL") {
    out.push({
      rule: "wrong-env-var",
      message: `url reads env("${ds.url.env}") but the lab provides DATABASE_URL. Why: a misnamed variable is undefined at runtime and Prisma refuses to connect.`,
      line: ds.line,
    });
  }
  return out;
}
