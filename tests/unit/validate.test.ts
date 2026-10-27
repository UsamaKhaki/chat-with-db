import { describe, expect, it } from "vitest";
import { validateSql, type ValidationFailure } from "@/lib/sql/validate";

const options = {
  schema: "shop",
  allowedTables: new Set([
    "customers",
    "orders",
    "order_items",
    "products",
    "categories",
    "reviews",
  ]),
};

async function rejection(sql: string): Promise<ValidationFailure | null> {
  const result = await validateSql(sql, options);
  return result.ok ? null : result.reason;
}

describe("validateSql", () => {
  it.each([
    "SELECT count(*) FROM orders",
    "select c.country, count(*) from shop.customers c group by 1 order by 2 desc",
    "WITH monthly AS (SELECT date_trunc('month', ordered_at) AS month, count(*) AS n FROM orders GROUP BY 1) SELECT * FROM monthly ORDER BY month",
    "SELECT extract(year FROM ordered_at) AS year, sum(oi.quantity * oi.unit_price) FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY 1",
    "SELECT name FROM products WHERE id IN (SELECT product_id FROM reviews WHERE rating = 5)",
    "SELECT coalesce(nullif(city, ''), 'unknown'), round(avg(rating), 2) FROM reviews r JOIN customers c ON c.id = r.customer_id GROUP BY 1",
    "SELECT id, rank() OVER (ORDER BY price DESC) FROM products",
    "SELECT d::date FROM generate_series('2024-01-01'::date, '2024-02-01'::date, interval '1 day') AS d",
    "SELECT 1 UNION ALL SELECT 2",
  ])("accepts %s", async (sql) => {
    expect(await rejection(sql)).toBeNull();
  });

  it("strips trailing semicolons and whitespace", async () => {
    const result = await validateSql("  SELECT 1;;  \n", options);
    expect(result).toEqual({ ok: true, sql: "SELECT 1" });
  });

  it.each<[string, ValidationFailure]>([
    ["", "empty"],
    ["   ;", "empty"],
    ["SELEC 1", "syntax_error"],
    ["SELECT 1; SELECT 2", "multiple_statements"],
    ["SELECT 1; DROP TABLE orders", "multiple_statements"],
    ["DELETE FROM orders", "not_select"],
    ["UPDATE products SET price = 0", "not_select"],
    ["INSERT INTO categories VALUES (9, 'x')", "not_select"],
    ["DROP TABLE orders", "not_select"],
    ["TRUNCATE orders", "not_select"],
    ["EXPLAIN ANALYZE SELECT 1", "not_select"],
    ["SET statement_timeout = 0", "not_select"],
    ["COPY orders TO '/tmp/x'", "not_select"],
    ["CREATE TABLE x AS SELECT 1", "not_select"],
    [
      "WITH gone AS (DELETE FROM orders RETURNING *) SELECT count(*) FROM gone",
      "write_not_allowed",
    ],
    [
      "WITH x AS (UPDATE products SET price = 1 RETURNING id) SELECT * FROM x",
      "write_not_allowed",
    ],
    ["SELECT * INTO backup FROM orders", "write_not_allowed"],
    ["SELECT * FROM orders FOR UPDATE", "locking_not_allowed"],
    ["SELECT * FROM rag.documents", "table_not_allowed"],
    ["SELECT * FROM pg_catalog.pg_authid", "table_not_allowed"],
    ["SELECT * FROM pg_user", "table_not_allowed"],
    ["SELECT * FROM information_schema.tables", "table_not_allowed"],
    ["SELECT * FROM public.orders", "table_not_allowed"],
    ["SELECT * FROM orders o JOIN secrets s ON true", "table_not_allowed"],
    ["SELECT pg_sleep(10)", "function_not_allowed"],
    ["SELECT pg_read_file('/etc/passwd')", "function_not_allowed"],
    [
      "SELECT set_config('statement_timeout', '0', false)",
      "function_not_allowed",
    ],
    [
      "SELECT * FROM dblink('host=evil', 'select 1') AS t(x int)",
      "function_not_allowed",
    ],
    ["SELECT lo_import('/etc/passwd')", "function_not_allowed"],
    ["SELECT current_setting('data_directory')", "function_not_allowed"],
    ["SELECT shop.count(*) FROM orders", "function_not_allowed"],
    [
      "SELECT count(*) FROM orders WHERE id = (SELECT pg_terminate_backend(1))",
      "function_not_allowed",
    ],
  ])("rejects %s as %s", async (sql, reason) => {
    expect(await rejection(sql)).toBe(reason);
  });

  it("rejects queries over the length limit", async () => {
    expect(await rejection(`SELECT ${"1 + ".repeat(5000)}1`)).toBe("too_long");
  });

  it("does not let a CTE name shadow a forbidden schema-qualified table", async () => {
    expect(
      await rejection(
        "WITH documents AS (SELECT 1) SELECT * FROM rag.documents",
      ),
    ).toBe("table_not_allowed");
  });

  it("explains the failure in a message the model can act on", async () => {
    const result = await validateSql("SELECT pg_sleep(1)", options);
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("pg_sleep"),
    });
  });
});
