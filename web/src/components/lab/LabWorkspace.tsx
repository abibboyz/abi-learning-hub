"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { fetchHistoryDetail, fetchLessons, fetchSchema, fetchTasks, fetchTrack, fetchTracks, type HistoryDetail } from "@/lib/api";
import type { ExecuteResult, Lesson, Manifest, RefLink, Schema, Task } from "@/types/hub";
import { SchemaDiagram } from "@/components/diagram/SchemaDiagram";
import { PrereqPanel } from "@/components/lab/PrereqPanel";
import { DbTools } from "@/components/lab/DbTools";
import { HistoryPanel } from "@/components/lab/HistoryPanel";
import { ExercisePane, type ExerciseItem } from "@/components/lab/ExercisePane";
import { ItemList } from "@/components/lab/ItemList";
import { Checklist } from "@/components/lab/Checklist";
import { buildChecklist, tickChecklist, type Req } from "@/lib/lab/checklist";
import { continueId, itemStates, loadProgress, markAssisted, markPassed, saveProgress, type ProgressState } from "@/lib/lab/progress";

type Props = {
  trackId: string;
  mode: "topics" | "execute";
  onTrackChange: (id: string) => void;
};

/** Used until /api/tracks answers; the picker then lists every track in tracks/index.json. */
const TRACK_OPTIONS = [
  { id: "python-sqlalchemy", label: "Python · SQLAlchemy" },
  { id: "node-typescript", label: "Node · TypeScript" },
  { id: "node-javascript", label: "Node · JavaScript" },
  { id: "sql-postgres", label: "Raw SQL · PostgreSQL" },
  { id: "playwright-typescript", label: "Playwright · TypeScript" },
];

