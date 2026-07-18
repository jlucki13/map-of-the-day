import { z } from "zod";
import {
  extractFirstText,
  getAnthropicClient,
  parseStructuredJson,
  SUBAGENT_MODEL,
} from "@/agents/client";
import { JUDGE_SYSTEM } from "@/agents/prompts";
import type { JudgeAgent, JudgeVerdict } from "@/agents/types";

const judgeResponseSchema = z.object({
  verdict: z.enum(["correct", "incorrect"]),
});

const JUDGE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["correct", "incorrect"] },
  },
  required: ["verdict"],
  additionalProperties: false,
} as const;

/**
 * Live Haiku judge — the only agent on the interactive path. Called ONLY for
 * guesses the local normalizer marked ambiguous.
 *
 * MUST throw on transport/model failure (timeout, 5xx, refusal-shaped or
 * unparseable output). A thrown error means the guess is NOT consumed — the
 * route returns 503 and the client retries the same submission. Returning
 * "incorrect" on a failure would silently eat one of the player's 5 guesses.
 *
 * NOTE: Haiku 4.5 must never receive thinking/effort params.
 */
export class LiveJudgeAgent implements JudgeAgent {
  async judgeGuess(input: {
    guess: string;
    title: string;
    aliases: string[];
    description: string;
  }): Promise<JudgeVerdict> {
    const client = getAnthropicClient();

    const response = await client.messages.create(
      {
        model: SUBAGENT_MODEL,
        max_tokens: 256,
        system: JUDGE_SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: JUDGE_OUTPUT_JSON_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content:
              `Player's guess: ${JSON.stringify(input.guess)}\n` +
              `Answer title: ${input.title}\n` +
              `Accepted aliases: ${input.aliases.join(", ") || "(none)"}\n` +
              `Answer context: ${input.description.slice(0, 400)}`,
          },
        ],
      },
      // Interactive path: keep it snappy; a timeout throws, which the route
      // maps to 503 without consuming the guess.
      { timeout: 15_000, maxRetries: 1 },
    );

    const text = extractFirstText(response.content, "agents:judge");
    const parsed = parseStructuredJson(judgeResponseSchema, text, "agents:judge");
    return parsed.verdict;
  }
}
