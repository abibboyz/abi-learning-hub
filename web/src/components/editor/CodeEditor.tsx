"use client";

type Props = {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  label?: string;
  minHeight?: number;
};

export function CodeEditor({ value, onChange, readOnly, label, minHeight = 220 }: Props) {
  const id = "hub-code-editor";
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs uppercase tracking-wide text-ink-400">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className="code-area"
        style={{ minHeight }}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        aria-label={label || "Code editor"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
