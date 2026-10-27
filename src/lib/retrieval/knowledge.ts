import type { Pool } from "pg";
import { describeTable, type SchemaCatalog } from "../catalog";
import type { TextEmbedder } from "../llm";
import { EXAMPLE_QUERIES, type ExampleQuery } from "./examples";

export interface RetrievedContext {
  tables: string[];
  examples: ExampleQuery[];
  /** "vector" when pgvector ranked the documents, "full" for the fallback. */
  strategy: "vector" | "full";
}

const TABLE_MATCHES = 4;
const EXAMPLE_MATCHES = 3;

interface KnowledgeDocument {
  id: string;
  kind: "table" | "example";
  content: string;
  metadata: Record<string, string>;
}

function knowledgeDocuments(catalog: SchemaCatalog): KnowledgeDocument[] {
  return [
    ...catalog.tables.map((table) => ({
      id: `table:${table.name}`,
      kind: "table" as const,
      content: describeTable(table),
      metadata: { table: table.name },
    })),
    // Examples are matched on the question only; the SQL would add noise.
    ...EXAMPLE_QUERIES.map((example) => ({
      id: `example:${example.id}`,
      kind: "example" as const,
      content: example.question,
      metadata: { exampleId: example.id },
    })),
  ];
}

/** Rebuilds the rag.documents table. Run by scripts/index-knowledge.ts. */
export async function indexKnowledge(
  pool: Pool,
  embedder: TextEmbedder,
  catalog: SchemaCatalog,
): Promise<number> {
  const documents = knowledgeDocuments(catalog);
  const vectors = await embedder.embedDocuments(
    documents.map((document) => document.content),
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM rag.documents");
    for (const [index, document] of documents.entries()) {
      await client.query(
        `INSERT INTO rag.documents (id, kind, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [
          document.id,
          document.kind,
          document.content,
          document.metadata,
          toVectorLiteral(vectors[index]),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return documents.length;
}

/**
 * Finds the tables and examples closest to the question. With no embedder,
 * or before the index has been built, every table and example is returned;
 * that is fine for a six-table demo schema but would not scale to hundreds.
 */
export async function retrieveContext(
  question: string,
  catalog: SchemaCatalog,
  retrieval: { pool: Pool; embedder: TextEmbedder | null },
): Promise<RetrievedContext> {
  const everything: RetrievedContext = {
    tables: catalog.tables.map((table) => describeTable(table)),
    examples: EXAMPLE_QUERIES,
    strategy: "full",
  };
  if (!retrieval.embedder) return everything;

  const vector = toVectorLiteral(await retrieval.embedder.embedQuery(question));
  const { rows } = await retrieval.pool.query<{
    kind: "table" | "example";
    metadata: Record<string, string>;
  }>(
    `(SELECT kind, metadata FROM rag.documents WHERE kind = 'table' ORDER BY embedding <=> $1::vector LIMIT $2)
     UNION ALL
     (SELECT kind, metadata FROM rag.documents WHERE kind = 'example' ORDER BY embedding <=> $1::vector LIMIT $3)`,
    [vector, TABLE_MATCHES, EXAMPLE_MATCHES],
  );
  if (rows.length === 0) return everything;

  const tableNames = new Set(
    rows.filter((row) => row.kind === "table").map((row) => row.metadata.table),
  );
  const exampleIds = new Set(
    rows
      .filter((row) => row.kind === "example")
      .map((row) => row.metadata.exampleId),
  );
  return {
    tables: catalog.tables
      .filter((table) => tableNames.has(table.name))
      .map((table) => describeTable(table)),
    examples: EXAMPLE_QUERIES.filter((example) => exampleIds.has(example.id)),
    strategy: "vector",
  };
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
