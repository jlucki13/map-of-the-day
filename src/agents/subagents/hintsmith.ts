import { z } from "zod";
import {
  extractFirstText,
  getAnthropicClient,
  parseStructuredJson,
  SUBAGENT_MODEL,
} from "@/agents/client";
import { HINTSMITH_SYSTEM } from "@/agents/prompts";
import type { HintsmithAgent } from "@/agents/types";
import { hintLeaksAnswer } from "@/lib/guessMatch";
import type { CandidateMap, Hint } from "@/types";

const hintsResponseSchema = z.object({
  hint1: z.string().min(1),
  hint2: z.string().min(1),
});

const HINTS_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    hint1: { type: "string" },
    hint2: { type: "string" },
  },
  required: ["hint1", "hint2"],
  additionalProperties: false,
} as const;

/** Live Haiku hintsmith. NOTE: Haiku 4.5 must never receive thinking/effort params. */
export class LiveHintsmithAgent implements HintsmithAgent {
  async writeHints(candidate: CandidateMap): Promise<[Hint, Hint]> {
    const client = getAnthropicClient();

    const baseRequest = (feedback?: string) =>
      client.messages.create(
        {
          model: SUBAGENT_MODEL,
          max_tokens: 1024,
          system: HINTSMITH_SYSTEM,
          output_config: {
            format: { type: "json_schema", schema: HINTS_OUTPUT_JSON_SCHEMA },
          },
          messages: [
            {
              role: "user",
              content:
                `Answer: ${candidate.title}\n` +
                `Aliases (also forbidden in hints): ${candidate.aliases.join(", ") || "(none)"}\n` +
                `Background: ${candidate.description.slice(0, 800)}` +
                (feedback ? `\n\nYour previous attempt was rejected: ${feedback}` : ""),
            },
          ],
        },
        { timeout: 60_000 },
      );

    const toHints = (raw: { hint1: string; hint2: string }): [Hint, Hint] => [
      { order: 1, text: raw.hint1.trim() },
      { order: 2, text: raw.hint2.trim() },
    ];

    const leaks = (hints: [Hint, Hint]): boolean =>
      hints.some((h) =>
        hintLeaksAnswer(h.text, candidate.title, candidate.aliases),
      );

    // First attempt.
    let response = await baseRequest();
    let text = extractFirstText(response.content, "agents:hintsmith");
    let hints = toHints(
      parseStructuredJson(hintsResponseSchema, text, "agents:hintsmith"),
    );

    if (!leaks(hints)) return hints;

    // One retry with explicit feedback, then hard-fail. The deterministic
    // leak check is the authority here regardless of what any model thinks.
    response = await baseRequest(
      "one or both hints contained the answer title or an alias. Rewrite both hints without any form of the answer.",
    );
    text = extractFirstText(response.content, "agents:hintsmith");
    hints = toHints(
      parseStructuredJson(hintsResponseSchema, text, "agents:hintsmith"),
    );

    if (leaks(hints)) {
      throw new Error(
        "agents:hintsmith: hints still leak the answer after one retry",
      );
    }
    return hints;
  }
}
