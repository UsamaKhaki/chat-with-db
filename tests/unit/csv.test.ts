import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header and rows with CRLF line endings", () => {
    const csv = toCsv({
      columns: [
        { name: "country", kind: "text" },
        { name: "customers", kind: "number" },
      ],
      rows: [
        ["Germany", 104],
        ["France", 50],
      ],
      truncated: false,
    });
    expect(csv).toBe("country,customers\r\nGermany,104\r\nFrance,50\r\n");
  });

  it("quotes fields with commas, quotes and newlines, and leaves nulls empty", () => {
    const csv = toCsv({
      columns: [
        { name: "name", kind: "text" },
        { name: "note", kind: "text" },
      ],
      rows: [
        ['Home, "Kitchen"', null],
        ["a\nb", "ok"],
      ],
      truncated: false,
    });
    expect(csv).toBe('name,note\r\n"Home, ""Kitchen""",\r\n"a\nb",ok\r\n');
  });
});
