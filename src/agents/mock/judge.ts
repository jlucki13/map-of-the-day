import type { JudgeAgent, JudgeVerdict } from "@/agents/types";
import { matchGuessLocally } from "@/lib/guessMatch";

/**
 * Deterministic mock judge: reuses the local matcher; "ambiguous" resolves to
 * "incorrect" so mock-mode behavior is fully reproducible. (In live mode
 * ambiguous guesses go to the Haiku judge instead.)
 */
export class MockJudgeAgent implements JudgeAgent {
  async judgeGuess(input: {
    guess: string;
    title: string;
    aliases: string[];
    description: string;
  }): Promise<JudgeVerdict> {
    const result = matchGuessLocally(input.guess, input.title, input.aliases);
    return result === "correct" ? "correct" : "incorrect";
  }
}
