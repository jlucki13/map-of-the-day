import type {
  OrchestratorAgent,
  OrchestratorPickInput,
  OrchestratorQaInput,
} from "@/agents/types";
import { hintLeaksAnswer } from "@/lib/guessMatch";
import type { CandidateMap } from "@/types";

/**
 * Deterministic mock orchestrator: picks the first suitable candidate, and
 * final QA is exactly the deterministic hint-leak check (which the live path
 * runs as an independent safety net anyway).
 */
export class MockOrchestratorAgent implements OrchestratorAgent {
  async pickCandidate(input: OrchestratorPickInput): Promise<CandidateMap | null> {
    const suitableIds = new Set(
      input.assessments.filter((a) => a.suitable).map((a) => a.externalId),
    );
    return (
      input.candidates.find((c) => suitableIds.has(c.externalId)) ?? null
    );
  }

  async finalQa(
    input: OrchestratorQaInput,
  ): Promise<{ passed: boolean; notes?: string }> {
    const leakingHints = input.hints.filter((h) =>
      hintLeaksAnswer(h.text, input.candidate.title, input.candidate.aliases),
    );
    if (leakingHints.length > 0) {
      return {
        passed: false,
        notes: `mock QA: hint(s) ${leakingHints.map((h) => h.order).join(", ")} contain the answer`,
      };
    }
    return { passed: true, notes: "mock QA: deterministic leak check passed" };
  }
}
