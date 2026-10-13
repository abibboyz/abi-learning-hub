"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet, keymap } from "@codemirror/view";
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Mark } from "@/lib/lab/diagnostics";

export type CodeEditorHandle = { focusLine: (line: number) => void; focus: () => void };

type Props = {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  label?: string;
  minHeight?: number;
  /** sql | python | prisma | typescript | javascript … (decides syntax highlighting) */
  language?: string;
  /** Error lines (from gate failures / tracebacks): gutter marker + highlighted line + tooltip */
  marks?: Mark[];
  onRun?: () => void;
  onCheck?: () => void;
  /** The current non-empty selection (or "" when nothing is selected), e.g. for "Run selection". */
  onSelectionChange?: (selected: string) => void;
};

// Token colours come from CSS variables, so the same highlight works in dark and light themes.
const tokenHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "rgb(var(--accent))", fontWeight: "600" },
  { tag: [t.string, t.special(t.string)], color: "rgb(var(--warn))" },
  { tag: [t.number, t.bool, t.null], color: "rgb(var(--info))" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "rgb(var(--ink-400))", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.definition(t.variableName)], color: "rgb(var(--info))" },
  { tag: [t.function(t.variableName), t.propertyName], color: "rgb(var(--ink-50))" },
]);

const setLineMarks = StateEffect.define<Mark[]>();
const lineMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLineMarks)) {
        const doc = tr.state.doc;
        const ranges = e.value
          .filter((m) => m.line >= 1 && m.line <= doc.lines)
          .sort((a, b) => a.line - b.line)
          .map((m) => Decoration.line({ class: "alh-error-line" }).range(doc.line(m.line).from));
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function languageExt(lang?: string): Extension[] {
  const l = (lang || "").toLowerCase();
  if (l === "sql") return [sql({ dialect: PostgreSQL })];
  if (l === "python") return [python()];
  if (l === "typescript" || l === "ts" || l === "zod" || l === "drizzle" || l === "prisma-client") return [javascript({ typescript: true })];
  if (l === "javascript" || l === "js") return [javascript()];
  return []; // prisma schema, plain text
}

function usePlainEditor(): boolean {
  const [plain, setPlain] = useState(false);
  useEffect(() => {
    setPlain(new URLSearchParams(window.location.search).get("editor") === "plain");
  }, []);
  return plain;
}

/**
 * CodeMirror 6 editor (same props as the old textarea + extras). `?editor=plain` falls back to a
 * plain <textarea> (useful for screen readers that prefer native fields, or for debugging).
 * Tab indents; press Esc then Tab to move focus out of the editor.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { value, onChange, readOnly, label, minHeight = 220, language, marks, onRun, onCheck, onSelectionChange },
  ref
) {
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const plain = usePlainEditor();
  const cm = useRef<ReactCodeMirrorRef>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const cbs = useRef({ onRun, onCheck, onSelectionChange });
  cbs.current = { onRun, onCheck, onSelectionChange };

  useImperativeHandle(ref, () => ({
    focus: () => (cm.current?.view ? cm.current.view.focus() : ta.current?.focus()),
    focusLine: (line: number) => {
      const view = cm.current?.view;
      if (view) {
        const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
        view.dispatch({ selection: EditorSelection.cursor(l.from), effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
        view.focus();
      } else if (ta.current) {
        const lines = ta.current.value.split("\n");
        const pos = lines.slice(0, Math.max(0, line - 1)).reduce((n, s) => n + s.length + 1, 0);
        ta.current.focus();
        ta.current.setSelectionRange(pos, pos + (lines[line - 1]?.length ?? 0));
      }
    },
  }));

  const extensions = useMemo<Extension[]>(
    () => [
      ...languageExt(language),
      syntaxHighlighting(tokenHighlight),
      lineMarks,
      lintGutter(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-labelledby": labelId, "aria-describedby": helpId }),
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (cbs.current.onRun?.(), Boolean(cbs.current.onRun)) },
          { key: "Mod-Shift-Enter", run: () => (cbs.current.onCheck?.(), Boolean(cbs.current.onCheck)) },
        ])
      ),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet && cbs.current.onSelectionChange) {
          const r = u.state.selection.main;
          cbs.current.onSelectionChange(r.empty ? "" : u.state.sliceDoc(r.from, r.to));
        }
      }),
    ],
    [language, labelId, helpId]
  );

  // Push marks into the editor as lint diagnostics (gutter + tooltip) and line highlights.
  useEffect(() => {
    const view = cm.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    const ms = (marks || []).filter((m) => m.line >= 1 && m.line <= doc.lines);
    const diags: Diagnostic[] = ms.map((m) => {
      const l = doc.line(m.line);
      return { from: l.from, to: l.to, severity: m.kind, message: m.message };
    });
    view.dispatch(setDiagnostics(view.state, diags), { effects: setLineMarks.of(ms) });
  }, [marks, value, plain]);

  const labelEl = (
    <div className="flex items-baseline justify-between gap-2">
      <span id={labelId} className="text-xs uppercase tracking-wide text-ink-300">
        {label || "Code editor"}
      </span>
      <span id={helpId} className="text-xs text-ink-400">
        {readOnly ? "read-only" : "Tab indents · Esc then Tab leaves the editor"}
      </span>
    </div>
  );

  if (plain) {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <textarea
          ref={ta}
          className="code-area"
          style={{ minHeight }}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              (e.shiftKey ? onCheck : onRun)?.();
            }
          }}
          onSelect={(e) => {
            const t = e.currentTarget;
            onSelectionChange?.(t.value.slice(t.selectionStart, t.selectionEnd));
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="code-editor">
      {labelEl}
      <CodeMirror
        ref={cm}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        editable={!readOnly}
        theme="none"
        minHeight={`${minHeight}px`}
        extensions={extensions}
        basicSetup={{ syntaxHighlighting: false, foldGutter: false, highlightActiveLine: !readOnly, autocompletion: true, searchKeymap: true }}
        className="overflow-hidden rounded-lg border border-ink-700 font-mono"
      />
    </div>
  );
});
