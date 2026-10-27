// Embeds the schema description and example questions into rag.documents.
// Usage: npm run index (needs DATABASE_URL, READONLY_DATABASE_URL, OPENAI_API_KEY)
import { Pool } from "pg";
import { loadCatalog } from "@/lib/catalog";
import { parseEnv } from "@/lib/env";
import { createEmbedder } from "@/lib/llm";
import { indexKnowledge } from "@/lib/retrieval/knowledge";

async function main() {
  const env = parseEnv(process.env);
  const embedder = createEmbedder(
    env.OPENAI_API_KEY,
    env.OPENAI_EMBEDDING_MODEL,
  );
  if (!embedder) {
    console.log(
      "OPENAI_API_KEY is not set: skipping indexing. The app will send the full schema instead.",
    );
    return;
  }

  const appPool = new Pool({ connectionString: env.DATABASE_URL });
  const readonlyPool = new Pool({
    connectionString: env.READONLY_DATABASE_URL,
  });
  try {
    const catalog = await loadCatalog(readonlyPool);
    const count = await indexKnowledge(appPool, embedder, catalog);
    console.log(
      `Indexed ${count} documents (${catalog.tables.length} tables) with ${env.OPENAI_EMBEDDING_MODEL}.`,
    );
  } finally {
    await Promise.all([appPool.end(), readonlyPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