function RefList({ refs }: { refs?: RefLink[] }) {
  if (!refs?.length) return null;
  return (
    <div className="text-sm">
      <p className="mb-1 text-xs uppercase tracking-wide text-ink-300">References</p>
      <ul className="space-y-1">
        {refs.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
              {r.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "accent" }) {
  return (
    <section className={clsx("space-y-1.5", tone === "accent" && "rounded-lg border border-accent/25 bg-accent/5 p-3")}>
      <h3 className={clsx("text-xs font-semibold uppercase tracking-wide", tone === "accent" ? "text-accent" : "text-ink-300")}>{title}</h3>
      <div className="text-sm text-ink-100">{children}</div>
    </section>
  );
}

/** History mode → lesson id: "lesson:<id>" (Check) or "run:lesson:<id>" (Run). */
const lessonOf = (mode?: string | null) => (mode || "").replace(/^run:/, "").match(/^lesson:(.+)$/)?.[1] || null;

const editorLabel = (lang?: string) =>
  lang === "sql" ? "Your SQL" : lang === "prisma" ? "Your Prisma schema" : lang === "python" ? "Your Python" : lang ? `Your ${lang}` : "Your code";

export function LabWorkspace({ trackId, mode, onTrackChange }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [highlightTables, setHighlightTables] = useState<string[]>([]);
  const [highlightRels, setHighlightRels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackOptions, setTrackOptions] = useState(TRACK_OPTIONS);
  const [historyKey, setHistoryKey] = useState(0);
  const [replay, setReplay] = useState<{ id: number; nonce: number } | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ passed: [], assisted: [] });

  const isTopics = mode === "topics";
  const kind = isTopics ? "lesson" : "task";
  const listItems = useMemo(
    () => (isTopics ? lessons.map((l) => ({ id: l.id, order: l.order, title: l.title, level: l.level })) : tasks.map((t) => ({ id: t.id, order: t.order, title: t.title, level: t.level }))),
    [isTopics, lessons, tasks]
  );
  const ids = useMemo(() => listItems.map((i) => i.id), [listItems]);
  // Progress is kept per track and per kind (tasks and lessons separately) in localStorage.
  const progressKey = isTopics ? `${trackId}:lessons` : trackId;

  useEffect(() => {
    fetchTracks()
      .then((t) => t.length && setTrackOptions(t.map((x) => ({ id: x.id, label: x.title }))))
      .catch(() => {});
  }, []);

  const refreshSchema = useCallback(() => {
    fetchSchema(trackId)
      .then(setSchema)
      .catch(() => setSchema({ tables: [], relationships: [] }));
  }, [trackId]);

  useEffect(() => {
    setError(null);
    setResult(null);
    setLoading(true);
    const prog = loadProgress(progressKey);
    setProgress(prog);
    Promise.all([fetchTrack(trackId), fetchTasks(trackId), fetchLessons(trackId)])
      .then(async ([m, t, l]) => {
        setManifest(m);
        setTasks(t);
        setLessons(l);
        const list = (isTopics ? l : t).map((x) => x.id);
        const params = new URLSearchParams(window.location.search);
        const replayId = Number(params.get("replay"));
        const wanted = params.get("item");
        let pick = wanted && list.includes(wanted) ? wanted : continueId(list, prog);
        if (replayId) {
          try {
            const d = await fetchHistoryDetail(trackId, replayId);
            const target = lessonOf(d.mode) || d.task_id;
            if (target && list.includes(target)) {
              pick = target;
              setReplay({ id: replayId, nonce: Date.now() });
            }
          } catch {
            /* ignore a stale replay id */
          }
        }
        setSelected(pick);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    refreshSchema();
  }, [trackId, isTopics, progressKey, refreshSchema]);

  const task = !isTopics ? tasks.find((t) => t.id === selected) || null : null;
  const lesson = isTopics ? lessons.find((l) => l.id === selected) || null : null;
  const lessonEx = lesson && typeof lesson.exercise === "object" ? lesson.exercise : null;
  const idx = selected ? ids.indexOf(selected) : -1;
  const hasNext = idx >= 0 && idx < ids.length - 1;

  const exercise: ExerciseItem | null = useMemo(() => {
    if (task) return { kind: "task", id: task.id, language: task.language, starterCode: task.starterCode || "", editorLabel: editorLabel(task.language) };
    if (lesson && lessonEx?.runnable)
      return {
        kind: "lesson",
        id: lesson.id,
        language: lessonEx.language,
        starterCode: lessonEx.starterCode || "",
        quiz: lessonEx.kind === "quiz" ? lessonEx.questions || [] : undefined,
        editorLabel: editorLabel(lessonEx.language),
      };
    return null;
  }, [task, lesson, lessonEx]);

  const checklist = useMemo(() => {
    const req = (task ? task.requirements : lessonEx?.requirements) as Req | undefined;
    return tickChecklist(buildChecklist(req), (result?.validation?.failures as never) || [], Boolean(result && result.checked !== false));
  }, [task, lessonEx, result]);

  function select(id: string) {
    setSelected(id);
    setReplay(null);
    setResult(null);
    const p = { ...progress, last: id };
    setProgress(p);
    saveProgress(progressKey, p);
    const url = new URL(window.location.href);
    url.searchParams.set("item", id);
    url.searchParams.delete("replay");
    window.history.replaceState(null, "", url.toString());
    document.getElementById("item-title")?.focus();
  }

  function onPassed() {
    if (!selected) return;
    const p = markPassed(progress, selected);
    setProgress(p);
    saveProgress(progressKey, p);
  }
  function onAssisted() {
    if (!selected) return;
    const p = markAssisted(progress, selected);
    setProgress(p);
    saveProgress(progressKey, p);
  }

  function onResult(r: ExecuteResult | null) {
    setResult(r);
    if (r?.success && r.checked !== false && r.animation) {
      setHighlightTables(r.animation.highlightTables || []);
      setHighlightRels(r.animation.highlightRels || []);
      setTimeout(() => {
        setHighlightTables([]);
        setHighlightRels([]);
      }, 4000);
    }
  }

  function replayFromHistory(d: HistoryDetail) {
    const lessonId = lessonOf(d.mode);
    const wantTopics = Boolean(lessonId);
    if (wantTopics !== isTopics) {
      window.location.href = `/lab?track=${trackId}&mode=${wantTopics ? "topics" : "execute"}&replay=${d.id}`;
      return;
    }
    const target = lessonId || d.task_id;
    if (target) setSelected(target);
    setReplay({ id: d.id, nonce: Date.now() });
  }

  const states = itemStates(ids, progress, selected);
  const cont = continueId(ids, progress);
  const example = lesson ? (typeof lesson.example === "object" ? lesson.example?.code || lesson.example?.sql : lesson.example) || lesson.exampleSql : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent">{isTopics ? "Lessons" : "Tasks"} · one platform</p>
          <h1 className="text-2xl font-semibold text-white">Relationship lab</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="track-picker">
            Learning track
          </label>
          <select
            id="track-picker"
            className="h-10 rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-ink-100"
            value={trackId}
            onChange={(e) => onTrackChange(e.target.value)}
          >
            {trackOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <nav aria-label="Lab mode" className="flex overflow-hidden rounded-lg border border-ink-600 text-sm">
            {(["topics", "execute"] as const).map((m) => (
              <a
                key={m}
                href={`/lab?track=${trackId}&mode=${m}`}
                aria-current={mode === m ? "page" : undefined}
                className={clsx("px-3 py-2", mode === m ? "bg-accent text-on-accent font-semibold" : "bg-ink-900 text-ink-200 hover:text-white")}
              >
                {m === "topics" ? "Lessons" : "Tasks"}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink-100" role="alert">
          <p className="font-semibold text-danger">The hub API is not answering.</p>
          <p>
            Start everything with <code>docker compose up --build</code> and open <code>http://localhost:3000</code>. ({error})
          </p>
          <button type="button" className="btn-ghost mt-2 !h-8 text-xs" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading track content…</span>
          {[0, 1].map((i) => (
            <div key={i} className="card h-72 motion-safe:animate-pulse" aria-hidden />
          ))}
        </div>
      )}

      {!loading && !error && listItems.length === 0 && (
        <div className="card p-6 text-ink-200" role="status">
          No {isTopics ? "lessons" : "tasks"} in this track yet. Add some under <code className="text-accent">tracks/{trackId}/{isTopics ? "lessons" : "tasks"}</code>.
        </div>
      )}

      {!loading && !error && listItems.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Left ≈40%: map + lesson content */}
          <div className="min-w-0 space-y-4">
            <ItemList label={isTopics ? "Lessons" : "Tasks"} items={listItems} states={states} progress={progress} selected={selected} continueTo={cont} onSelect={select} />

            {(task || lesson) && (
              <article className="card space-y-4 p-4 motion-safe:animate-fade-up" aria-labelledby="item-title">
                <header className="space-y-1">
                  <p className="text-xs text-ink-300">
                    {isTopics ? "Lesson" : "Task"} {idx + 1} of {ids.length}
                    {(task?.level || lesson?.level) && ` · ${task?.level || lesson?.level}`}
                    {selected && progress.assisted.includes(selected) && <span className="ml-2 rounded border border-warn/50 px-1 text-warn">assisted</span>}
                  </p>
                  <h2 id="item-title" tabIndex={-1} className="text-xl font-semibold text-white focus:outline-none">
                    {(task || lesson)!.title}
                  </h2>
                </header>

                <Section title="Concept">
                  <p className="whitespace-pre-wrap">{task ? task.summary || task.description : lesson!.body || lesson!.summary}</p>
                </Section>
                {(task?.why || lesson?.why) && (
                  <Section title="Why it matters" tone="accent">
                    {task?.why || lesson?.why}
                  </Section>
                )}
                {(task?.objectives?.length || lesson?.objectives?.length) ? (
                  <Section title="Goal">
                    <ul className="list-disc space-y-1 pl-5">
                      {(task?.objectives || lesson?.objectives || []).map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
                {example && (
                  <Section title="Example">
                    <pre className="overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-100">{example}</pre>
                  </Section>
                )}
                {task?.sqlEquivalent && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-accent">Equivalent SQL</summary>
                    <pre className="mt-2 overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-100">{task.sqlEquivalent}</pre>
                  </details>
                )}
                {(task?.mappingNotes || lesson?.mappingNotes) && (
                  <p className="text-sm text-ink-200">
                    <span className="font-semibold text-accent">SQL ↔ ORM: </span>
                    {task?.mappingNotes || lesson?.mappingNotes}
                  </p>
                )}
                {lessonEx?.prompt && (
                  <Section title="Try it" tone="accent">
                    {lessonEx.prompt}
                  </Section>
                )}
                {exercise && <Checklist items={checklist} />}
                {(task?.pitfalls?.length || lesson?.pitfalls?.length) ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-warn">Common pitfalls</summary>
                    <ul className="mt-2 list-disc pl-5 text-ink-200">
                      {(task?.pitfalls || lesson?.pitfalls || []).map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {(result?.success && result.checked !== false && (result.teachAlong || task?.teachAlong || lesson?.teachAlong)?.length) ? (
                  <Section title="What just happened" tone="accent">
                    <ol className="list-decimal space-y-1 pl-5">
                      {(result.teachAlong || task?.teachAlong || lesson?.teachAlong || []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </Section>
                ) : null}
                <RefList refs={task?.references || lesson?.references} />
              </article>
            )}

            {manifest?.prerequisites && (
              <details className="card p-3">
                <summary className="cursor-pointer text-sm font-medium text-white">Setup &amp; prerequisites</summary>
                <div className="mt-3">
                  <PrereqPanel
                    title={manifest.prerequisites.title || `${manifest.title} setup`}
                    install={manifest.prerequisites.install || ""}
                    code={manifest.prerequisites.code || manifest.prerequisites.setupCode || ""}
                    lockedByDefault={manifest.prerequisites.lockedByDefault ?? true}
                  />
                </div>
              </details>
            )}
            {manifest?.runtimePanels && (
              <details className="card p-3">
                <summary className="cursor-pointer text-sm font-medium text-white">Runtime context</summary>
                <div className="mt-3 space-y-3">
                  {Object.entries(manifest.runtimePanels).map(([k, v]) => (
                    <div key={k}>
                      <h3 className="text-sm font-semibold text-ink-100">{v.title}</h3>
                      <ul className="list-disc pl-5 text-sm text-ink-200">
                        {v.points.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {manifest?.validationCatalog && manifest.validationCatalog.length > 0 && (
              <details className="card p-3">
                <summary className="cursor-pointer text-sm font-medium text-white">Validation &amp; ecosystem</summary>
                <div className="mt-3 space-y-3">
                  {manifest.validationCatalog.map((c) => (
                    <div key={c.id}>
                      <h3 className="text-sm font-semibold text-ink-100">{c.title}</h3>
                      <pre className="overflow-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-ink-100">{c.example}</pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Right ≈60%: editor over output */}
          <div className="min-w-0 space-y-4">
            <div className="card p-4">
              {exercise ? (
                <ExercisePane
                  key={`${exercise.kind}:${exercise.id}`}
                  trackId={trackId}
                  item={exercise}
                  replay={replay}
                  hasNext={hasNext}
                  onNext={() => hasNext && select(ids[idx + 1])}
                  onResult={onResult}
                  onPassed={onPassed}
                  onAssisted={onAssisted}
                  onSchema={setSchema}
                  onHistoryChanged={() => setHistoryKey((k) => k + 1)}
                />
              ) : (
                <div className="space-y-2 text-sm text-ink-200" role="status">
                  <p className="font-medium text-white">This lesson is reading only.</p>
                  {lessonEx?.prompt || (typeof lesson?.exercise === "string" ? lesson.exercise : "") ? <p>{lessonEx?.prompt || (lesson?.exercise as string)}</p> : null}
                  {hasNext && (
                    <button type="button" className="btn-primary" onClick={() => select(ids[idx + 1])}>
                      Next lesson
                    </button>
                  )}
                </div>
              )}
            </div>
            <SchemaDiagram schema={schema} highlightTables={highlightTables} highlightRels={highlightRels} />
            <details className="card p-3">
              <summary className="cursor-pointer text-sm font-medium text-white">All runs in this track</summary>
              <div className="mt-3">
                <HistoryPanel trackId={trackId} refreshKey={historyKey} onReplay={replayFromHistory} />
              </div>
            </details>
            <DbTools trackId={trackId} onSchema={refreshSchema} />
          </div>
        </div>
      )}
    </div>
  );
}
