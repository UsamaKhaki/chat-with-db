import { answerQuestion, type AskResponse } from "./ask";
import { loadCatalog, type SchemaCatalog } from "./catalog";
import { getAppPool, getReadonlyPool } from "./db";
import { getEnv, resolveModelConfig } from "./env";
import { createEmbedder, createLanguageModel } from "./llm";
import { retrieveContext } from "./retrieval/knowledge";
import { toQueryError, userMessageFor } from "./sql/errors";
import { executeReadOnly } from "./sql/execute";
import { validateSql } from "./sql/validate";

let catalogPromise: Promise<SchemaCatalog> | undefined;

function getCatalog(): Promise<SchemaCatalog> {
  // Cached for the life of the process; a failed load is retried next time.
  catalogPromise ??= loadCatalog(getReadonlyPool()).catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

/** Wires the pipeline to the real database and model from the environment. */
export async function ask(question: string): Promise<AskResponse> {
  const env = getEnv();
  const modelConfig = resolveModelConfig(env);
  if (!modelConfig) {
    return {
      ok: false,
      code: "model_not_configured",
      message: userMessageFor("model_not_configured"),
    };
  }

  let catalog: SchemaCatalog;
  try {
    catalog = await getCatalog();
  } catch (error) {
    const queryError = toQueryError(error);
    console.error(
      JSON.stringify({
        event: "catalog_failure",
        code: queryError.code,
        detail: queryError.detail,
      }),
    );
    return {
      ok: false,
      code: queryError.code,
      message: userMessageFor(queryError.code),
    };
  }

  const allowedTables = new Set(catalog.tables.map((table) => table.name));
  const embedder = createEmbedder(
    env.OPENAI_API_KEY,
    env.OPENAI_EMBEDDING_MODEL,
  );

  return answerQuestion(question, {
    model: createLanguageModel(modelConfig),
    retrieve: (text) =>
      retrieveContext(text, catalog, { pool: getAppPool(), embedder }),
    validate: (sql) =>
      validateSql(sql, { schema: catalog.schema, allowedTables }),
    execute: (sql) =>
      executeReadOnly(getReadonlyPool(), sql, {
        rowLimit: env.QUERY_ROW_LIMIT,
        timeoutMs: env.QUERY_TIMEOUT_MS,
      }),
  });
}
