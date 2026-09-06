"use client";

import MonacoEditor from "@monaco-editor/react";

export function Editor({
  value,
  onChange,
  language = "python",
  readOnly = false,
}: {
  value: string;
  onChange?: (next: string) => void;
  language?: string;
  readOnly?: boolean;
}): React.ReactNode {
  return (
    <div className="rounded-lg overflow-hidden border border-slate-800">
      <MonacoEditor
        height="440px"
        language={language}
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange?.(v ?? "")}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  );
}
