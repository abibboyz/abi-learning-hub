import fs from "node:fs";
import path from "node:path";

export function tracksRoot() {
  return process.env.TRACKS_DIR || path.resolve(process.cwd(), "../tracks");
}

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function normalizeManifest(data: Record<string, unknown>, trackId: string) {
  const prereq = (data.prerequisites || {}) as Record<string, unknown>;
  if (prereq && !prereq.code && prereq.setupCode) {
    data.prerequisites = {
      title: `${data.title || trackId} setup`,
      lockedByDefault: true,
      install: prereq.install || "",
      code: prereq.setupCode,
      connection: prereq.connection,
      notes: prereq.notes,
    };
  } else if (prereq && !prereq.title) {
    data.prerequisites = {
      title: `${data.title || trackId} setup`,
      lockedByDefault: true,
      install: prereq.install || "",
      code: prereq.code || prereq.setupCode || "",
    };
  }
  return data;
}

export function listTracks() {
  const idx = readJson(path.join(tracksRoot(), "index.json"));
  return (idx.tracks as Array<Record<string, unknown>>).map((t) => {
    try {
      const m = loadManifest(String(t.id));
      return { ...t, ...m };
    } catch {
      return t;
    }
  });
}

export function loadManifest(trackId: string) {
  const p = path.join(tracksRoot(), trackId, "manifest.json");
  if (!fs.existsSync(p)) throw new Error(`Track not found: ${trackId}`);
  return normalizeManifest(readJson(p), trackId);
}

function scanDir(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => readJson(path.join(dir, n)))
    .sort((a: { order?: number }, b: { order?: number }) => (a.order || 0) - (b.order || 0));
}

export function loadTask(trackId: string, taskId: string) {
  const dir = path.join(tracksRoot(), trackId, "tasks");
  const direct = path.join(dir, `${taskId}.json`);
  if (fs.existsSync(direct)) return readJson(direct);
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const data = readJson(path.join(dir, name));
    const stem = name.replace(/\.json$/, "");
    if (data.id === taskId || stem === taskId || stem.endsWith(taskId) || stem.includes(taskId) || taskId.includes(stem)) {
      return data;
    }
  }
  throw new Error(`Task not found: ${trackId}/${taskId}`);
}

export function listTasks(trackId: string) {
  const m = loadManifest(trackId) as { taskIds?: string[] };
  if (m.taskIds?.length) return m.taskIds.map((id) => loadTask(trackId, id));
  return scanDir(path.join(tracksRoot(), trackId, "tasks"));
}

export function listLessons(trackId: string) {
  const m = loadManifest(trackId) as { lessonIds?: string[] };
  if (m.lessonIds?.length) return m.lessonIds.map((id) => {
    const dir = path.join(tracksRoot(), trackId, "lessons");
    const direct = path.join(dir, `${id}.json`);
    if (fs.existsSync(direct)) return readJson(direct);
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const data = readJson(path.join(dir, name));
      if (data.id === id || name.startsWith(id) || name.includes(id)) return data;
    }
    throw new Error(`Lesson not found: ${id}`);
  });
  return scanDir(path.join(tracksRoot(), trackId, "lessons"));
}
