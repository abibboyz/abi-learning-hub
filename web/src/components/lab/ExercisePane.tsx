"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowRight, Check, Lightbulb, Play, RotateCcw } from "lucide-react";
import {
  executeCode,
  fetchExpected,
  fetchHintsUsed,
  fetchHistoryDetail,
  fetchSolution,
  fetchTimeline,
  resetTask,
  revealHints,
  type ItemKind,
} from "@/lib/api";
import type { ExecuteResult, Expected, Hint, QuizQuestion, Schema, TimelineRun } from "@/types/hub";
import { CodeEditor, type CodeEditorHandle } from "@/components/editor/CodeEditor";
import { ResultPanel, statusText, type RunStatus } from "@/components/lab/ResultPanel";
import { HintTray } from "@/components/lab/HintTray";
import { PlanView } from "@/components/lab/PlanView";
import { marksFrom, nextErrorLine } from "@/lib/lab/diagnostics";
import { isMacPlatform, matchShortcut, shortcutLabel } from "@/lib/lab/shortcuts";

export type ExerciseItem = {
  kind: ItemKind;
  id: string;
  language?: string;
  starterCode: string;
  quiz?: QuizQuestion[];
  editorLabel: string;
};

type Props = {
  trackId: string;
  item: ExerciseItem;
  replay?: { id: number; nonce: number } | null;
  hasNext: boolean;
  onNext: () => void;
  onResult: (r: ExecuteResult | null) => void;
  onPassed: () => void;
  onAssisted: () => void;
  onSchema: (s: Schema) => void;
  onHistoryChanged?: () => void;
};

const TIMEOUT = /timed out|timeout|canceling statement due to statement timeout/i;

export function statusOf(r: ExecuteResult): RunStatus {
  if (r.gate === "passed" || (r.success && r.checked !== false)) return "passed";
  if (r.gate === "ran") return "ran";
  if (r.gate === "validation_failed") return "failed";
  if (TIMEOUT.test(r.message || "")) return "timeout";
  return "error";
}

