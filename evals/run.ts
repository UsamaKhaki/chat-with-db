import {
  answerQuestion,
  type AskDependencies,
  type AskResponse,
} from "@/lib/ask";
import type { QueryResult } from "@/lib/sql/execute";
import type { EvalCase } from "./cases";
import { resultsMatch } from "./compare";

export interface CaseOutcome {
  id: string;
  question: string;
  passed: boolean;
  reason: string;
  sql?: string;
  durationMs: number;
}

/**
 * Runs each case through the real pipeline and scores it. Reference SQL is
 * executed through the same read-only executor, so both sides see the same
 * row limit and type conversion.
 */
export async function runCases(
  cases: EvalCase[],
  deps: AskDependencies,
  runReference: (sql: string) => Promise<QueryResult>,
): Promise<CaseOutcome[]> {
  const outcomes: CaseOutcome[] = [];
  for (const evalCase of cases) {
    const started = Date.now();
    const response = await answerQuestion(evalCase.question, deps);
    const durationMs = Date.now() - started;
    const { passed, reason } = await score(evalCase, response, runReference);
    outcomes.push({
      id: evalCase.id,
      question: evalCase.question,
      passed,
      reason,
      sql: response.sql,
      durationMs,
    });
  }
  return outcomes;
}

async function score(
  evalCase: EvalCase,
  response: AskResponse,
  runReference: (sql: string) => Promise<QueryResult>,
): Promise<{ passed: boolean; reason: string }> {
  if (!("referenceSql" in evalCase)) {
    return response.ok
      ? {
          passed: false,
          reason: `expected no answer, got ${response.result.rows.length} rows`,
        }
      : { passed: true, reason: `declined (${response.code})` };
  }
  if (!response.ok)
    return { passed: false, reason: `pipeline failed: ${response.code}` };

  const expected = await runReference(evalCase.referenceSql);
  return resultsMatch(expected, response.result, evalCase.orderMatters)
    ? { passed: true, reason: "result matches reference" }
    : {
        passed: false,
        reason: `result differs (${response.result.rows.length} rows vs ${expected.rows.length} expected)`,
      };
}
