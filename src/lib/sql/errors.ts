import type { ValidationFailure } from "./validate";

/**
 * Failure codes the ask pipeline can end with. `detail` on QueryError is for
 * server logs and model repair prompts only; users only ever see the text
 * from userMessageFor().
 */
export type FailureCode =
  | ValidationFailure
  | "invalid_query"
  | "timeout"
  | "write_blocked"
  | "permission_denied"
  | "database_unavailable"
  | "model_unavailable"
  | "model_not_configured"
  | "unanswerable"
  | "internal_error";

export class QueryError extends Error {
  constructor(
    readonly code: FailureCode,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "QueryError";
  }
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const POSTGRES_ERROR_CODES: Record<string, FailureCode> = {
  "57014": "timeout", // query_canceled (statement_timeout)
  "25006": "write_blocked", // read_only_sql_transaction
  "42501": "permission_denied", // insufficient_privilege
  "42601": "invalid_query", // syntax_error
  "42P01": "invalid_query", // undefined_table
  "42703": "invalid_query", // undefined_column
  "42883": "invalid_query", // undefined_function
  "42803": "invalid_query", // grouping_error
  "42804": "invalid_query", // datatype_mismatch
  "42702": "invalid_query", // ambiguous_column
  "22P02": "invalid_query", // invalid_text_representation
  "22012": "invalid_query", // division_by_zero
};

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "28P01", // invalid_password
  "3D000", // invalid_catalog_name
]);

export function toQueryError(error: unknown): QueryError {
  if (error instanceof QueryError) return error;

  const code = errorCode(error);
  const detail = error instanceof Error ? error.message : String(error);
  if (code && CONNECTION_ERROR_CODES.has(code)) {
    return new QueryError("database_unavailable", detail);
  }
  if (code && code in POSTGRES_ERROR_CODES) {
    return new QueryError(POSTGRES_ERROR_CODES[code], detail);
  }
  if (
    error instanceof Error &&
    /connect|timeout expired/i.test(error.message)
  ) {
    return new QueryError("database_unavailable", detail);
  }
  return new QueryError("internal_error", detail);
}

/** Errors the model can plausibly fix by rewriting its SQL. */
export function isRepairable(code: FailureCode): boolean {
  return (
    code === "invalid_query" ||
    code === "syntax_error" ||
    code === "table_not_allowed" ||
    code === "function_not_allowed" ||
    code === "not_select" ||
    code === "multiple_statements"
  );
}

export function userMessageFor(code: FailureCode): string {
  switch (code) {
    case "timeout":
      return "That question needed a query that ran too long. Try narrowing it down, for example to a date range.";
    case "unanswerable":
      return "I couldn't answer that from this database. Try asking about customers, orders, products, categories or reviews.";
    case "database_unavailable":
      return "The database is not reachable right now. Please try again in a moment.";
    case "model_unavailable":
      return "The language model did not respond. Please try again in a moment.";
    case "model_not_configured":
      return "No language model is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY on the server.";
    case "write_not_allowed":
    case "write_blocked":
    case "locking_not_allowed":
    case "permission_denied":
      return "This assistant can only read data, so that request was blocked.";
    case "internal_error":
      return "Something went wrong on our side. Please try again.";
    default:
      return "I couldn't turn that question into a valid query. Try rephrasing it.";
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
