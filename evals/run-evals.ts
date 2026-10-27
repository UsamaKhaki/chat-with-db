// Scores SQL generation against evals/cases.json.
//   npm run eval                 uses the configured model (needs an API key)
//   npm run eval -- --reference  answers with the reference SQL (harness self-test)
// Writes a JSON report to evals/results/. Exits non-zero below EVAL_MIN_ACCURACY.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { AskDependencies } from "@/lib/ask";
import { loadCatalog } from "@/lib/catalog";
import { parseEnv, resolveModelConfig } from "@/lib/env";
import { createEmbedder, createLanguageModel } from "@/lib/llm";
import { retrieveContext } from "@/lib/retrieval/knowledge";
import { executeReadOnly } from "@/lib/sql/execute";
import { validateSql } from "@/lib/sql/validate";
import { loadCases, referenceModel } from "./cases";
import { runCases } from "./run";

async function main() {
  const env = parseEnv(process.env);
  const cases = loadCases();
  const useReference = process.argv.includes("--reference");
  const modelConfig = resolveModelConfig(env);
  if (!useReference && !modelConfig) {
    console.error(
      "No model configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run with --reference.",
    );
    process.exit(1);
  }
  const model =
    useReference || !modelConfig
      ? referenceModel(cases)
      : createLanguageModel(modelConfig);
  const minAccuracy = Number(
    process.env.EVAL_MIN_ACCURACY ?? (useReference ? 1 : 0.8),
  );

  const appPool = new Pool({ connectionString: env.DATABASE_URL });
  const readonlyPool = new Pool({
    connectionString: env.READONLY_DATABASE_URL,
  });
  try {
    const catalog = await loadCatalog(readonlyPool);
    const allowedTables = new Set(catalog.tables.map((table) => table.name));
    const embedder = createEmbedder(
      env.OPENAI_API_KEY,
      env.OPENAI_EMBEDDING_MODEL,
    );
    const limits = {
      rowLimit: env.QUERY_ROW_LIMIT,
      timeoutMs: env.QUERY_TIMEOUT_MS,
    };
    const execute = (sql: string) => executeReadOnly(readonlyPool, sql, limits);
    const deps: AskDependencies = {
      model,
      retrieve: (question) =>
        retrieveContext(question, catalog, { pool: appPool, embedder }),
      validate: (sql) =>
        validateSql(sql, { schema: catalog.schema, allowedTables }),
      execute,
    };

    const outcomes = await runCases(cases, deps, execute);
    const passed = outcomes.filter((outcome) => outcome.passed).length;
    const accuracy = passed / outcomes.length;

    for (const outcome of outcomes) {
      console.log(
        `${outcome.passed ? "PASS" : "FAIL"}  ${outcome.id.padEnd(30)} ${outcome.reason}`,
      );
    }
    console.log(
      `\n${model.id}: ${passed}/${outcomes.length} passed (${(accuracy * 100).toFixed(1)}%)`,
    );

    const resultsDir = path.join(process.cwd(), "evals", "results");
    mkdirSync(resultsDir, { recursive: true });
    const file = path.join(
      resultsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(
      file,
      JSON.stringify({ model: model.id, accuracy, outcomes }, null, 2),
    );
    console.log(`Report: ${path.relative(process.cwd(), file)}`);

    if (accuracy < minAccuracy) {
      console.error(
        `Accuracy ${accuracy.toFixed(3)} is below the minimum of ${minAccuracy}.`,
      );
      process.exitCode = 1;
    }
  } finally {
    await Promise.all([appPool.end(), readonlyPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
