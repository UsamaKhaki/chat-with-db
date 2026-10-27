import { formatCell } from "@/lib/format";
import type { QueryResult } from "@/lib/sql/execute";

export function ResultTable({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        The query returned no rows.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-[26rem] overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-sunken">
            <tr>
              {result.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`border-b border-line px-3 py-2 font-display text-xs font-semibold tracking-wide whitespace-nowrap text-muted ${
                    column.kind === "number" ? "text-right" : "text-left"
                  }`}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-mark-soft/40">
                {row.map((value, index) => {
                  const kind = result.columns[index].kind;
                  return (
                    <td
                      key={index}
                      className={`border-b border-line/60 px-3 py-1.5 whitespace-nowrap ${
                        kind === "number"
                          ? "text-right font-mono text-[13px] tabular-nums"
                          : ""
                      } ${value === null ? "text-muted italic" : ""}`}
                    >
                      {formatCell(value, kind)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && (
        <p className="text-xs text-muted">
          Showing the first {result.rows.length.toLocaleString("en-GB")} rows.
          The result was cut off at the row limit; ask a narrower question to
          see the rest.
        </p>
      )}
    </div>
  );
}
