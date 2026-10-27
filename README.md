# chat-with-db

Ask questions in plain English about a Postgres database and get an answer, the SQL that produced it, the result table and a chart.

It runs against a seeded demo e-commerce database (customers, orders, order items, products, categories, reviews). Generated SQL goes through three independent safety layers before and during execution, and the SQL generation is measured with an execution-accuracy eval suite.

## How it works

```
question
  -> retrieve   pgvector finds the closest table docs and example queries
  -> generate   Claude or OpenAI returns { answerable, sql, explanation } via structured output
  -> validate   the real Postgres parser checks the SQL against an allow-list
  -> execute    read-only role, READ ONLY transaction, statement timeout, row limit
  -> summarise  the model writes a 1 to 3 sentence answer from the returned rows
  -> chart      picked from the result's column types, not by the model
```

If validation or execution fails with a mistake the model can fix (unknown table or column, syntax error, a function that is not allowed), the reason is sent back and the model gets one more attempt. Safety rejections, timeouts and outages are not retried.

Every failure ends as a typed code (`timeout`, `write_not_allowed`, `unanswerable`, `database_unavailable`, ...) with a fixed user-facing message. Raw database and provider errors are logged on the server and never sent to the browser.

## SQL safety

The layers are independent, so a bug in one is caught by the next. Each has its own tests.

