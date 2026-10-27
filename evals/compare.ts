import type { CellValue, QueryResult } from "@/lib/sql/execute";

/**
 * Execution accuracy: does the generated query return the same data as the
 * reference? Column names and order are ignored, and extra columns in the
 * generated result are allowed, so "SELECT city, count(*)" still matches a
 * reference of "SELECT city". Reference queries therefore select only the
 * columns the question actually asks for.
 */
export function resultsMatch(
  expected: QueryResult,
  actual: QueryResult,
  orderMatters = false,
): boolean {
  if (expected.rows.length !== actual.rows.length) return false;
  if (expected.columns.length > actual.columns.length) return false;

  const expectedColumns = expected.columns.map((_, index) =>
    columnValues(expected, index),
  );
  const actualColumns = actual.columns.map((_, index) =>
    columnValues(actual, index),
  );

  // Candidate actual columns for each expected column: same values as a multiset.
  const candidates = expectedColumns.map((values) =>
    actualColumns.flatMap((other, index) =>
      sameMultiset(values, other) ? [index] : [],
    ),
  );
  if (candidates.some((list) => list.length === 0)) return false;

  return someMapping(candidates, (mapping) =>
    rowsMatch(expected, actual, mapping, orderMatters),
  );
}

/** Rounds numbers to two decimals so 1234.5 and 1234.50 compare equal. */
export function normalize(value: CellValue): string {
  if (value === null) return "∅";
  if (typeof value === "number") return value.toFixed(2);
  return String(value).trim().toLowerCase();
}

function columnValues(result: QueryResult, index: number): string[] {
  return result.rows.map((row) => normalize(row[index]));
}

function sameMultiset(a: string[], b: string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function rowsMatch(
  expected: QueryResult,
  actual: QueryResult,
  mapping: number[],
  orderMatters: boolean,
): boolean {
  const expectedRows = expected.rows.map((row) =>
    row.map(normalize).join("\u0000"),
  );
  const actualRows = actual.rows.map((row) =>
    mapping.map((index) => normalize(row[index])).join("\u0000"),
  );
  if (orderMatters)
    return expectedRows.every((row, index) => row === actualRows[index]);
  return sameMultiset(expectedRows, actualRows);
}

/** Tries each assignment of distinct actual columns, stopping at the first that passes. */
function someMapping(
  candidates: number[][],
  test: (mapping: number[]) => boolean,
  chosen: number[] = [],
): boolean {
  if (chosen.length === candidates.length) return test(chosen);
  for (const index of candidates[chosen.length]) {
    if (chosen.includes(index)) continue;
    if (someMapping(candidates, test, [...chosen, index])) return true;
  }
  return false;
}
