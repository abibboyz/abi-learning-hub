"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { PwExecuteResult, PwFinding, PwLog, PwTestResult } from "@/types/hub";

const STATUS_STYLE: Record<string, string> = {
  passed: "bg-accent/15 text-accent border-accent/30",
  failed: "bg-danger/15 text-danger border-danger/30",
  timedOut: "bg-danger/15 text-danger border-danger/30",
  flaky: "bg-warn/15 text-warn border-warn/30",
  skipped: "bg-ink-700/40 text-ink-300 border-ink-600",
};

const GATE_LABEL: Record<string, string> = {
  passed: "Passed",
  rejected: "Not run — rejected",
  static_failed: "Rules not met",
  tests_failed: "Tests failed",
  flaky: "Flaky",
  weak_test: "Weak test",
  runtime_error: "Run error",
  busy: "Runner busy",
  bad_request: "Bad request",
  not_found: "Not found",
  runner_error: "Runner error",
};

/** Artifacts are served by pw-runner under /pw/...; the browser reaches them via the BFF at /api/pw/... */
export const artifactHref = (u: string) => `/api${u}`;
export function traceViewerHref(trace: string): string {
  const abs = typeof window !== "undefined" ? `${window.location.origin}/api${trace}` : `/api${trace}`;
  return `/api/pw/trace-viewer/index.html?trace=${encodeURIComponent(abs)}`;
}

function Finding({ f, onJump }: { f: PwFinding; onJump?: (line: number) => void }) {
  return (
    <li className="flex gap-2">
      <span className={clsx("kbd shrink-0", f.severity === "warning" ? "text-warn" : "text-danger")}>{f.rule}</span>
      <span className="text-ink-200">
        {f.message}
        {f.line && onJump ? (
          <button type="button" className="ml-2 text-accent hover:underline" onClick={() => onJump(f.line!)}>
            line {f.line}
          </button>
        ) : null}
      </span>
    </li>
  );
}

