"use client";

import { useEffect, useState } from "react";
import type { SchemaResponse } from "@/app/api/schema/route";

type State =
  | { status: "loading" }
  | { status: "ready"; schema: SchemaResponse }
  | { status: "error"; message: string };

/** The tables the read-only role can query, so people know what to ask about. */
export function SchemaPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/schema", { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!res.ok)
          throw new Error(
            (body as { message?: string }).message ?? "Schema unavailable.",
          );
        setState({ status: "ready", schema: body as SchemaResponse });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Schema unavailable.",
        });
      });
    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <p className="px-1 text-sm text-muted">Loading tables…</p>;
  }
  if (state.status === "error") {
    return <p className="px-1 text-sm text-danger">{state.message}</p>;
  }

  return (
    <ul className="space-y-0.5">
      {state.schema.tables.map((table) => (
        <li key={table.name}>
          <details className="group rounded-md open:bg-sunken/70">
            <summary
              className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-sunken"
              title={table.comment ?? undefined}
            >
              <span className="flex items-center gap-2 font-mono text-[13px] text-ink">
                <span
                  aria-hidden
                  className="text-muted transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                {table.name}
              </span>
              <span className="text-xs text-muted">{table.columns.length}</span>
            </summary>
            <ul className="space-y-0.5 pr-2 pb-2 pl-7">
              {table.columns.map((column) => (
                <li
                  key={column.name}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="truncate font-mono text-ink/90">
                    {column.name}
                  </span>
                  <span className="shrink-0 text-muted">
                    {column.references
                      ? `→ ${column.references.split(".")[0]}`
                      : shortType(column.type)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

function shortType(type: string): string {
  if (type.startsWith("timestamp")) return "timestamp";
  if (type === "character varying") return "varchar";
  return type;
}
