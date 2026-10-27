import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  READONLY_DATABASE_URL: z.string().min(1, "READONLY_DATABASE_URL is required"),
  LLM_PROVIDER: z.enum(["anthropic", "openai"]).optional(),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  QUERY_ROW_LIMIT: z.coerce.number().int().min(1).max(5_000).default(500),
  QUERY_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
});

export type Env = z.infer<typeof envSchema>;

export type ModelConfig =
  | { provider: "anthropic"; apiKey: string; model: string }
  | { provider: "openai"; apiKey: string; model: string };

let cached: Env | undefined;

/** Parsed lazily so `next build` works without a configured environment. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return result.data;
}

/**
 * Picks the chat model. LLM_PROVIDER wins when set; otherwise Anthropic is
 * preferred when both keys exist. Returns null when no key is configured so
 * the API can answer with a clear "not configured" message.
 */
export function resolveModelConfig(env: Env): ModelConfig | null {
  const provider =
    env.LLM_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY
      ? { provider, apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }
      : null;
  }
  return env.OPENAI_API_KEY
    ? { provider, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }
    : null;
}
