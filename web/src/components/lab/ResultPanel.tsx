"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { ExecuteResult, Expected, TimelineRun } from "@/types/hub";
import type { Mark } from "@/lib/lab/diagnostics";
import { friendlyError } from "@/lib/lab/friendlyErrors";
import { diffGrids, diffLines, diffSchema, diffSnapshot, gridsEqual } from "@/lib/lab/resultDiff";
import { DataTable } from "@/components/lab/DataTable";
import { Tabs } from "@/components/lab/Tabs";

export type RunStatus = "idle" | "dirty" | "running" | "error" | "passed" | "failed" | "ran" | "timeout";

type Props = {
  status: RunStatus;
  result: ExecuteResult | null;
  expected: Expected | null;
  marks: Mark[];
  onGoToLine: (line: number) => void;
  timeline: TimelineRun[];
  onReplay?: (id: number) => void;
  tab: string;
  onTab: (t: string) => void;
  /** Extra tab (e.g. SQL plan) rendered by the parent */
  extraTabs?: Array<{ id: string; label: string; panel: React.ReactNode }>;
  runLabel: string;
  checkLabel: string;
};

/** One sentence for the live region (polite) */
export function statusText(status: RunStatus, r: ExecuteResult | null): string {
  switch (status) {
    case "running":
      return "Running…";
    case "passed":
      return `Passed. ${r?.message || ""}`.trim();
    case "failed":
      return `Not yet: ${(r?.validation?.failures || []).length || 1} thing(s) to fix.`;
    case "error":
      return `Error: ${r?.message || "the code did not run"}`;
    case "timeout":
      return "Timed out — look for an infinite loop or a slow query.";
    case "ran":
      return `Ran (not graded). ${r?.results?.length ? `${r.results.length} result set(s).` : ""}`.trim();
    default:
      return "";
  }
}

function StatusBanner({ status, result, runLabel, checkLabel }: { status: RunStatus; result: ExecuteResult | null; runLabel: string; checkLabel: string }) {
  const map = {
    running: { Icon: Loader2, cls: "border-info/40 bg-info/10 text-info", text: "Running…" },
    passed: { Icon: CheckCircle2, cls: "border-accent/40 bg-accent/10 text-accent", text: "Passed" },
    failed: { Icon: XCircle, cls: "border-danger/40 bg-danger/10 text-danger", text: "Not yet — see what to fix" },
    error: { Icon: AlertTriangle, cls: "border-danger/40 bg-danger/10 text-danger", text: "Your code raised an error" },
    timeout: { Icon: Clock, cls: "border-warn/40 bg-warn/10 text-warn", text: "Timed out" },
    ran: { Icon: CheckCircle2, cls: "border-ink-600 bg-ink-900 text-ink-100", text: "Ran — not graded yet" },
  } as const;
  if (status === "idle" || status === "dirty") {
    return (
      <div className="rounded-lg border border-dashed border-ink-600 p-4 text-sm text-ink-300" data-testid="result-empty">
        <p className="font-medium text-ink-100">{status === "dirty" ? "Changes not run yet." : "Nothing run yet."}</p>
        <p className="mt-1">
          <strong className="text-ink-100">Run</strong> ({runLabel}) executes your code and shows the output — nothing is graded.{" "}
          <strong className="text-ink-100">Check</strong> ({checkLabel}) runs it and grades it against the task.
        </p>
      </div>
    );
  }
  const m = map[status];
  return (
    <div className={clsx("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", m.cls)} data-testid="result-status" data-status={status}>
      <m.Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", status === "running" && "motion-safe:animate-spin")} aria-hidden />
      <div>
        <p className="font-semibold">{m.text}</p>
        {status === "failed" ? (
          <p className="text-ink-100">
            {(result?.validation?.failures || []).length} thing(s) to fix — see the Check tab and the checklist.
          </p>
        ) : (
          result?.message && status !== "running" && <p className="text-ink-100">{result.message}</p>
        )}
        {status === "ran" && <p className="text-ink-300">Press Check ({checkLabel}) when you are ready to be graded.</p>}
      </div>
    </div>
  );
}

