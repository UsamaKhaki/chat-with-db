"use client";

import { useState } from "react";

const KEYWORDS = new Set(
  (
    "select from where join left right inner outer full cross on and or not in is null as group by order " +
    "having limit offset with distinct case when then else end union all asc desc between like ilike " +
    "exists filter over partition interval true false insert into values update set delete returning"
  ).split(" "),
);

// Strings, numbers, words, whitespace or any single character.
const TOKEN =
  /('(?:[^']|'')*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|.)/g;

export function SqlBlock({ sql }: { sql: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopyState("copied");
    } catch {
      // Clipboard access can be denied (permissions, embedded browsers);
      // say so, and the SQL stays selectable.
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute top-2 right-2 rounded border border-line bg-panel px-2 py-0.5 text-xs text-muted hover:text-ink"
      >
        {copyState === "copied"
          ? "Copied"
          : copyState === "failed"
            ? "Copy failed"
            : "Copy SQL"}
      </button>
      <pre className="overflow-x-auto rounded-md bg-sunken px-4 py-3 pr-24 font-mono text-[13px] leading-relaxed text-ink">
        <code>
          {sql.match(TOKEN)?.map((token, index) => (
            <span key={index} className={tokenClass(token)}>
              {token}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function tokenClass(token: string): string | undefined {
  if (token.startsWith("'")) return "[color:var(--chart-3)]";
  if (/^\d/.test(token)) return "[color:var(--chart-2)]";
  if (KEYWORDS.has(token.toLowerCase())) return "font-medium text-accent";
  return undefined;
}
