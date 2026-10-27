import type { QueryResult } from "./sql/execute";

export interface ChartSpec {
  type: "line" | "bar";
  /** Column indexes rather than names: result columns can share a name. */
  x: number;
  y: number[];
}

const MAX_SERIES = 3;
const MAX_BARS = 30;

/**
 * Picks a chart from the shape of the result instead of asking the model:
 * it is deterministic, testable and free. Anything that does not fit a
 * clear time series or category breakdown gets no chart, only the table.
 */
export function pickChart({ columns, rows }: QueryResult): ChartSpec | null {
  if (rows.length < 2 || columns.length < 2) return null;

  // Numeric id columns are identifiers, not measures, so they are never plotted.
  const measures = columns
    .flatMap((column, index) =>
      column.kind === "number" && !/(^|_)id$/i.test(column.name) ? [index] : [],
    )
    .slice(0, MAX_SERIES);
  if (measures.length === 0) return null;

  const dateIndex = columns.findIndex((column) => column.kind === "date");
  if (dateIndex !== -1) return { type: "line", x: dateIndex, y: measures };

  const textIndex = columns.findIndex((column) => column.kind === "text");
  if (textIndex !== -1 && rows.length <= MAX_BARS) {
    return { type: "bar", x: textIndex, y: measures };
  }
  return null;
}