| Layer         | What it does                                                                                                                                                                                                                                                                                                                                                                                                     | Where                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Validator     | Parses with [libpg-query](https://github.com/constructive-io/libpg-query-node) (Postgres's own parser compiled to WebAssembly). Accepts exactly one `SELECT` (CTEs allowed). Rejects data-modifying CTEs, `SELECT INTO`, `FOR UPDATE`, any table outside the `shop` schema, and any function not on an allow-list (so `pg_sleep`, `pg_read_file`, `dblink`, `set_config`, `lo_import` and the rest are blocked). | `src/lib/sql/validate.ts` |
| Executor      | Runs the query in `BEGIN READ ONLY` with `SET LOCAL statement_timeout`, through a cursor that fetches `limit + 1` rows. Postgres stops producing rows at the limit, the original `ORDER BY` is kept, and the UI is told when a result was cut off. A cursor also only accepts `SELECT`/`VALUES`.                                                                                                                 | `src/lib/sql/execute.ts`  |
| Database role | Generated SQL runs as `chat_readonly`: `SELECT` on `shop` tables only, no access to the `rag` schema, no `CREATE`, `default_transaction_read_only = on`, and its own 5s statement timeout.                                                                                                                                                                                                                       | `db/roles.sql`            |

The table allow-list is not hand-maintained: it is read from `information_schema` as the read-only role, which only lists objects that role has privileges on.

## Stack

- Next.js 16 (App Router) and React 19, TypeScript in strict mode, Tailwind CSS 4, Recharts
- LangChain (`@langchain/anthropic`, `@langchain/openai`) behind a single `LanguageModel` interface
- Postgres 18 with pgvector 0.8, via `pg`
- zod for env, request and model-output validation
- Vitest, ESLint, Prettier, GitHub Actions

## Getting started

Requirements: Node 22.12 or newer (see `.nvmrc`), Docker, and an Anthropic or OpenAI API key.

```bash
npm install
cp .env.example .env.local    # then add ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run db:up                 # Postgres + pgvector on localhost:5443, seeded on first start
npm run index                 # optional: embeds schema docs for retrieval (needs OPENAI_API_KEY)
npm run dev                   # http://localhost:6601
```

The seed is deterministic (fixed random seed and fixed 2024 to 2025 dates), so every fresh database has identical rows and the eval answers stay stable. `npm run db:reset` drops the volume and reseeds.

### Environment variables

| Name                     | Required            | Default                     | Purpose                                         |
| ------------------------ | ------------------- | --------------------------- | ----------------------------------------------- |
| `DATABASE_URL`           | yes                 |                             | `chat_app` role, used for the retrieval store   |
| `READONLY_DATABASE_URL`  | yes                 |                             | `chat_readonly` role, used to run generated SQL |
| `ANTHROPIC_API_KEY`      | one of the two keys |                             | Claude                                          |
| `OPENAI_API_KEY`         | one of the two keys |                             | OpenAI chat, and embeddings for retrieval       |
| `LLM_PROVIDER`           | no                  | Anthropic if its key is set | `anthropic` or `openai`                         |
| `ANTHROPIC_MODEL`        | no                  | `claude-sonnet-5-5`         |                                                 |
| `OPENAI_MODEL`           | no                  | `gpt-5-mini`                |                                                 |
| `OPENAI_EMBEDDING_MODEL` | no                  | `text-embedding-3-small`    | must produce 1536 dimensions                    |
| `QUERY_ROW_LIMIT`        | no                  | `500`                       | rows returned per question                      |
| `QUERY_TIMEOUT_MS`       | no                  | `5000`                      | statement timeout per question                  |

Anthropic has no embeddings API. Without `OPENAI_API_KEY`, or before `npm run index` has run, retrieval falls back to putting the whole schema and every example in the prompt. That is fine for six tables; retrieval is there for schemas where it would not be.

The passwords in `docker-compose.yml` and `.env.example` are defaults for the local container only.

## Scripts

| Script                                        |                                                |
| --------------------------------------------- | ---------------------------------------------- |
| `npm run dev` / `build` / `start`             | Next.js on port 6601                           |
| `npm run lint` / `typecheck` / `format:check` | ESLint, `tsc --noEmit`, Prettier               |
| `npm test`                                    | unit tests, no database needed                 |
| `npm run test:integration`                    | tests against the docker-compose database      |
| `npm run eval`                                | SQL-generation evals with the configured model |
| `npm run eval -- --reference`                 | eval harness self-test, no API key needed      |
| `npm run index`                               | builds the pgvector index                      |
| `npm run db:up` / `db:down` / `db:reset`      | local database                                 |

## Testing

- **Unit** (`tests/unit`): the validator against allowed queries and attack-style queries, error mapping, env parsing, the pipeline with a scripted fake model (repair loop, no retry on writes or timeouts, error details never reach the response, summary failure keeps the rows), chart selection, formatting and the eval comparator.
- **Integration** (`tests/integration`, real Postgres): typed results, row-limit truncation, timeouts, and the read-only role on its own, with validation bypassed (writes fail even in a `READ WRITE` transaction, `rag` is not readable, `CREATE` is denied). Retrieval is tested end to end through pgvector with a deterministic keyword embedder, so no API key is needed.

## Evals

`evals/cases.json` has 18 questions with reference SQL and 3 the pipeline must decline (out of scope, a write request, a prompt injection). Each question goes through the full pipeline, and the rows it returns are compared with the reference query's rows:

- column names and column order are ignored, extra columns are allowed, so `SELECT city, count(*)` matches a reference of `SELECT city`
- row order only counts where the question asks for it
- numbers are compared at two decimals

The few-shot examples in `src/lib/retrieval/examples.ts` are deliberately different questions from the eval cases, so the eval measures generation rather than recall of the examples.

`npm run eval` prints a pass/fail line per case, writes a JSON report to `evals/results/` (gitignored), and exits non-zero below 80% accuracy (`EVAL_MIN_ACCURACY`). CI always runs the `--reference` self-test, which checks the harness, the comparator and that every reference query passes the validator. Model evals run in CI only on `main` or a manual run, and only when an `ANTHROPIC_API_KEY` secret exists.

No model accuracy numbers are published here yet, because none have been recorded for this repo. Run `npm run eval` with a key to get them.

## Project layout

```
db/                    schema, deterministic seed, rag store, roles, init script
evals/                 eval cases, comparator, runner
scripts/               index-knowledge.ts
src/app/               page and POST /api/ask
src/components/        question form, answer, table, chart, SQL block
src/lib/ask.ts         the pipeline (no I/O of its own; dependencies are passed in)
src/lib/ask-service.ts wires the pipeline to the real database and model
src/lib/sql/           validator, executor, error codes
src/lib/retrieval/     pgvector retrieval and few-shot examples
tests/                 unit and integration tests
```

## Limitations

- No authentication or rate limiting. Anyone who can reach the server can spend model credits, so do not expose it publicly as is.
- Single question and answer: no follow-up questions with conversational context.
- The function allow-list covers common aggregate, window, date, text and math functions. A valid question that needs something else gets a repair attempt and then a "couldn't build a valid query" message.
- `bigint` and `numeric` values are converted to JavaScript numbers for display and charts, which loses precision above 2^53.
- Charts are line or bar only, chosen by a simple rule (date column gives a line, up to 30 categories give bars).
- The summary is model-written from up to 50 rows. The table and SQL are the source of truth.

## Roadmap

- Docker image and Kubernetes manifests, deployed on AWS
- Record model eval results per provider and model
- Rate limiting and an auth gate before any public deployment
