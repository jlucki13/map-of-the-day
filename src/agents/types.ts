import type {
  CandidateMap,
  Hint,
  OcrTextBlock,
  RedactionRegion,
} from "@/types";

/**
 * Agent interfaces for the puzzle-generation pipeline and the runtime judge.
 *
 * There are exactly two implementations of each: a live one (Anthropic API —
 * Haiku for the four focused sub-tasks, Fable for the two orchestrator
 * judgment calls) and a deterministic mock (used when ANTHROPIC_API_KEY is
 * absent). generatePuzzle() is byte-identical control flow in both modes —
 * only the injected implementations differ.
 */

/** Scout's verdict on one raw candidate. */
export interface ScoutAssessment {
  /** Must match the CandidateMap.externalId it refers to. */
  externalId: string;
  /** Is this a usable single-answer map puzzle candidate? */
  suitable: boolean;
  /** Short reason, for logs / orchestrator context. */
  reason: string;
  /**
   * Additional acceptable answers (common names, abbreviations, endonyms).
   * Merged with any hand-authored aliases; never shown to the client until
   * reveal.
   */
  proposedAliases: string[];
}

export interface ScoutAgent {
  assessCandidates(candidates: CandidateMap[]): Promise<ScoutAssessment[]>;
}

export interface RedactorInput {
  candidate: CandidateMap;
  /** Original image bytes, base64-encoded (no data: prefix). */
  imageBase64: string;
  /** e.g. "image/jpeg" */
  imageMediaType: string;
  /**
   * Deterministic OCR geometry, already pre-filtered to the largest-N blocks
   * by area. The redactor only classifies these blocks; it must never invent
   * new geometry.
   */
  blocks: OcrTextBlock[];
}

export interface RedactorAgent {
  /**
   * Classify which OCR blocks are title / legend / other-identifying-text.
   * Returns regions to redact (a subset of the input blocks, with `kind`
   * assigned and `sourceText` carried over). Blocks judged harmless are
   * omitted.
   */
  classifyTextBlocks(input: RedactorInput): Promise<RedactionRegion[]>;
}

export interface HintsmithAgent {
  /**
   * Two progressively-revealing hints. Hint 1 (after 3rd wrong guess) is
   * oblique; hint 2 (after 4th) is more direct. Neither may contain the title
   * or any alias — a deterministic leak check runs after this regardless.
   */
  writeHints(candidate: CandidateMap): Promise<[Hint, Hint]>;
}

export type JudgeVerdict = "correct" | "incorrect";

export interface JudgeAgent {
  /**
   * Runtime, per ambiguous guess only (the local normalizer handles obvious
   * cases first). MUST throw on transport/model failure rather than returning
   * "incorrect" — a thrown error means the guess is NOT consumed (route
   * returns 503 and the client retries); a returned "incorrect" IS consumed.
   */
  judgeGuess(input: {
    guess: string;
    title: string;
    aliases: string[];
    description: string;
  }): Promise<JudgeVerdict>;
}

export interface OrchestratorPickInput {
  candidates: CandidateMap[];
  assessments: ScoutAssessment[];
}

export interface OrchestratorQaInput {
  candidate: CandidateMap;
  /** REDACTED image bytes, base64-encoded (no data: prefix). */
  redactedImageBase64: string;
  imageMediaType: string;
  hints: [Hint, Hint];
}

export interface OrchestratorAgent {
  /**
   * Pick the best scouted candidate, or null if nothing is usable (caller
   * then falls back to the static dataset).
   */
  pickCandidate(input: OrchestratorPickInput): Promise<CandidateMap | null>;

  /**
   * Final QA: given only what a player would see (the redacted image + the
   * two hints), confirm nothing leaks the answer. This runs IN ADDITION to
   * the deterministic substring leak check, never instead of it.
   */
  finalQa(input: OrchestratorQaInput): Promise<{ passed: boolean; notes?: string }>;
}

/** The full set of agents generatePuzzle()/the guess route are injected with. */
export interface AgentPipeline {
  mode: "mock" | "live";
  orchestratorModel: string;
  subagentModel: string;
  scout: ScoutAgent;
  redactor: RedactorAgent;
  hintsmith: HintsmithAgent;
  judge: JudgeAgent;
  orchestrator: OrchestratorAgent;
}
