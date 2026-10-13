"use client";

import clsx from "clsx";
import type { ExecuteResult } from "@/types/hub";

/** Gate outcome: overall message, every failure with its rule id (and line), plus captured output. */
export function GateResult({ result, teachAlong }: { result: ExecuteResult; teachAlong?: string[] }) {
  const failures = result.validation?.failures || [];
  return (
    <div
      className={clsx(
        "rounded-xl border px-3 py-2 text-sm animate-fade-up space-y-2",
        result.success ? "border-accent/40 bg-accent/10 text-accent-glow" : "border-danger/40 bg-danger/10 text-danger"
      )}
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">
        {result.success ? "✓ Passed" : `✗ ${result.gate?.replace(/_/g, " ") || "failed"}`}
        {result.success && result.message ? ` — ${result.message}` : ""}
      </p>
      {failures.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Why it failed">
          {failures.map((f, i) => (
            <li key={`${f.rule}-${i}`} className="flex gap-2 text-ink-100">
              <code className="shrink-0 self-start rounded bg-danger/20 px-1.5 py-0.5 text-xs text-danger">{f.rule}</code>
              <span>
                {f.line ? <span className="mr-1 text-warn">line {f.line}:</span> : null}
                {f.message}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        !result.success && result.message && <p className="text-ink-100">{result.message}</p>
      )}
      {result.note && !result.success && <p className="text-ink-300">{result.note}</p>}
      {result.stdout ? (
        <details open className="text-ink-200">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-ink-400">Output</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-ink-950 p-2 text-xs">{result.stdout}</pre>
        </details>
      ) : null}
      {result.success && teachAlong?.length ? (
        <ol className="list-decimal pl-4 text-ink-200">
          {teachAlong.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
