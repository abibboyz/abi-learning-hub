export type SchemaColumn = {
  name: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  references?: { table: string; column: string };
};

export type SchemaTable = { name: string; columns: SchemaColumn[] };
export type SchemaRel = {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete?: string;
  onUpdate?: string;
};
export type Schema = { tables: SchemaTable[]; relationships: SchemaRel[] };

export type Requirements = {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      pk?: boolean;
      unique?: boolean;
      nullable?: boolean;
      fk?: { table: string; column: string; onDelete?: string };
    }>;
  }>;
};

export function checkRequirements(schema: Schema, requirements: Requirements) {
  const errors: string[] = [];
  const matched: string[] = [];
  const tablesByName = Object.fromEntries(schema.tables.map((t) => [t.name, t]));
  const rels = schema.relationships || [];

  for (const reqTable of requirements.tables || []) {
    const actual = tablesByName[reqTable.name];
    if (!actual) {
      errors.push(
        `Missing required table \`${reqTable.name}\`. ` +
          `Why: later foreign keys and joins need this relation to exist in Postgres — ` +
          `declare/create it (lab_ prefix) then re-run.`
      );
      continue;
    }
    matched.push(`table:${reqTable.name}`);
    const colsByName = Object.fromEntries(actual.columns.map((c) => [c.name, c]));

    for (const reqCol of reqTable.columns || []) {
      const col = colsByName[reqCol.name];
      if (!col) {
        errors.push(
          `Table \`${reqTable.name}\` missing required column \`${reqCol.name}\`. ` +
            `Why: the task gate introspects real columns; extras are fine, but \`${reqCol.name}\` ` +
            `must be present for the relationship drill to proceed.`
        );
        continue;
      }
      matched.push(`column:${reqTable.name}.${reqCol.name}`);
      if (reqCol.pk && !col.isPrimaryKey) {
        errors.push(
          `Column \`${reqTable.name}.${reqCol.name}\` must be a primary key. ` +
            `Why: foreign keys reference primary (or unique) keys — without a PK, ` +
            `child tables cannot attach a valid REFERENCES constraint.`
        );
      }
      const fk = reqCol.fk;
      if (fk) {
        if (!col.isForeignKey) {
          errors.push(
            `Column \`${reqTable.name}.${reqCol.name}\` must be a foreign key to \`${fk.table}.${fk.column}\`. ` +
              `Why: relationships are enforced by FK constraints — an ORM ` +
              `\`@relation\` without a real FK will not pass the gate.`
          );
        } else {
          const ref = col.references || { table: "", column: "" };
          if (ref.table !== fk.table || ref.column !== fk.column) {
            errors.push(
              `Column \`${reqTable.name}.${reqCol.name}\` must reference \`${fk.table}.${fk.column}\`, found \`${ref.table}.${ref.column}\`. ` +
                `Why: the FK target defines the parent side of the relationship.`
            );
          } else {
            matched.push(`fk:${reqTable.name}.${reqCol.name}->${fk.table}.${fk.column}`);
          }
          if (fk.onDelete) {
            const found = rels.find(
              (r) => r.fromTable === reqTable.name && r.fromColumn === reqCol.name
            );
            const got = (found?.onDelete || "").toUpperCase();
            if (got !== fk.onDelete.toUpperCase()) {
              errors.push(
                `FK \`${reqTable.name}.${reqCol.name}\` must have ON DELETE ${fk.onDelete} (found ${got || "NONE"}). ` +
                  `Why: delete policy decides whether children are removed, nulled, or blocked when the parent row goes away.`
              );
            } else {
              matched.push(`onDelete:${reqTable.name}.${reqCol.name}:${fk.onDelete}`);
            }
          }
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    matched,
    message:
      errors.length === 0 ? "All requirements satisfied — extras are allowed." : errors.join("; "),
  };
}
