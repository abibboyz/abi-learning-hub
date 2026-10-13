"use client";

import { useId, useMemo } from "react";
import type { Schema } from "@/types/hub";
import clsx from "clsx";

type Props = {
  schema: Schema | null;
  highlightTables?: string[];
  highlightRels?: string[];
  executing?: boolean;
};

const V = (n: string) => `rgb(var(--${n}))`;

export function SchemaDiagram({ schema, highlightTables = [], highlightRels = [], executing }: Props) {
  const uid = useId();
  const layout = useMemo(() => {
    const tables = schema?.tables || [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length || 1)));
    return tables.map((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        ...t,
        x: 40 + col * 240,
        y: 40 + row * 200,
        w: 200,
        h: 36 + t.columns.length * 22,
      };
    });
  }, [schema]);

  const byName = useMemo(() => Object.fromEntries(layout.map((t) => [t.name, t])), [layout]);

  const width = Math.max(640, ...layout.map((t) => t.x + t.w + 40), 640);
  const height = Math.max(420, ...layout.map((t) => t.y + t.h + 40), 420);

  if (!schema || !schema.tables.length) {
    return (
      <div className="card flex h-full min-h-[420px] items-center justify-center p-6 text-ink-400">
        <div className="text-center">
          <p className="text-white">Schema diagram</p>
          <p className="mt-2 text-sm">
            No tables yet — run a task to materialize lab_ tables, or reset to the demo seed.
            Highlights narrate cause→effect when a task passes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("card overflow-auto", executing && "executing-banner")}>
      <div className="flex items-center justify-between border-b border-ink-700/60 px-4 py-2 text-xs text-ink-300">
        <span>Live schema · {schema.tables.length} tables · {schema.relationships.length} FKs</span>
        {executing && <span className="text-accent animate-pulse">executing…</span>}
      </div>
      <svg width={width} height={height} className="block min-w-full" role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>Entity-relationship diagram of the lab database</title>
        <desc id={`${uid}-d`}>
          {`${schema.tables.length} tables. ` +
            schema.tables
              .map((t) => `${t.name}: ${t.columns.map((c) => `${c.name}${c.isPrimaryKey ? " (primary key)" : ""}${c.isForeignKey ? ` (foreign key${c.references ? ` to ${c.references.table}.${c.references.column}` : ""})` : ""}`).join(", ")}.`)
              .join(" ")}
        </desc>
        {(schema.relationships || []).map((r, i) => {
          const from = byName[r.fromTable];
          const to = byName[r.toTable];
          if (!from || !to) return null;
          const x1 = from.x;
          const y1 = from.y + from.h / 2;
          const x2 = to.x + to.w;
          const y2 = to.y + to.h / 2;
          const key = `${r.fromTable}.${r.fromColumn}`;
          const hi = highlightRels.includes(key);
          return (
            <g key={`${key}-${i}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                style={{ stroke: hi ? V("accent") : V("ink-500") }}
                strokeWidth={hi ? 3 : 1.5}
                strokeDasharray={hi ? "6 4" : undefined}
                className={hi ? "rel-highlight" : undefined}
              />
              <circle cx={x1} cy={y1} r={3} style={{ fill: hi ? V("accent") : V("ink-400") }} />
            </g>
          );
        })}
        {layout.map((t) => {
          const hi = highlightTables.includes(t.name);
          return (
            <g key={t.name} className={hi ? "table-highlight" : undefined}>
              <rect
                x={t.x}
                y={t.y}
                width={t.w}
                height={t.h}
                rx={10}
                style={{ fill: V("ink-900"), stroke: hi ? V("accent") : V("ink-600") }}
                strokeWidth={hi ? 2 : 1}
              />
              <rect x={t.x} y={t.y} width={t.w} height={28} rx={10} style={{ fill: V("ink-800") }} />
              <text x={t.x + 10} y={t.y + 18} style={{ fill: V("ink-100") }} fontSize={13} fontWeight={600}>
                {t.name}
              </text>
              {t.columns.map((c, idx) => (
                <text
                  key={c.name}
                  x={t.x + 10}
                  y={t.y + 48 + idx * 22}
                  style={{ fill: c.isPrimaryKey ? V("warn") : c.isForeignKey ? V("accent") : V("ink-200") }}
                  fontSize={12}
                  fontFamily="ui-monospace, monospace"
                >
                  <tspan fontWeight={700}>{c.isPrimaryKey ? "PK " : c.isForeignKey ? "FK " : "   "}</tspan>
                  {c.name}
                  <tspan style={{ fill: V("ink-400") }}> : {c.type}</tspan>
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <details className="border-t border-ink-700/60 px-4 py-2 text-sm">
        <summary className="cursor-pointer text-xs text-ink-300">Schema as text</summary>
        <ul className="mt-2 space-y-1 font-mono text-xs text-ink-200">
          {schema.tables.map((t) => (
            <li key={t.name}>
              <b className={clsx(highlightTables.includes(t.name) && "text-accent")}>{t.name}</b>
              {highlightTables.includes(t.name) ? " (changed)" : ""}:{" "}
              {t.columns.map((c) => `${c.name}${c.isPrimaryKey ? " PK" : ""}${c.isForeignKey ? ` FK→${c.references ? `${c.references.table}.${c.references.column}` : "?"}` : ""}`).join(", ")}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
