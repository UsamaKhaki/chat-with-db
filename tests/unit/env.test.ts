import { describe, expect, it } from "vitest";
import { parseEnv, resolveModelConfig } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://app@localhost/db",
  READONLY_DATABASE_URL: "postgres://ro@localhost/db",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env.QUERY_ROW_LIMIT).toBe(500);
    expect(env.QUERY_TIMEOUT_MS).toBe(5_000);
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });

  it("names missing variables without echoing values", () => {
    expect(() =>
      parseEnv({
        ...base,
        DATABASE_URL: undefined,
        OPENAI_API_KEY: "sk-secret",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnv({
        ...base,
        DATABASE_URL: undefined,
        OPENAI_API_KEY: "sk-secret",
      }),
    ).not.toThrow(/sk-secret/);
  });

  it("rejects out-of-range limits", () => {
    expect(() => parseEnv({ ...base, QUERY_ROW_LIMIT: "0" })).toThrow(
      /QUERY_ROW_LIMIT/,
    );
  });
});

describe("resolveModelConfig", () => {
  it("returns null when no key is set", () => {
    expect(resolveModelConfig(parseEnv(base))).toBeNull();
  });

  it("treats blank keys as unset", () => {
    expect(
      resolveModelConfig(parseEnv({ ...base, ANTHROPIC_API_KEY: "  " })),
    ).toBeNull();
  });

  it("prefers Anthropic when both keys are present", () => {
    const config = resolveModelConfig(
      parseEnv({ ...base, ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }),
    );
    expect(config).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
    });
  });

  it("uses OpenAI when it is the only key", () => {
    expect(
      resolveModelConfig(parseEnv({ ...base, OPENAI_API_KEY: "o" }))?.provider,
    ).toBe("openai");
  });

  it("honours an explicit LLM_PROVIDER", () => {
    const env = parseEnv({
      ...base,
      LLM_PROVIDER: "openai",
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
    });
    expect(resolveModelConfig(env)?.provider).toBe("openai");
  });

  it("returns null when the chosen provider has no key", () => {
    expect(
      resolveModelConfig(
        parseEnv({ ...base, LLM_PROVIDER: "openai", ANTHROPIC_API_KEY: "a" }),
      ),
    ).toBeNull();
  });
});
