import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LanguageModel } from "@/lib/llm";

const caseSchema = z.union([
  z.object({
    id: z.string(),
    question: z.string(),
    referenceSql: z.string(),
    orderMatters: z.boolean().optional(),
  }),
  z.object({
    id: z.string(),
    question: z.string(),
    /** The pipeline must decline: no rows may come back. */
    expect: z.literal("no_answer"),
  }),
]);

export type EvalCase = z.infer<typeof caseSchema>;

export function loadCases(
  file = path.join(process.cwd(), "evals", "cases.json"),
): EvalCase[] {
  return z.array(caseSchema).parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * Answers every eval question with its reference SQL (and declines the
 * no_answer cases). Used to self-test the harness, the validator and the
 * comparator in CI, where no model API key is available.
 */
export function referenceModel(cases: EvalCase[]): LanguageModel {
  const byQuestion = new Map(
    cases.map((evalCase) => [evalCase.question, evalCase]),
  );
  return {
    id: "reference",
    async generateObject({ name, prompt, schema }) {
      if (name === "summarize_result")
        return schema.parse({ answer: "reference answer" });
      const question =
        /<question>\n([\s\S]*?)\n<\/question>/.exec(prompt)?.[1] ?? "";
      const evalCase = byQuestion.get(question);
      const reply =
        evalCase && "referenceSql" in evalCase
          ? {
              answerable: true,
              sql: evalCase.referenceSql,
              explanation: "reference",
            }
          : { answerable: false, sql: "", explanation: "reference declines" };
      return schema.parse(reply);
    },
  };
}
