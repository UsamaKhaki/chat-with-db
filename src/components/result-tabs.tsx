"use client";

import { useId, useState } from "react";
import type { AskResponse } from "@/lib/ask";
import { toCsv } from "@/lib/csv";
import { ResultChart } from "./result-chart";
import { ResultTable } from "./result-table";
import { SqlBlock } from "./sql-block";

type Answered = Extract<AskResponse, { ok: true }>;
type Tab = "chart" | "table" | "sql";

export function ResultTabs({ response }: { response: Answered }) {
  const tabs: { id: Tab; label: string }[] = [
    ...(response.chart ? [{ id: "chart" as const, label: "Chart" }] : []),
    {
      id: "table",
      label: `Table · ${response.result.rows.length.toLocaleString("en-GB")}`,
    },
    { id: "sql", label: "SQL" },
  ];
  const [active, setActive] = useState<Tab>(tabs[0].id);
  const baseId = useId();

  function downloadCsv() {
    const blob = new Blob([toCsv(response.result)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "query-result.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2">
        <div role="tablist" aria-label="Result views" className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`${baseId}-${tab.id}-tab`}
              role="tab"
              type="button"
              aria-selected={active === tab.id}
              aria-controls={`${baseId}-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                active === tab.id
                  ? "border-mark font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {response.result.rows.length > 0 && (
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-sunken hover:text-ink"
          >
            Download CSV
          </button>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-${active}`}
        aria-labelledby={`${baseId}-${active}-tab`}
        className="p-3 sm:p-4"
      >
        {active === "chart" && response.chart && (
          <ResultChart result={response.result} chart={response.chart} />
        )}
        {active === "table" && <ResultTable result={response.result} />}
        {active === "sql" && <SqlBlock sql={response.sql} />}
      </div>
    </div>
  );
}
