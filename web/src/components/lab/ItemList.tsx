"use client";

import clsx from "clsx";
import type { ItemState, ProgressState } from "@/lib/lab/progress";

/** Numbered progress map: ✓ done · ● current · ○ to do, with Continue and an x/y bar. */
export function ItemList({
  label,
  items,
  states,
  progress,
  selected,
  continueTo,
  onSelect,
}: {
  label: string;
  items: Array<{ id: string; order: number; title: string; level?: string }>;
  states: Record<string, ItemState>;
  progress: ProgressState;
  selected: string | null;
  continueTo: string | null;
  onSelect: (id: string) => void;
}) {
  const done = items.filter((i) => progress.passed.includes(i.id)).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <nav aria-label={label} className="card space-y-3 p-3" data-testid="item-list">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-xs text-ink-300">
            <span>
              {done}/{items.length} {label.toLowerCase()} passed
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-label={`${label} progress`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} aria-valuetext={`${done} of ${items.length}`}>
            <div className="h-full bg-accent motion-safe:transition-all motion-safe:duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {continueTo && continueTo !== selected && (
          <button type="button" className="btn-primary !h-8 !px-3 text-xs" onClick={() => onSelect(continueTo)} data-testid="continue-btn">
            Continue
          </button>
        )}
      </div>
      <ol className="max-h-[40vh] space-y-0.5 overflow-auto pr-1 lg:max-h-[46vh]">
        {items.map((it) => {
          const st = states[it.id];
          const assisted = progress.assisted.includes(it.id);
          const isSel = it.id === selected;
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                aria-current={isSel ? "step" : undefined}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  isSel ? "bg-accent/15 text-white ring-1 ring-accent/50" : "text-ink-200 hover:bg-ink-800"
                )}
              >
                <span
                  aria-hidden
                  className={clsx("w-4 shrink-0 text-center font-bold", st === "done" ? "text-accent" : st === "current" ? "text-warn" : "text-ink-400")}
                >
                  {st === "done" ? "✓" : st === "current" ? "●" : "○"}
                </span>
                <span className="sr-only">{st === "done" ? "Passed: " : st === "current" ? "Up next: " : "Not done: "}</span>
                <span className="w-6 shrink-0 text-xs text-ink-400">{it.order}.</span>
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                {assisted && <span className="rounded border border-warn/50 px-1 text-xs text-warn" title="You used hints or the solution here">assisted</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
