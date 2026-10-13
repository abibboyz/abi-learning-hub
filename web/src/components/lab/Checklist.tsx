"use client";

import clsx from "clsx";
import type { CheckItem } from "@/lib/lab/checklist";

function md(s: string) {
  return s.split("`").map((p, i) => (i % 2 ? <code key={i} className="text-xs">{p}</code> : p));
}

/** Requirements of the current exercise, ticked live from the last Check. */
export function Checklist({ items }: { items: CheckItem[] }) {
  if (!items.length) return null;
  const pass = items.filter((i) => i.status === "pass").length;
  return (
    <section aria-label="Checklist" className="space-y-1.5" data-testid="checklist">
      <p className="text-xs uppercase tracking-wide text-ink-300">
        Checklist {items.some((i) => i.status !== "pending") ? `· ${pass}/${items.length}` : "· press Check to tick"}
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span aria-hidden className={clsx("w-4 shrink-0 text-center font-bold", i.status === "pass" ? "text-accent" : i.status === "fail" ? "text-danger" : "text-ink-400")}>
              {i.status === "pass" ? "✓" : i.status === "fail" ? "✗" : "○"}
            </span>
            <span className="sr-only">{i.status === "pass" ? "Done: " : i.status === "fail" ? "Not yet: " : "Pending: "}</span>
            <span className={clsx(i.status === "fail" ? "text-ink-100" : "text-ink-200")}>
              {md(i.label)}
              {i.reason && <span className="block text-xs text-danger">{i.reason}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
