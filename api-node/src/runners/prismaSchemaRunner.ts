/**
 * Constrained Prisma-schema lab runner.
 * Parses model blocks → CREATE TABLE / ALTER FK. No unrestricted shell.
 */

export type RunResult = { ok: boolean; sql: string[]; error?: string };

type Field = {
  name: string;
  type: string;
  optional: boolean;
  attributes: string[];
  rawAttrs: string;
};

type Model = {
  name: string;
  table: string;
  fields: Field[];
  mapAttrs: string[];
};

function stripComments(src: string) {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Split attributes keeping parentheses intact */
function splitAttrs(raw: string): string[] {
  const attrs: string[] = [];
  let i = 0;
  const s = raw.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] !== "@" && s[i] !== "/") {
      // skip stray tokens
      while (i < s.length && !/\s/.test(s[i])) i++;
      continue;
    }
    const start = i;
    i++;
    while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i++;
    if (s[i] === "(") {
      let depth = 0;
      do {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") depth--;
        i++;
      } while (i < s.length && depth > 0);
    }
    attrs.push(s.slice(start, i).trim());
  }
  return attrs.filter(Boolean);
}

function parseModels(src: string): Model[] {
  const clean = stripComments(src);
  const models: Model[] = [];
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const name = m[1];
    const body = m[2];
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const fields: Field[] = [];
    const mapAttrs: string[] = [];
    let table = name;
    for (const line of lines) {
      if (line.startsWith("@@")) {
        mapAttrs.push(line);
        const map = line.match(/@@map\(\s*"([^"]+)"\s*\)/);
        if (map) table = map[1];
        continue;
      }
      const fm = line.match(/^(\w+)\s+(\w+)(\??)\s*(.*)$/);
      if (!fm) continue;
      const rawAttrs = fm[4] || "";
      fields.push({
        name: fm[1],
        type: fm[2],
        optional: fm[3] === "?",
        attributes: splitAttrs(rawAttrs),
        rawAttrs,
      });
    }
    models.push({ name, table, fields, mapAttrs });
  }
  return models;
}

function attrHas(attrs: string[], prefix: string) {
  return attrs.some((a) => a.startsWith(prefix));
}

