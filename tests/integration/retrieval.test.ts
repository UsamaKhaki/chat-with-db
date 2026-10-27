import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalog, type SchemaCatalog } from "@/lib/catalog";
import type { TextEmbedder } from "@/lib/llm";
import { indexKnowledge, retrieveContext } from "@/lib/retrieval/knowledge";
import { appPool, readonlyPool } from "./database";

// A deterministic stand-in for a real embedding model: hashed bag of words
// in 1536 dimensions. Good enough to check the pgvector plumbing and
// ranking without calling an API.
const keywordEmbedder: TextEmbedder = {
  async embedQuery(text) {
    const vector = new Array<number>(1536).fill(0);
    for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      let hash = 0;
      for (const char of word.replace(/s$/, ""))
        hash = (hash * 31 + char.charCodeAt(0)) % 1536;
      vector[hash] += 1;
    }
    return vector.some((value) => value > 0)
      ? vector
      : vector.map((_, i) => (i === 0 ? 1 : 0));
  },
  async embedDocuments(texts) {
    return Promise.all(texts.map((text) => this.embedQuery(text)));
  },
};

const app = appPool();
const readonly = readonlyPool();
let catalog: SchemaCatalog;

beforeAll(async () => {
  catalog = await loadCatalog(readonly);
});

afterAll(async () => {
  await app.query("DELETE FROM rag.documents");
  await Promise.all([app.end(), readonly.end()]);
});

describe("loadCatalog", () => {
  it("lists the shop tables visible to the read-only role", () => {
    expect(catalog.tables.map((table) => table.name).sort()).toEqual([
      "categories",
      "customers",
      "order_items",
      "orders",
      "products",
      "reviews",
    ]);
  });

  it("includes foreign keys and comments", () => {
    const orders = catalog.tables.find((table) => table.name === "orders");
    expect(orders?.comment).toMatch(/Revenue should only count/);
    expect(
      orders?.columns.find((column) => column.name === "customer_id")
        ?.references,
    ).toBe("customers.id");
  });
});

describe("retrieveContext", () => {
  it("falls back to the full schema without an embedder", async () => {
    const context = await retrieveContext("anything", catalog, {
      pool: app,
      embedder: null,
    });
    expect(context.strategy).toBe("full");
    expect(context.tables).toHaveLength(catalog.tables.length);
  });

  it("falls back to the full schema when the index is empty", async () => {
    await app.query("DELETE FROM rag.documents");
    const context = await retrieveContext("reviews", catalog, {
      pool: app,
      embedder: keywordEmbedder,
    });
    expect(context.strategy).toBe("full");
  });

  it("ranks tables and examples by vector similarity", async () => {
    const count = await indexKnowledge(app, keywordEmbedder, catalog);
    expect(count).toBeGreaterThan(catalog.tables.length);

    const context = await retrieveContext(
      "average rating of products in reviews",
      catalog,
      {
        pool: app,
        embedder: keywordEmbedder,
      },
    );
    expect(context.strategy).toBe("vector");
    expect(context.tables).toHaveLength(4);
    expect(
      context.tables.some((table) => table.startsWith("Table reviews")),
    ).toBe(true);
    expect(context.examples.map((example) => example.id)).toContain(
      "lowest-rated-products",
    );
  });
});