/** Line, Go to line, friendly explanation, raw message, traceback in a disclosure. */
export function ErrorCard({ result, marks, onGoToLine }: { result: ExecuteResult; marks: Mark[]; onGoToLine: (l: number) => void }) {
  const runtime = (result.validation?.failures || []).find((f) => f.rule === "runtime-error" || f.rule === "rejected");
  const raw = runtime?.message || result.message || "";
  const friendly = friendlyError(raw) || friendlyError(result.traceback);
  const line = marks[0]?.line;
  return (
    <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm" data-testid="error-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-danger">{line ? `Line ${line}` : "Error"}</p>
        {line ? (
          <button type="button" className="btn-ghost !h-8 !px-2 text-xs" onClick={() => onGoToLine(line)}>
            Go to line {line}
          </button>
        ) : null}
      </div>
      {friendly && <p className="text-ink-100">{friendly}</p>}
      <pre className="whitespace-pre-wrap break-words rounded bg-ink-950 p-2 font-mono text-xs text-ink-200">{raw}</pre>
      {result.traceback && (
        <details>
          <summary className="cursor-pointer text-xs text-ink-300">Full traceback</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded bg-ink-950 p-2 font-mono text-xs text-ink-200">{result.traceback}</pre>
        </details>
      )}
    </div>
  );
}

function OutputTab({ result, marks, onGoToLine }: { result: ExecuteResult | null; marks: Mark[]; onGoToLine: (l: number) => void }) {
  if (!result) return <p className="text-sm text-ink-400">Output appears here after Run or Check.</p>;
  const isErr = (result.validation?.failures || []).some((f) => f.rule === "runtime-error" || f.rule === "rejected") || result.gate === "runtime_error";
  return (
    <div className="space-y-3">
      {isErr && <ErrorCard result={result} marks={marks} onGoToLine={onGoToLine} />}
      {(result.results || []).map((g, i) => (
        <DataTable key={i} caption={`Result ${i + 1}${g.rowCount !== undefined ? ` · ${g.rowCount} row(s)` : ""}`} columns={g.columns} rows={g.rows} total={g.rowCount} />
      ))}
      {result.stdout ? (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-300">Printed output</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-ink-950 p-2 font-mono text-xs text-ink-100">{result.stdout}</pre>
        </div>
      ) : null}
      {result.sql?.length ? (
        <details>
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-ink-300">Generated SQL ({result.sql.length})</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-ink-950 p-2 font-mono text-xs text-ink-200">{result.sql.join(";\n\n")}</pre>
        </details>
      ) : null}
      {!isErr && !result.results?.length && !result.stdout && !result.sql?.length && (
        <p className="text-sm text-ink-400">The code ran and produced no output or result rows.</p>
      )}
    </div>
  );
}