function mapAttr(attrs: string[], key: string): string | null {
  const a = attrs.find((x) => x.startsWith(key));
  if (!a) return null;
  const m = a.match(/\(\s*"([^"]+)"\s*\)/) || a.match(/\(\s*([^)]+)\s*\)/);
  return m ? m[1].replace(/['"]/g, "") : null;
}

function sqlType(field: Field): string | null {
  const scalars = new Set(["String", "Int", "Boolean", "DateTime", "Decimal", "Float", "BigInt"]);
  if (!scalars.has(field.type)) return null;

  if (attrHas(field.attributes, "@db.Decimal") || field.type === "Decimal") {
    const d = field.attributes.find((a) => a.startsWith("@db.Decimal"));
    if (d) {
      const nums = d.match(/(\d+)\s*,\s*(\d+)/);
      if (nums) return `NUMERIC(${nums[1]},${nums[2]})`;
    }
    return "NUMERIC(10,2)";
  }
  switch (field.type) {
    case "Int":
      return attrHas(field.attributes, "@default(autoincrement") ? "SERIAL" : "INTEGER";
    case "String":
      return "VARCHAR(200)";
    case "Boolean":
      return "BOOLEAN";
    case "DateTime":
      return "TIMESTAMPTZ";
    case "Float":
      return "DOUBLE PRECISION";
    case "BigInt":
      return "BIGINT";
    default:
      return "TEXT";
  }
}

function columnName(field: Field) {
  return mapAttr(field.attributes, "@map") || camelToSnake(field.name);
}

function camelToSnake(s: string) {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()).replace(/^_/, "");
}

export function prismaModelsToSql(source: string): RunResult {
  try {
    if (/[;`]\s*(drop|truncate|alter\s+role|copy\s+)/i.test(source)) {
      return { ok: false, sql: [], error: "Forbidden SQL-like content in schema." };
    }
    const models = parseModels(source);
    if (!models.length) {
      return {
        ok: false,
        sql: [],
        error: "No Prisma `model` blocks found. Paste model definitions with @@map table names.",
      };
    }

    const sql: string[] = [];
    const fkDeferred: string[] = [];

    for (const model of models) {
      if (!model.table.startsWith("lab_")) {
        return {
          ok: false,
          sql: [],
          error: `Table map for ${model.name} must start with lab_ (got ${model.table}).`,
        };
      }
      const cols: string[] = [];
      const pkCols: string[] = [];

      for (const field of model.fields) {
        const st = sqlType(field);
        if (!st) continue;
        const cname = columnName(field);
        const parts = [`"${cname}" ${st}`];
        if (attrHas(field.attributes, "@id")) pkCols.push(cname);
        if (attrHas(field.attributes, "@unique")) parts.push("UNIQUE");
        if (!field.optional && !attrHas(field.attributes, "@default") && st !== "SERIAL") {
          parts.push("NOT NULL");
        }
        if (attrHas(field.attributes, "@default(true)")) parts.push("DEFAULT TRUE");
        if (attrHas(field.attributes, "@default(false)")) parts.push("DEFAULT FALSE");
        const defStr = field.attributes.find((a) => a.startsWith('@default("'));
        if (defStr) {
          const v = defStr.match(/@default\("([^"]*)"\)/);
          if (v) parts.push(`DEFAULT '${v[1].replace(/'/g, "''")}'`);
        }
        cols.push(parts.join(" "));
      }

      for (const field of model.fields) {
        const relAttr =
          field.attributes.find((a) => a.startsWith("@relation")) ||
          (field.rawAttrs.includes("@relation")
            ? field.rawAttrs.slice(field.rawAttrs.indexOf("@relation"))
            : null);
        if (!relAttr) continue;
        const fieldsM = relAttr.match(/fields:\s*\[([^\]]+)\]/);
        const refsM = relAttr.match(/references:\s*\[([^\]]+)\]/);
        if (!fieldsM || !refsM) continue;
        const localField = fieldsM[1].trim();
        const refField = refsM[1].trim();
        const localFieldObj = model.fields.find((f) => f.name === localField);
        const localCol = localFieldObj ? columnName(localFieldObj) : camelToSnake(localField);
        const targetModel = models.find((m) => m.name === field.type);
        if (!targetModel) continue;
        const targetFieldObj = targetModel.fields.find((f) => f.name === refField);
        const targetCol = targetFieldObj ? columnName(targetFieldObj) : camelToSnake(refField);
        const onDelete = /onDelete:\s*Cascade/i.test(relAttr)
          ? " ON DELETE CASCADE"
          : /onDelete:\s*SetNull/i.test(relAttr)
            ? " ON DELETE SET NULL"
            : "";
        fkDeferred.push(
          `ALTER TABLE "${model.table}" ADD CONSTRAINT "${model.table}_${localCol}_fkey" FOREIGN KEY ("${localCol}") REFERENCES "${targetModel.table}"("${targetCol}")${onDelete}`
        );
      }

      const idAttr = model.mapAttrs.find((a) => a.startsWith("@@id"));
      if (idAttr) {
        const ids = idAttr.match(/@@id\(\[([^\]]+)\]\)/);
        if (ids) {
          const names = ids[1].split(",").map((s) => {
            const fn = s.trim();
            const f = model.fields.find((x) => x.name === fn);
            return `"${f ? columnName(f) : camelToSnake(fn)}"`;
          });
          cols.push(`PRIMARY KEY (${names.join(", ")})`);
        }
      } else if (pkCols.length === 1) {
        const c = cols.find((x) => x.startsWith(`"${pkCols[0]}"`));
        if (c && c.includes("SERIAL") && !c.includes("PRIMARY KEY")) {
          const idx = cols.indexOf(c);
          cols[idx] = c.replace("SERIAL", "SERIAL PRIMARY KEY");
        } else if (c && !c.includes("PRIMARY KEY") && !c.includes("SERIAL")) {
          cols.push(`PRIMARY KEY ("${pkCols[0]}")`);
        }
      }

      sql.push(`CREATE TABLE IF NOT EXISTS "${model.table}" (\n  ${cols.join(",\n  ")}\n)`);
    }

    for (const fk of fkDeferred) {
      sql.push(fk.endsWith(";") ? fk : fk + ";");
    }

    const normalized = sql.map((s) => (s.trim().endsWith(";") ? s.trim() : s.trim() + ";"));
    return { ok: true, sql: normalized };
  } catch (e) {
    return { ok: false, sql: [], error: e instanceof Error ? e.message : String(e) };
  }
}
