/** Turn gate failures / runtime errors into editor line marks (pure). */
export type Failure = { rule: string; message: string; table?: string; column?: string; line?: number | null; question?: string };
export type Mark = { line: number; kind: "error" | "warning"; message: string };

export function lineFromText(text: string | undefined | null): number | null {
  if (!text) return null;
  const pats = [/\(line (\d+)\)/i, /line (\d+)/i, /:(\d+):\d+\)?\s*$/m];
  for (const p of pats) {
    const m = text.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Python traceback: the last frame inside learner code ("<lab>" / "<string>" / "__lab__"). */
export function lineFromTraceback(tb: string | undefined | null): number | null {
  if (!tb) return null;
  const re = /File "(<lab>|<string>|__lab__|<learner>)", line (\d+)/g;
  let last: number | null = null;
  for (let m = re.exec(tb); m; m = re.exec(tb)) last = Number(m[2]);
  return last;
}

export function marksFrom(failures: Failure[] | undefined, traceback?: string | null, lineCount = Infinity): Mark[] {
  const out: Mark[] = [];
  for (const f of failures || []) {
    const line = f.line ?? (f.rule === "runtime-error" || f.rule === "rejected" ? lineFromText(f.message) ?? lineFromTraceback(traceback) : null);
    if (line && line >= 1 && line <= lineCount) out.push({ line, kind: "error", message: `${f.rule}: ${f.message}` });
  }
  return out.sort((a, b) => a.line - b.line);
}

export function nextErrorLine(marks: Mark[], fromLine: number): number | null {
  if (!marks.length) return null;
  const after = marks.find((m) => m.line > fromLine);
  return (after || marks[0]).line;
}
