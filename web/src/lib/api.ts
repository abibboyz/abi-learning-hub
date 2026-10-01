import type { ExecuteResult, Lesson, Manifest, Schema, Task, TrackSummary } from "@/types/hub";

const PYTHON = process.env.NEXT_PUBLIC_PYTHON_API_URL || "http://localhost:8000";
const NODE = process.env.NEXT_PUBLIC_NODE_API_URL || "http://localhost:8001";

function baseForTrackId(trackId: string): string {
  if (trackId.startsWith("node-")) return NODE;
  return PYTHON;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export async function healthCheck(): Promise<{
  python?: { database?: boolean; ok?: boolean };
  node?: { database?: boolean; ok?: boolean };
}> {
  const [python, node] = await Promise.all([
    fetch(`${PYTHON}/health`).then((r) => r.json()).catch(() => ({ ok: false, database: false })),
    fetch(`${NODE}/health`).then((r) => r.json()).catch(() => ({ ok: false, database: false })),
  ]);
  return { python, node };
}

export async function fetchTracks(): Promise<TrackSummary[]> {
  try {
    const data = await getJson<{ tracks?: TrackSummary[] }>(`${PYTHON}/tracks`);
    return data.tracks || [];
  } catch {
    const data = await getJson<{ tracks?: TrackSummary[] }>(`${NODE}/tracks`);
    return data.tracks || [];
  }
}

export async function fetchTrack(trackId: string): Promise<Manifest> {
  return getJson(`${baseForTrackId(trackId)}/tracks/${trackId}`);
}

export async function fetchTasks(trackId: string): Promise<Task[]> {
  const data = await getJson<{ tasks?: Task[] }>(`${baseForTrackId(trackId)}/tracks/${trackId}/tasks`);
  return (data.tasks || []).map((t) => ({
    ...t,
    summary: t.summary || t.description || t.title,
    description: t.description || t.summary,
  }));
}

export async function fetchLessons(trackId: string): Promise<Lesson[]> {
  const data = await getJson<{ lessons?: Lesson[] }>(
    `${baseForTrackId(trackId)}/tracks/${trackId}/lessons`
  );
  return (data.lessons || []).map((l) => {
    const exampleObj = typeof l.example === "object" && l.example ? l.example : null;
    const exampleCode =
      typeof l.example === "string" ? l.example : exampleObj?.code || "";
    return {
      ...l,
      topic: l.topic || l.title,
      body: l.body || l.summary || "",
      example: exampleCode,
      summary: l.summary || l.body || "",
    };
  });
}

export async function fetchSchema(trackId: string): Promise<Schema> {
  return getJson(`${baseForTrackId(trackId)}/schema`);
}

export async function executeCode(body: {
  trackId: string;
  taskId?: string | null;
  code: string;
  mode?: string;
}): Promise<ExecuteResult> {
  const res = await fetch(`${baseForTrackId(body.trackId)}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function resetLab(trackId?: string): Promise<{ ok?: boolean; message?: string; schema?: Schema }> {
  const res = await fetch(`${PYTHON}/lab/reset`, { method: "POST" });
  if (!res.ok) {
    // node also has reset
    const res2 = await fetch(`${NODE}/lab/reset`, { method: "POST" });
    return res2.json();
  }
  return res.json();
}

export async function fetchHistory(trackId: string): Promise<{ history: Array<Record<string, unknown>> }> {
  const base = baseForTrackId(trackId);
  try {
    const data = await getJson<{ history?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
      `${base}/history?limit=40&trackId=${encodeURIComponent(trackId)}`
    );
    if (Array.isArray(data)) return { history: data };
    return { history: data.history || data.items || [] };
  } catch {
    return { history: [] };
  }
}

export async function listSnapshots(): Promise<{
  snapshots: Array<{ name: string; size: number; mtime: string }>;
}> {
  try {
    const data = await getJson<{ snapshots?: Array<{ name: string; size: number; mtime: string }> }>(
      `${PYTHON}/db/snapshots`
    );
    return { snapshots: data.snapshots || [] };
  } catch {
    return { snapshots: [] };
  }
}

export async function exportDb(): Promise<{ ok?: boolean; file?: string; message?: string }> {
  const res = await fetch(`${PYTHON}/db/export`, { method: "POST" });
  return res.json();
}

export async function restoreSnapshot(name: string): Promise<{ ok?: boolean; message?: string }> {
  const res = await fetch(`${PYTHON}/db/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: name, name }),
  });
  return res.json();
}

// Aliases used by older LabClient (kept for TrackCards etc.)
export const runLab = executeCode;
export const exportSnapshot = exportDb;
export { PYTHON, NODE };
