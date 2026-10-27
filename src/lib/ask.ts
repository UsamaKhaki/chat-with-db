import { z } from "zod";
import { pickChart, type ChartSpec } from "./chart";
import type { LanguageModel } from "./llm";
import {
  ANSWER_SYSTEM_PROMPT,
  SQL_SYSTEM_PROMPT,
  answerPrompt,
  repairPrompt,
  sqlPrompt,
} from "./prompts";
import type { RetrievedContext } from "./retrieval/knowledge";
import {
  QueryError,
  isRepairable,
  toQueryError,
  userMessageFor,
  type FailureCode,
} from "./sql/errors";
import type { QueryResult } from "./sql/execute";
import type { ValidationResult } from "./sql/validate";

export const MAX_QUESTION_LENGTH = 500;

/** One rejected query plus one rewrite: enough for typos, cheap on latency. */
const MAX_SQL_ATTEMPTS = 2;

const generatedSqlSchema = z.object({
  answerable: z
    .boolean()
    .describe("False when the schema cannot answer the question"),
  sql: z
    .string()
    .describe(
      "A single PostgreSQL SELECT statement, or empty when not answerable",
    ),
  explanation: z
    .string()
    .describe(
      "One sentence on how the query answers the question, or why it cannot",
    ),
});

const answerSchema = z.object({
  answer: z
    .string()
    .describe("One to three sentences answering the question from the rows"),
});

export interface AskDependencies {
  model: LanguageModel;
  retrieve(question: string): Promise<RetrievedContext>;
  validate(sql: string): Promise<ValidationResult>;
  execute(sql: string): Promise<QueryResult>;
}

export type AskResponse =
  | {
      ok: true;
      answer: string;
      sql: string;
      explanation: string;
      result: QueryResult;
      chart: ChartSpec | null;
      meta: {
        model: string;
        retrieval: RetrievedContext["strategy"];
        attempts: number;
      };
    }
  | { ok: false; code: FailureCode; message: string; sql?: string };

export async function answerQuestion(
  question: string,
  deps: AskDependencies,
): Promise<AskResponse> {
  let lastSql: string | undefined;
  try {
    const context = await deps.retrieve(question);
    const basePrompt = sqlPrompt(question, context);
    let prompt = basePrompt;

    for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
      const generated = await deps.model.generateObject({
        name: "generate_sql",
        system: SQL_SYSTEM_PROMPT,
        prompt,
        schema: generatedSqlSchema,
      });
      if (!generated.answerable || generated.sql.trim() === "") {
        logFailure(
          new QueryError("unanswerable", generated.explanation),
          question,
        );
        return failure("unanswerable");
      }
      lastSql = generated.sql;

      const validation = await deps.validate(generated.sql);
      let problem: QueryError;
      if (validation.ok) {
        lastSql = validation.sql;
        try {
          const result = await deps.execute(validation.sql);
          const answer = await summarize(
            deps.model,
            question,
            validation.sql,
            result,
          );
          return {
            ok: true,
            answer,
            sql: validation.sql,
            explanation: generated.explanation,
            result,
            chart: pickChart(result),
            meta: {
              model: deps.model.id,
              retrieval: context.strategy,
              attempts: attempt,
            },
          };
        } catch (error) {
          problem = toQueryError(error);
        }
      } else {
        problem = new QueryError(validation.reason, validation.message);
      }

      logFailure(problem, question, generated.sql);
      if (!isRepairable(problem.code) || attempt === MAX_SQL_ATTEMPTS) {
        return failure(problem.code, lastSql);
      }
      prompt = repairPrompt(basePrompt, generated.sql, problem.detail);
    }
    return failure("internal_error", lastSql);
  } catch (error) {
    const queryError = toQueryError(error);
    logFailure(queryError, question, lastSql);
    return failure(queryError.code, lastSql);
  }
}

async function summarize(
  model: LanguageModel,
  question: string,
  sql: string,
  result: QueryResult,
) {
  if (result.rows.length === 0) return "The query ran but returned no rows.";
  try {
    const { answer } = await model.generateObject({
      name: "summarize_result",
      system: ANSWER_SYSTEM_PROMPT,
      prompt: answerPrompt(question, sql, result),
      schema: answerSchema,
    });
    return answer;
  } catch (error) {
    // The table and SQL are the real answer; a missing summary should not
    // throw them away.
    logFailure(toQueryError(error), question, sql);
    const rows = result.truncated
      ? `the first ${result.rows.length}`
      : String(result.rows.length);
    return `Here are ${rows} matching rows. A written summary is not available right now.`;
  }
}

function failure(code: FailureCode, sql?: string): AskResponse {
  // Blocked or failed SQL is still shown, since seeing it helps the user
  // rephrase; error details never leave the server.
  return {
    ok: false,
    code,
    message: userMessageFor(code),
    ...(sql ? { sql } : {}),
  };
}

function logFailure(error: QueryError, question: string, sql?: string) {
  console.error(
    JSON.stringify({
      event: "ask_failure",
      code: error.code,
      detail: error.detail,
      question,
      sql,
    }),
  );
}
