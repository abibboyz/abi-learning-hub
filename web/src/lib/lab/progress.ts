/** Local progress per track (localStorage `alh:progress:<trackId>`), pure helpers + a tiny store. */
export type ProgressState = { passed: string[]; assisted: string[]; last?: string };
export type ItemState = "done" | "current" | "todo";

export const EMPTY: ProgressState = { passed: [], assisted: [] };
export const storageKey = (trackId: string) => `alh:progress:${trackId}`;

export function parseProgress(raw: string | null | undefined): ProgressState {
  try {
    const v = JSON.parse(raw || "");
    return { passed: Array.isArray(v.passed) ? v.passed.map(String) : [], assisted: Array.isArray(v.assisted) ? v.assisted.map(String) : [], last: typeof v.last === "string" ? v.last : undefined };
  } catch {
    return { ...EMPTY };
  }
}

export function markPassed(p: ProgressState, id: string): ProgressState {
  return { ...p, passed: p.passed.includes(id) ? p.passed : [...p.passed, id], last: id };
}
export function markAssisted(p: ProgressState, id: string): ProgressState {
  return { ...p, assisted: p.assisted.includes(id) ? p.assisted : [...p.assisted, id] };
}

/** ✓ done, ● current (the selected one, else the first not done), ○ to do. */
export function itemStates(ids: string[], p: ProgressState, selected?: string | null): Record<string, ItemState> {
  const cur = selected ?? continueId(ids, p);
  return Object.fromEntries(ids.map((id) => [id, p.passed.includes(id) ? "done" : id === cur ? "current" : "todo"]));
}

/** "Continue": the first item not passed yet (after the last one worked on), else the last item. */
export function continueId(ids: string[], p: ProgressState): string | null {
  if (!ids.length) return null;
  const start = p.last ? Math.max(0, ids.indexOf(p.last)) : 0;
  const order = [...ids.slice(start), ...ids.slice(0, start)];
  return order.find((id) => !p.passed.includes(id)) ?? ids[ids.length - 1];
}

export function loadProgress(trackId: string): ProgressState {
  if (typeof window === "undefined") return { ...EMPTY };
  return parseProgress(window.localStorage.getItem(storageKey(trackId)));
}
export function saveProgress(trackId: string, p: ProgressState) {
  if (typeof window !== "undefined") window.localStorage.setItem(storageKey(trackId), JSON.stringify(p));
}
