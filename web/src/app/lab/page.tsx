"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LabWorkspace } from "@/components/lab/LabWorkspace";

function LabInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const trackId = sp.get("track") || "python-sqlalchemy";
  const mode = (sp.get("mode") === "topics" ? "topics" : "execute") as "topics" | "execute";

  return (
    <LabWorkspace
      trackId={trackId}
      mode={mode}
      onTrackChange={(id) => router.push(`/lab?track=${id}&mode=${mode}`)}
    />
  );
}

export default function LabPage() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-400">Loading lab…</div>}>
      <LabInner />
    </Suspense>
  );
}
