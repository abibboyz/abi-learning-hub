/** Internal backend URLs — never exposed to the browser. */
export function pythonBackend(): string {
  return (
    process.env.PYTHON_API_INTERNAL ||
    process.env.PYTHON_API_URL ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
}

export function nodeBackend(): string {
  return (
    process.env.NODE_API_INTERNAL ||
    process.env.NODE_API_URL ||
    "http://localhost:8001"
  ).replace(/\/$/, "");
}

/** Route a track id to the internal runner service. */
export function backendForTrack(trackId: string | null | undefined): string {
  if (trackId && trackId.startsWith("node-")) return nodeBackend();
  return pythonBackend();
}

/** Infer track id from path segments like tracks/:id/... */
export function trackIdFromPath(parts: string[]): string | null {
  const i = parts.indexOf("tracks");
  if (i >= 0 && parts[i + 1] && parts[i + 1] !== "undefined") {
    return parts[i + 1];
  }
  const p = parts.indexOf("progress");
  if (p >= 0 && parts[p + 1]) return parts[p + 1];
  return null;
}

/** Shared/meta endpoints always go to Python (tracks index, db tools, reset). */
export function isSharedMetaPath(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const head = parts[0];
  if (head === "db" || head === "lab") return true;
  if (head === "tracks" && parts.length === 1) return true;
  if (head === "compare") return false; // node-only comparison panel
  return false;
}

export function pickBackend(parts: string[], trackId: string | null): string {
  if (parts[0] === "compare") return nodeBackend();
  if (isSharedMetaPath(parts)) return pythonBackend();
  const tid = trackId || trackIdFromPath(parts);
  return backendForTrack(tid);
}
