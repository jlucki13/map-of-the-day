import { z } from "zod";
import {
  extractFirstText,
  getAnthropicClient,
  parseStructuredJson,
  SUBAGENT_MODEL,
} from "@/agents/client";
import { REDACTOR_SYSTEM } from "@/agents/prompts";
import type { RedactorAgent, RedactorInput } from "@/agents/types";
import type { RedactionRegion } from "@/types";

const redactorResponseSchema = z.object({
  classifications: z.array(
    z.object({
      blockIndex: z.number().int(),
      kind: z.enum(["title", "legend", "other-identifying-text", "harmless"]),
    }),
  ),
});

const REDACTOR_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          blockIndex: { type: "integer" },
          kind: {
            type: "string",
            enum: ["title", "legend", "other-identifying-text", "harmless"],
          },
        },
        required: ["blockIndex", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["classifications"],
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
      throw new Error(`agents:redactor: unsupported image media type "${mediaType}"`);
  }
}

/**
 * Live Haiku redactor (vision). The LLM only classifies the deterministic
 * OCR blocks; all geometry comes from the input, never from the model.
 * NOTE: Haiku 4.5 must never receive thinking/effort params.
 */
export class LiveRedactorAgent implements RedactorAgent {
  async classifyTextBlocks(input: RedactorInput): Promise<RedactionRegion[]> {
    if (input.blocks.length === 0) return [];

    const client = getAnthropicClient();
    const blockList = input.blocks
      .map(
        (b, i) =>
          `#${i}: text=${JSON.stringify(b.text)} rect=(x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height})`,
      )
      .join("\n");

    const response = await client.messages.create(
      {
        model: SUBAGENT_MODEL,
        max_tokens: 1024,
        system: REDACTOR_SYSTEM,
        output_config: {
          format: { type: "json_schema", schema: REDACTOR_OUTPUT_JSON_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: toImageMediaType(input.imageMediaType),
                  data: input.imageBase64,
                },
              },
              {
                type: "text",
                text: `This map's answer (never show players): "${input.candidate.title}".\nOCR text blocks:\n${blockList}\n\nClassify every block index.`,
              },
            ],
          },
        ],
      },
      { timeout: 60_000 },
    );

    const text = extractFirstText(response.content, "agents:redactor");
    const parsed = parseStructuredJson(
      redactorResponseSchema,
      text,
      "agents:redactor",
    );

    const regions: RedactionRegion[] = [];
    for (const c of parsed.classifications) {
      if (c.kind === "harmless") continue;
      const block = input.blocks[c.blockIndex];
      if (!block) continue; // model referenced a nonexistent index — skip
      regions.push({
        kind: c.kind,
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        confidence: block.confidence,
        sourceText: block.text,
      });
    }
    return regions;
  }
}