/** Editor (or quiz) + Run / Check / Hint / Reset + results — the same for tasks and lesson exercises. */
export function ExercisePane({ trackId, item, replay, hasNext, onNext, onResult, onPassed, onAssisted, onSchema, onHistoryChanged }: Props) {
  const isQuiz = Boolean(item.quiz);
  const [code, setCode] = useState(item.starterCode);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RunStatus>("idle");
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [expected, setExpected] = useState<Expected | null>(null);
  const [timeline, setTimeline] = useState<TimelineRun[]>([]);
  const [hints, setHints] = useState<Hint[]>([]);
  const [hintTotal, setHintTotal] = useState(3);
  const [showHints, setShowHints] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [tab, setTab] = useState("output");
  const [selection, setSelection] = useState("");
  const [mac, setMac] = useState(false);
  const [notice, setNotice] = useState("");
  const editor = useRef<CodeEditorHandle>(null);
  const lastErrLine = useRef(0);

  useEffect(() => setMac(isMacPlatform(navigator.platform)), []);

  const loadTimeline = useCallback(() => {
    fetchTimeline(trackId, item.kind, item.id)
      .then((t) => setTimeline(t.runs))
      .catch(() => setTimeline([]));
  }, [trackId, item.kind, item.id]);

  // New item: fresh state + its expected result, run timeline and hints already used.
  useEffect(() => {
    setCode(item.starterCode);
    setAnswers({});
    setStatus("idle");
    setResult(null);
    onResult(null);
    setHints([]);
    setShowHints(false);
    setTab("output");
    setNotice("");
    setExpected(null);
    fetchExpected(trackId, item.kind, item.id).then(setExpected).catch(() => setExpected(null));
    fetchHintsUsed(trackId, item.kind, item.id)
      .then((h) => {
        setHintTotal(h.total);
        setHints(h.hints || []);
      })
      .catch(() => {});
    loadTimeline();
  }, [trackId, item.kind, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (replay) void loadRun(replay.id);
  }, [replay?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRun(id: number) {
    try {
      const d = await fetchHistoryDetail(trackId, id);
      if (isQuiz) {
        try {
          setAnswers(JSON.parse(d.code).answers || {});
        } catch {
          setAnswers({});
        }
      } else setCode(d.code);
      setStatus("dirty");
      setNotice(`Loaded the code from run #${id}. Run or Check it again.`);
    } catch (e) {
      setNotice(`Could not load run #${id}: ${e}`);
    }
  }

  const marks = useMemo(
    () => marksFrom(result?.validation?.failures || [], result?.traceback, code.split("\n").length),
    [result, code]
  );

  async function exec(scratch: boolean) {
    if (status === "running") return;
    if (scratch && isQuiz) {
      setNotice("Quizzes have nothing to run — press Check.");
      return;
    }
    setStatus("running");
    setNotice("");
    try {
      const r = await executeCode({
        trackId,
        taskId: item.kind === "task" ? item.id : undefined,
        lessonId: item.kind === "lesson" ? item.id : undefined,
        code: isQuiz ? JSON.stringify({ answers }) : code,
        scratch,
      });
      const st = statusOf(r);
      setResult(r);
      onResult(r);
      setStatus(st);
      if (r.schema) onSchema(r.schema);
      if (st === "passed") {
        onPassed();
        setTab(expected?.results?.length ? "expected" : "check");
      } else if (st === "failed") setTab("check");
      else setTab("output");
      loadTimeline();
      onHistoryChanged?.();
    } catch (e) {
      const r: ExecuteResult = { success: false, gate: "client_error", message: `Could not reach the lab: ${e}` };
      setResult(r);
      setStatus("error");
    }
  }

  async function moreHints() {
    setHintBusy(true);
    setShowHints(true);
    try {
      const h = await revealHints(trackId, item.kind, item.id, Math.min(3, hints.length + 1));
      setHints(h.hints);
      setHintTotal(h.total);
      onAssisted();
    } catch (e) {
      setNotice(`No hints available: ${e}`);
    } finally {
      setHintBusy(false);
    }
  }

  async function revealSolution() {
    try {
      const s = await fetchSolution(trackId, item.kind === "task" ? "tasks" : "lessons", item.id);
      if (isQuiz) setAnswers(JSON.parse(s).answers || {});
      else setCode(s);
      setStatus("dirty");
      onAssisted();
      setNotice("Reference solution loaded. Read it, then press Check.");
    } catch (e) {
      setNotice(`No solution available: ${e}`);
    }
  }

  async function reset() {
    if (!window.confirm("Reset this exercise? Your code goes back to the starter and its tables are dropped. Hint history is kept.")) return;
    try {
      const r = await resetTask(trackId, item.kind, item.id);
      setCode(r.starterCode || item.starterCode);
      setAnswers({});
      setResult(null);
      onResult(null);
      setStatus("idle");
      if (r.schema) onSchema(r.schema);
      setNotice(r.message);
    } catch {
      setCode(item.starterCode);
      setStatus("idle");
      setNotice("Code reset to the starter (the lab API did not answer, so tables were not dropped).");
    }
  }

  function goNextError() {
    const l = nextErrorLine(marks, lastErrLine.current);
    if (l) {
      lastErrLine.current = l;
      editor.current?.focusLine(l);
    }
  }

  // Window shortcuts (the editor handles its own ⌘Enter; it calls preventDefault so we skip those).
  const handlers = useRef({ exec, moreHints, goNextError, status, hasNext, onNext });
  handlers.current = { exec, moreHints, goNextError, status, hasNext, onNext };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const inEditor = Boolean(t?.closest?.(".cm-editor") || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || ""));
      const id = matchShortcut(e, inEditor);
      const h = handlers.current;
      if (id === "run") void h.exec(true);
      else if (id === "check") {
        if (h.status === "passed" && h.hasNext) h.onNext();
        else void h.exec(false);
      } else if (id === "hint") void h.moreHints();
      else if (id === "nextError") h.goNextError();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runKeys = shortcutLabel("run", mac);
  const checkKeys = shortcutLabel("check", mac);
  const hintKeys = shortcutLabel("hint", mac);
  const passed = status === "passed";
  const failedQ = new Set((result?.validation?.failures || []).map((f) => f.question).filter(Boolean));

  const extraTabs = useMemo(
    () => (trackId === "sql-postgres" && !isQuiz ? [{ id: "plan", label: "Plan", panel: <PlanView code={code} selection={selection} /> }] : []),
    [trackId, isQuiz, code, selection]
  );

  return (
    <div className="space-y-3" data-testid="exercise-pane" data-status={status}>
      {isQuiz ? (
        <ol className="space-y-3" aria-label="Quiz">
          {(item.quiz || []).map((q, qi) => (
            <li key={q.id}>
              <fieldset className={clsx("rounded-lg border p-3", failedQ.has(q.id) ? "border-danger/60" : "border-ink-700")}>
                <legend className="px-1 text-sm text-ink-100">
                  {qi + 1}. {q.prompt}
                  {failedQ.has(q.id) && <span className="ml-2 text-danger">✗ not yet</span>}
                </legend>
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-start gap-2 py-1 text-sm text-ink-200">
                    <input
                      type="radio"
                      name={`${item.id}-${q.id}`}
                      value={o.id}
                      checked={answers[q.id] === o.id}
                      onChange={() => {
                        setAnswers((a) => ({ ...a, [q.id]: o.id }));
                        setStatus("dirty");
                      }}
                      className="mt-1 accent-[rgb(var(--accent))]"
                    />
                    {o.text}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ol>
      ) : (
        <CodeEditor
          ref={editor}
          label={item.editorLabel}
          language={item.language}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (status !== "running") setStatus("dirty");
          }}
          minHeight={260}
          marks={marks}
          onRun={() => void exec(true)}
          onCheck={() => (passed && hasNext ? onNext() : void exec(false))}
          onSelectionChange={setSelection}
        />
      )}

      <div
        className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-t border-ink-700 bg-ink-950/95 px-1 py-2 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-0"
        role="toolbar"
        aria-label="Exercise actions"
      >
        {!isQuiz && (
          <button type="button" className="btn-ghost" onClick={() => void exec(true)} disabled={status === "running"} title={`Run — execute only, no grading (${runKeys})`} data-testid="run-btn">
            <Play className="h-4 w-4" aria-hidden />
            Run
          </button>
        )}
        {passed && hasNext ? (
          <button type="button" className="btn-primary" onClick={onNext} title={`Next item (${checkKeys})`} data-testid="next-btn">
            Next <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => void exec(false)} disabled={status === "running"} title={`Check — run and grade (${checkKeys})`} data-testid="check-btn">
            <Check className="h-4 w-4" aria-hidden />
            {status === "running" ? "Running…" : "Check"}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => (showHints ? setShowHints(false) : hints.length ? setShowHints(true) : void moreHints())} title={`Hint (${hintKeys})`} aria-expanded={showHints} data-testid="hint-btn">
          <Lightbulb className="h-4 w-4" aria-hidden />
          Hint{hints.length ? ` ${hints.length}/${hintTotal}` : ""}
        </button>
        <button type="button" className="btn-ghost ml-auto" onClick={() => void reset()} title="Reset this exercise to its starter">
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset
        </button>
        <span className="hidden text-xs text-ink-400 xl:inline">
          <kbd className="kbd">{runKeys}</kbd> run · <kbd className="kbd">{checkKeys}</kbd> check
        </span>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusText(status, result)}
      </p>
      {notice && (
        <p className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200" role="status">
          {notice}
        </p>
      )}

      {showHints && (
        <HintTray hints={hints} total={hintTotal} busy={hintBusy} onMore={() => void moreHints()} onSolution={() => void revealSolution()} hintLabel={hintKeys} onClose={() => setShowHints(false)} />
      )}

      <ResultPanel
        status={status}
        result={result}
        expected={expected}
        marks={marks}
        onGoToLine={(l) => editor.current?.focusLine(l)}
        timeline={timeline}
        onReplay={(id) => void loadRun(id)}
        tab={tab}
        onTab={setTab}
        extraTabs={extraTabs}
        runLabel={runKeys}
        checkLabel={checkKeys}
      />
    </div>
  );
}
