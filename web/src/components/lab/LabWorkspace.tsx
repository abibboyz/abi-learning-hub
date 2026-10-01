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

function RefList({ refs }: { refs?: Array<{ title: string; url: string }> }) {
  if (!refs?.length) return null;
  return (
    <div className="text-sm">
      <p className="text-xs uppercase tracking-wide text-ink-400 mb-1">References</p>
      <ul className="space-y-1">
        {refs.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {r.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [passedIds, setPassedIds] = useState<Set<string>>(() => new Set());

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || tasks[0] || null,
    [tasks, taskId]
  );

  const progressPct = tasks.length
    ? Math.round((passedIds.size / tasks.length) * 100)
    : 0;

  const refreshSchema = useCallback(() => {
    fetchSchema(trackId)
      .then(setSchema)
      .catch(() => setSchema({ tables: [], relationships: [] }));
  }, [trackId]);

  useEffect(() => {
    setError(null);
    setResult(null);
    setLoading(true);
    setPassedIds(new Set());
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
        setLessonIdx(0);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
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
        if (task?.id) {
          setPassedIds((prev) => new Set(prev).add(task.id));
        }
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
  const teachAlong =
    (result?.success && (result.teachAlong || task?.teachAlong)) ||
    (!result?.success && result ? undefined : task?.teachAlong);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent">
            {mode === "topics" ? "Topic mode" : "Execute-only"} · one platform
          </p>
          <h1 className="text-2xl font-semibold text-white">Relationship lab</h1>
          <p className="text-sm text-ink-400">
            Switch tracks here — Docker stays the same.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="track-picker">
            Learning track
          </label>
          <select
            id="track-picker"
            className="rounded-xl border border-ink-600 bg-ink-900 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            value={trackId}
            onChange={(e) => onTrackChange(e.target.value)}
          >
            {TRACK_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <div
            className="flex rounded-xl border border-ink-600 overflow-hidden text-sm"
            role="tablist"
            aria-label="Lab mode"
          >
            <a
              href={`/lab?track=${trackId}&mode=topics`}
              role="tab"
              aria-selected={mode === "topics"}
              className={clsx(
                "px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                mode === "topics" ? "bg-accent text-ink-950" : "bg-ink-900 text-ink-200"
              )}
            >
              Topics
            </a>
            <a
              href={`/lab?track=${trackId}&mode=execute`}
              role="tab"
              aria-selected={mode === "execute"}
              className={clsx(
                "px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                mode === "execute" ? "bg-accent text-ink-950" : "bg-ink-900 text-ink-200"
              )}
            >
              Execute
            </a>
          </div>
        </div>
      </div>

      {mode === "execute" && tasks.length > 0 && (
        <div
          className="card px-4 py-3 flex flex-wrap items-center gap-3"
          aria-label="Task progress"
        >
          <div className="flex-1 min-w-[160px]">
            <div className="flex justify-between text-xs text-ink-400 mb-1">
              <span>
                Progress {passedIds.size}/{tasks.length} tasks passed this session
              </span>
              <span>{progressPct}%</span>
            </div>
            <div
              className="h-2 rounded-full bg-ink-800 overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          Hub API unavailable ({error}). Start with{" "}
          <code className="text-ink-100">docker compose up --build</code> and open{" "}
          <code className="text-ink-100">http://localhost:3000</code> — track selection stays
          in-app.
        </div>
      )}

      {loading && !error && (
        <div className="card p-6 text-ink-400" aria-live="polite">
          Loading track content…
        </div>
      )}

      {!loading && !error && mode === "execute" && tasks.length === 0 && (
        <div className="card p-6 text-ink-300" role="status">
          No tasks found for this track yet. Check <code className="text-accent">tracks/{trackId}/tasks</code>.
        </div>
      )}

      {!loading && !error && mode === "topics" && lessons.length === 0 && (
        <div className="card p-6 text-ink-300" role="status">
          No lessons found for this track yet.
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
            <article className="card p-4 space-y-3 animate-fade-up">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-white">
                  {lesson.order}. {lesson.title}
                </h2>
                <span className="text-xs text-ink-400">
                  {lessonIdx + 1}/{lessons.length}
                </span>
              </div>
              <p className="text-sm text-ink-200 whitespace-pre-wrap">
                {lesson.body || lesson.summary || ""}
              </p>
              {lesson.why && (
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm text-ink-200">
                  <p className="text-xs uppercase tracking-wide text-accent mb-1">Why</p>
                  {lesson.why}
                </div>
              )}
              {lesson.objectives && lesson.objectives.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400 mb-1">
                    Learning objectives
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink-200">
                    {lesson.objectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lesson.pitfalls && lesson.pitfalls.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-warn mb-1">
                    Common pitfalls
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink-300">
                    {lesson.pitfalls.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lesson.mappingNotes && (
                <p className="text-sm text-ink-300">
                  <span className="text-accent">SQL ↔ ORM:</span> {lesson.mappingNotes}
                </p>
              )}
              {lesson.teachAlong && (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
                  {lesson.teachAlong.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {lesson.example && (
                <pre className="overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] text-accent-glow">
                  {typeof lesson.example === "string"
                    ? lesson.example
                    : lesson.example.code || ""}
                </pre>
              )}
              <RefList refs={lesson.references} />
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
            </article>
          )}

          {mode === "execute" && tasks.length > 0 && (
            <div className="card p-3">
              <div className="flex gap-1 overflow-x-auto pb-1" role="listbox" aria-label="Tasks">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={t.id === task?.id}
                    onClick={() => setTaskId(t.id)}
                    className={clsx(
                      "shrink-0 rounded-lg px-2.5 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      t.id === task?.id
                        ? "bg-accent text-ink-950"
                        : "bg-ink-800 text-ink-300 hover:bg-ink-700",
                      passedIds.has(t.id) && t.id !== task?.id && "ring-1 ring-accent/50"
                    )}
                  >
                    {passedIds.has(t.id) ? "✓ " : ""}
                    {t.order}. {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {task && (mode === "execute" || mode === "topics") && mode === "execute" && (
            <div className="card p-4 space-y-3">
              <div>
                <h2 className="text-lg font-medium text-white">{task.title}</h2>
                <p className="text-sm text-ink-300 whitespace-pre-wrap">
                  {task.summary || task.description}
                </p>
              </div>
              {task.why && (
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm text-ink-200">
                  <p className="text-xs uppercase tracking-wide text-accent mb-1">Why</p>
                  {task.why}
                </div>
              )}
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-200">
                {task.objectives?.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
              {task.pitfalls && task.pitfalls.length > 0 && (
                <details className="text-sm text-ink-400">
                  <summary className="cursor-pointer text-warn">Common pitfalls</summary>
                  <ul className="mt-2 list-disc pl-5 text-ink-300">
                    {task.pitfalls.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </details>
              )}
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
              {task.mappingNotes && (
                <p className="text-sm text-ink-300">
                  <span className="text-accent">SQL ↔ ORM:</span> {task.mappingNotes}
                </p>
              )}
              {task.sqlEquivalent && (
                <details open className="text-sm">
                  <summary className="cursor-pointer text-accent">Equivalent SQL</summary>
                  <pre className="mt-2 overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] text-ink-200">
                    {task.sqlEquivalent}
                  </pre>
                </details>
              )}
              <RefList refs={task.references} />
              <CodeEditor
                label="Your ORM / schema code"
                value={code}
                onChange={setCode}
                minHeight={280}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={executing}
                  onClick={() => void run()}
                >
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
                  role="status"
                  aria-live="polite"
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
                  {result.success && (result.teachAlong || task.teachAlong) && (
                    <ol className="mt-2 list-decimal pl-4 text-ink-200">
                      {(result.teachAlong || task.teachAlong || []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
              {!result && teachAlong && (
                <div className="rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-sm text-ink-300">
                  <p className="text-xs uppercase tracking-wide text-ink-400 mb-1">
                    Teach-along (cause → effect)
                  </p>
                  <ol className="list-decimal pl-4 space-y-1">
                    {teachAlong.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
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
                      "rounded-lg px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
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
                      "rounded-lg px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
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
