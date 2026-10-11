/**
 * Prisma schema → PostgreSQL DDL for the lab (no Prisma engine, no shell).
 *
 * Follows Prisma's own mapping rules so what passes here would behave the same with `prisma migrate`:
 *  - table = model name unless @@map, column = field name unless @map (no silent snake_casing),
 *  - String → text (or @db.VarChar(n) / @db.Text …), DateTime → timestamp(3), Decimal → decimal(65,30)
 *    unless @db.Decimal(p,s), Int @default(autoincrement()) → serial,
 *  - @id/@@id, @unique/@@unique, @@index, @relation(fields, references, onDelete, onUpdate).
 * Anything it does not understand is an explicit error with a line number (never silently skipped).
 * Every identifier is validated, so the generated SQL can only create lab_ tables.
 */

export type DatasourceInfo = { provider: string | null; url: { env?: string; literal?: string } | null; line: number };
export type RunResult = {
  ok: boolean;
  sql: string[];
  tables: string[];
  datasource: DatasourceInfo | null;
  error?: string;
  line?: number;
};

type Field = { name: string; type: string; optional: boolean; list: boolean; attrs: string[]; line: number };
type Model = { name: string; table: string; fields: Field[]; blockAttrs: { text: string; line: number }[]; line: number };

class SchemaError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
  }
}

const SCALARS = new Set(["String", "Int", "BigInt", "Boolean", "DateTime", "Decimal", "Float", "Json", "Bytes"]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const REFERENTIAL: Record<string, string> = {
  Cascade: "CASCADE",
  SetNull: "SET NULL",
  Restrict: "RESTRICT",
  NoAction: "NO ACTION",
  SetDefault: "SET DEFAULT",
};
const FIELD_ATTRS = new Set(["@id", "@default", "@unique", "@map", "@relation", "@updatedAt", "@ignore"]);

/** Replace comments with spaces so line numbers stay correct. */
function stripComments(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Split `@a @b(x, y(z)) @db.VarChar(20)` keeping parentheses and strings intact. */
function splitAttrs(raw: string, line: number): string[] {
  const out: string[] = [];
  let i = 0;
  const s = raw.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] !== "@") throw new SchemaError(`Unexpected \`${s.slice(i).split(/\s/)[0]}\` — attributes start with @.`, line);
    const start = i++;
    while (i < s.length && /[A-Za-z0-9_.@]/.test(s[i])) i++;
    if (s[i] === "(") {
      let depth = 0;
      let inStr = false;
      do {
        const ch = s[i];
        if (ch === '"' && s[i - 1] !== "\\") inStr = !inStr;
        else if (!inStr && ch === "(") depth++;
        else if (!inStr && ch === ")") depth--;
        i++;
      } while (i < s.length && depth > 0);
      if (depth !== 0) throw new SchemaError("Unbalanced parentheses in attribute.", line);
    }
    out.push(s.slice(start, i));
  }
  return out;
}

function argOf(attr: string): string {
  const i = attr.indexOf("(");
  return i < 0 ? "" : attr.slice(i + 1, attr.lastIndexOf(")")).trim();
}

function listArg(s: string, key: string | null, line: number): string[] | null {
  const re = key ? new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`) : /^\s*\[([^\]]*)\]/;
  const m = s.match(re);
  if (!m) return null;
  const items = m[1].split(",").map((x) => x.trim().replace(/\(.*\)$/, "")).filter(Boolean);
  for (const it of items) if (!IDENT.test(it)) throw new SchemaError(`Invalid field name \`${it}\`.`, line);
  return items;
}