function LogTable({ log, kind }: { log: PwLog[]; kind: "console" | "network" }) {
  const rows = log.filter((l) => (kind === "console" ? l.kind === "console" || l.kind === "pageerror" : l.kind === "request" || l.kind === "requestfailed"));
  if (!rows.length) return <p className="text-xs text-ink-500">No {kind} entries recorded for this test.</p>;
  return (
    <div className="max-h-60 overflow-auto rounded-lg border border-ink-800">
      <table className="w-full text-left font-mono text-xs">
        <tbody>
          {rows.map((l, i) => (
            <tr key={i} className="border-b border-ink-800/60 align-top">
              <td className="px-2 py-1 text-ink-500 whitespace-nowrap">+{l.at}ms</td>
              {kind === "console" ? (
                <>
                  <td className={clsx("px-2 py-1", l.kind === "pageerror" || l.level === "error" ? "text-danger" : l.level === "warning" ? "text-warn" : "text-ink-300")}>
                    {l.kind === "pageerror" ? "pageerror" : l.level}
                  </td>
                  <td className="px-2 py-1 text-ink-100 break-all">{l.text}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-1 text-ink-300">{l.method}</td>
                  <td className={clsx("px-2 py-1", l.kind === "requestfailed" || (l.status ?? 0) >= 400 ? "text-danger" : "text-accent")}>
                    {l.kind === "requestfailed" ? "failed" : l.status}
                  </td>
                  <td className="px-2 py-1 text-ink-100 break-all">{l.url || l.text}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TestDetail({ t, onJump }: { t: PwTestResult; onJump: (line: number) => void }) {
  const [tab, setTab] = useState<"error" | "screens" | "console" | "network">(t.error ? "error" : "screens");
  useEffect(() => setTab(t.error ? "error" : "screens"), [t.id, t.error]);
  return (
    <div className="space-y-3 rounded-xl border border-ink-700/60 bg-ink-950/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-white">{t.titlePath.join(" › ")}</span>
        <span className="text-xs text-ink-400">({t.project})</span>
        <div className="ml-auto flex gap-2">
          {t.trace && (
            <>
              <a className="btn-primary text-xs" href={traceViewerHref(t.trace)} target="_blank" rel="noopener noreferrer">
                Open trace viewer
              </a>
              <a className="btn-ghost text-xs" href={artifactHref(t.trace)} download>
                trace.zip
              </a>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-1 text-xs" role="tablist" aria-label="Test details">
        {(["error", "screens", "console", "network"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            type="button"
            className={clsx("rounded-md px-2 py-1", tab === k ? "bg-accent/20 text-accent" : "text-ink-300 hover:bg-ink-800")}
            onClick={() => setTab(k)}
          >
            {k === "error" ? "Error" : k === "screens" ? `Screenshots (${t.screenshots.length})` : k === "console" ? "Console" : "Network"}
          </button>
        ))}
      </div>
      {tab === "error" &&
        (t.error ? (
          <div className="space-y-2">
            {t.error.line && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => onJump(t.error!.line!)}>
                {t.error.file || "your file"}:{t.error.line}
                {t.error.column ? `:${t.error.column}` : ""} — show in editor
              </button>
            )}
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-2 text-xs text-danger">{t.error.message}</pre>
            {t.error.snippet && <pre className="max-h-40 overflow-auto rounded-lg bg-ink-950 p-2 text-xs text-ink-200">{t.error.snippet}</pre>}
          </div>
        ) : (
          <p className="text-xs text-ink-400">No error — every repetition passed.</p>
        ))}
      {tab === "screens" &&
        (t.screenshots.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {t.screenshots.map((s) => (
              <a key={s} href={artifactHref(s)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-ink-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artifactHref(s)} alt={`Screenshot: ${s.split("/").pop()}`} className="w-full" loading="lazy" />
                <span className="block truncate px-2 py-1 text-xs text-ink-400">{s.split("/").pop()}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-400">No screenshots for this test.</p>
        ))}
      {tab === "console" && <LogTable log={t.log} kind="console" />}
      {tab === "network" && <LogTable log={t.log} kind="network" />}
    </div>
  );
}

export function PwResults({ result, running, onJump }: { result: PwExecuteResult | null; running: boolean; onJump: (line: number) => void }) {
  const tests = useMemo(() => result?.run?.tests || [], [result]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const firstBad = tests.find((t) => t.status !== "passed") || tests[0];
    setSel(firstBad?.id || null);
  }, [tests]);

  if (running) {
    return (
      <div className="card p-4 text-sm text-ink-300" aria-live="polite">
        Running in Chromium… tasks run every test 3× (flakiness check) plus the planted-bug check.
      </div>
    );
  }
  if (!result) {
    return <div className="card p-4 text-sm text-ink-400">Run your test to see per-test results, the failing line, screenshots, the trace and console/network logs.</div>;
  }
  const selected = tests.find((t) => t.id === sel) || null;
  return (
    <div className="card space-y-3 p-4" aria-live="polite">
      <div className={clsx("rounded-xl border px-3 py-2", result.success ? "border-accent/40 bg-accent/10" : "border-danger/40 bg-danger/10")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("font-semibold", result.success ? "text-accent" : "text-danger")}>{GATE_LABEL[result.gate] || result.gate}</span>
          <span className="text-sm text-ink-200">{result.message}</span>
          {result.run && <span className="ml-auto text-xs text-ink-400">{(result.run.durationMs / 1000).toFixed(1)} s</span>}
        </div>
      </div>

      {result.reasons && result.reasons.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Why it did not pass</p>
          <ul className="space-y-1 text-sm">{result.reasons.map((f, i) => <Finding key={i} f={f} onJump={onJump} />)}</ul>
        </div>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Suggestions</p>
          <ul className="space-y-1 text-sm">{result.warnings.map((f, i) => <Finding key={i} f={f} onJump={onJump} />)}</ul>
        </div>
      )}

      {result.run?.mutants && result.run.mutants.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 uppercase tracking-wide text-ink-400">Planted-bug check</p>
          <div className="flex flex-wrap gap-1.5">
            {result.run.mutants.map((m) => (
              <span key={m.bug} className={clsx("rounded-md border px-2 py-0.5", m.status === "caught" ? STATUS_STYLE.passed : m.status === "missed" ? STATUS_STYLE.failed : STATUS_STYLE.skipped)}>
                {m.bug}: {m.status === "caught" ? "caught ✓" : m.status === "missed" ? "missed ✗" : "not run"}
              </span>
            ))}
          </div>
        </div>
      )}

      {tests.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Tests ({tests.length})</p>
          <ul className="divide-y divide-ink-800 rounded-xl border border-ink-800">
            {tests.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSel(t.id)}
                  aria-pressed={sel === t.id}
                  className={clsx("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-800/60", sel === t.id && "bg-ink-800/80")}
                >
                  <span className={clsx("rounded-md border px-1.5 py-0.5 text-xs uppercase", STATUS_STYLE[t.status])}>{t.status}</span>
                  <span className="truncate text-ink-100">{t.titlePath.join(" › ")}</span>
                  {t.project !== "chromium" && <span className="text-xs text-ink-500">{t.project}</span>}
                  <span className="ml-auto flex items-center gap-1" title="Each repetition (repeat-each)">
                    {t.runs.map((r, i) => (
                      <span key={i} className={clsx("h-2 w-2 rounded-full", r.status === "passed" ? "bg-accent" : r.status === "skipped" ? "bg-ink-600" : "bg-danger")} />
                    ))}
                  </span>
                  <span className="w-14 text-right text-xs text-ink-400">{t.durationMs} ms</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selected && <TestDetail t={selected} onJump={onJump} />}

      {result.run?.globalErrors && result.run.globalErrors.length > 0 && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Run errors</p>
          {result.run.globalErrors.map((e, i) => (
            <pre key={i} className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-2 text-xs text-danger">
              {e.line ? `line ${e.line}: ` : ""}
              {e.message}
            </pre>
          ))}
        </div>
      )}
      {result.run?.output && !result.success && tests.length === 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-400">Runner output</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-2 text-ink-300">{result.run.output}</pre>
        </details>
      )}
    </div>
  );
}
