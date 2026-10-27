import { describe, expect, it } from "vitest";
import { pickChart } from "@/lib/chart";
import type { QueryResult, ResultColumn } from "@/lib/sql/execute";

function resultOf(
  columns: ResultColumn[],
  rows: QueryResult["rows"],
): QueryResult {
  return { columns, rows, truncated: false };
}

describe("pickChart", () => {
  it("draws a line for a time series", () => {
    const result = resultOf(
      [
        { name: "month", kind: "date" },
        { name: "revenue", kind: "number" },
        { name: "orders", kind: "number" },
      ],
      [
        ["2025-01-01T00:00:00.000Z", 10, 1],
        ["2025-02-01T00:00:00.000Z", 20, 2],
      ],
    );
    expect(pickChart(result)).toEqual({ type: "line", x: 0, y: [1, 2] });
  });

  it("draws bars for a category breakdown and ignores id columns", () => {
    const result = resultOf(
      [
        { name: "product_id", kind: "number" },
        { name: "name", kind: "text" },
        { name: "units", kind: "number" },
      ],
      [
        [1, "Pro Tent", 30],
        [2, "Eco Novel", 20],
      ],
    );
    expect(pickChart(result)).toEqual({ type: "bar", x: 1, y: [2] });
  });

  it("does not plot ids over time", () => {
    const result = resultOf(
      [
        { name: "id", kind: "number" },
        { name: "email", kind: "text" },
        { name: "created_at", kind: "date" },
      ],
      [
        [1, "a@example.com", "2024-01-01T10:00:00.000Z"],
        [2, "b@example.com", "2024-02-01T10:00:00.000Z"],
      ],
    );
    expect(pickChart(result)).toBeNull();
  });

  it("skips single values, text-only results and long category lists", () => {
    const single = resultOf([{ name: "count", kind: "number" }], [[3000]]);
    const textOnly = resultOf(
      [
        { name: "first_name", kind: "text" },
        { name: "email", kind: "text" },
      ],
      [
        ["Ben", "a@example.com"],
        ["Isla", "b@example.com"],
      ],
    );
    const long = resultOf(
      [
        { name: "email", kind: "text" },
        { name: "orders", kind: "number" },
      ],
      Array.from({ length: 31 }, (_, i) => [`c${i}@example.com`, i]),
    );
    expect(pickChart(single)).toBeNull();
    expect(pickChart(textOnly)).toBeNull();
    expect(pickChart(long)).toBeNull();
  });
});
