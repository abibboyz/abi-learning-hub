"use client";

type Props = {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  label?: string;
  minHeight?: number;
};

export function CodeEditor({ value, onChange, readOnly, label, minHeight = 220 }: Props) {
  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>}
      <textarea
        className="code-area"
        style={{ minHeight }}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
