"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  executeCode,
  fetchLessons,
  fetchSchema,
  fetchTasks,
  fetchTrack,
} from "@/lib/api";
import type { ExecuteResult, Lesson, Manifest, Schema, Task } from "@/types/hub";
import { SchemaDiagram } from "@/components/diagram/SchemaDiagram";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { PrereqPanel } from "@/components/lab/PrereqPanel";
import { DbTools } from "@/components/lab/DbTools";
import { HistoryPanel } from "@/components/lab/HistoryPanel";
import clsx from "clsx";

type Props = {
  trackId: string;
  mode: "topics" | "execute";
  onTrackChange: (id: string) => void;
};

const TRACK_OPTIONS = [
  { id: "python-sqlalchemy", label: "Python · SQLAlchemy" },
  { id: "node-typescript", label: "Node · TypeScript" },
  { id: "node-javascript", label: "Node · JavaScript" },
];

export function LabWorkspace({ trackId, mode, onTrackChange }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [code, setCode] = useState("");
  const [schema, setSchema] = useState<Schema | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [executing, setExecuting] = useState(false);
  const [highlightTables, setHighlightTables] = useState<string[]>([]);
  const [highlightRels, setHighlightRels] = useState<string[]>([]);
  const [runtimePanel, setRuntimePanel] = useState<string>("");
  const [valCat, setValCat] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || tasks[0] || null,
    [tasks, taskId]
  );

  const refreshSchema = useCallback(() => {
    fetchSchema(trackId)
      .then(setSchema)
      .catch(() => setSchema({ tables: [], relationships: [] }));
  }, [trackId]);

  useEffect(() => {
    setError(null);
    setResult(null);
    Promise.all([fetchTrack(trackId), fetchTasks(trackId), fetchLessons(trackId)])
      .then(([m, t, l]) => {
        setManifest(m);
        setTasks(t);
        setLessons(l);
        const first = t[0];
        setTaskId(first?.id || null);
        setCode(first?.starterCode || "");
        const panels = Object.keys(m.runtimePanels || {});
        setRuntimePanel(panels[0] || "");
      })
      .catch((e) => setError(String(e)));
    refreshSchema();
  }, [trackId, refreshSchema]);

  useEffect(() => {
    if (task) setCode(task.starterCode || "");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function run() {
    if (!task && mode === "execute") return;
    setExecuting(true);
    setResult(null);
    setHighlightTables([]);
    setHighlightRels([]);
    // animate during execution
    const pendingTables = task?.animation?.highlightTables || [];
    setHighlightTables(pendingTables);
    try {
      const res = await executeCode({
        trackId,
        taskId: mode === "execute" ? task?.id : null,
        code,
        mode: mode === "topics" ? "topic-exercise" : "execute",
      });
      setResult(res);
      if (res.schema) setSchema(res.schema);
      if (res.success && res.animation) {
        setHighlightTables(res.animation.highlightTables || []);
        setHighlightRels(res.animation.highlightRels || []);
        setTimeout(() => {
          setHighlightTables([]);
          setHighlightRels([]);
        }, 4000);
      } else if (!res.success) {
        setHighlightTables([]);
        setHighlightRels([]);
      }
    } catch (e) {
      setResult({ success: false, message: String(e), gate: "client_error" });
      setHighlightTables([]);
    } finally {
      setExecuting(false);
    }
  }

  const lesson = lessons[lessonIdx];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent">
            {mode === "topics" ? "Topic mode" : "Execute-only"}
          </p>
          <h1 className="text-2xl font-semibold text-white">Relationship lab</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border border-ink-600 bg-ink-900 px-3 py-2 text-sm"
            value={trackId}
            onChange={(e) => onTrackChange(e.target.value)}
          >
            {TRACK_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl border border-ink-600 overflow-hidden text-sm">
            <a
              href={`/lab?track=${trackId}&mode=topics`}
              className={clsx(
                "px-3 py-2",
                mode === "topics" ? "bg-accent text-ink-950" : "bg-ink-900 text-ink-200"
              )}
            >
              Topics
            </a>
            <a
              href={`/lab?track=${trackId}&mode=execute`}
              className={clsx(
                "px-3 py-2",
                mode === "execute" ? "bg-accent text-ink-950" : "bg-ink-900 text-ink-200"
              )}
            >
              Execute
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          API unavailable ({error}). Start with <code>docker compose up --build</code>.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
        <div className="space-y-4">
          {manifest?.prerequisites && (
            <PrereqPanel
              title={manifest.prerequisites.title || `${manifest.title} setup`}
              install={manifest.prerequisites.install || ""}
              code={manifest.prerequisites.code || manifest.prerequisites.setupCode || ""}
              lockedByDefault={manifest.prerequisites.lockedByDefault ?? true}
            />
          )}

          {mode === "topics" && lesson && (
            <div className="card p-4 space-y-3 animate-fade-up">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-white">
                  {lesson.order}. {lesson.title}
                </h2>
                <span className="text-xs text-ink-400">
                  {lessonIdx + 1}/{lessons.length}
                </span>
              </div>
              <p className="text-sm text-ink-200 whitespace-pre-wrap">{lesson.body || lesson.summary || ""}</p>
              {lesson.example && (
                <p className="text-xs text-accent">{typeof lesson.example === "string" ? lesson.example : lesson.example.code || ""}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={lessonIdx === 0}
                  onClick={() => setLessonIdx((i) => Math.max(0, i - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={lessonIdx >= lessons.length - 1}
                  onClick={() => setLessonIdx((i) => Math.min(lessons.length - 1, i + 1))}
                >
                  Next topic
                </button>
              </div>
            </div>
          )}

          {mode === "execute" && (
            <div className="card p-3">
              <div className="flex gap-1 overflow-x-auto pb-1">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaskId(t.id)}
                    className={clsx(
                      "shrink-0 rounded-lg px-2.5 py-1.5 text-xs",
                      t.id === task?.id
                        ? "bg-accent text-ink-950"
                        : "bg-ink-800 text-ink-300 hover:bg-ink-700"
                    )}
                  >
                    {t.order}. {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {task && (
            <div className="card p-4 space-y-3">
              <div>
                <h2 className="text-lg font-medium text-white">{task.title}</h2>
                <p className="text-sm text-ink-300">{task.summary || task.description}</p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-200">
                {task.objectives?.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              {task.hints && (
                <details className="text-sm text-ink-400">
                  <summary className="cursor-pointer text-ink-300">Hints</summary>
                  <ul className="mt-2 list-disc pl-5">
                    {task.hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </details>
              )}
              {task.sqlEquivalent && (
                <details open className="text-sm">
                  <summary className="cursor-pointer text-accent">Equivalent SQL</summary>
                  <pre className="mt-2 overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] text-ink-200">
                    {task.sqlEquivalent}
                  </pre>
                </details>
              )}
              <CodeEditor
                label="Your ORM / schema code"
                value={code}
                onChange={setCode}
                minHeight={280}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={executing} onClick={() => void run()}>
                  {executing ? "Running…" : "Run & validate"}
                  <span className="kbd !text-[10px]">⌘↵</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => task && setCode(task.starterCode)}
                >
                  Reset starter
                </button>
              </div>
              {result && (
                <div
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-sm animate-fade-up",
                    result.success
                      ? "border-accent/40 bg-accent/10 text-accent-glow"
                      : "border-danger/40 bg-danger/10 text-danger"
                  )}
                >
                  <p className="font-medium">
                    {result.gate}: {result.message}
                  </p>
                  {result.validation?.errors?.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {result.validation.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  {result.note && <p className="mt-1 text-ink-300">{result.note}</p>}
                </div>
              )}
            </div>
          )}

          {manifest?.runtimePanels && (
            <div className="card p-4 space-y-2">
              <h3 className="font-medium text-white">Runtime context</h3>
              <div className="flex flex-wrap gap-1">
                {Object.entries(manifest.runtimePanels).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className={clsx(
                      "rounded-lg px-2 py-1 text-xs",
                      runtimePanel === k ? "bg-accent text-ink-950" : "bg-ink-800 text-ink-300"
                    )}
                    onClick={() => setRuntimePanel(k)}
                  >
                    {v.title}
                  </button>
                ))}
              </div>
              {runtimePanel && manifest.runtimePanels[runtimePanel] && (
                <ul className="list-disc pl-5 text-sm text-ink-300">
                  {manifest.runtimePanels[runtimePanel].points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {manifest?.validationCatalog && manifest.validationCatalog.length > 0 && (
            <div className="card p-4 space-y-2">
              <h3 className="font-medium text-white">Validation & ecosystem</h3>
              <div className="flex flex-wrap gap-1">
                {manifest.validationCatalog.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={clsx(
                      "rounded-lg px-2 py-1 text-xs",
                      valCat === i ? "bg-accent text-ink-950" : "bg-ink-800 text-ink-300"
                    )}
                    onClick={() => setValCat(i)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
              <pre className="overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] text-accent-glow">
                {manifest.validationCatalog[valCat]?.example}
              </pre>
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <SchemaDiagram
            schema={schema}
            highlightTables={highlightTables}
            highlightRels={highlightRels}
            executing={executing}
          />
          <HistoryPanel trackId={trackId} />
          <DbTools trackId={trackId} onSchema={refreshSchema} />
        </div>
      </div>
    </div>
  );
}
