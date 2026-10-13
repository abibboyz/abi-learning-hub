"use client";

import { useId, useRef, type ReactNode } from "react";
import clsx from "clsx";

/** WAI-ARIA APG tabs: ←/→/Home/End move between tabs, automatic activation, one tab stop. */
export function Tabs({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: Array<{ id: string; label: ReactNode; badge?: ReactNode; panel: ReactNode }>;
  active: string;
  onChange: (id: string) => void;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = Math.max(0, tabs.findIndex((t) => t.id === active));
  const go = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onChange(t.id);
    refs.current[t.id]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-ink-700">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={i === idx}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(i + 1);
              else if (e.key === "ArrowLeft") go(i - 1);
              else if (e.key === "Home") go(0);
              else if (e.key === "End") go(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={clsx(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              i === idx ? "border-accent text-white" : "border-transparent text-ink-300 hover:text-white"
            )}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== idx}
          tabIndex={0}
          className="pt-3 focus-visible:outline-none"
        >
          {i === idx ? t.panel : null}
        </div>
      ))}
    </div>
  );
}
