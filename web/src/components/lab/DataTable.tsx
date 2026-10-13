"use client";

import clsx from "clsx";

export type RowMarkKind = "=" | "≠" | "+" | "-" | "~" | undefined;

const MARK_LABEL: Record<string, string> = { "≠": "mismatch", "+": "added", "-": "removed", "~": "changed", "=": "same" };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Small, accessible result table. Row marks are shown as text (not colour only). */
export function DataTable({
  caption,
  columns,
  rows,
  marks,
  changedCells,
  total,
  emptyText = "No rows.",
}: {
  caption: string;
  columns: string[];
  rows: unknown[][];
  marks?: RowMarkKind[];
  changedCells?: Array<number[] | undefined>;
  total?: number;
  emptyText?: string;
}) {
  const hasMarks = Boolean(marks?.some((m) => m && m !== "="));
  return (
    <div className="overflow-auto rounded-lg border border-ink-700">
      <table className="w-full min-w-max border-collapse text-xs font-mono">
        <caption className="caption-top px-2 py-1.5 text-left font-sans text-xs text-ink-300">
          {caption}
          {total !== undefined && total > rows.length ? ` (first ${rows.length} of ${total})` : ""}
        </caption>
        <thead className="bg-ink-900 text-ink-200">
          <tr>
            {hasMarks && (
              <th scope="col" className="w-6 px-2 py-1 text-left">
                <span className="sr-only">Row status</span>
              </th>
            )}
            {columns.map((c) => (
              <th key={c} scope="col" className="px-2 py-1 text-left font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (hasMarks ? 1 : 0)} className="px-2 py-2 font-sans text-ink-400">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const m = marks?.[i];
            return (
              <tr
                key={i}
                className={clsx(
                  "border-t border-ink-800",
                  m === "≠" && "bg-danger/10",
                  m === "-" && "bg-danger/10 line-through decoration-danger/60",
                  m === "+" && "bg-accent/10",
                  m === "~" && "bg-warn/10"
                )}
              >
                {hasMarks && (
                  <td className={clsx("px-2 py-1 font-bold", m === "≠" || m === "-" ? "text-danger" : m === "+" ? "text-accent" : "text-warn")}>
                    {m && m !== "=" ? (
                      <>
                        <span aria-hidden>{m}</span>
                        <span className="sr-only">{MARK_LABEL[m]}</span>
                      </>
                    ) : null}
                  </td>
                )}
                {r.map((v, j) => (
                  <td
                    key={j}
                    className={clsx(
                      "px-2 py-1 text-ink-100",
                      v === null && "italic text-ink-400",
                      changedCells?.[i]?.includes(j) && "font-bold text-warn underline"
                    )}
                  >
                    {cell(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
