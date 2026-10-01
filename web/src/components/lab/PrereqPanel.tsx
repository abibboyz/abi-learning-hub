"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/editor/CodeEditor";

type Props = {
  title: string;
  install: string;
  code: string;
  lockedByDefault?: boolean;
};

export function PrereqPanel({ title, install, code, lockedByDefault = true }: Props) {
  const [locked, setLocked] = useState(lockedByDefault);
  const [local, setLocal] = useState(code);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-white">{title}</h3>
          <p className="text-xs text-ink-400">Prerequisites — read & run setup before task work</p>
        </div>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => setLocked((v) => !v)}
        >
          {locked ? "Edit / Unlock" : "Lock"}
        </button>
      </div>
      <div className="rounded-lg bg-ink-950/80 px-3 py-2 font-mono text-xs text-accent-glow">
        $ {install}
      </div>
      <CodeEditor
        label={locked ? "Setup (read-only)" : "Setup (editable)"}
        value={local}
        onChange={setLocal}
        readOnly={locked}
        minHeight={160}
      />
    </div>
  );
}
