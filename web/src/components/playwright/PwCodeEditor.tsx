"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

type Mark = { line: number; kind: "error" | "warning"; message: string };

type Props = {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  label: string;
  marks?: Mark[];
  /** Line to scroll into view (e.g. clicked from the results list); `n` re-triggers the same line. */
  focus?: { line: number; n: number } | null;
  minLines?: number;
  onRun?: () => void;
};

const LINE_PX = 20;
const PAD_PX = 12;

/**
 * Plain textarea editor with a line-number gutter and highlighted error lines.
 * No heavy editor dependency: the hub stays a small Next.js app.
 */
export function PwCodeEditor({ value, onChange, readOnly, label, marks = [], focus, minLines = 18, onRun }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const lines = Math.max(value.split("\n").length, 1);
  const height = Math.min(Math.max(lines, minLines), 34) * LINE_PX + PAD_PX * 2;
  const byLine = new Map<number, Mark>();
  for (const m of marks) {
    const prev = byLine.get(m.line);
    if (!prev || (prev.kind === "warning" && m.kind === "error")) byLine.set(m.line, m);
  }

  useEffect(() => {
    const focusLine = focus?.line;
    if (!focusLine || !ta.current) return;
    const top = Math.max(0, (focusLine - 3) * LINE_PX);
    ta.current.scrollTop = top;
    // The browser clamps scrollTop (short files cannot scroll): mirror the real value.
    setScrollTop(ta.current.scrollTop);
    // Put the caret on that line so keyboard users land there too.
    const idx = value.split("\n").slice(0, focusLine - 1).join("\n").length + (focusLine > 1 ? 1 : 0);
    ta.current.focus({ preventScroll: true });
    ta.current.setSelectionRange(idx, idx);
    setScrollTop(ta.current.scrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-ink-400">
        <span>{label}</span>
        {readOnly ? <span className="kbd">read-only</span> : onRun ? <span className="normal-case"><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> runs</span> : null}
      </div>
      <div className="relative flex overflow-hidden rounded-xl border border-ink-700 bg-ink-950 font-mono text-[13px]" style={{ height }}>
        <div aria-hidden className="relative w-12 shrink-0 select-none border-r border-ink-800 bg-ink-900/60 text-right text-ink-500">
          <div style={{ transform: `translateY(${-scrollTop}px)`, paddingTop: PAD_PX }}>
            {Array.from({ length: lines }, (_, i) => {
              const m = byLine.get(i + 1);
              return (
                <div
                  key={i}
                  title={m?.message}
                  className={clsx("pr-2", m?.kind === "error" && "bg-danger/25 font-semibold text-danger", m?.kind === "warning" && "bg-warn/15 text-warn")}
                  style={{ height: LINE_PX, lineHeight: `${LINE_PX}px` }}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative flex-1">
          {[...byLine.values()].map((m) => (
            <div
              key={m.line}
              aria-hidden
              className={clsx("pointer-events-none absolute inset-x-0", m.kind === "error" ? "bg-danger/15 border-y border-danger/30" : "bg-warn/10")}
              style={{ top: PAD_PX + (m.line - 1) * LINE_PX - scrollTop, height: LINE_PX }}
            />
          ))}
          <textarea
            ref={ta}
            className="absolute inset-0 h-full w-full resize-none bg-transparent px-3 text-accent-glow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/40"
            style={{ lineHeight: `${LINE_PX}px`, paddingTop: PAD_PX, paddingBottom: PAD_PX, tabSize: 2 }}
            value={value}
            readOnly={readOnly}
            wrap="off"
            spellCheck={false}
            aria-label={label}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onRun) {
                e.preventDefault();
                onRun();
                return;
              }
              if (e.key === "Tab" && !readOnly && onChange) {
                e.preventDefault();
                const el = e.currentTarget;
                const { selectionStart: s, selectionEnd: en } = el;
                const next = value.slice(0, s) + "  " + value.slice(en);
                onChange(next);
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
              }
            }}
          />
        </div>
      </div>
      {marks.length > 0 && (
        <ul className="space-y-0.5 text-xs" aria-label="Problems in this file">
          {marks.slice(0, 6).map((m, i) => (
            <li key={i} className={m.kind === "error" ? "text-danger" : "text-warn"}>
              Line {m.line}: {m.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
