/** Postgres EXPLAIN (FORMAT JSON) → tree + execution-order steps (pure). */
export type PlanNode = {
  id: number;
  type: string;
  relation?: string;
  index?: string;
  joinType?: string;
  cost: number;
  rows: number;
  actualRows?: number;
  actualMs?: number;
  loops?: number;
  detail: string[];
  children: PlanNode[];
  depth: number;
  share: number; // share of the root total cost (0..1)
  estimateOff?: number; // actual / estimated when ≥10× apart
};

type Raw = Record<string, unknown> & { Plans?: Raw[] };

export function parsePlan(json: unknown): { root: PlanNode; planningMs?: number; executionMs?: number } {
  const top = (Array.isArray(json) ? json[0] : json) as { Plan: Raw; "Planning Time"?: number; "Execution Time"?: number };
  if (!top || !top.Plan) throw new Error("Not an EXPLAIN (FORMAT JSON) result");
  let next = 0;
  const total = Number(top.Plan["Total Cost"] || 0) || 1;
  const walk = (p: Raw, depth: number): PlanNode => {
    const rows = Number(p["Plan Rows"] ?? 0);
    const actual = p["Actual Rows"] !== undefined ? Number(p["Actual Rows"]) : undefined;
    const detail = ["Filter", "Index Cond", "Hash Cond", "Join Filter", "Merge Cond", "Sort Key", "Recheck Cond", "Rows Removed by Filter"]
      .filter((k) => p[k] !== undefined)
      .map((k) => `${k}: ${Array.isArray(p[k]) ? (p[k] as unknown[]).join(", ") : String(p[k])}`);
    const ratio = actual !== undefined && rows > 0 ? (actual || 0.5) / rows : undefined;
    return {
      id: next++,
      type: String(p["Node Type"]),
      relation: p["Relation Name"] as string | undefined,
      index: p["Index Name"] as string | undefined,
      joinType: p["Join Type"] as string | undefined,
      cost: Number(p["Total Cost"] || 0),
      rows,
      actualRows: actual,
      actualMs: p["Actual Total Time"] !== undefined ? Number(p["Actual Total Time"]) : undefined,
      loops: p["Actual Loops"] !== undefined ? Number(p["Actual Loops"]) : undefined,
      detail,
      depth,
      share: Math.min(1, Number(p["Total Cost"] || 0) / total),
      estimateOff: ratio !== undefined && (ratio >= 10 || ratio <= 0.1) ? ratio : undefined,
      children: (p.Plans || []).map((c) => walk(c, depth + 1)),
    };
  };
  return { root: walk(top.Plan, 0), planningMs: top["Planning Time"], executionMs: top["Execution Time"] };
}

/** Postgres runs children before their parent: post-order is the order rows start flowing. */
export function executionOrder(root: PlanNode): PlanNode[] {
  const out: PlanNode[] = [];
  const visit = (n: PlanNode) => {
    n.children.forEach(visit);
    out.push(n);
  };
  visit(root);
  return out;
}

const EXPLAIN_TEXT: Record<string, string> = {
  "Seq Scan": "Reads every row of the table, start to end. Fine for small tables; on big ones an index may help.",
  "Index Scan": "Uses an index to jump to matching rows, then reads each row from the table.",
  "Index Only Scan": "Answers from the index alone, without touching the table rows.",
  "Bitmap Index Scan": "Collects matching row locations from an index into a bitmap.",
  "Bitmap Heap Scan": "Reads the rows the bitmap points to, in table order.",
  "Nested Loop": "For each row on the outer side, looks up matching rows on the inner side.",
  "Hash Join": "Builds a hash table from one side, then probes it with each row of the other side.",
  Hash: "Builds the in-memory hash table that the Hash Join probes.",
  "Merge Join": "Walks two inputs sorted on the join key side by side.",
  Sort: "Sorts rows (ORDER BY, or to prepare a merge join).",
  Aggregate: "Computes count / sum / avg … over the rows.",
  HashAggregate: "Groups rows with a hash table (GROUP BY).",
  GroupAggregate: "Groups rows that arrive already sorted (GROUP BY).",
  Limit: "Stops after the first N rows.",
  Materialize: "Keeps rows in memory so they can be read again cheaply.",
  Result: "Computes a value without reading a table.",
  "ModifyTable": "Applies an INSERT / UPDATE / DELETE.",
};
export function explainNode(n: PlanNode): string {
  return EXPLAIN_TEXT[n.type] || `${n.type} step.`;
}