function parse(src: string): { models: Model[]; datasource: DatasourceInfo | null } {
  const lines = stripComments(src).split("\n");
  const models: Model[] = [];
  let datasource: DatasourceInfo | null = null;
  let i = 0;
  while (i < lines.length) {
    const ln = i + 1;
    const t = lines[i].trim();
    i++;
    if (!t) continue;
    const head = t.match(/^(model|datasource|generator|enum|type|view)\s+(\w+)\s*\{\s*$/);
    if (!head) {
      throw new SchemaError(
        `Unexpected \`${t.slice(0, 40)}\` outside a block. Expected \`model Name {\` (or datasource/generator).`,
        ln
      );
    }
    const [, kind, name] = head;
    const body: { text: string; line: number }[] = [];
    let closed = false;
    while (i < lines.length) {
      const bt = lines[i].trim();
      i++;
      if (bt === "}") {
        closed = true;
        break;
      }
      if (/^(model|datasource|generator|enum)\s+\w+\s*\{/.test(bt)) break;
      if (bt) body.push({ text: bt, line: i });
    }
    if (!closed) throw new SchemaError(`Block \`${kind} ${name}\` is missing its closing }.`, ln);
    if (kind === "enum" || kind === "type" || kind === "view") {
      throw new SchemaError(
        `\`${kind}\` blocks are not supported by the lab translator — use a String field (and validate values with Zod).`,
        ln
      );
    }
    if (kind === "generator") continue;
    if (kind === "datasource") {
      const get = (k: string) => body.find((b) => new RegExp(`^${k}\\s*=`).test(b.text))?.text.split("=").slice(1).join("=").trim();
      const prov = get("provider");
      const url = get("url");
      const envM = url?.match(/^env\(\s*"([^"]+)"\s*\)$/);
      const litM = url?.match(/^"([^"]*)"$/);
      datasource = {
        provider: prov ? prov.replace(/^"|"$/g, "") : null,
        url: envM ? { env: envM[1] } : litM ? { literal: litM[1] } : null,
        line: ln,
      };
      continue;
    }
    const model: Model = { name, table: name, fields: [], blockAttrs: [], line: ln };
    for (const b of body) {
      if (b.text.startsWith("@@")) {
        model.blockAttrs.push(b);
        continue;
      }
      const fm = b.text.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!fm) throw new SchemaError(`Cannot read field \`${b.text}\` — expected \`name Type @attributes\`.`, b.line);
      model.fields.push({
        name: fm[1],
        type: fm[2],
        list: Boolean(fm[3]),
        optional: Boolean(fm[4]),
        attrs: splitAttrs(fm[5] || "", b.line),
        line: b.line,
      });
    }
    for (const a of model.blockAttrs) {
      if (a.text.startsWith("@@map")) {
        const m = a.text.match(/^@@map\(\s*(?:name\s*:\s*)?"([^"]+)"\s*\)$/);
        if (!m) throw new SchemaError('Use @@map("lab_table_name").', a.line);
        model.table = m[1];
      }
    }
    models.push(model);
  }
  return { models, datasource };
}

function column(f: Field) {
  const m = f.attrs.find((a) => a.startsWith("@map"));
  if (!m) return f.name;
  const v = argOf(m).match(/^(?:name\s*:\s*)?"([^"]+)"$/);
  if (!v) throw new SchemaError('Use @map("column_name").', f.line);
  return v[1];
}

function q(id: string, line?: number) {
  if (!IDENT.test(id)) throw new SchemaError(`Invalid identifier \`${id}\` (letters, digits, _; max 63).`, line);
  return `"${id}"`;
}

function cname(s: string) {
  return s.slice(0, 63);
}

function sqlType(f: Field): string {
  const db = f.attrs.find((a) => a.startsWith("@db."));
  const auto = f.attrs.some((a) => /^@default\(\s*autoincrement\(\)\s*\)$/.test(a));
  if (db) {
    const m = db.match(/^@db\.(\w+)(?:\(([^)]*)\))?$/);
    const name = m?.[1];
    const args = (m?.[2] || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (args.some((a) => !/^\d{1,4}$/.test(a))) throw new SchemaError(`Invalid arguments in ${db}.`, f.line);
    const allowed: Record<string, string[]> = {
      VarChar: ["String"], Char: ["String"], Text: ["String"], Uuid: ["String"],
      Decimal: ["Decimal"], Money: ["Decimal"], Real: ["Float"], DoublePrecision: ["Float"],
      SmallInt: ["Int"], Integer: ["Int"], BigInt: ["BigInt"],
      Date: ["DateTime"], Timestamp: ["DateTime"], Timestamptz: ["DateTime"], Time: ["DateTime"],
      Boolean: ["Boolean"], JsonB: ["Json"], Json: ["Json"],
    };
    if (!name || !allowed[name]) throw new SchemaError(`Unsupported native type ${db}.`, f.line);
    if (!allowed[name].includes(f.type)) {
      throw new SchemaError(`${db} cannot be used on a ${f.type} field (only ${allowed[name].join("/")}).`, f.line);
    }
    const a = args.length ? `(${args.join(",")})` : "";
    const map: Record<string, string> = {
      VarChar: `VARCHAR${a}`, Char: `CHAR${a}`, Text: "TEXT", Uuid: "UUID", Decimal: `DECIMAL${a}`, Money: "MONEY",
      Real: "REAL", DoublePrecision: "DOUBLE PRECISION", SmallInt: "SMALLINT", Integer: auto ? "SERIAL" : "INTEGER",
      BigInt: auto ? "BIGSERIAL" : "BIGINT", Date: "DATE", Timestamp: `TIMESTAMP${a}`, Timestamptz: `TIMESTAMPTZ${a}`,
      Time: `TIME${a}`, Boolean: "BOOLEAN", JsonB: "JSONB", Json: "JSON",
    };
    return map[name];
  }
  switch (f.type) {
    case "String": return "TEXT";
    case "Int": return auto ? "SERIAL" : "INTEGER";
    case "BigInt": return auto ? "BIGSERIAL" : "BIGINT";
    case "Boolean": return "BOOLEAN";
    case "DateTime": return "TIMESTAMP(3)";
    case "Decimal": return "DECIMAL(65,30)";
    case "Float": return "DOUBLE PRECISION";
    case "Json": return "JSONB";
    case "Bytes": return "BYTEA";
  }
  throw new SchemaError(`Unknown type ${f.type}.`, f.line);
}

