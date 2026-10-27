import { z } from "zod";
import { MAX_QUESTION_LENGTH } from "@/lib/ask";
import { ask } from "@/lib/ask-service";
import type { FailureCode } from "@/lib/sql/errors";

const requestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Ask a slightly longer question.")
    .max(MAX_QUESTION_LENGTH),
});

const STATUS_BY_CODE: Partial<Record<FailureCode, number>> = {
  model_not_configured: 503,
  model_unavailable: 503,
  database_unavailable: 503,
  timeout: 504,
  internal_error: 500,
};

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue?.path[0] === "question"
        ? issue.message
        : 'Send a JSON body like {"question": "..."}.';
    return Response.json(
      { ok: false, code: "bad_request", message },
      { status: 400 },
    );
  }

  const response = await ask(parsed.data.question);
  // Blocked or unanswerable questions are a normal outcome of the request,
  // so they stay 422 rather than looking like server faults.
  const status = response.ok ? 200 : (STATUS_BY_CODE[response.code] ?? 422);
  return Response.json(response, { status });
}
