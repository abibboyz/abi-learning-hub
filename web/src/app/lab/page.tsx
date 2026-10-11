"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LabWorkspace } from "@/components/lab/LabWorkspace";
import { PlaywrightLab } from "@/components/playwright/PlaywrightLab";
import { fetchTrack } from "@/lib/api";

/** Picks the lab for a track from its manifest `kind` (pluggable track kinds). */
function useTrackKind(trackId: string): "orm" | "playwright" | null {
  // Guess from the id so the right lab renders immediately; the manifest confirms it.
  const guess = trackId.startsWith("playwright-") ? "playwright" : "orm";
  const [kind, setKind] = useState<"orm" | "playwright" | null>(guess);
  useEffect(() => {
    let alive = true;
    setKind(guess);
    fetchTrack(trackId)
      .then((m) => alive && setKind(m.kind === "playwright" ? "playwright" : "orm"))
      .catch(() => {});
    return () => { alive = false; };
  }, [trackId, guess]);
  return kind;
}

function LabInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const trackId = sp.get("track") || "python-sqlalchemy";
  const mode = (sp.get("mode") === "topics" ? "topics" : "execute") as "topics" | "execute";
  const kind = useTrackKind(trackId);
  const onTrackChange = (id: string) => router.push(`/lab?track=${id}&mode=${mode}`);

  if (kind === "playwright") {
    return <PlaywrightLab key={`${trackId}:${mode}`} trackId={trackId} mode={mode} onTrackChange={onTrackChange} />;
  }
  return <LabWorkspace trackId={trackId} mode={mode} onTrackChange={onTrackChange} />;
}

export default function LabPage() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-400">Loading lab…</div>}>
      <LabInner />
    </Suspense>
  );
}
