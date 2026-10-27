import { describe, expect, it, vi } from "vitest";
import { answerQuestion, type AskDependencies } from "@/lib/ask";
import { QueryError } from "@/lib/sql/errors";
import type { QueryResult } from "@/lib/sql/execute";
import { validateSql } from "@/lib/sql/validate";
import { scriptedModel } from "./fakes";

const result: QueryResult = {
  columns: [
    { name: "status", kind: "text" },
    { name: "orders", kind: "number" },
  ],
  rows: [
    ["delivered", 1918],
    ["shipped", 302],
  ],
  truncated: false,
};

const allowedTables = new Set(["orders", "customers"]);

function deps(
  model: AskDependencies["model"],
  overrides: Partial<AskDependencies> = {},
): AskDependencies {
  return {
    model,
    retrieve: async () => ({
      tables: ["Table orders"],
      examples: [],
      strategy: "full",
    }),
    validate: (sql) => validateSql(sql, { schema: "shop", allowedTables }),
    execute: async () => result,
    ...overrides,
  };
}

function sqlReply(sql: string) {
  return { answerable: true, sql, explanation: "Counts orders per status." };
}

// The pipeline logs failures for operators; keep test output readable.
vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("answerQuestion", () => {
  it("returns the answer, SQL, rows and a chart", async () => {
    const { model, calls } = scriptedModel({
      generate_sql: [
        sqlReply("SELECT status, count(*) AS orders FROM orders GROUP BY 1;"),
      ],
      summarize_result: [{ answer: "Most orders are delivered." }],
    });

    const response = await answerQuestion(
      "How many orders per status?",
      deps(model),
    );

    expect(response).toMatchObject({
      ok: true,
      answer: "Most orders are delivered.",
      sql: "SELECT status, count(*) AS orders FROM orders GROUP BY 1",
      chart: { type: "bar", x: 0, y: [1] },
      meta: { model: "fake:scripted", retrieval: "full", attempts: 1 },
    });
    expect(calls[0].prompt).toContain(
      "<question>\nHow many orders per status?\n</question>",
    );
    expect(calls[1].prompt).toContain("delivered | 1918");
  });

  it("reports unanswerable questions without running anything", async () => {
    const execute = vi.fn();
    const { model } = scriptedModel({
      generate_sql: [
        { answerable: false, sql: "", explanation: "No weather data." },
      ],
    });

    const response = await answerQuestion(
      "Will it rain tomorrow?",
      deps(model, { execute }),
    );

    expect(response).toMatchObject({ ok: false, code: "unanswerable" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("asks the model to repair a query the validator rejects", async () => {
    const { model, calls } = scriptedModel({
      generate_sql: [
        sqlReply("SELECT * FROM invoices"),
        sqlReply("SELECT count(*) AS orders FROM orders"),
      ],
      summarize_result: [{ answer: "There are 3000 orders." }],
    });

    const response = await answerQuestion("How many orders?", deps(model));

    expect(response).toMatchObject({ ok: true, meta: { attempts: 2 } });
    expect(calls[1].prompt).toContain('Table "invoices" is not available.');
  });

  it("asks the model to repair a query Postgres rejects", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        new QueryError("invalid_query", 'column "total" does not exist'),
      )
      .mockResolvedValueOnce(result);
    const { model, calls } = scriptedModel({
      generate_sql: [
        sqlReply("SELECT total FROM orders"),
        sqlReply("SELECT count(*) FROM orders"),
      ],
      summarize_result: [{ answer: "ok" }],
    });

    const response = await answerQuestion("Total?", deps(model, { execute }));

    expect(response.ok).toBe(true);
    expect(calls[1].prompt).toContain('column "total" does not exist');
  });

  it("gives up after the repair attempt also fails", async () => {
    const { model } = scriptedModel({
      generate_sql: [
        sqlReply("SELECT * FROM invoices"),
        sqlReply("SELECT * FROM refunds"),
      ],
    });

    const response = await answerQuestion("Invoices?", deps(model));

    expect(response).toMatchObject({
      ok: false,
      code: "table_not_allowed",
      sql: "SELECT * FROM refunds",
    });
  });

  it("does not offer a repair for write attempts", async () => {
    const { model, calls } = scriptedModel({
      generate_sql: [
        sqlReply(
          "WITH x AS (DELETE FROM orders RETURNING id) SELECT count(*) FROM x",
        ),
      ],
    });

    const response = await answerQuestion("Delete all orders", deps(model));

    expect(response).toMatchObject({ ok: false, code: "write_not_allowed" });
    expect(calls).toHaveLength(1);
  });

  it("does not retry timeouts", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(new QueryError("timeout", "canceling statement"));
    const { model } = scriptedModel({
      generate_sql: [sqlReply("SELECT count(*) FROM orders")],
    });

    const response = await answerQuestion("Count", deps(model, { execute }));

    expect(response).toMatchObject({ ok: false, code: "timeout" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps internal error detail out of the response", async () => {
    const execute = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("password authentication failed"), {
          code: "28P01",
        }),
      );
    const { model } = scriptedModel({
      generate_sql: [sqlReply("SELECT count(*) FROM orders")],
    });

    const response = await answerQuestion("Count", deps(model, { execute }));

    expect(response).toMatchObject({ ok: false, code: "database_unavailable" });
    expect(JSON.stringify(response)).not.toContain("password");
  });

  it("maps a model outage to model_unavailable", async () => {
    const { model } = scriptedModel({
      generate_sql: [new QueryError("model_unavailable", "429 rate limited")],
    });

    expect(await answerQuestion("Count", deps(model))).toMatchObject({
      ok: false,
      code: "model_unavailable",
    });
  });

  it("still returns the rows when only the summary fails", async () => {
    const { model } = scriptedModel({
      generate_sql: [
        sqlReply("SELECT status, count(*) FROM orders GROUP BY 1"),
      ],
      summarize_result: [new QueryError("model_unavailable", "overloaded")],
    });

    const response = await answerQuestion("Orders per status", deps(model));

    expect(response).toMatchObject({
      ok: true,
      answer: expect.stringContaining("2 matching rows"),
    });
  });

  it("skips the summary call for empty results", async () => {
    const { model, calls } = scriptedModel({
      generate_sql: [sqlReply("SELECT id FROM orders WHERE false")],
    });

    const response = await answerQuestion(
      "Nothing",
      deps(model, { execute: async () => ({ ...result, rows: [] }) }),
    );

    expect(response).toMatchObject({
      ok: true,
      answer: "The query ran but returned no rows.",
    });
    expect(calls).toHaveLength(1);
  });
});
