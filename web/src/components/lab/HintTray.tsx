"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import type { Hint } from "@/types/hub";

const KIND_LABEL: Record<Hint["kind"], string> = { nudge: "Nudge", concept: "Concept", "near-solution": "Almost there" };

/**
 * Progressive hints: nudge → concept → near-solution (blanked reference), then the full solution
 * behind a confirm. Using hints marks the item "assisted" — informational, never a penalty.
 */
export function HintTray({
  hints,
  total,
  busy,
  onMore,
  onSolution,
  hintLabel,
  onClose,
}: {
  hints: Hint[];
  total: number;
  busy: boolean;
  onMore: () => void;
  onSolution: () => void;
  hintLabel: string;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-label="Hints" className="space-y-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm" data-testid="hint-tray">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-warn">
          <Lightbulb className="h-4 w-4" aria-hidden /> Hints {hints.length}/{total}
        </p>
        <button type="button" className="text-xs text-ink-300 hover:text-white" onClick={onClose}>
          Hide
        </button>
      </div>
      <ol className="space-y-2" aria-live="polite">
        {hints.map((h) => (
          <li key={h.level} className="rounded-md bg-ink-950/60 p-2">
            <p className="text-xs uppercase tracking-wide text-ink-300">
              {h.level}. {KIND_LABEL[h.kind] || h.kind}
            </p>
            <p className="text-ink-100">{h.text}</p>
            {h.code && <pre className="mt-1 max-h-48 overflow-auto rounded bg-ink-950 p-2 font-mono text-xs text-ink-100">{h.code}</pre>}
            {h.questions?.length ? (
              <ul className="mt-1 list-disc pl-5 text-ink-200">
                {h.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            ) : null}
            {h.links?.length ? (
              <p className="mt-1 text-xs">
                {h.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="mr-3 text-accent underline-offset-2 hover:underline">
                    {l.title}
                  </a>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {hints.length < total && (
          <button type="button" className="btn-ghost !h-8 text-xs" disabled={busy} onClick={onMore} title={hintLabel}>
            {hints.length ? "Next hint" : "Show a hint"}
          </button>
        )}
        {!confirming ? (
          <button type="button" className="btn-ghost !h-8 text-xs" onClick={() => setConfirming(true)}>
            Reveal solution…
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-xs text-ink-200" role="group" aria-label="Confirm reveal solution">
            Replace your code with the reference solution?
            <button
              type="button"
              className="btn-primary !h-8 text-xs"
              autoFocus
              onClick={() => {
                setConfirming(false);
                onSolution();
              }}
            >
              Yes, reveal
            </button>
            <button type="button" className="btn-ghost !h-8 text-xs" onClick={() => setConfirming(false)}>
              Keep trying
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-ink-400">Using hints marks this item “assisted” on your progress map. It never blocks you.</p>
    </section>
  );
}
