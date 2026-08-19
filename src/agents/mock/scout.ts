import type { ScoutAgent, ScoutAssessment } from "@/agents/types";
import type { CandidateMap } from "@/types";

/**
 * Deterministic mock scout: every candidate is suitable, and the proposed
 * aliases are exactly the candidate's own (hand-authored) aliases — the mock
 * never invents data.
 */
export class MockScoutAgent implements ScoutAgent {
  async assessCandidates(candidates: CandidateMap[]): Promise<ScoutAssessment[]> {
    return candidates.map((c) => ({
      externalId: c.externalId,
      suitable: true,
      reason: "mock: accepted as-is",
      proposedAliases: [...new Set(c.aliases)],
    }));
  }
}
