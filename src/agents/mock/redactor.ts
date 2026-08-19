import type { RedactorAgent, RedactorInput } from "@/agents/types";
import { normalizeGuess } from "@/lib/guessMatch";
import type { RedactionRegion } from "@/types";

const MAX_MOCK_REGIONS = 5;

/**
 * Deterministic mock redactor:
 * - Preauthored regions (static dataset) are used verbatim when present.
 * - Otherwise a geometry heuristic classifies OCR blocks: the largest block
 *   near the top of the image is the title; blocks whose text contains the
 *   answer are identifying; the largest remaining block in the bottom third
 *   is the legend.
 */
export class MockRedactorAgent implements RedactorAgent {
  async classifyTextBlocks(input: RedactorInput): Promise<RedactionRegion[]> {
    const preauthored = input.candidate.preauthoredRedactionRegions;
    if (preauthored && preauthored.length > 0) {
      return preauthored;
    }

    const blocks = input.blocks;
    if (blocks.length === 0) return [];

    const imageHeight = Math.max(
      input.candidate.height ?? 0,
      ...blocks.map((b) => b.y + b.height),
    );
    const titleWords = normalizeGuess(input.candidate.title)
      .split(" ")
      .filter((w) => w.length >= 3);

    const regions: RedactionRegion[] = [];
    const used = new Set<number>();

    const byArea = blocks
      .map((b, i) => ({ block: b, index: i, area: b.width * b.height }))
      .sort((a, b) => b.area - a.area);

    // Largest block whose top edge is in the top 20% of the image = title.
    const titleEntry = byArea.find(
      (e) => e.block.y <= imageHeight * 0.2,
    );
    if (titleEntry) {
      used.add(titleEntry.index);
      regions.push(toRegion(titleEntry.block, "title"));
    }

    // Blocks whose text mentions the answer = other-identifying-text.
    for (const e of byArea) {
      if (used.has(e.index)) continue;
      const normText = normalizeGuess(e.block.text);
      if (titleWords.some((w) => normText.includes(w))) {
        used.add(e.index);
        regions.push(toRegion(e.block, "other-identifying-text"));
      }
    }

    // Largest remaining block in the bottom third = legend.
    const legendEntry = byArea.find(
      (e) => !used.has(e.index) && e.block.y >= imageHeight * (2 / 3),
    );
    if (legendEntry) {
      used.add(legendEntry.index);
      regions.push(toRegion(legendEntry.block, "legend"));
    }

    return regions.slice(0, MAX_MOCK_REGIONS);
  }
}

function toRegion(
  block: RedactorInput["blocks"][number],
  kind: RedactionRegion["kind"],
): RedactionRegion {
  return {
    kind,
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    confidence: block.confidence,
    sourceText: block.text,
  };
}
