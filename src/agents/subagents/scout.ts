import { z } from "zod";
import {
  extractFirstText,
  getAnthropicClient,
  parseStructuredJson,
  SUBAGENT_MODEL,
} from "@/agents/client";
import { SCOUT_SYSTEM } from "@/agents/prompts";
import type { ScoutAgent, ScoutAssessment } from "@/agents/types";
import type { CandidateMap } from "@/types";

const scoutResponseSchema = z.object({
  assessments: z.array(
    z.object({
      externalId: z.string(),
      suitable: z.boolean(),
      reason: z.string(),
      proposedAliases: z.array(z.string()),
    }),
  ),
});

const SCOUT_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          externalId: { type: "string" },
          suitable: { type: "boolean" },
          reason: { type: "string" },
          proposedAliases: { type: "array", items: { type: "string" } },
        },
        required: ["externalId", "suitable", "reason", "proposedAliases"],
        additionalProperties: false,
      },
    },
  },
  required: ["assessments"],
  additionalProperties: false,
} as const;

/** Live Haiku scout. NOTE: Haiku 4.5 must never receive thinking/effort params. */
export class LiveScoutAgent implements ScoutAgent {
  async assessCandidates(candidates: CandidateMap[]): Promise<ScoutAssessment[]> {
    if (candidates.length === 0) return [];

    const client = getAnthropicClient();
    const compact = candidates.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description.slice(0, 500),
      width: c.width,
      height: c.height,
      mimeType: c.mimeType,
    }));

    const response = await client.messages.create(
      {
        model: SUBAGENT_MODEL,
        max_tokens: 2048,
        system: SCOUT_SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: SCOUT_OUTPUT_JSON_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: `Candidates:\n${JSON.stringify(compact, null, 2)}`,
          },
        ],
      },
      { timeout: 60_000 },
    );

    const text = extractFirstText(response.content, "agents:scout");
    const parsed = parseStructuredJson(scoutResponseSchema, text, "agents:scout");

    // Only keep assessments that refer to a candidate we actually sent.
    const knownIds = new Set(candidates.map((c) => c.externalId));
    return parsed.assessments.filter((a) => knownIds.has(a.externalId));
  }
}
