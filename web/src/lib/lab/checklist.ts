/** Live task checklist built from an exercise's requirements, ticked from the last Check (pure). */
import type { Failure } from "./diagnostics";

export type Req = {
  tables?: Array<{ name: string; columns?: Array<{ name: string; pk?: boolean; unique?: boolean; nullable?: boolean; indexed?: boolean; type?: string; fk?: { table: string; column: string; onDelete?: string } }>; uniqueTogether?: string[][] }>;
  data?: Array<{ message?: string }>;
  probes?: Array<{ message?: string }>;
  stdout?: { message?: string; contains?: string } | null;
  calls?: unknown[];
  zod?: unknown;
  datasource?: unknown;
};
export type CheckItem = { id: string; label: string; table?: string; column?: string; status: "pending" | "pass" | "fail"; reason?: string };

export function buildChecklist(req: Req | null | undefined): Omit<CheckItem, "status">[] {
  const out: Omit<CheckItem, "status">[] = [];
  if (!req) return out;
  for (const t of req.tables || []) {
    out.push({ id: `table:${t.name}`, label: `Table \`${t.name}\` exists`, table: t.name });
    for (const c of t.columns || []) {
      const bits: string[] = [];
      if (c.pk) bits.push("primary key");
      if (c.fk) bits.push(`references ${c.fk.table}.${c.fk.column}${c.fk.onDelete ? ` ON DELETE ${c.fk.onDelete}` : ""}`);
      if (c.unique) bits.push("unique");
      if (c.unique === false) bits.push("not unique");
      if (c.nullable === false) bits.push("NOT NULL");
      if (c.nullable === true) bits.push("nullable");
      if (c.indexed) bits.push("indexed");
      if (c.type) bits.push(c.type);
      out.push({ id: `column:${t.name}.${c.name}`, label: `\`${t.name}.${c.name}\`${bits.length ? ` (${bits.join(", ")})` : ""}`, table: t.name, column: c.name });
    }
    for (const u of t.uniqueTogether || []) out.push({ id: `uniq:${t.name}:${u.join(",")}`, label: `\`${t.name}\` unique on (${u.join(", ")})`, table: t.name });
  }
  (req.data || []).forEach((d, i) => out.push({ id: `data:${i}`, label: d.message || "Required rows exist" }));
  (req.probes || []).forEach((p, i) => out.push({ id: `probe:${i}`, label: p.message || "Behaviour check" }));
  if (req.stdout) out.push({ id: "stdout", label: req.stdout.message || `Prints \`${req.stdout.contains}\`` });
  if (req.calls?.length) out.push({ id: "calls", label: "Validators accept good input and reject bad input" });
  if (req.zod) out.push({ id: "zod", label: "Schema accepts the valid samples and rejects the invalid ones" });
  if (req.datasource) out.push({ id: "datasource", label: "datasource uses postgresql + env(\"DATABASE_URL\")" });
  return out;
}

const RULE_GROUP: Record<string, string> = {
  "missing-data": "data", "too-much-data": "data", "probe-failed": "probe", "constraint-not-enforced": "probe",
  "missing-output": "stdout", "accepts-invalid": "zod|calls", "rejects-valid": "zod|calls", "missing-name": "zod|calls",
  "missing-datasource": "datasource", "wrong-provider": "datasource", "hardcoded-url": "datasource", "wrong-env-var": "datasource",
};

/** Tick items: a failure marks the matching item (by table/column, or by group); a passing Check ticks all. */
export function tickChecklist(items: Omit<CheckItem, "status">[], failures: Failure[] | null, checked: boolean): CheckItem[] {
  if (!checked) return items.map((i) => ({ ...i, status: "pending" }));
  const fails = failures || [];
  const global = fails.some((f) => f.rule === "rejected" || f.rule === "runtime-error");
  return items.map((item) => {
    const hit = fails.find((f) => {
      const grp = RULE_GROUP[f.rule];
      if (grp) return grp.split("|").some((g) => item.id === g || item.id.startsWith(`${g}:`));
      if (f.column && f.table) return item.id === `column:${f.table}.${f.column}`;
      if (f.rule === "missing-composite-key") return item.id.startsWith(`uniq:${f.table}:`);
      if (f.table) return item.id === `table:${f.table}`;
      return false;
    });
    if (hit) return { ...item, status: "fail", reason: hit.message };
    return { ...item, status: global ? "pending" : "pass" };
  });
}
