"use client";

import { useEffect, useState } from "react";
import { exportDb, listSnapshots, resetLab, restoreSnapshot } from "@/lib/api";

export function DbTools({ trackId, onSchema }: { trackId: string; onSchema?: () => void }) {
  const [snaps, setSnaps] = useState<Array<{ name: string; size: number; mtime: string }>>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    listSnapshots()
      .then((d) => setSnaps(d.snapshots))
      .catch(() => setSnaps([]));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-medium text-white">DB export / restore</h3>
      <p className="text-xs text-ink-400">
        Also available via <code className="text-accent">./scripts/export-db.sh</code> and{" "}
        <code className="text-accent">./scripts/restore-db.sh &lt;file&gt;</code>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await exportDb();
              setMsg(r.message || `Exported ${r.file}`);
              await refresh();
            } catch (e) {
              setMsg(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Export snapshot
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await resetLab(trackId);
              setMsg("Lab reset to seed.");
              onSchema?.();
            } catch (e) {
              setMsg(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Reset lab to seed
        </button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-auto text-xs">
        {snaps.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2 rounded-lg bg-ink-950/50 px-2 py-1.5">
            <span className="truncate text-ink-200">{s.name}</span>
            <button
              type="button"
              className="btn-ghost !py-1 !text-[11px]"
              onClick={async () => {
                setBusy(true);
                try {
                  await restoreSnapshot(s.name);
                  setMsg(`Restored ${s.name}`);
                  onSchema?.();
                } catch (e) {
                  setMsg(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restore
            </button>
          </li>
        ))}
        {!snaps.length && <li className="text-ink-500">No snapshots yet.</li>}
      </ul>
      {msg && <p className="text-xs text-accent">{msg}</p>}
    </div>
  );
}
