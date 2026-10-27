import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import type { z } from "zod";
import type { ModelConfig } from "./env";
import { QueryError } from "./sql/errors";

/**
 * The only model surface the pipeline needs: send a system and user prompt,
 * get back an object that matches a zod schema. Claude and OpenAI both sit
 * behind it, so the pipeline and the evals never import a provider.
 */
export interface LanguageModel {
  readonly id: string;
  generateObject<T extends Record<string, unknown>>(request: {
    name: string;
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
}

export function createLanguageModel(config: ModelConfig): LanguageModel {
  const chatModel: BaseChatModel =
    config.provider === "anthropic"
      ? new ChatAnthropic({
          apiKey: config.apiKey,
          model: config.model,
          maxTokens: 4_096,
        })
      : new ChatOpenAI({ apiKey: config.apiKey, model: config.model });

  return {
    id: `${config.provider}:${config.model}`,
    async generateObject({ name, system, prompt, schema }) {
      // jsonSchema uses each provider's native structured output instead of
      // forced tool calls, which current Claude models no longer accept.
      const structured = chatModel.withStructuredOutput(schema, {
        name,
        method: "jsonSchema",
      });
      let output: unknown;
      try {
        output = await structured.invoke([
          new SystemMessage(system),
          new HumanMessage(prompt),
        ]);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new QueryError(
          "model_unavailable",
          `${config.provider} ${name} call failed: ${detail}`,
        );
      }
      // Validate again here: provider-side schema enforcement differs, and
      // this is also what gives the caller a precise return type.
      const parsed = schema.safeParse(output);
      if (!parsed.success) {
        throw new QueryError(
          "model_unavailable",
          `${name} output did not match its schema: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
  };
}

export interface TextEmbedder {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/**
 * Anthropic has no embeddings API, so retrieval needs an OpenAI key. Without
 * one the pipeline falls back to sending the whole schema to the model.
 */
export function createEmbedder(
  apiKey: string | undefined,
  model: string,
): TextEmbedder | null {
  return apiKey ? new OpenAIEmbeddings({ apiKey, model }) : null;
}
