import { describe, expect, it } from "vitest";
import { resultsMatch } from "../../evals/compare";
import type { QueryResult, ResultColumn } from "@/lib/sql/execute";

const text = (name: string): ResultColumn => ({ name, kind: "text" });
const num = (name: string): ResultColumn => ({ name, kind: "number" });

function result(
  columns: ResultColumn[],
  rows: QueryResult["rows"],
): QueryResult {
  return { columns, rows, truncated: false };
}

const reference = result(
  [text("country"), num("count")],
  [
    ["Germany", 104],
    ["France", 50],
  ],
);

describe("resultsMatch", () => {
  it("ignores column names, column order and row order", () => {
    const actual = result(
      [num("customers"), text("country")],
      [
        [50, "France"],
        [104, "Germany"],
      ],
    );
    expect(resultsMatch(reference, actual)).toBe(true);
  });

  it("allows extra columns in the generated result", () => {
    const expected = result([text("city")], [["Abu Dhabi"]]);
    const actual = result([text("city"), num("orders")], [["Abu Dhabi", 353]]);
    expect(resultsMatch(expected, actual)).toBe(true);
  });

  it("treats 2-decimal rounding as equal", () => {
    const expected = result([num("avg")], [[3.6449999]]);
    expect(resultsMatch(expected, result([num("x")], [[3.64]]))).toBe(true);
    expect(resultsMatch(expected, result([num("x")], [[3.6]]))).toBe(false);
  });

  it("rejects different values, missing rows and missing columns", () => {
    expect(
      resultsMatch(
        reference,
        result(
          [text("country"), num("count")],
          [
            ["Germany", 105],
            ["France", 50],
          ],
        ),
      ),
    ).toBe(false);
    expect(
      resultsMatch(
        reference,
        result([text("country"), num("count")], [["Germany", 104]]),
      ),
    ).toBe(false);
    expect(
      resultsMatch(
        reference,
        result([text("country")], [["Germany"], ["France"]]),
      ),
    ).toBe(false);
  });

  it("rejects values that only match when paired with the wrong rows", () => {
    const actual = result(
      [text("country"), num("count")],
      [
        ["Germany", 50],
        ["France", 104],
      ],
    );
    expect(resultsMatch(reference, actual)).toBe(false);
  });

  it("checks order only when asked", () => {
    const expected = result([num("revenue")], [[1], [2], [3]]);
    const shuffled = result([num("revenue")], [[3], [1], [2]]);
    expect(resultsMatch(expected, shuffled)).toBe(true);
    expect(resultsMatch(expected, shuffled, true)).toBe(false);
  });

  it("does not map two expected columns onto the same actual column", () => {
    const expected = result([num("a"), num("b")], [[1, 1]]);
    expect(resultsMatch(expected, result([num("a")], [[1]]))).toBe(false);
  });
});
