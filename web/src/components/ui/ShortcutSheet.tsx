"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { SHORTCUTS, isMacPlatform, matchShortcut } from "@/lib/lab/shortcuts";

export const OPEN_SHORTCUTS = "alh:shortcuts";

function inEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest?.(".cm-editor")));
}

/** `?` (outside text fields) or the header button opens a native modal dialog: Esc closes, focus returns. */
export function ShortcutSheet() {
  const ref = useRef<HTMLDialogElement>(null);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(isMacPlatform(navigator.platform));
    const open = () => ref.current?.showModal();
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, inEditable(e.target)) === "help") {
        e.preventDefault();
        if (ref.current?.open) ref.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS, open);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="shortcuts-title"
      className="card w-[min(92vw,30rem)] p-0 text-ink-100 backdrop:bg-black/50"
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h2 id="shortcuts-title" className="font-semibold text-white">Keyboard shortcuts</h2>
        <button type="button" className="btn-ghost !h-8 !px-2" aria-label="Close" onClick={() => ref.current?.close()} autoFocus>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Lab keyboard shortcuts</caption>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.id} className="border-b border-ink-800 last:border-0">
              <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-normal">
                <kbd className="kbd">{mac ? s.mac : s.keys}</kbd>
              </th>
              <td className="px-4 py-2 text-ink-200">{s.label}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-normal">
              <kbd className="kbd">Esc</kbd> then <kbd className="kbd">Tab</kbd>
            </th>
            <td className="px-4 py-2 text-ink-200">Leave the code editor (Tab normally indents)</td>
          </tr>
        </tbody>
      </table>
    </dialog>
  );
}
