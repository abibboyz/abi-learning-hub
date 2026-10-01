import type { ExecuteResult, Lesson, Manifest, Schema, Task, TrackSummary } from "@/types/hub";

/** Single public API surface — same-origin BFF proxies to internal runners. */
const API = (typeof window === "undefined"
  ? process.env.HUB_PUBLIC_API_BASE || "http://localhost:3000/api"
  : "/api"
).replace(/\/$/, "");

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export async function healthCheck(): Promise<{
  ok?: boolean;
  message?: string;
  python?: { database?: boolean; ok?: boolean };
  node?: { database?: boolean; ok?: boolean };
}> {
  try {
    return await getJson(`${API}/health`);
  } catch {
    return { ok: false, message: "Hub offline", python: { ok: false }, node: { ok: false } };
  }
}

export async function fetchTracks(): Promise<TrackSummary[]> {
  const data = await getJson<{ tracks?: TrackSummary[] }>(`${API}/tracks`);
  return data.tracks || [];
}

export async function fetchTrack(trackId: string): Promise<Manifest> {
  return getJson(`${API}/tracks/${trackId}`);
}

export async function fetchTasks(trackId: string): Promise<Task[]> {
  const data = await getJson<{ tasks?: Task[] }>(`${API}/tracks/${trackId}/tasks`);
  return (data.tasks || []).map((t) => ({
    ...t,
    summary: t.summary || t.description || t.title,
    description: t.description || t.summary,
  }));
}

export async function fetchLessons(trackId: string): Promise<Lesson[]> {
  const data = await getJson<{ lessons?: Lesson[] }>(`${API}/tracks/${trackId}/lessons`);
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
      exampleSql: exampleObj?.sql || l.exampleSql,
      exampleLanguage: exampleObj?.language || l.exampleLanguage,
    };
  });
}

export async function fetchSchema(trackId: string): Promise<Schema> {
  return getJson(`${API}/schema?trackId=${encodeURIComponent(trackId)}`);
}

export async function executeCode(body: {
  trackId: string;
  taskId?: string | null;
  code: string;
  mode?: string;
}): Promise<ExecuteResult> {
  const res = await fetch(`${API}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function resetLab(_trackId?: string): Promise<{
  ok?: boolean;
  message?: string;
  schema?: Schema;
}> {
  const res = await fetch(`${API}/lab/reset`, { method: "POST" });
  return res.json();
}

export async function fetchHistory(
  trackId: string
): Promise<{ history: Array<Record<string, unknown>> }> {
  try {
    const data = await getJson<
      | { history?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>
    >(`${API}/history?limit=40&trackId=${encodeURIComponent(trackId)}`);
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
    const data = await getJson<{
      snapshots?: Array<{ name: string; size: number; mtime: string }>;
    }>(`${API}/db/snapshots`);
    return { snapshots: data.snapshots || [] };
  } catch {
    return { snapshots: [] };
  }
}

export async function exportDb(): Promise<{ ok?: boolean; file?: string; message?: string }> {
  const res = await fetch(`${API}/db/export`, { method: "POST" });
  return res.json();
}

export async function restoreSnapshot(
  name: string
): Promise<{ ok?: boolean; message?: string }> {
  const res = await fetch(`${API}/db/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: name, name }),
  });
  return res.json();
}

export const runLab = executeCode;
export const exportSnapshot = exportDb;
/** @deprecated Dual public URLs removed — use same-origin /api */
export const PYTHON = API;
export const NODE = API;