function CheckTab({ result }: { result: ExecuteResult | null }) {
  if (!result || result.checked === false)
    return <p className="text-sm text-ink-400">Press Check to see which requirements pass. Run never grades.</p>;
  const failures = result.validation?.failures || [];
  const matched = result.validation?.matched || [];
  return (
    <div className="space-y-3 text-sm">
      {failures.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-danger">To fix ({failures.length})</p>
          <ul className="space-y-1.5">
            {failures.map((f, i) => (
              <li key={i} className="flex gap-2">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                <span className="text-ink-100">
                  <span className="sr-only">Failed: </span>
                  {f.line ? <span className="mr-1 text-warn">line {f.line}:</span> : null}
                  {f.message} <code className="ml-1 rounded bg-ink-800 px-1 text-xs text-ink-300">{f.rule}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {matched.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-accent">Already right ({matched.length})</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {matched.map((m) => (
              <li key={m} className="flex gap-2 text-ink-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">Passed: </span>
                <code className="text-xs">{m}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!failures.length && !matched.length && <p className="text-ink-300">{result.message}</p>}
    </div>
  );
}

function ExpectedTab({ result, expected }: { result: ExecuteResult | null; expected: Expected | null }) {
  if (!expected) return <p className="text-sm text-ink-400">No expected result for this item (quizzes, or not captured).</p>;
  const yoursResults = result?.results || [];
  const blocks: React.ReactNode[] = [];
  (expected.results || []).forEach((eg, i) => {
    const yg = yoursResults[i];
    if (!yg) {
      blocks.push(
        <div key={`r${i}`} className="space-y-1">
          <DataTable caption={`Expected result ${i + 1}`} columns={eg.columns} rows={eg.rows} />
          <p className="text-xs text-ink-400">Run your code to compare result {i + 1}.</p>
        </div>
      );
      return;
    }
    const d = diffGrids(eg, yg);
    const ok = gridsEqual(d);
    blocks.push(
      <div key={`r${i}`} className="space-y-1" data-testid="expected-vs-yours">
        <p className={clsx("text-sm font-medium", ok ? "text-accent" : "text-danger")}>
          Result {i + 1}: {ok ? "✓ matches" : `≠ ${d.summary.missing} missing, ${d.summary.extra} extra${d.columnsMatch ? "" : ", columns differ"}`}
        </p>
        <div className="grid gap-2 xl:grid-cols-2">
          <DataTable caption="Expected" columns={eg.columns} rows={d.expected.map((r) => r.row)} marks={d.expected.map((r) => r.mark)} />
          <DataTable caption="Yours" columns={yg.columns} rows={d.yours.map((r) => r.row)} marks={d.yours.map((r) => r.mark)} />
        </div>
      </div>
    );
  });
  if (expected.stdout && result?.stdout !== undefined) {
    const ops = diffLines(expected.stdout.trim(), (result.stdout || "").trim());
    const same = ops.every((o) => o.op === "=");
    blocks.push(
      <div key="out">
        <p className={clsx("mb-1 text-sm font-medium", same ? "text-accent" : "text-warn")}>Printed output {same ? "✓ matches" : "differs"}</p>
        <pre className="max-h-56 overflow-auto rounded-lg bg-ink-950 p-2 font-mono text-xs" aria-label="Output diff: minus is expected only, plus is yours only">
          {ops.map((o, i) => (
            <div key={i} className={clsx(o.op === "+" && "bg-accent/10 text-accent", o.op === "-" && "bg-danger/10 text-danger", o.op === "=" && "text-ink-300")}>
              {o.op === "=" ? "  " : `${o.op} `}
              {o.text}
            </div>
          ))}
        </pre>
      </div>
    );
  }
  if (expected.schema?.tables?.length && result?.schema) {
    const rows = diffSchema(expected.schema as never, result.schema as never);
    const bad = rows.filter((r) => !r.ok).length;
    blocks.push(
      <details key="schema" open={bad > 0}>
        <summary className={clsx("cursor-pointer text-sm font-medium", bad ? "text-danger" : "text-accent")}>
          Schema: {bad ? `${bad} difference(s)` : "✓ matches the reference"}
        </summary>
        <DataTable
          caption="Expected schema vs yours"
          columns={["table", "column", "expected", "yours"]}
          rows={rows.map((r) => [r.table, r.column || "", r.expected, r.yours])}
          marks={rows.map((r) => (r.ok ? "=" : "≠"))}
        />
      </details>
    );
  }
  if (!blocks.length) {
    const tables = Object.entries(expected.data || {});
    if (!tables.length) return <p className="text-sm text-ink-400">Run or Check to compare against the reference.</p>;
    return (
      <div className="space-y-2">
        {tables.map(([t, g]) => (
          <DataTable key={t} caption={`Expected rows in ${t}`} columns={g.columns} rows={g.rows} total={g.total} />
        ))}
      </div>
    );
  }
  return <div className="space-y-4">{blocks}</div>;
}

function DataTab({ result }: { result: ExecuteResult | null }) {
  const after = result?.dataAfter || {};
  const names = Object.keys(after);
  if (!names.length) return <p className="text-sm text-ink-400">Table contents before and after a Check appear here.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-300">
        Rows marked <b className="text-accent">+</b> were added, <b className="text-warn">~</b> changed and <b className="text-danger">−</b> removed by this run.
      </p>
      {names.map((t) => {
        const ch = diffSnapshot(result?.dataBefore?.[t], after[t]);
        const counts = { "+": 0, "-": 0, "~": 0 } as Record<string, number>;
        ch.forEach((c) => c.mark !== "=" && (counts[c.mark] += 1));
        return (
          <DataTable
            key={t}
            caption={`${t}: +${counts["+"]} ~${counts["~"]} −${counts["-"]}`}
            columns={after[t].columns}
            rows={ch.map((c) => c.row)}
            marks={ch.map((c) => c.mark)}
            changedCells={ch.map((c) => c.changed)}
            total={after[t].total}
            emptyText="Empty table."
          />
        );
      })}
    </div>
  );
}

function HistoryTab({ runs, onReplay }: { runs: TimelineRun[]; onReplay?: (id: number) => void }) {
  if (!runs.length) return <p className="text-sm text-ink-400">Your runs of this item will be listed here.</p>;
  const firstPass = runs.find((r) => r.success)?.id;
  return (
    <div className="space-y-2">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Run timeline">
        {runs.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onReplay?.(r.id)}
              title={`#${i + 1} ${r.mode.startsWith("run") ? "Run" : r.success ? "passed" : "failed"} — ${r.message}`}
              aria-label={`Attempt ${i + 1}: ${r.mode.startsWith("run") ? "run, not graded" : r.success ? "passed" : `failed (${r.rules.join(", ") || r.failureCount})`}. Load this code`}
              className={clsx(
                "flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-xs font-semibold",
                r.mode.startsWith("run") ? "border-ink-600 text-ink-300" : r.success ? "border-accent bg-accent/15 text-accent" : "border-danger/60 bg-danger/10 text-danger",
                r.id === firstPass && "ring-2 ring-accent"
              )}
            >
              {r.mode.startsWith("run") ? "▶" : r.success ? "✓" : "✗"}
            </button>
          </li>
        ))}
      </ol>
      <ul className="max-h-64 space-y-1 overflow-auto text-xs">
        {[...runs].reverse().map((r, i) => (
          <li key={r.id} className="flex items-baseline justify-between gap-2 border-b border-ink-800 py-1">
            <span className="text-ink-200">
              <b className={r.mode.startsWith("run") ? "text-ink-300" : r.success ? "text-accent" : "text-danger"}>
                #{runs.length - i} {r.mode.startsWith("run") ? "Run" : r.success ? "Passed" : "Failed"}
              </b>{" "}
              {r.rules.length ? r.rules.join(", ") : ""} {r.hintLevel ? `· hint ${r.hintLevel}` : ""}
            </span>
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => onReplay?.(r.id)}>
              Load code
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultPanel(p: Props) {
  const failures = p.result?.validation?.failures?.length || 0;
  const tabs = useMemo(
    () => [
      { id: "output", label: "Output", panel: <OutputTab result={p.result} marks={p.marks} onGoToLine={p.onGoToLine} /> },
      {
        id: "check",
        label: "Check",
        badge: failures ? <span className="rounded-full bg-danger/20 px-1.5 text-xs text-danger">{failures}</span> : null,
        panel: <CheckTab result={p.result} />,
      },
      { id: "expected", label: "Expected vs yours", panel: <ExpectedTab result={p.result} expected={p.expected} /> },
      { id: "data", label: "Data", panel: <DataTab result={p.result} /> },
      ...(p.extraTabs || []),
      { id: "history", label: `History${p.timeline.length ? ` (${p.timeline.length})` : ""}`, panel: <HistoryTab runs={p.timeline} onReplay={p.onReplay} /> },
    ],
    [p.result, p.marks, p.onGoToLine, p.expected, p.timeline, p.onReplay, p.extraTabs, failures]
  );
  return (
    <section aria-label="Results" className="space-y-3">
      <StatusBanner status={p.status} result={p.result} runLabel={p.runLabel} checkLabel={p.checkLabel} />
      <Tabs label="Result views" tabs={tabs} active={p.tab} onChange={p.onTab} />
    </section>
  );
}
