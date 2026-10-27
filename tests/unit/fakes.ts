import type { LanguageModel } from "@/lib/llm";

type Reply = Record<string, unknown> | Error;

/**
 * A scripted LanguageModel: each call to a named step returns the next
 * reply queued for it. Records every prompt so tests can assert on them.
 */
export function scriptedModel(script: Record<string, Reply[]>) {
  const calls: { name: string; prompt: string }[] = [];
  const model: LanguageModel = {
    id: "fake:scripted",
    async generateObject({ name, prompt, schema }) {
      calls.push({ name, prompt });
      const reply = script[name]?.shift();
      if (!reply) throw new Error(`no scripted reply left for ${name}`);
      if (reply instanceof Error) throw reply;
      return schema.parse(reply);
    },
  };
  return { model, calls };
}
