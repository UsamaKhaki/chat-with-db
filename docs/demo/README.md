# Demo

`demo.webm` (31 seconds, 1280x800, no audio) is a recording of the real app running locally at `http://localhost:6601` against the seeded docker-compose database.

## How it was recorded

No model API key was available when it was recorded, so the language model was the one part replaced. Each question was answered with reference SQL (the same kind of queries as `evals/cases.json`), passed through the real pipeline (validator, read-only executor, chart picker) against the seeded database, and the resulting `/api/ask` responses were served to the page. That is why the summary line reads "Summary not generated". Everything else on screen, including the chart, table, SQL, the blocked write and the row-limit notice, is real output.

The screenshots in `docs/screenshots/` were captured the same way, except `06-no-model-configured.png`, which is the unmodified app with no key configured.

## Script for a recording with a real model

Use this once `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in `.env.local`. It takes about 90 seconds.

1. **Setup (not recorded).** Run `npm run db:reset`, optionally `npm run index`, then `npm run dev` and open `http://localhost:6601` at 1280x800.
2. **0:00 Intro.** Show the empty page. Caption: "Ask a Postgres database questions in plain English."
3. **0:05 Time series.** Type "What was the monthly revenue in 2025?" and press Enter. Hover the line chart, then scroll to the table and SQL. Caption: "The model writes SQL; the app validates it, runs it read-only, then charts the rows."
4. **0:25 Breakdown.** Click "How many customers do we have in each country?". Point at the bar chart and the summary sentence.
5. **0:40 Harder question.** Type "Which 5 customers spent the most, and how many orders did each place?". Open the SQL to show the joins and status filter.
6. **0:55 Safety.** Type "Delete every cancelled order". Show the blocked message and, if the model produced one, the query that was not run. Caption: "Writes are blocked by the validator, the transaction and the database role."
7. **1:10 Limits.** Type "List every order". Scroll to "500 rows shown. The result was cut off at the row limit."
8. **1:20 Close.** Scroll back to the top. Caption: "Next.js, LangChain, Postgres + pgvector. Evals in `evals/`."

Before publishing, check the recording for API keys in terminal windows or browser tabs.
