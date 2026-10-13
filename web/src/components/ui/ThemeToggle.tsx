"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "dark" | "light";
const ORDER: Theme[] = ["system", "dark", "light"];

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && !window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
}

/** Cycles system → dark → light; the choice is kept in localStorage (`alh:theme`). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = (localStorage.getItem("alh:theme") as Theme) || "system";
    setTheme(ORDER.includes(saved) ? saved : "system");
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => (localStorage.getItem("alh:theme") || "system") === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      className="btn-ghost !h-9 !px-2.5"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme} (click for ${next})`}
      onClick={() => {
        localStorage.setItem("alh:theme", next);
        setTheme(next);
        applyTheme(next);
      }}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="ml-1.5 hidden text-xs capitalize md:inline">{theme}</span>
    </button>
  );
}
