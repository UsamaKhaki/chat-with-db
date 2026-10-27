const STARTERS = [
  {
    topic: "Revenue",
    questions: [
      "What was the monthly revenue in 2025?",
      "Which category brought in the most revenue last year?",
    ],
  },
  {
    topic: "Customers",
    questions: [
      "How many customers do we have in each country?",
      "Who are our 5 biggest spenders?",
    ],
  },
  {
    topic: "Products",
    questions: [
      "Which 10 products sold the most units?",
      "How many products cost more than 200?",
    ],
  },
  {
    topic: "Reviews",
    questions: [
      "What is the average rating per category?",
      "How many reviews are there for each star rating?",
    ],
  },
];

export function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-16">
      <h1 className="font-display text-3xl leading-tight font-semibold text-ink sm:text-4xl">
        Ask the shop database a question.
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        You get a short answer, the SQL that produced it, the rows and a chart.
        Every query is checked and run with read-only access, so asking can
        never change the data.
      </p>

      <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {STARTERS.map((group) => (
          <section key={group.topic}>
            <h2 className="mb-2 font-display text-xs font-semibold tracking-[0.12em] text-muted uppercase">
              {group.topic}
            </h2>
            <ul className="space-y-1.5">
              {group.questions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => onAsk(question)}
                    className="w-full rounded-md border border-line bg-panel px-3 py-2 text-left text-sm text-ink transition-colors hover:border-accent"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
