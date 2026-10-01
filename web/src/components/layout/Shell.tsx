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
          const p = h.python?.database ? "py✓" : "py✗";
          const n = h.node?.database ? "node✓" : "node✗";
          setHealth(`${p} ${n}`);
        })
        .catch(() => setHealth("offline"))
    );
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
              Δ
            </span>
            abi-learning-hub
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {nav.map((n) => {
              const active =
                n.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(n.href.split("?")[0]) &&
                    (n.href.includes("mode=")
                      ? typeof window !== "undefined" &&
                        window.location.search.includes(n.href.split("?")[1] || "")
                      : true);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-sm",
                    pathname === n.href.split("?")[0] ||
                      (n.href !== "/" && pathname.startsWith(n.href.split("?")[0]))
                      ? "bg-ink-800 text-white"
                      : "text-ink-300 hover:text-white hover:bg-ink-900"
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span className="hidden sm:inline">APIs {health}</span>
            <span className="kbd">?</span>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <div
        id="shortcuts"
        className="hidden fixed bottom-4 right-4 card p-4 text-sm text-ink-200 w-64 z-50"
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
        MIT · CONCEPTS.md · Docker Compose brings up Postgres + Python API + Node API + Next.js
      </footer>
    </div>
  );
}
