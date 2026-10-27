import { parse } from "libpg-query";

export type ValidationFailure =
  | "empty"
  | "too_long"
  | "syntax_error"
  | "multiple_statements"
  | "not_select"
  | "write_not_allowed"
  | "locking_not_allowed"
  | "table_not_allowed"
  | "function_not_allowed";

export type ValidationResult =
  | { ok: true; sql: string }
  | { ok: false; reason: ValidationFailure; message: string };

export interface ValidationOptions {
  /** Schema the generated SQL may read from. */
  schema: string;
  /** Unqualified table names inside `schema` that may be queried. */
  allowedTables: ReadonlySet<string>;
}

const MAX_SQL_LENGTH = 10_000;

// Functions are allow-listed rather than deny-listed: Postgres has hundreds
// of built-ins and some of them (pg_sleep, pg_read_file, dblink, lo_import,
// set_config, ...) have side effects or leak server details. Anything not
// listed here is rejected and the model is asked to rewrite the query.
const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "stddev",
  "stddev_pop",
  "stddev_samp",
  "variance",
  "var_pop",
  "var_samp",
  "string_agg",
  "array_agg",
  "bool_and",
  "bool_or",
  "every",
  "percentile_cont",
  "percentile_disc",
  "mode",
  "corr",
  // window functions
  "row_number",
  "rank",
  "dense_rank",
  "percent_rank",
  "cume_dist",
  "ntile",
  "lag",
  "lead",
  "first_value",
  "last_value",
  "nth_value",
  // dates and times
  "now",
  "date_trunc",
  "date_part",
  "extract",
  "age",
  "make_date",
  "make_interval",
  "to_char",
  "to_date",
  "to_timestamp",
  "timezone",
  "date_bin",
  "justify_interval",
  // numbers
  "round",
  "floor",
  "ceil",
  "ceiling",
  "abs",
  "trunc",
  "mod",
  "power",
  "sqrt",
  "greatest",
  "least",
  "div",
  "sign",
  "width_bucket",
  // text
  "lower",
  "upper",
  "initcap",
  "length",
  "char_length",
  "concat",
  "concat_ws",
  "substring",
  "substr",
  "left",
  "right",
  "trim",
  "btrim",
  "ltrim",
  "rtrim",
  "replace",
  "split_part",
  "position",
  "strpos",
  "lpad",
  "rpad",
  "format",
  // conditionals and misc
  "coalesce",
  "nullif",
  "generate_series",
  "unnest",
  "array_length",
  "cardinality",
]);

const WRITE_STATEMENTS = new Set([
  "InsertStmt",
  "UpdateStmt",
  "DeleteStmt",
  "MergeStmt",
]);

export async function validateSql(
  rawSql: string,
  options: ValidationOptions,
): Promise<ValidationResult> {
  const sql = rawSql.trim().replace(/;+\s*$/, "");
  if (sql === "") return fail("empty", "The query is empty.");
  if (sql.length > MAX_SQL_LENGTH) {
    return fail(
      "too_long",
      `The query is longer than ${MAX_SQL_LENGTH} characters.`,
    );
  }

  let statements: unknown[];
  try {
    statements = (await parse(sql)).stmts ?? [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail("syntax_error", `The query does not parse: ${detail}`);
  }

  if (statements.length !== 1) {
    return fail("multiple_statements", "Only a single statement is allowed.");
  }
  const root = isRecord(statements[0]) ? statements[0].stmt : undefined;
  if (!isRecord(root) || !("SelectStmt" in root)) {
    const kind = isRecord(root) ? Object.keys(root)[0] : "unknown";
    return fail("not_select", `Only SELECT queries are allowed, got ${kind}.`);
  }

  const cteNames = new Set<string>();
  collectCteNames(root, cteNames);

  const problem = findProblem(root, options, cteNames);
  return problem ?? { ok: true, sql };
}

function findProblem(
  node: unknown,
  options: ValidationOptions,
  cteNames: ReadonlySet<string>,
): ValidationResult | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const problem = findProblem(child, options, cteNames);
      if (problem) return problem;
    }
    return null;
  }
  if (!isRecord(node)) return null;

  for (const [key, value] of Object.entries(node)) {
    if (WRITE_STATEMENTS.has(key)) {
      return fail(
        "write_not_allowed",
        "Data-modifying statements are not allowed.",
      );
    }
    if (key === "intoClause") {
      return fail("write_not_allowed", "SELECT INTO is not allowed.");
    }
    if (key === "lockingClause") {
      return fail(
        "locking_not_allowed",
        "Row locking clauses (FOR UPDATE etc.) are not allowed.",
      );
    }
    if (key === "RangeVar" && isRecord(value)) {
      const problem = checkTable(value, options, cteNames);
      if (problem) return problem;
    }
    if (key === "FuncCall" && isRecord(value)) {
      const problem = checkFunction(value);
      if (problem) return problem;
    }

    const problem = findProblem(value, options, cteNames);
    if (problem) return problem;
  }
  return null;
}

function checkTable(
  rangeVar: Record<string, unknown>,
  { schema, allowedTables }: ValidationOptions,
  cteNames: ReadonlySet<string>,
): ValidationResult | null {
  const schemaName =
    typeof rangeVar.schemaname === "string" ? rangeVar.schemaname : undefined;
  const tableName = String(rangeVar.relname);
  const label = schemaName ? `${schemaName}.${tableName}` : tableName;

  if (!schemaName && cteNames.has(tableName)) return null;
  if (
    (schemaName === undefined || schemaName === schema) &&
    allowedTables.has(tableName)
  ) {
    return null;
  }
  return fail("table_not_allowed", `Table "${label}" is not available.`);
}

function checkFunction(
  funcCall: Record<string, unknown>,
): ValidationResult | null {
  const parts = Array.isArray(funcCall.funcname)
    ? funcCall.funcname.map((part) =>
        isRecord(part) && isRecord(part.String) ? String(part.String.sval) : "",
      )
    : [];
  // The parser rewrites SQL syntax such as EXTRACT(... FROM ...) into
  // pg_catalog-qualified calls, so that one schema prefix is accepted.
  const [schemaName, functionName] =
    parts.length === 2 ? parts : [undefined, parts[0]];
  const name = (functionName ?? "").toLowerCase();

  if (
    (schemaName === undefined || schemaName === "pg_catalog") &&
    ALLOWED_FUNCTIONS.has(name)
  ) {
    return null;
  }
  return fail(
    "function_not_allowed",
    `Function "${parts.join(".")}" is not allowed.`,
  );
}

function collectCteNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCteNames(child, names);
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "CommonTableExpr" &&
      isRecord(value) &&
      typeof value.ctename === "string"
    ) {
      names.add(value.ctename);
    }
    collectCteNames(value, names);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: ValidationFailure, message: string): ValidationResult {
  return { ok: false, reason, message };
}
