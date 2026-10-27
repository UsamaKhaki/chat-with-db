"use client";

import { useEffect, useRef, useState } from "react";
import type { AskResponse } from "@/lib/ask";
import { AnswerEntry, type Entry } from "./answer-entry";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { SchemaPanel } from "./schema-panel";

export function Workspace() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const latest = entries.at(-1);
  const busy = latest !== undefined && latest.response === undefined;
  const nextId = useRef(0);

  // Bring each new question into view as it is asked.
  useEffect(() => {
    if (!latest) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById(latest.id)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(question: string) {
    if (busy) return;
    const id = `q-${++nextId.current}`;
    setEntries((current) => [
      ...current,
      { id, question, askedAt: Date.now() },
    ]);
    setDraft("");

    let response: AskResponse;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      response = (await res.json()) as AskResponse;
    } catch (error) {
      // Handled below with a user-facing message; kept for debugging.
      console.warn("ask request failed", error);
      response = {
        ok: false,
        code: "internal_error",
        message:
          "Couldn't reach the server. Check your connection and try again.",
      };
    }
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, response } : entry,
      ),
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:pt-6">
          <div>
            <p className="font-display text-lg font-semibold text-ink">
              Chat with DB
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-mark" />
              Demo shop database · read-only
            </p>
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => setEntries([])}
              disabled={busy}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-sunken hover:text-ink disabled:opacity-40 lg:mt-3 lg:-ml-2"
            >
              New session
            </button>
          )}
        </div>

        <details className="group border-t border-line lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm text-muted">
            <span
              aria-hidden
              className="mr-1 inline-block transition-transform group-open:rotate-90"
            >
              ›
            </span>
            Tables you can ask about
          </summary>
          <div className="px-2 pb-3">
            <SchemaPanel />
          </div>
        </details>

        <div className="hidden lg:block">
          <SidebarSection title="Tables you can ask about">
            <SchemaPanel />
          </SidebarSection>
          {entries.length > 0 && (
            <SidebarSection title="This session">
              <ol className="space-y-0.5">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-sunken"
                    >
                      <StatusDot response={entry.response} />
                      <span className="line-clamp-2">{entry.question}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </SidebarSection>
          )}
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col lg:min-h-0">
        <div className="flex-1 px-4 sm:px-8">
          {entries.length === 0 ? (
            <EmptyState onAsk={(question) => void ask(question)} />
          ) : (
            <div className="mx-auto max-w-3xl divide-y divide-line py-8">
              {entries.map((entry) => (
                // The newest entry is at least a screen tall, so it can
                // scroll to the top instead of starting under the composer.
                <div
                  key={entry.id}
                  className="py-8 first:pt-0 last:min-h-[calc(100dvh-10rem)]"
                >
                  <AnswerEntry entry={entry} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-gradient-to-t from-surface via-surface to-surface/0 px-4 pt-6 pb-4 sm:px-8">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={(question) => void ask(question)}
            busy={busy}
          />
        </div>
      </main>
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line px-3 py-4">
      <h2 className="mb-2 px-2 font-display text-xs font-semibold tracking-[0.12em] text-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusDot({ response }: { response?: AskResponse }) {
  const color = !response
    ? "bg-mark animate-pulse"
    : response.ok
      ? "bg-accent"
      : "bg-danger";
  const label = !response
    ? "Running"
    : response.ok
      ? "Answered"
      : "Not answered";
  return (
    <span
      role="img"
      aria-label={label}
      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${color}`}
    />
  );
}
