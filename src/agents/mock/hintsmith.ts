import type { HintsmithAgent } from "@/agents/types";
import { hintLeaksAnswer, normalizeGuess } from "@/lib/guessMatch";
import type { CandidateMap, Hint } from "@/types";

const GENERIC_HINT_1 =
  "Read the pattern: where the values run high versus low across the map is the biggest clue to what's being measured.";
const GENERIC_HINT_2 =
  "The color scale tells you the range of the quantity — match that range and the regional pattern to a familiar statistic.";

/**
 * Deterministic mock hintsmith: preauthored hints when available; otherwise
 * template hints scrubbed of any answer substrings, falling back to fully
 * generic hints if scrubbing still leaks.
 */
export class MockHintsmithAgent implements HintsmithAgent {
  async writeHints(candidate: CandidateMap): Promise<[Hint, Hint]> {
    if (candidate.preauthoredHints) {
      const [h1, h2] = candidate.preauthoredHints;
      const preauthored: [Hint, Hint] = [
        { order: 1, text: h1 },
        { order: 2, text: h2 },
      ];
      if (
        !preauthored.some((h) =>
          hintLeaksAnswer(h.text, candidate.title, candidate.aliases),
        )
      ) {
        return preauthored;
      }
      // Preauthored hints that leak fall through to the scrubbed/generic path.
    }

    const scrubbedDescription = scrubAnswer(
      candidate.description,
      candidate.title,
      candidate.aliases,
    );

    const generated: [Hint, Hint] = [
      {
        order: 1,
        text: "Look at which regions are shaded high versus low — the spatial pattern narrows the topic more than you'd think.",
      },
      {
        order: 2,
        text: `About this map: ${truncate(scrubbedDescription, 160)}`,
      },
    ];

    const leaks = generated.some((h) =>
      hintLeaksAnswer(h.text, candidate.title, candidate.aliases),
    );
    if (!leaks) return generated;

    return [
      { order: 1, text: GENERIC_HINT_1 },
      { order: 2, text: GENERIC_HINT_2 },
    ];
  }
}

/** Replace normalized-answer substrings in text with "?????". */
function scrubAnswer(text: string, title: string, aliases: string[]): string {
  let out = text;
  const answers = [title, ...aliases]
    .map((a) => a.trim())
    .filter((a) => a.length >= 3)
    // longest first so "New York City" is scrubbed before "York"
    .sort((a, b) => b.length - a.length);

  for (const answer of answers) {
    const pattern = new RegExp(escapeRegExp(answer), "gi");
    out = out.replace(pattern, "?????");
    // Also scrub the diacritic-free form if it differs.
    const normalized = normalizeGuess(answer);
    if (normalized && normalized !== answer.toLowerCase()) {
      out = out.replace(new RegExp(escapeRegExp(normalized), "gi"), "?????");
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
