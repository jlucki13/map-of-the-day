/**
 * Lazily-constructed singleton Anthropic client + model constants shared by
 * every live sub-agent and the orchestrator.
 *
 * Kept lazy so importing this module (or the pipeline factory in index.ts)
 * never throws in mock mode, even when ANTHROPIC_API_KEY is entirely absent
 * — the client is only ever instantiated by live agent implementations,
 * which are only ever constructed when isLiveMode() is true.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

let cachedClient: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/** Fable model used for the two orchestrator judgment calls. */
export const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL ?? "claude-fable-5";

/** Haiku model used for every focused sub-agent (scout/redactor/hintsmith/judge). */
export const SUBAGENT_MODEL = process.env.SUBAGENT_MODEL ?? "claude-haiku-4-5";

/**
 * Extract the first text content block from a Message/BetaMessage response,
 * throwing a descriptive error if there is no usable text (empty content,
 * a response consisting only of non-text blocks, etc).
 *
 * Works for both `client.messages.create` (ContentBlock[]) and
 * `client.beta.messages.create` (BetaContentBlock[]) responses — both share
 * the `{ type: string; text?: string }` shape on their text blocks.
 */
export function extractFirstText(
  content: ReadonlyArray<{ type: string; text?: string }>,
  errorPrefix: string,
): string {
  const block = content.find((b) => b.type === "text");
  if (!block || typeof block.text !== "string" || block.text.length === 0) {
    throw new Error(`${errorPrefix}: no text content in model response`);
  }
  return block.text;
}

/**
 * Parse a structured-output JSON string and validate it against a zod
 * schema, throwing a descriptive error on either failure. Structured
 * outputs (`output_config.format`) guarantee syntactically valid JSON from
 * the API, but we still validate shape defensively — a schema drift or a
 * refusal-shaped payload should fail loudly, not propagate bad data.
 */
export function parseStructuredJson<T>(
  schema: z.ZodType<T>,
  text: string,
  errorPrefix: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `${errorPrefix}: failed to parse JSON response: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `${errorPrefix}: response failed schema validation: ${result.error.message}`,
    );
  }
  return result.data;
}
