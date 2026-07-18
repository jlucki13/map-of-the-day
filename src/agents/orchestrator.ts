import { z } from "zod";
import {
  extractFirstText,
  getAnthropicClient,
  ORCHESTRATOR_MODEL,
  parseStructuredJson,
} from "@/agents/client";
import {
  ORCHESTRATOR_PICK_SYSTEM,
  ORCHESTRATOR_QA_SYSTEM,
} from "@/agents/prompts";
import type {
  OrchestratorAgent,
  OrchestratorPickInput,
  OrchestratorQaInput,
} from "@/agents/types";
import type { CandidateMap } from "@/types";

const pickResponseSchema = z.object({
  chosenExternalId: z.string().nullable(),
  reason: z.string(),
});

const PICK_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    chosenExternalId: { type: ["string", "null"] },
    reason: { type: "string" },
  },
  required: ["chosenExternalId", "reason"],
  additionalProperties: false,
} as const;

const qaResponseSchema = z.object({
  passed: z.boolean(),
  notes: z.string(),
});

const QA_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["passed", "notes"],
  additionalProperties: false,
} as const;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function toImageMediaType(mediaType: string): ImageMediaType {
  switch (mediaType) {
    case "image/jpeg":
    case "image/png":
    case "image/gif":
    case "image/webp":
      return mediaType;
    default:
      throw new Error(
        `agents:orchestrator: unsupported image media type "${mediaType}"`,
      );
  }
}

/**
 * Live Fable orchestrator — the two judgment calls (candidate pick, final QA).
 *
 * Fable 5 specifics honored here:
 * - Thinking is always on: NO `thinking` param is sent (an explicit config
 *   would 400).
 * - `stop_reason === "refusal"` must be checked before reading content.
 * - Server-side fallback to Opus 4.8 is enabled via the
 *   `server-side-fallback-2026-06-01` beta on the beta messages endpoint, per
 *   current Anthropic guidance for Fable callers.
 */
export class LiveOrchestratorAgent implements OrchestratorAgent {
  private async callFable(args: {
    system: string;
    content: unknown; // string | content block array
    schema: Record<string, unknown>;
    maxTokens: number;
    errorPrefix: string;
  }): Promise<string> {
    const client = getAnthropicClient();

    const response = await client.beta.messages.create(
      {
        model: ORCHESTRATOR_MODEL,
        max_tokens: args.maxTokens,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        system: args.system,
        output_config: {
          format: { type: "json_schema", schema: args.schema },
        },
        messages: [
          {
            role: "user",
            // Content is either a plain string or an array of content blocks;
            // both are valid user-message content shapes.
            content: args.content as never,
          },
        ],
      },
      { timeout: 120_000 },
    );

    if (response.stop_reason === "refusal") {
      throw new Error(`${args.errorPrefix}: orchestrator refusal`);
    }

    return extractFirstText(response.content, args.errorPrefix);
  }

  async pickCandidate(input: OrchestratorPickInput): Promise<CandidateMap | null> {
    const suitableIds = new Set(
      input.assessments.filter((a) => a.suitable).map((a) => a.externalId),
    );
    const usable = input.candidates.filter((c) => suitableIds.has(c.externalId));
    if (usable.length === 0) return null;

    const briefing = usable.map((c) => {
      const assessment = input.assessments.find(
        (a) => a.externalId === c.externalId,
      );
      return {
        externalId: c.externalId,
        title: c.title,
        description: c.description.slice(0, 400),
        width: c.width,
        height: c.height,
        scoutReason: assessment?.reason ?? "",
        proposedAliases: assessment?.proposedAliases ?? [],
      };
    });

    const text = await this.callFable({
      system: ORCHESTRATOR_PICK_SYSTEM,
      content: `Scouted candidates:\n${JSON.stringify(briefing, null, 2)}\n\nChoose the single best candidate's externalId, or null if none are genuinely usable.`,
      schema: PICK_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1024,
      errorPrefix: "agents:orchestrator:pick",
    });

    const parsed = parseStructuredJson(
      pickResponseSchema,
      text,
      "agents:orchestrator:pick",
    );
    if (parsed.chosenExternalId === null) return null;

    const chosen = usable.find((c) => c.externalId === parsed.chosenExternalId);
    if (!chosen) {
      throw new Error(
        `agents:orchestrator:pick: model chose unknown candidate "${parsed.chosenExternalId}"`,
      );
    }
    return chosen;
  }

  async finalQa(
    input: OrchestratorQaInput,
  ): Promise<{ passed: boolean; notes?: string }> {
    const text = await this.callFable({
      system: ORCHESTRATOR_QA_SYSTEM,
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: toImageMediaType(input.imageMediaType),
            data: input.redactedImageBase64,
          },
        },
        {
          type: "text",
          text:
            `The answer (private, for leak detection only): "${input.candidate.title}"; aliases: ${input.candidate.aliases.join(", ") || "(none)"}.\n` +
            `Hint 1 (shown to players): ${input.hints[0].text}\n` +
            `Hint 2 (shown to players): ${input.hints[1].text}\n\n` +
            `Above is the redacted image players will see. Does this puzzle pass?`,
        },
      ],
      schema: QA_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1024,
      errorPrefix: "agents:orchestrator:qa",
    });

    const parsed = parseStructuredJson(
      qaResponseSchema,
      text,
      "agents:orchestrator:qa",
    );
    return { passed: parsed.passed, notes: parsed.notes };
  }
}
