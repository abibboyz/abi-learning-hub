/** Loads track packages (tracks/<id>/manifest.json, lessons/*.json, tasks/*.json). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function tracksRoot(): string {
  return process.env.TRACKS_DIR || path.resolve(HERE, "..", "..", "tracks");
}

type Json = Record<string, unknown>;

function readJson(p: string): Json {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function trackDir(trackId: string): string {
  if (!SAFE_ID.test(trackId)) throw new Error(`Invalid track id: ${trackId}`);
  return path.join(tracksRoot(), trackId);
}

export function listTracks(): Json[] {
  const idx = readJson(path.join(tracksRoot(), "index.json")) as { tracks: Json[] };
  return idx.tracks.map((t) => {
    try {
      return { ...t, ...loadManifest(String(t.id)) };
    } catch {
      return t;
    }
  });
}

export function loadManifest(trackId: string): Json {
  const p = path.join(trackDir(trackId), "manifest.json");
  if (!fs.existsSync(p)) throw new Error(`Track not found: ${trackId}`);
  return readJson(p);
}

function loadFrom(trackId: string, kind: "tasks" | "lessons", id: string): Json {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid ${kind} id: ${id}`);
  const dir = path.join(trackDir(trackId), kind);
  if (!fs.existsSync(dir)) throw new Error(`No ${kind} for ${trackId}`);
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const data = readJson(path.join(dir, name));
    if (data.id === id || name.replace(/\.json$/, "") === id) return data;
  }
  throw new Error(`${kind === "tasks" ? "Task" : "Lesson"} not found: ${trackId}/${id}`);
}

function listFrom(trackId: string, kind: "tasks" | "lessons"): Json[] {
  const m = loadManifest(trackId);
  const ids = (kind === "tasks" ? m.taskIds : m.lessonIds) as string[] | undefined;
  if (ids?.length) return ids.map((id) => loadFrom(trackId, kind, id));
  const dir = path.join(trackDir(trackId), kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()
    .map((n) => readJson(path.join(dir, n)))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

export const loadTask = (t: string, id: string) => loadFrom(t, "tasks", id);
export const loadLesson = (t: string, id: string) => loadFrom(t, "lessons", id);
export const listTasks = (t: string) => listFrom(t, "tasks");
export const listLessons = (t: string) => listFrom(t, "lessons");

/** Reference solutions and planted wrong answers stay server-side (tests use them). */
export function publicTask(task: Json): Json {
  const { solution: _s, solutionJs: _sj, wrongSolutions: _w, ...rest } = task;
  void _s; void _sj; void _w;
  return rest;
}
