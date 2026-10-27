import type { CellValue, ColumnKind } from "./sql/execute";

const integerFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});
const decimalFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatCell(value: CellValue, kind: ColumnKind): string {
  if (value === null) return "null";
  if (kind === "number" && typeof value === "number") {
    return Number.isInteger(value)
      ? integerFormat.format(value)
      : decimalFormat.format(value);
  }
  if (kind === "date" && typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    // date_trunc results sit on UTC midnight; showing 00:00 there is noise.
    const isMidnight =
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0;
    return (isMidnight ? dateFormat : dateTimeFormat).format(date);
  }
  return String(value);
}
