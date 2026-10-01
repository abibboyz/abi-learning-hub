"use client";

import { useEffect, useState } from "react";
import { fetchHistory } from "@/lib/api";

export function HistoryPanel({ trackId }: { trackId: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetchHistory(trackId)
      .then((d) => setRows(d.history))
      .catch(() => setRows([]));
  }, [trackId]);

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">Execution history</h3>
        <button
          type="button"
          className="btn-ghost !py-1 text-xs"
          onClick={() =>
            fetchHistory(trackId)
              .then((d) => setRows(d.history))
              .catch(() => setRows([]))
          }
        >
          Refresh
        </button>
      </div>
      <ul className="max-h-48 space-y-1 overflow-auto text-xs">
        {rows.map((r) => (
          <li
            key={String(r.id)}
            className="rounded-lg border border-ink-700/50 bg-ink-950/40 px-2 py-1.5"
          >
            <div className="flex justify-between gap-2">
              <span className={r.success ? "text-accent" : "text-danger"}>
                {r.success ? "✓" : "✗"} {String(r.task_id || "ad-hoc")}
              </span>
              <span className="text-ink-500">{String(r.created_at || "")}</span>
            </div>
            <p className="mt-0.5 text-ink-300 line-clamp-2">{String(r.message || "")}</p>
          </li>
        ))}
        {!rows.length && <li className="text-ink-500">No runs yet.</li>}
      </ul>
    </div>
  );
}
