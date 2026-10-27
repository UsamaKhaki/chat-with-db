import type { AskResponse } from "@/lib/ask";
import { QueryReceipt } from "./query-receipt";
import { ResultTabs } from "./result-tabs";
import { SqlBlock } from "./sql-block";

export interface Entry {
  id: string;
  question: string;
  askedAt: number;
  response?: AskResponse;
}

export function AnswerEntry({ entry }: { entry: Entry }) {
  const { response } = entry;

  return (
    <article
      id={entry.id}
      className="scroll-mt-6 space-y-4"
      aria-busy={!response}
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl leading-snug font-semibold text-ink sm:text-2xl">
          {entry.question}
        </h2>
        <time
          dateTime={new Date(entry.askedAt).toISOString()}
          className="shrink-0 font-mono text-xs text-muted"
        >
          {new Date(entry.askedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </header>

      {!response && <Working />}

      {response?.ok === true && (
        <>
          <QueryReceipt response={response} />
          <div className="space-y-1.5">
            <p className="text-lg leading-relaxed text-ink">
              {response.answer}
            </p>
            <p className="text-sm text-muted">{response.explanation}</p>
          </div>
          <ResultTabs response={response} />
        </>
      )}

      {response?.ok === false && (
        <div className="space-y-3">
          <div
            role="alert"
            className="rounded-md border-l-4 border-danger bg-panel px-4 py-3"
          >
            <p className="font-medium text-ink">{response.message}</p>
          </div>
          {response.sql && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Query that was not run
              </p>
              <SqlBlock sql={response.sql} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Working() {
  return (
    <div className="space-y-2" role="status">
      <div className="relative h-1 overflow-hidden rounded-full bg-sunken">
        <div className="working-bar absolute inset-y-0 w-2/5 rounded-full bg-mark" />
      </div>
      <p className="text-sm text-muted">
        Finding the right tables, writing SQL, checking it and running it
        read-only…
      </p>
    </div>
  );
}
