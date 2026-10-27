-- Retrieval store for schema docs and example queries. The read-only role
-- has no access here, so generated SQL can never read or change it.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA rag;

CREATE TABLE rag.documents (
  id         text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('table', 'example')),
  content    text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  embedding  vector(1536) NOT NULL
);
