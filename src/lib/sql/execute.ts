import type { Pool, PoolClient } from "pg";
import { toQueryError } from "./errors";

export type ColumnKind = "number" | "date" | "boolean" | "text";

export interface ResultColumn {
  name: string;
  kind: ColumnKind;
}

export type CellValue = string | number | boolean | null;

export interface QueryResult {
  columns: ResultColumn[];
  rows: CellValue[][];
  /** True when the query returned more rows than the limit allowed. */
  truncated: boolean;
}

export interface ExecuteOptions {
  rowLimit: number;
  timeoutMs: number;
}

// Postgres type OIDs, from pg_type.
const NUMBER_TYPES = new Set([20, 21, 23, 26, 700, 701, 1700]);
const DATE_TYPES = new Set([1082, 1114, 1184]);
const BOOLEAN_TYPE = 16;

/**
 * Runs already-validated SQL as the read-only role. The query is wrapped in
 * a READ ONLY transaction and read through a cursor, so the row limit stops
 * Postgres from producing more rows than we need and the original ORDER BY
 * is kept exactly as written.
 */
export async function executeReadOnly(
  pool: Pool,
  sql: string,
  { rowLimit, timeoutMs }: ExecuteOptions,
): Promise<QueryResult> {
  if (!Number.isInteger(rowLimit) || rowLimit < 1)
    throw new Error("rowLimit must be a positive integer");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw new Error("timeoutMs must be a positive integer");

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    await client.query(`DECLARE answer_cursor NO SCROLL CURSOR FOR ${sql}`);
    const result = await client.query({
      text: `FETCH ${rowLimit + 1} FROM answer_cursor`,
      rowMode: "array",
    });

    const columns = result.fields.map((field) => ({
      name: field.name,
      kind: columnKind(field.dataTypeID),
    }));
    const rows = (result.rows as unknown[][])
      .slice(0, rowLimit)
      .map((row) =>
        row.map((value, index) => toCell(value, columns[index].kind)),
      );

    return { columns, rows, truncated: result.rows.length > rowLimit };
  } catch (error) {
    throw toQueryError(error);
  } finally {
    if (client) {
      // A failed ROLLBACK means the connection is broken, so it is
      // destroyed instead of going back into the pool.
      const rolledBack = await client.query("ROLLBACK").then(
        () => true,
        () => false,
      );
      client.release(!rolledBack);
    }
  }
}

function columnKind(dataTypeId: number): ColumnKind {
  if (NUMBER_TYPES.has(dataTypeId)) return "number";
  if (DATE_TYPES.has(dataTypeId)) return "date";
  if (dataTypeId === BOOLEAN_TYPE) return "boolean";
  return "text";
}

function toCell(value: unknown, kind: ColumnKind): CellValue {
  if (value === null || value === undefined) return null;
  // node-postgres returns bigint and numeric as strings to avoid precision
  // loss. Values in an answer table are shown and charted, so a JS number
  // is precise enough here.
  if (kind === "number") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  return JSON.stringify(value);
}
