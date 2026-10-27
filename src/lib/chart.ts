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

  const numeric = columns.flatMap((column, index) =>
    column.kind === "number" ? [index] : [],
  );
  const dateIndex = columns.findIndex((column) => column.kind === "date");
  const textIndex = columns.findIndex((column) => column.kind === "text");

  if (dateIndex !== -1) {
    const y = numeric
      .filter((index) => index !== dateIndex)
      .slice(0, MAX_SERIES);
    if (y.length > 0) return { type: "line", x: dateIndex, y };
  }
  if (textIndex !== -1 && rows.length <= MAX_BARS) {
    // An id column next to a label is an identifier, not a measure.
    const y = numeric
      .filter((index) => !/(^|_)id$/i.test(columns[index].name))
      .slice(0, MAX_SERIES);
    if (y.length > 0) return { type: "bar", x: textIndex, y };
  }
  return null;
}
