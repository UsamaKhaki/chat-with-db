"use client";

import { useRef, useState, type FormEvent } from "react";
import type { AskResponse } from "@/lib/ask";
import { ResultChart } from "./result-chart";
import { ResultTable } from "./result-table";
import { SqlBlock } from "./sql-block";

const EXAMPLE_QUESTIONS = [
  "What was the monthly revenue in 2025?",
  "Which 10 products sold the most units?",
  "How many customers do we have in each country?",
  "What is the average rating per category?",
];

const MAX_LENGTH = 500;

type State =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; response: AskResponse };

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: "loading", question: trimmed });

    let response: AskResponse;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      response = (await res.json()) as AskResponse;
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(error);
      response = {
        ok: false,
        code: "internal_error",
        message:
          "Couldn't reach the server. Check your connection and try again.",
      };
    }
    if (inFlight.current === controller) {
      setState({ status: "done", question: trimmed, response });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(question);
  }

  const loading = state.status === "loading";

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="question"
            name="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={MAX_LENGTH}
            placeholder="Ask about customers, orders, products or reviews…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-4 py-3 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            className="rounded-lg bg-accent px-5 py-3 font-medium text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Asking…" : "Ask"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuestion(example);
                void submit(example);
              }}
              className="rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      <section aria-live="polite" aria-busy={loading} className="space-y-5">
        {state.status === "loading" && (
          <p className="animate-pulse text-sm text-muted">
            Writing and running a query for “{state.question}”…
          </p>
        )}
        {state.status === "done" && (
          <Answer question={state.question} response={state.response} />
        )}
      </section>
    </div>
  );
}

function Answer({
  question,
  response,
}: {
  question: string;
  response: AskResponse;
}) {
  if (!response.ok) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink"
        >
          <p className="font-medium">{response.message}</p>
        </div>
        {response.sql && (
          <SqlBlock sql={response.sql} label="Query that was not run" />
        )}
      </div>
    );
  }

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-sm font-medium text-muted">{question}</h2>
        <p className="text-lg leading-relaxed text-ink">{response.answer}</p>
        <p className="text-xs text-muted">{response.explanation}</p>
      </header>
      {response.chart && (
        <ResultChart result={response.result} chart={response.chart} />
      )}
      <ResultTable result={response.result} />
      <SqlBlock sql={response.sql} />
      <p className="text-xs text-muted">
        {response.meta.model} · retrieval: {response.meta.retrieval}
        {response.meta.attempts > 1
          ? ` · repaired after ${response.meta.attempts - 1} rejected query`
          : ""}
      </p>
    </article>
  );
}
