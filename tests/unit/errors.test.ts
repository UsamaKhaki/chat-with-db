import { describe, expect, it } from "vitest";
import {
  QueryError,
  isRepairable,
  toQueryError,
  userMessageFor,
} from "@/lib/sql/errors";

function pgError(code: string, message = "boom") {
  return Object.assign(new Error(message), { code });
}

describe("toQueryError", () => {
  it.each([
    ["57014", "timeout"],
    ["25006", "write_blocked"],
    ["42501", "permission_denied"],
    ["42P01", "invalid_query"],
    ["42703", "invalid_query"],
    ["ECONNREFUSED", "database_unavailable"],
    ["28P01", "database_unavailable"],
    ["XX000", "internal_error"],
  ])("maps %s to %s", (code, expected) => {
    expect(toQueryError(pgError(code)).code).toBe(expected);
  });

  it("keeps the original message as internal detail", () => {
    const error = toQueryError(
      pgError("42703", 'column "secret" does not exist'),
    );
    expect(error.detail).toBe('column "secret" does not exist');
  });

  it("passes QueryError through unchanged", () => {
    const original = new QueryError("timeout", "slow");
    expect(toQueryError(original)).toBe(original);
  });

  it("handles non-Error throws", () => {
    expect(toQueryError("weird").code).toBe("internal_error");
  });
});

describe("userMessageFor", () => {
  it("never includes the internal detail", () => {
    const error = toQueryError(
      pgError("42P01", 'relation "rag.documents" does not exist'),
    );
    expect(userMessageFor(error.code)).not.toContain("rag");
  });
});

describe("isRepairable", () => {
  it("lets the model retry query mistakes but not safety or infrastructure failures", () => {
    expect(isRepairable("invalid_query")).toBe(true);
    expect(isRepairable("function_not_allowed")).toBe(true);
    expect(isRepairable("write_not_allowed")).toBe(false);
    expect(isRepairable("timeout")).toBe(false);
    expect(isRepairable("database_unavailable")).toBe(false);
  });
});
