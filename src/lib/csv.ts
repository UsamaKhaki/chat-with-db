import type { QueryResult } from "./sql/execute";

/** RFC 4180 CSV: quote fields containing commas, quotes or line breaks. */
export function toCsv({ columns, rows }: QueryResult): string {
  const lines = [columns.map((column) => column.name), ...rows].map((row) =>
    row
      .map((value) => escapeField(value === null ? "" : String(value)))
      .join(","),
  );
  return `${lines.join("\r\n")}\r\n`;
}

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
