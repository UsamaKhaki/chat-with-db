import { formatCell } from "@/lib/format";
import type { QueryResult } from "@/lib/sql/execute";

export function ResultTable({ result }: { result: QueryResult }) {
  if (result.rows.length === 0) {
    return <p className="text-sm text-muted">No rows.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="max-h-[28rem] overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-panel">
            <tr>
              {result.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`border-b border-line px-3 py-2 font-medium whitespace-nowrap text-muted ${
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
              <tr key={rowIndex} className="odd:bg-surface even:bg-panel/50">
                {row.map((value, index) => {
                  const kind = result.columns[index].kind;
                  return (
                    <td
                      key={index}
                      className={`border-b border-line/60 px-3 py-1.5 whitespace-nowrap ${
                        kind === "number" ? "text-right tabular-nums" : ""
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
      <p className="text-xs text-muted">
        {result.rows.length.toLocaleString("en-GB")}{" "}
        {result.rows.length === 1 ? "row" : "rows"}
        {result.truncated
          ? " shown. The result was cut off at the row limit."
          : ""}
      </p>
    </div>
  );
}
