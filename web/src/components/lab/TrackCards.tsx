"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrackSummary } from "@/types/hub";
import { fetchTracks } from "@/lib/api";

const FALLBACK: TrackSummary[] = [
  {
    id: "python-sqlalchemy",
    title: "Python · SQLAlchemy",
    language: "python",
    variant: "orm",
    runtime: "fastapi",
    api: "python",
    description: "SQLAlchemy 2.x Mapped columns & relationships",
    order: 1,
    icon: "🐍",
  },
  {
    id: "node-typescript",
    title: "Node.js · TypeScript",
    language: "typescript",
    variant: "orm",
    runtime: "node",
    api: "node",
    description: "Prisma + typed client",
    order: 2,
    icon: "📘",
  },
  {
    id: "node-javascript",
    title: "Node.js · JavaScript",
    language: "javascript",
    variant: "orm",
    runtime: "node",
    api: "node",
    description: "Prisma without TS — Zod at the edges",
    order: 3,
    icon: "📒",
  },
];

export function TrackCards() {
  const [tracks, setTracks] = useState<TrackSummary[]>(FALLBACK);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    fetchTracks()
      .then((t) => {
        if (t.length) {
          setTracks(t);
          setStatus("ready");
        } else {
          setStatus("fallback");
        }
      })
      .catch(() => setStatus("fallback"));
  }, []);

  return (
    <section className="space-y-4" aria-labelledby="tracks-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="tracks-heading" className="text-lg font-medium text-white">
            Choose a track
          </h2>
          <p className="text-sm text-ink-400">
            Same hub — switching tracks never means a different Compose file.
          </p>
        </div>
        {status === "loading" && (
          <p className="text-xs text-ink-500" aria-live="polite">
            Loading tracks…
          </p>
        )}
        {status === "fallback" && (
          <p className="text-xs text-warn" aria-live="polite">
            Showing built-in track list (API warming up)
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tracks.map((t) => (
          <Link
            key={t.id}
            href={`/lab?track=${t.id}&mode=execute`}
            className="card p-5 transition hover:border-accent/40 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <div className="text-2xl" aria-hidden>
              {t.icon || "◆"}
            </div>
            <h3 className="mt-2 font-medium text-white">{t.title}</h3>
            <p className="mt-1 text-sm text-ink-300">{t.description}</p>
            <p className="mt-3 text-xs text-accent">Open lab in this track →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
