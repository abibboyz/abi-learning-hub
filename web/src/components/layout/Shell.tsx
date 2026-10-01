"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";

const nav = [
  { href: "/", label: "Home" },
  { href: "/tracks", label: "Tracks" },
  { href: "/lab?mode=topics", label: "Topics" },
  { href: "/lab?mode=execute", label: "Lab" },
  { href: "/concepts", label: "Concepts" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<string>("…");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        const el = document.getElementById("shortcuts");
        el?.classList.toggle("hidden");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    import("@/lib/api").then(({ healthCheck }) =>
      healthCheck()
        .then((h) => {
          if (h.ok) setHealth("online");
          else if (h.python?.ok || h.node?.ok) setHealth("degraded");
          else setHealth("offline");
        })
        .catch(() => setHealth("offline"))
    );
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent"
              aria-hidden
            >
              Δ
            </span>
            <span>abi-learning-hub</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Primary">
            {nav.map((n) => {
              const base = n.href.split("?")[0];
              const active =
                n.href === "/"
                  ? pathname === "/"
                  : pathname === base || pathname.startsWith(`${base}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active ? "bg-ink-800 text-white" : "text-ink-300 hover:text-white hover:bg-ink-900"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span
              className="hidden sm:inline"
              title="Aggregated hub health via /api/health"
              aria-live="polite"
            >
              Hub{" "}
              <span
                className={clsx(
                  health === "online" && "text-accent",
                  health === "degraded" && "text-warn",
                  health === "offline" && "text-danger"
                )}
              >
                {health}
              </span>
            </span>
            <span className="kbd" title="Keyboard shortcuts">
              ?
            </span>
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <div
        id="shortcuts"
        className="hidden fixed bottom-4 right-4 card p-4 text-sm text-ink-200 w-64 z-50"
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <p className="font-medium text-white mb-2">Shortcuts</p>
        <ul className="space-y-1 text-ink-300">
          <li>
            <span className="kbd">?</span> toggle this help
          </li>
          <li>
            <span className="kbd">⌘/Ctrl</span>+<span className="kbd">Enter</span> run (in lab)
          </li>
        </ul>
      </div>
      <footer className="border-t border-ink-800/60 py-4 text-center text-xs text-ink-500">
        MIT · One platform · <code className="text-ink-400">docker compose up --build</code> · pick a
        track in the UI · CONCEPTS.md
      </footer>
    </div>
  );
}
