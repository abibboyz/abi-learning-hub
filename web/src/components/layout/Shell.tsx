"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Keyboard } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { OPEN_SHORTCUTS, ShortcutSheet } from "@/components/ui/ShortcutSheet";

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
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
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
            <ThemeToggle />
            <button
              type="button"
              className="btn-ghost !h-9 !px-2.5"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS))}
            >
              <Keyboard className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <ShortcutSheet />
      <footer className="border-t border-ink-800/60 py-4 text-center text-xs text-ink-500">
        MIT · One platform · <code className="text-ink-400">docker compose up --build</code> · pick a
        track in the UI · CONCEPTS.md
      </footer>
    </div>
  );
}
