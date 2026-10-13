/** Keyboard shortcuts for the lab (pure: tested in web/tests/lab.test.ts). */
export type ShortcutId = "run" | "check" | "hint" | "help" | "nextError";
export type KeyLike = { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean };

export const SHORTCUTS: Array<{ id: ShortcutId; keys: string; mac: string; label: string }> = [
  { id: "run", keys: "Ctrl+Enter", mac: "⌘ Enter", label: "Run (execute only, no grading)" },
  { id: "check", keys: "Ctrl+Shift+Enter", mac: "⌘ ⇧ Enter", label: "Check (run and grade); after a pass: Next" },
  { id: "hint", keys: "Ctrl+H", mac: "⌘ H", label: "Show the next hint" },
  { id: "nextError", keys: "F8", mac: "F8", label: "Go to the next error line" },
  { id: "help", keys: "?", mac: "?", label: "Show this shortcut sheet (outside the editor)" },
];

export function isMacPlatform(platform: string | undefined): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform || "");
}

export function shortcutLabel(id: ShortcutId, mac: boolean): string {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? (mac ? s.mac : s.keys) : "";
}

/** Which shortcut does this key event trigger? `inEditor`: single-key shortcuts are off while typing (WCAG 2.1.4). */
export function matchShortcut(e: KeyLike, inEditor: boolean): ShortcutId | null {
  const mod = Boolean(e.ctrlKey || e.metaKey);
  if (mod && !e.altKey && e.key === "Enter") return e.shiftKey ? "check" : "run";
  if (mod && !e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H" || e.code === "KeyH")) return "hint";
  if (!mod && !e.altKey && e.key === "F8") return "nextError";
  if (!inEditor && !mod && !e.altKey && e.key === "?") return "help";
  return null;
}
