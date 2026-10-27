import { AskPanel } from "@/components/ask-panel";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Chat with DB
        </h1>
        <p className="max-w-2xl text-muted">
          Ask a question about the demo shop database. You get an answer, the
          SQL that produced it, the rows and a chart when the data has a clear
          shape. Queries run as a read-only role with a time and row limit.
        </p>
      </header>
      <AskPanel />
    </main>
  );
}