function defaultClause(f: Field): string {
  const d = f.attrs.find((a) => a.startsWith("@default"));
  if (!d) return "";
  const v = argOf(d);
  if (v === "autoincrement()" || v === "uuid()" || v === "cuid()" || /^(uuid|cuid|nanoid|ulid)\(.*\)$/.test(v)) return "";
  if (v === "now()") return " DEFAULT CURRENT_TIMESTAMP";
  if (v === "true" || v === "false") return ` DEFAULT ${v.toUpperCase()}`;
  if (/^-?\d+(\.\d+)?$/.test(v)) return ` DEFAULT ${v}`;
  const s = v.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (s) return ` DEFAULT '${s[1].replace(/'/g, "''")}'`;
  if (v.startsWith("dbgenerated")) throw new SchemaError("dbgenerated() is not allowed in the lab.", f.line);
  throw new SchemaError(`Unsupported default @default(${v}).`, f.line);
}

export function prismaModelsToSql(source: string): RunResult {
  const empty = { sql: [] as string[], tables: [] as string[], datasource: null };
  try {
    const { models, datasource } = parse(source);
    const byName = new Map(models.map((m) => [m.name, m]));
    const sql: string[] = [];
    const after: string[] = [];

    for (const model of models) {
      if (!model.table.startsWith("lab_")) {
        throw new SchemaError(
          `Model ${model.name} maps to table \`${model.table}\` — lab tables must start with lab_. ` +
            `Add @@map("lab_…") (Prisma uses the model name as the table name otherwise).`,
          model.line
        );
      }
      const table = q(model.table, model.line);
      const cols: string[] = [];
      const pk: string[] = [];
      for (const f of model.fields) {
        for (const a of f.attrs) {
          const base = a.startsWith("@db.") ? "@db" : a.replace(/\(.*$/s, "");
          if (base !== "@db" && !FIELD_ATTRS.has(base)) {
            throw new SchemaError(`Unknown attribute ${base} on ${model.name}.${f.name}.`, f.line);
          }
        }
        if (!SCALARS.has(f.type)) {
          const target = byName.get(f.type);
          if (!target) {
            throw new SchemaError(
              `Unknown type \`${f.type}\` on ${model.name}.${f.name} — it is not a Prisma scalar and no model ` +
                `named ${f.type} exists in this schema (check the spelling).`,
              f.line
            );
          }
          const rel = f.attrs.find((a) => a.startsWith("@relation"));
          const args = rel ? argOf(rel) : "";
          const fields = listArg(args, "fields", f.line);
          const refs = listArg(args, "references", f.line);
          if (!fields && !refs) continue; // back-relation / list side: no column on this table
          if (f.list) throw new SchemaError(`A list field (${f.name} ${f.type}[]) cannot hold fields/references.`, f.line);
          if (!fields || !refs || fields.length !== refs.length) {
            throw new SchemaError(`@relation on ${model.name}.${f.name} needs fields: [...] and references: [...] of equal length.`, f.line);
          }
          const local = fields.map((n) => {
            const lf = model.fields.find((x) => x.name === n);
            if (!lf) throw new SchemaError(`@relation fields: [${n}] — ${model.name} has no field ${n}.`, f.line);
            if (!SCALARS.has(lf.type)) throw new SchemaError(`${n} must be a scalar field to hold the foreign key.`, f.line);
            if (lf.optional !== f.optional) {
              throw new SchemaError(
                `${model.name}.${f.name} and its foreign-key field ${n} must both be optional (?) or both required — ` +
                  `Prisma rejects the mix.`,
                f.line
              );
            }
            return column(lf);
          });
          const remote = refs.map((n) => {
            const tf = target.fields.find((x) => x.name === n);
            if (!tf) throw new SchemaError(`@relation references: [${n}] — ${target.name} has no field ${n}.`, f.line);
            return column(tf);
          });
          let actions = "";
          for (const [key, kw] of [["onDelete", "DELETE"], ["onUpdate", "UPDATE"]] as const) {
            const m = args.match(new RegExp(`${key}\\s*:\\s*(\\w+)`));
            if (m) {
              if (!REFERENTIAL[m[1]]) {
                throw new SchemaError(`${key}: ${m[1]} is not a referential action (Cascade, SetNull, Restrict, NoAction, SetDefault).`, f.line);
              }
              actions += ` ON ${kw} ${REFERENTIAL[m[1]]}`;
            }
          }
          after.push(
            `ALTER TABLE ${table} ADD CONSTRAINT ${q(cname(`${model.table}_${local.join("_")}_fkey`))} FOREIGN KEY (${local
              .map((c) => q(c))
              .join(", ")}) REFERENCES ${q(target.table)} (${remote.map((c) => q(c)).join(", ")})${actions}`
          );
          continue;
        }
        if (f.list) throw new SchemaError(`Scalar lists (${f.type}[]) are not supported in the lab.`, f.line);
        const c = column(f);
        let def = `${q(c, f.line)} ${sqlType(f)}`;
        if (!f.optional) def += " NOT NULL";
        def += defaultClause(f);
        cols.push(def);
        if (f.attrs.includes("@id") || f.attrs.some((a) => a.startsWith("@id("))) pk.push(c);
        if (f.attrs.some((a) => a === "@unique" || a.startsWith("@unique("))) {
          after.push(`CREATE UNIQUE INDEX ${q(cname(`${model.table}_${c}_key`))} ON ${table} (${q(c)})`);
        }
      }
      const resolve = (names: string[], line: number) =>
        names.map((n) => {
          const f = model.fields.find((x) => x.name === n);
          if (!f) throw new SchemaError(`${model.name} has no field ${n}.`, line);
          return column(f);
        });
      for (const a of model.blockAttrs) {
        const kind = a.text.match(/^@@(\w+)/)?.[1];
        if (kind === "map") continue;
        const list = listArg(argOf(a.text), null, a.line) || listArg(argOf(a.text), "fields", a.line);
        if (kind === "id") {
          if (!list) throw new SchemaError("Use @@id([fieldA, fieldB]).", a.line);
          if (pk.length) throw new SchemaError(`${model.name} has both @id and @@id — pick one.`, a.line);
          pk.push(...resolve(list, a.line));
        } else if (kind === "unique" || kind === "index") {
          if (!list) throw new SchemaError(`Use @@${kind}([fieldA, fieldB]).`, a.line);
          const cs = resolve(list, a.line);
          const suffix = kind === "unique" ? "key" : "idx";
          after.push(
            `CREATE ${kind === "unique" ? "UNIQUE " : ""}INDEX ${q(cname(`${model.table}_${cs.join("_")}_${suffix}`))} ON ${table} (${cs
              .map((c) => q(c))
              .join(", ")})`
          );
        } else {
          throw new SchemaError(`Unsupported block attribute @@${kind}.`, a.line);
        }
      }
      if (!pk.length) {
        throw new SchemaError(`Model ${model.name} has no @id or @@id — Prisma requires a unique identifier.`, model.line);
      }
      cols.push(`CONSTRAINT ${q(cname(`${model.table}_pkey`))} PRIMARY KEY (${pk.map((c) => q(c)).join(", ")})`);
      sql.push(`CREATE TABLE ${table} (\n  ${cols.join(",\n  ")}\n);`);
    }
    return {
      ok: true,
      sql: [...sql, ...after.map((s) => s + ";")],
      tables: models.map((m) => m.table),
      datasource,
    };
  } catch (e) {
    if (e instanceof SchemaError) {
      return { ...empty, ok: false, error: e.message + (e.line ? ` (line ${e.line})` : ""), line: e.line };
    }
    return { ...empty, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
