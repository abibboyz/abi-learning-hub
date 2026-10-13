"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { explainSql, type ExplainResponse } from "@/lib/api";
import { executionOrder, explainNode, parsePlan, type PlanNode } from "@/lib/lab/explainPlan";

/** EXPLAIN / EXPLAIN ANALYZE of the selected (or last) statement, as a tree you can step through. */
export function PlanView({ code, selection }: { code: string; selection: string }) {
  const [resp, setResp] = useState<ExplainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const parsed = useMemo(() => {
    if (!resp?.ok) return null;
    try {
      return parsePlan(resp.plan);
    } catch {
      return null;
    }
  }, [resp]);
  const order = useMemo(() => (parsed ? executionOrder(parsed.root) : []), [parsed]);
  const cur = order[step];

  async function go(analyze: boolean) {
    setBusy(true);
    try {
      setResp(await explainSql(code, analyze, selection));
      setStep(0);
    } catch (e) {
      setResp({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const renderNode = (n: PlanNode): React.ReactNode => (
    <li key={n.id}>
      <div
        className={clsx(
          "my-0.5 rounded border px-2 py-1 font-mono text-xs",
          cur?.id === n.id ? "border-accent bg-accent/15 text-white" : order.indexOf(n) < step ? "border-ink-600 text-ink-200" : "border-ink-800 text-ink-300"
        )}
        aria-current={cur?.id === n.id ? "step" : undefined}
      >
        <b>{n.type}</b>
        {n.relation ? ` on ${n.relation}` : ""}
        {n.index ? ` using ${n.index}` : ""} · est. {n.rows} rows
        {n.actualRows !== undefined ? ` · actual ${n.actualRows}` : ""}
        {n.estimateOff ? <span className="ml-1 text-warn">(estimate off ×{n.estimateOff.toFixed(0)})</span> : null}
        <span className="ml-2 inline-block h-1.5 w-16 rounded bg-ink-800 align-middle" aria-hidden>
          <span className="block h-1.5 rounded bg-warn" style={{ width: `${Math.round(n.share * 100)}%` }} />
        </span>
      </div>
      {n.children.length ? <ul className="ml-4 border-l border-ink-700 pl-2">{n.children.map(renderNode)}</ul> : null}
    </li>
  );

  return (
    <div className="space-y-3 text-sm" data-testid="plan-view">
      <p className="text-ink-300">
        Explains {selection.trim() ? "the selected statement" : "the last statement"} (earlier statements run as setup). Always rolled back.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost !h-8 text-xs" disabled={busy} onClick={() => void go(false)}>
          EXPLAIN
        </button>
        <button type="button" className="btn-ghost !h-8 text-xs" disabled={busy} onClick={() => void go(true)}>
          EXPLAIN ANALYZE
        </button>
      </div>
      {resp && !resp.ok && <p className="rounded border border-danger/40 bg-danger/5 p-2 text-danger">{resp.error}{resp.line ? ` (line ${resp.line})` : ""}</p>}
      {parsed && (
        <>
          <ul aria-label="Query plan tree">{renderNode(parsed.root)}</ul>
          <div className="rounded-lg border border-ink-700 p-2" aria-live="polite">
            <p className="text-xs uppercase tracking-wide text-ink-300">
              Step {step + 1} of {order.length} (Postgres runs the tree bottom-up)
            </p>
            {cur && <p className="text-ink-100">{explainNode(cur)}</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-ghost !h-8 text-xs" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                ← Previous step
              </button>
              <button type="button" className="btn-ghost !h-8 text-xs" disabled={step >= order.length - 1} onClick={() => setStep((s) => s + 1)}>
                Next step →
              </button>
            </div>
          </div>
          {parsed.executionMs !== undefined && <p className="text-xs text-ink-400">Execution {parsed.executionMs.toFixed(2)} ms · planning {parsed.planningMs?.toFixed(2)} ms</p>}
        </>
      )}
    </div>
  );
}
