import type { AskResponse } from "@/lib/ask";

type Answered = Extract<AskResponse, { ok: true }>;

/**
 * What actually happened to the question, in order. Everything here comes
 * from the response; nothing is estimated on the client.
 */
export function QueryReceipt({ response }: { response: Answered }) {
  const { meta, result } = response;
  const rows = result.rows.length.toLocaleString("en-GB");
  const steps = [
    {
      label: "Context",
      value: meta.retrieval === "vector" ? "matched tables" : "full schema",
    },
    {
      label: "SQL",
      value: meta.attempts > 1 ? "rewritten after a rejected query" : "written",
    },
    { label: "Checks", value: "one SELECT, allowed tables" },
    {
      label: "Ran read-only",
      value: `${rows}${result.truncated ? "+" : ""} ${result.rows.length === 1 ? "row" : "rows"} in ${formatMs(meta.queryMs)}`,
    },
  ];

  return (
    <div className="rounded-md border border-dashed border-mark/60 bg-mark-soft/40 px-3 py-2">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 font-mono text-[12px] leading-5">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-1">
            {index > 0 && (
              <span aria-hidden className="px-1 text-mark">
                ›
              </span>
            )}
            <span className="text-muted">{step.label}</span>
            <span className="text-ink">{step.value}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {meta.model} · {formatMs(meta.totalMs)} total
      </p>
    </div>
  );
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
