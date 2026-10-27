"use client";

import { useState } from "react";

export function SqlBlock({
  sql,
  label = "SQL",
}: {
  sql: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the SQL stays selectable.
    }
  }

  return (
    <details className="group rounded-lg border border-line bg-panel" open>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-medium text-muted select-none">
        <span>
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          {label}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            void copy();
          }}
          className="rounded px-2 py-0.5 text-xs text-muted hover:bg-line hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <pre className="overflow-x-auto border-t border-line px-4 py-3 font-mono text-[13px] leading-relaxed text-ink">
        <code>{sql}</code>
      </pre>
    </details>
  );
}
