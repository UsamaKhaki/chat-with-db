import { afterAll, describe, expect, it } from "vitest";
import { executeReadOnly } from "@/lib/sql/execute";
import { QueryError } from "@/lib/sql/errors";
import { readonlyPool } from "./database";

const pool = readonlyPool();
const options = { rowLimit: 100, timeoutMs: 2_000 };

afterAll(() => pool.end());

async function failureCode(sql: string, overrides = {}) {
  try {
    await executeReadOnly(pool, sql, { ...options, ...overrides });
  } catch (error) {
    if (error instanceof QueryError) return error.code;
    throw error;
  }
  throw new Error(`expected "${sql}" to fail`);
}

describe("executeReadOnly", () => {
  it("returns typed columns and rows", async () => {
    const result = await executeReadOnly(
      pool,
      "SELECT status, count(*) AS orders, min(ordered_at) AS first FROM orders GROUP BY status ORDER BY status",
      options,
    );
    expect(result.columns).toEqual([
      { name: "status", kind: "text" },
      { name: "orders", kind: "number" },
      { name: "first", kind: "date" },
    ]);
    expect(result.rows).toHaveLength(6);
    expect(typeof result.rows[0][1]).toBe("number");
    expect(result.rows[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.truncated).toBe(false);
  });

  it("stops at the row limit and reports truncation", async () => {
    const result = await executeReadOnly(
      pool,
      "SELECT id FROM orders ORDER BY id DESC",
      {
        ...options,
        rowLimit: 10,
      },
    );
    expect(result.rows).toHaveLength(10);
    expect(result.rows[0][0]).toBe(3000);
    expect(result.truncated).toBe(true);
  });

  it("keeps duplicate column names", async () => {
    const result = await executeReadOnly(
      pool,
      "SELECT o.id, c.id FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 1",
      options,
    );
    expect(result.columns.map((column) => column.name)).toEqual(["id", "id"]);
  });

  it("cancels queries that exceed the timeout", async () => {
    // The validator would reject pg_sleep; this checks the database-level limit.
    expect(await failureCode("SELECT pg_sleep(2)", { timeoutMs: 200 })).toBe(
      "timeout",
    );
  });

  it("maps a missing column to invalid_query", async () => {
    expect(await failureCode("SELECT nope FROM orders")).toBe("invalid_query");
  });
});

describe("chat_readonly role (defence in depth if validation is bypassed)", () => {
  it("cannot write to shop tables, even when it asks for a read-write transaction", async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query("INSERT INTO categories VALUES (99, 'x')"),
      ).rejects.toMatchObject({
        code: "25006", // read_only_sql_transaction, from the role default
      });
      await client.query("BEGIN READ WRITE");
      await expect(
        client.query("INSERT INTO categories VALUES (99, 'x')"),
      ).rejects.toMatchObject({
        code: "42501", // insufficient_privilege, from the missing grant
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("refuses non-SELECT statements inside the cursor", async () => {
    expect(
      await failureCode("INSERT INTO categories VALUES (99, 'x') RETURNING id"),
    ).toBe("invalid_query");
  });

  it("cannot read the rag schema", async () => {
    expect(await failureCode("SELECT * FROM rag.documents")).toBe(
      "permission_denied",
    );
  });

  it("cannot turn off read-only mode for its session defaults", async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query("SHOW default_transaction_read_only");
      expect(rows[0].default_transaction_read_only).toBe("on");
    } finally {
      client.release();
    }
  });

  it("cannot create objects", async () => {
    const client = await pool.connect();
    try {
      await expect(
        client.query(
          "BEGIN READ WRITE; CREATE TABLE shop.evil (id int); ROLLBACK",
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
