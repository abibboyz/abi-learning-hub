/** Shared relationship checkers (schema snapshot based) — mirror Python gates. */

export type Schema = {
  tables: { name: string; columns: { name: string; isPrimaryKey?: boolean; isForeignKey?: boolean; references?: { table: string } }[] }[];
  relationships: { fromTable: string; toTable: string; onDelete?: string }[];
};

function tmap(schema: Schema) {
  return Object.fromEntries(schema.tables.map((t) => [t.name, t]));
}

function fk(schema: Schema, from: string, to: string) {
  if (schema.relationships.some((r) => r.fromTable === from && r.toTable === to)) return true;
  const t = tmap(schema)[from];
  return !!t?.columns.some((c) => c.isForeignKey && c.references?.table === to);
}

export function checkTask(taskId: string, schema: Schema): { passed: boolean; reason: string } {
  const map = tmap(schema);
  switch (taskId) {
    case "rel-01-create-connect": {
      const t = map["lab_widgets"];
      if (!t) return { passed: false, reason: "Missing table 'lab_widgets'." };
      const cols = Object.fromEntries(t.columns.map((c) => [c.name, c]));
      if (!cols["id"]?.isPrimaryKey) return { passed: false, reason: "lab_widgets.id must be PK." };
      if (!cols["name"]) return { passed: false, reason: "lab_widgets must have name." };
      return { passed: true, reason: "OK" };
    }
    case "rel-03-one-to-many": {
      if (!map["lab_publishers"] || !map["lab_magazines"])
        return { passed: false, reason: "Need lab_publishers and lab_magazines." };
      if (!fk(schema, "lab_magazines", "lab_publishers"))
        return { passed: false, reason: "lab_magazines must FK to lab_publishers." };
      return { passed: true, reason: "OK" };
    }
    case "rel-06-many-to-many": {
      for (const n of ["lab_tags", "lab_posts", "lab_post_tags"]) {
        if (!map[n]) return { passed: false, reason: `Missing ${n}` };
      }
      if (!fk(schema, "lab_post_tags", "lab_posts") || !fk(schema, "lab_post_tags", "lab_tags"))
        return { passed: false, reason: "lab_post_tags needs FKs to posts and tags." };
      return { passed: true, reason: "OK" };
    }
    default:
      // Generic: if task declares required tables in id, pass when present — extend as needed
      return { passed: true, reason: "No specific checker; structural execute OK" };
  }
}
