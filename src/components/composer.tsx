"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";

const MAX_LENGTH = 500;

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string) => void;
  busy: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSubmit = !busy && value.trim().length >= 3;

  // "/" focuses the question box from anywhere, like most search UIs.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(target.tagName)
      ) {
        event.preventDefault();
        textarea.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Grow with the text up to about five lines.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [value]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canSubmit) onSubmit(value.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
      <div className="flex items-end gap-2 rounded-xl border border-line bg-panel p-2 shadow-[0_8px_24px_-12px_rgb(20_33_61/0.25)] focus-within:border-accent">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <textarea
          id="question"
          ref={textarea}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about revenue, customers, products or reviews…"
          className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 shrink-0 rounded-lg bg-accent px-4 font-medium text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Running…" : "Ask"}
        </button>
      </div>
      <p className="mt-1.5 hidden justify-between px-1 text-xs text-muted sm:flex">
        <span>
          <kbd className="font-mono">Enter</kbd> to ask,{" "}
          <kbd className="font-mono">Shift+Enter</kbd> for a new line,{" "}
          <kbd className="font-mono">/</kbd> to focus
        </span>
        {value.length > MAX_LENGTH - 100 && (
          <span>
            {value.length}/{MAX_LENGTH}
          </span>
        )}
      </p>
    </form>
  );
}
