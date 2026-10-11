"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  executePlaywright,
  fetchHistory,
  fetchPwLessons,
  fetchPwProgress,
  fetchPwSolution,
  fetchPwTasks,
  fetchRun,
  fetchTrack,
  fetchTracks,
  healthCheck,
  resetPlaywrightApp,
} from "@/lib/api";
import type { Manifest, PwExecuteResult, PwLesson, PwSupportFile, PwTask, TrackSummary } from "@/types/hub";
import { PrereqPanel } from "@/components/lab/PrereqPanel";
import { PwCodeEditor } from "./PwCodeEditor";
import { PwResults } from "./PwResults";

type Props = { trackId: string; mode: "topics" | "execute"; onTrackChange: (id: string) => void };
type Lang = "typescript" | "javascript";
type HistoryRow = { id: number; task_id: string | null; mode: string; success: boolean; message: string; created_at: string };

const draftKey = (trackId: string, item: string, lang: Lang) => `pw-draft:${trackId}:${item}:${lang}`;

function Refs({ refs }: { refs?: Array<{ title: string; url: string }> }) {
  if (!refs?.length) return null;
  return (
    <div className="text-sm">
      <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Official docs</p>
      <ul className="space-y-1">
        {refs.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {r.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bullets({ title, items, tone = "text-ink-200" }: { title: string; items?: string[]; tone?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">{title}</p>
      <ul className={clsx("list-disc space-y-1 pl-5 text-sm", tone)}>
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}

/** Support files shipped with a task/lesson: read-only by default, unlock to edit a scratch copy. */
function SupportFiles({ files }: { files: PwSupportFile[] }) {
  const [open, setOpen] = useState<string | null>(files[0]?.path || null);
  const [unlocked, setUnlocked] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => { setOpen(files[0]?.path || null); setUnlocked(false); setEdits({}); }, [files]);
  if (!files.length) return null;
  const f = files.find((x) => x.path === open) || files[0];
  return (
    <div className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-white">Provided files</h3>
        <div className="flex gap-1 text-xs">
          {files.map((x) => (
            <button key={x.path} type="button" onClick={() => setOpen(x.path)} className={clsx("rounded-md px-2 py-0.5 font-mono", x.path === f.path ? "bg-accent/20 text-accent" : "text-ink-300 hover:bg-ink-800")}>
              {x.path}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost ml-auto text-xs" onClick={() => setUnlocked((v) => !v)}>
          {unlocked ? "Lock" : "Unlock to edit"}
        </button>
      </div>
      <p className="text-xs text-ink-400">
        These files sit next to your test in the run. {unlocked ? "You are editing a scratch copy to experiment — the gate always runs the original." : "Read them to see what your code builds on."}
      </p>
      <PwCodeEditor
        label={f.path}
        value={edits[f.path] ?? f.content}
        readOnly={!unlocked}
        onChange={(v) => setEdits((e) => ({ ...e, [f.path]: v }))}
        minLines={8}
      />
    </div>
  );
}

export function PlaywrightLab({ trackId, mode, onTrackChange }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [tasks, setTasks] = useState<PwTask[]>([]);
  const [lessons, setLessons] = useState<PwLesson[]>([]);
  const [itemId, setItemId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("typescript");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PwExecuteResult | null>(null);
  const [running, setRunning] = useState(false);
  const [focus, setFocus] = useState<{ line: number; n: number } | null>(null);
  const jump = useCallback((line: number) => setFocus((f) => ({ line, n: (f?.n || 0) + 1 })), []);
  // A replay sets this; the draft loader applies it instead of the saved draft.
  const pendingReplay = useRef<{ code: string; result: PwExecuteResult | null; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [health, setHealth] = useState<{ ok?: boolean; playwright?: string; appUnderTest?: boolean; traceViewer?: boolean } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const isTopics = mode === "topics";
  const task = useMemo(() => (isTopics ? null : tasks.find((t) => t.id === itemId) || null), [isTopics, tasks, itemId]);
  const lesson = useMemo(() => (isTopics ? lessons.find((l) => l.id === itemId) || null : null), [isTopics, lessons, itemId]);
  const hasJs = Boolean(task?.starterCodeJs);
  const runnable = isTopics ? Boolean(lesson?.runnable && lesson.example?.code) : Boolean(task);

  const starterFor = useCallback(
    (l: Lang) => (task ? (l === "javascript" && task.starterCodeJs ? task.starterCodeJs : task.starterCode) : lesson?.example?.code || ""),
    [task, lesson]
  );

  const refreshHistory = useCallback(() => {
    fetchHistory(trackId).then((h) => setHistory(h.history as unknown as HistoryRow[]));
    fetchPwProgress(trackId).then((p) => setPassed(new Set(p.filter((x) => x.completed).map((x) => x.task_id))));
  }, [trackId]);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([fetchTrack(trackId), fetchPwTasks(trackId), fetchPwLessons(trackId)])
      .then(([m, t, l]) => {
        if (!alive) return;
        setManifest(m);
        setTasks(t);
        setLessons(l);
        setItemId((cur) => {
          const pool = isTopics ? l.map((x) => x.id) : t.map((x) => x.id);
          return cur && pool.includes(cur) ? cur : pool[0] || null;
        });
      })
      .catch((e) => alive && setError(`Could not load the Playwright track (${String(e)}). Is pw-runner up? docker compose up --build`));
    fetchTracks().then((t) => alive && setTracks(t)).catch(() => {});
    healthCheck().then((h) => alive && setHealth(h.playwright || null));
    refreshHistory();
    return () => { alive = false; };
  }, [trackId, isTopics, refreshHistory]);

  // Load the saved draft (or the starter) when the item or language changes.
  useEffect(() => {
    if (!itemId) return;
    const rp = pendingReplay.current;
    if (rp) {
      pendingReplay.current = null;
      setCode(rp.code);
      setResult(rp.result);
      setNotice(rp.note);
      setFocus(null);
      return;
    }
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(draftKey(trackId, itemId, lang)) : null;
    setCode(saved ?? starterFor(lang));
    setResult(null);
    setFocus(null);
  }, [itemId, lang, trackId, starterFor]);

  useEffect(() => {
    if (!hasJs && lang === "javascript") setLang("typescript");
  }, [hasJs, lang]);

  const updateCode = (v: string) => {
    setCode(v);
    if (itemId) window.localStorage.setItem(draftKey(trackId, itemId, lang), v);
  };

  const run = useCallback(async () => {
    if (!itemId || running || !runnable) return;
    setRunning(true);
    setResult(null);
    setNotice(null);
    try {
      const r = await executePlaywright({
        trackId,
        taskId: task ? task.id : null,
        lessonId: lesson ? lesson.id : null,
        code,
        mode: lesson ? `lesson:${lesson.id}` : "execute",
        language: lang,
      });
      setResult(r);
      const firstLine = r.reasons?.find((x) => x.line)?.line || r.run?.tests.find((t) => t.error?.line && (!t.error.file || !t.error.file.includes("/")))?.error?.line;
      if (firstLine) jump(firstLine);
      if (r.success && task) setPassed((s) => new Set(s).add(task.id));
    } catch (e) {
      setResult({ success: false, gate: "runner_error", message: String(e) });
    } finally {
      setRunning(false);
      refreshHistory();
    }
  }, [itemId, running, runnable, trackId, task, lesson, code, lang, refreshHistory, jump]);

  const replay = async (id: number) => {
    const row = await fetchRun(trackId, id);
    if (!row) return setNotice(`Run #${id} is no longer available.`);
    const lessonId = row.mode?.startsWith("lesson:") ? row.mode.slice(7) : null;
    if (row.task_id && isTopics) return setNotice(`Run #${id} is a task run — switch to Tasks to replay it.`);
    if (lessonId && !isTopics) return setNotice(`Run #${id} is a lesson run — switch to Topics to replay it.`);
    const target = row.task_id || lessonId;
    const v = row.validation;
    const replayLang: Lang = v?.language === "javascript" ? "javascript" : "typescript";
    const note = `Replaying run #${id} from ${new Date(row.created_at).toLocaleString()}: code and results restored (screenshots/trace are kept for the last 40 runs). Press Run to re-execute.`;
    const res = v ? { ...v, historyId: row.id } : null;
    if ((target && target !== itemId) || replayLang !== lang) {
      pendingReplay.current = { code: row.code, result: res, note };
      if (target) setItemId(target);
      setLang(replayLang);
    } else {
      setCode(row.code);
      setResult(res);
      setNotice(note);
    }
  };

  const showSolution = async () => {
    if (!task) return;
    try {
      const s = await fetchPwSolution(trackId, task.id);
      const sol = lang === "javascript" && s.solutionJs ? s.solutionJs : s.solution;
      if (window.confirm("Replace your code with the reference solution? (Your draft is overwritten.)")) updateCode(sol);
    } catch {
      setNotice("No reference solution available.");
    }
  };

  const resetCode = () => {
    if (!itemId) return;
    window.localStorage.removeItem(draftKey(trackId, itemId, lang));
    setCode(starterFor(lang));
    setResult(null);
  };

  const exportDrafts = () => {
    const drafts: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (k.startsWith(`pw-draft:${trackId}:`)) drafts[k] = window.localStorage.getItem(k) || "";
    }
    const blob = new Blob([JSON.stringify({ kind: "abi-learning-hub/playwright-drafts", version: 1, trackId, exportedAt: new Date().toISOString(), drafts }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${trackId}-drafts.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice(`Exported ${Object.keys(drafts).length} draft(s).`);
  };

  const importDrafts = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { kind?: string; drafts?: Record<string, string> };
      if (data.kind !== "abi-learning-hub/playwright-drafts" || !data.drafts) throw new Error("not a Playwright drafts export");
      let n = 0;
      for (const [k, v] of Object.entries(data.drafts)) {
        if (k.startsWith(`pw-draft:${trackId}:`) && typeof v === "string" && v.length <= 40_000) {
          window.localStorage.setItem(k, v);
          n++;
        }
      }
      if (itemId) setCode(window.localStorage.getItem(draftKey(trackId, itemId, lang)) ?? starterFor(lang));
      setNotice(`Restored ${n} draft(s).`);
    } catch (e) {
      setNotice(`Import failed: ${String(e)}`);
    }
  };

  const resetApp = async (progress: boolean) => {
    if (progress && !window.confirm("Reset task progress for this track and clear run artifacts? Drafts in this browser stay.")) return;
    const r = await resetPlaywrightApp(trackId, progress);
    setNotice(r.message || (r.ok ? "Reset done." : "Reset failed."));
    refreshHistory();
  };

  const marks = useMemo(() => {
    const m: Array<{ line: number; kind: "error" | "warning"; message: string }> = [];
    for (const f of result?.reasons || []) if (f.line) m.push({ line: f.line, kind: "error", message: `${f.rule}: ${f.message}` });
    for (const f of result?.warnings || []) if (f.line) m.push({ line: f.line, kind: "warning", message: `${f.rule}: ${f.message}` });
    for (const t of result?.run?.tests || []) {
      if (t.error?.line && (!t.error.file || !t.error.file.includes("/")) && (!t.error.file || t.error.file === result?.testFile)) {
        m.push({ line: t.error.line, kind: "error", message: t.error.message.split("\n")[0] });
      }
    }
    return m;
  }, [result]);

  const supportFiles = (task?.supportFiles || lesson?.lab?.supportFiles || []) as PwSupportFile[];
  const list = isTopics ? lessons : tasks;
  const pct = tasks.length ? Math.round((passed.size / tasks.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white">
          {manifest?.icon || "🎭"} {manifest?.title || "Playwright"}
        </h1>
        <label className="sr-only" htmlFor="pw-track">Track</label>
        <select id="pw-track" className="rounded-lg border border-ink-600 bg-ink-900 px-2 py-1 text-sm" value={trackId} onChange={(e) => onTrackChange(e.target.value)}>
          {(tracks.length ? tracks : [{ id: trackId, title: manifest?.title || trackId } as TrackSummary]).map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-xl border border-ink-600 text-sm" role="tablist" aria-label="Lab mode">
          <a href={`/lab?track=${trackId}&mode=topics`} role="tab" aria-selected={isTopics} className={clsx("px-3 py-1", isTopics ? "bg-accent text-ink-950" : "text-ink-200 hover:bg-ink-800")}>Topics</a>
          <a href={`/lab?track=${trackId}&mode=execute`} role="tab" aria-selected={!isTopics} className={clsx("px-3 py-1", !isTopics ? "bg-accent text-ink-950" : "text-ink-200 hover:bg-ink-800")}>Tasks</a>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="kbd">Playwright {health?.playwright || manifest?.playwrightVersion || "?"}</span>
          <span className={clsx("kbd", health?.appUnderTest ? "text-accent" : "text-danger")}>app under test {health?.appUnderTest ? "up" : "down"}</span>
          {!isTopics && <span className="kbd">{passed.size}/{tasks.length} tasks · {pct}%</span>}
        </div>
      </header>

      {error && <div className="card border-danger/40 p-3 text-sm text-danger">{error}</div>}
      {notice && (
        <div className="card flex items-start gap-2 p-3 text-sm text-ink-200" role="status">
          <span className="flex-1">{notice}</span>
          <button type="button" className="text-ink-400 hover:text-white" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
        <nav className="card max-h-[80vh] overflow-auto p-2" aria-label={isTopics ? "Lessons" : "Tasks"}>
          <ol className="space-y-0.5">
            {list.map((x, i) => {
              const done = !isTopics && passed.has(x.id);
              const off = isTopics && !(x as PwLesson).runnable;
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setItemId(x.id)}
                    aria-current={x.id === itemId}
                    className={clsx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", x.id === itemId ? "bg-accent/15 text-white" : "text-ink-200 hover:bg-ink-800")}
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-ink-500">{i + 1}</span>
                    <span className="flex-1">{x.title}</span>
                    {done && <span className="text-accent" aria-label="passed">✓</span>}
                    {off && <span className="text-[10px] text-ink-500">read</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="space-y-4">
          <article className="card space-y-3 p-4">
            {task && (
              <>
                <h2 className="text-lg font-medium text-white">{task.title}</h2>
                <p className="text-sm text-ink-200">{task.summary}</p>
                {task.why && <p className="text-sm text-ink-300"><span className="text-ink-400">Why: </span>{task.why}</p>}
                <Bullets title="Objectives" items={task.objectives} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-300">Hints & pitfalls</summary>
                  <div className="mt-2 space-y-2">
                    <Bullets title="Hints" items={task.hints} />
                    <Bullets title="Pitfalls" items={task.pitfalls} tone="text-warn" />
                  </div>
                </details>
                <Bullets title="How the gate checks it" items={task.teachAlong} tone="text-ink-300" />
                <Refs refs={task.references} />
              </>
            )}
            {lesson && (
              <>
                <h2 className="text-lg font-medium text-white">{lesson.title}</h2>
                <p className="text-sm text-ink-200">{lesson.summary}</p>
                {lesson.why && <p className="text-sm text-ink-300"><span className="text-ink-400">Why: </span>{lesson.why}</p>}
                {lesson.body && <p className="whitespace-pre-line text-sm text-ink-200">{lesson.body}</p>}
                <Bullets title="You will learn" items={lesson.objectives} />
                <Bullets title="Pitfalls" items={lesson.pitfalls} tone="text-warn" />
                <Refs refs={lesson.references} />
              </>
            )}
          </article>
          {manifest?.prerequisites?.code && (
            <PrereqPanel
              title={manifest.prerequisites.title || "Setup"}
              install={manifest.prerequisites.install || "npm init playwright@latest"}
              code={manifest.prerequisites.code}
              lockedByDefault={manifest.prerequisites.lockedByDefault ?? true}
            />
          )}
          <SupportFiles files={supportFiles} />
        </section>

        <section className="space-y-4">
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-300">
                tests/{(task?.testFile || "learner.spec.ts").replace(/\.(ts|js)$/, lang === "javascript" ? ".js" : ".ts")}
              </span>
              {hasJs && (
                <div className="flex overflow-hidden rounded-lg border border-ink-600 text-xs" role="group" aria-label="Language">
                  {(["typescript", "javascript"] as const).map((l) => (
                    <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={clsx("px-2 py-0.5", lang === l ? "bg-accent text-ink-950" : "text-ink-200")}>
                      {l === "typescript" ? "TS" : "JS"}
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={run} disabled={!runnable || running}>
                  {running ? "Running…" : "Run"}
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={resetCode} disabled={!itemId}>Reset code</button>
                {task && <button type="button" className="btn-ghost text-xs" onClick={showSolution}>Show solution</button>}
              </div>
            </div>
            {isTopics && lesson && !runnable && (
              <p className="text-xs text-ink-400">This topic is reference material (config, CLI or CI) — read it here; it is not run in the lab.</p>
            )}
            <PwCodeEditor
              label={runnable ? "Your test" : "Example"}
              value={code}
              onChange={updateCode}
              readOnly={!runnable}
              marks={marks}
              focus={focus}
              onRun={run}
            />
          </div>

          <PwResults result={result} running={running} onJump={jump} />

          <div className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-white">History</h3>
              <button type="button" className="btn-ghost ml-auto text-xs" onClick={refreshHistory}>Refresh</button>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-ink-400">No runs yet.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-ink-800 overflow-auto text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 py-1.5">
                    <span className={h.success ? "text-accent" : "text-danger"}>{h.success ? "✓" : "✗"}</span>
                    <span className="font-mono text-xs text-ink-300">#{h.id}</span>
                    <span className="truncate text-ink-200">{h.task_id || (h.mode?.startsWith("lesson:") ? h.mode.slice(7) : h.mode)}</span>
                    <span className="hidden truncate text-xs text-ink-500 md:inline">{h.message}</span>
                    <button type="button" className="btn-ghost ml-auto text-xs" onClick={() => replay(h.id)}>Replay</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card space-y-2 p-4">
            <h3 className="font-medium text-white">Export / restore / reset</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={exportDrafts}>Export drafts (.json)</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => importRef.current?.click()}>Restore drafts…</button>
              <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importDrafts(f); e.target.value = ""; }} />
              <button type="button" className="btn-ghost text-xs" onClick={() => resetApp(false)}>Reset app under test</button>
              <button type="button" className="btn-danger text-xs" onClick={() => resetApp(true)}>Reset progress</button>
            </div>
            <p className="text-xs text-ink-400">
              The app under test ({manifest?.appUnderTest?.name || "QA Practice Shop"}) is seeded: reset restores its data and clears run artifacts.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
