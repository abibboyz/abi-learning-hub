"use client";

import { useEffect, useState } from "react";
import { fetchHistory, fetchHistoryDetail, type HistoryDetail } from "@/lib/api";

/** Recent runs for this track. "Replay" loads the exact code of that run back into its task or lesson. */
export function HistoryPanel({
  trackId,
  refreshKey = 0,
  onReplay,
}: {
  trackId: string;
  refreshKey?: number;
  onReplay?: (run: HistoryDetail) => void;
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = useState("");

  const load = () =>
    fetchHistory(trackId)
      .then((d) => setRows(d.history))
      .catch(() => setRows([]));

  useEffect(() => {
    void load();
  }, [trackId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">Execution history</h3>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <ul className="max-h-60 space-y-1 overflow-auto text-xs">
        {rows.map((r) => {
          const mode = String(r.mode || "");
          const isRun = mode.startsWith("run:");
          const m = mode.replace(/^run:/, "");
          const what = `${isRun ? "Run · " : ""}${r.task_id ? String(r.task_id) : m.startsWith("lesson:") ? `lesson ${m.slice(7)}` : "ad-hoc"}`;
          return (
            <li key={String(r.id)} className="rounded-lg border border-ink-700/50 bg-ink-950/40 px-2 py-1.5">
              <div className="flex justify-between gap-2">
                <span className={r.success ? "text-accent" : "text-danger"}>
                  {r.success ? "✓" : "✗"} {what}
                </span>
                <span className="text-ink-500">{String(r.created_at || "").replace("T", " ").slice(0, 19)}</span>
              </div>
              <p className="mt-0.5 text-ink-300 line-clamp-2">{String(r.message || "")}</p>
              {onReplay && (
                <button
                  type="button"
                  className="mt-1 text-accent hover:underline"
                  onClick={() =>
                    fetchHistoryDetail(trackId, Number(r.id))
                      .then((d) => {
                        setErr("");
                        onReplay(d);
                      })
                      .catch((e) => setErr(`Could not load run: ${e}`))
                  }
                >
                  Replay this code
                </button>
              )}
            </li>
          );
        })}
        {!rows.length && <li className="text-ink-500">No runs yet.</li>}
      </ul>
    </div>
  );
}
