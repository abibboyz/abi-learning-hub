"use client";

import { useEffect, useState } from "react";
import { executeCode, fetchSolution } from "@/lib/api";
import type { ExecuteResult, Lesson, LessonExercise as Ex } from "@/types/hub";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { GateResult } from "@/components/lab/GateResult";
import clsx from "clsx";

type Props = {
  trackId: string;
  lesson: Lesson;
  /** Code to load instead of the starter (history replay). Changes to it are applied once. */
  replay?: { code: string; nonce: number } | null;
  onResult: (r: ExecuteResult) => void;
};

/** Runs a lesson's exercise through the same gate as tasks: code (schema/SQL/Zod) or a quiz. */
export function LessonExercise({ trackId, lesson, replay, onResult }: Props) {
  const ex: Ex | null = typeof lesson.exercise === "object" && lesson.exercise ? lesson.exercise : null;
  const isQuiz = ex?.kind === "quiz";
  const [code, setCode] = useState(ex?.starterCode || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(ex?.starterCode || "");
    setAnswers({});
    setResult(null);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!replay) return;
    if (isQuiz) {
      try {
        setAnswers(JSON.parse(replay.code).answers || {});
      } catch {
        setAnswers({});
      }
    } else setCode(replay.code);
    setResult(null);
  }, [replay?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ex) return null;
  if (!ex.runnable) {
    return (
      <div className="rounded-lg border border-ink-700 p-3 text-sm text-ink-300">
        <p className="text-xs uppercase tracking-wide text-ink-400 mb-1">Exercise</p>
        {ex.prompt}
      </div>
    );
  }

  async function run() {
    setBusy(true);
    try {
      const r = await executeCode({
        trackId,
        lessonId: lesson.id,
        code: isQuiz ? JSON.stringify({ answers }) : code,
      });
      setResult(r);
      onResult(r);
    } catch (e) {
      setResult({ success: false, gate: "client_error", message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function showSolution() {
    try {
      const s = await fetchSolution(trackId, "lessons", lesson.id);
      if (isQuiz) setAnswers(JSON.parse(s).answers || {});
      else setCode(s);
      setResult(null);
    } catch (e) {
      setResult({ success: false, gate: "client_error", message: `No solution available: ${e}` });
    }
  }

  const failedQuestions = new Set((result?.validation?.failures || []).map((f) => f.question).filter(Boolean));

  return (
    <section className="rounded-xl border border-accent/30 bg-ink-950/40 p-3 space-y-3" aria-label="Lesson exercise">
      <div>
        <p className="text-xs uppercase tracking-wide text-accent">Try it — checked by the lab gate</p>
        <p className="text-sm text-ink-100">{ex.prompt}</p>
        {ex.hint && (
          <details className="mt-1 text-sm text-ink-400">
            <summary className="cursor-pointer">Hint</summary>
            <p className="mt-1 text-ink-300">{ex.hint}</p>
          </details>
        )}
      </div>
      {isQuiz ? (
        <ol className="space-y-3">
          {(ex.questions || []).map((q, qi) => (
            <li key={q.id}>
              <fieldset className={clsx("rounded-lg border p-2", failedQuestions.has(q.id) ? "border-danger/60" : "border-ink-700")}>
                <legend className="px-1 text-sm text-ink-100">
                  {qi + 1}. {q.prompt}
                </legend>
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-start gap-2 py-0.5 text-sm text-ink-200">
                    <input
                      type="radio"
                      name={`${lesson.id}-${q.id}`}
                      value={o.id}
                      checked={answers[q.id] === o.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                      className="mt-1"
                    />
                    {o.text}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ol>
      ) : (
        <CodeEditor label={`Your ${ex.language || "code"}`} value={code} onChange={setCode} minHeight={220} />
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void run()}>
          {busy ? "Checking…" : isQuiz ? "Check answers" : "Run & check"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setCode(ex.starterCode || "");
            setAnswers({});
            setResult(null);
          }}
        >
          Reset
        </button>
        <button type="button" className="btn-ghost" onClick={() => void showSolution()}>
          Show solution
        </button>
      </div>
      {result && <GateResult result={result} />}
    </section>
  );
}
