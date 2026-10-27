import { describe, expect, it } from "vitest";
import { formatCell } from "@/lib/format";

describe("formatCell", () => {
  it("formats integers and decimals", () => {
    expect(formatCell(1918, "number")).toBe("1,918");
    expect(formatCell(1234.5678, "number")).toBe("1,234.57");
  });

  it("drops the time for midnight UTC dates", () => {
    expect(formatCell("2025-03-01T00:00:00.000Z", "date")).toBe("1 Mar 2025");
    expect(formatCell("2025-03-01T14:30:00.000Z", "date")).toBe(
      "1 Mar 2025, 14:30",
    );
  });

  it("shows nulls explicitly and passes text through", () => {
    expect(formatCell(null, "text")).toBe("null");
    expect(formatCell("delivered", "text")).toBe("delivered");
    expect(formatCell("not a date", "date")).toBe("not a date");
  });
});
