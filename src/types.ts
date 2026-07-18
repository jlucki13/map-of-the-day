/**
 * Frozen data contracts for Map of the Day.
 *
 * Everything below the "Client-facing views" divider is the ONLY shape server
 * state may take when it reaches the browser, and the only code allowed to
 * produce those shapes is src/lib/publicViews.ts. Any route handler that
 * serializes a Puzzle or GuessSessionState directly is a leak bug.
 */

export type RedactionKind = "title" | "legend" | "other-identifying-text";

export interface RedactionRegion {
  kind: RedactionKind;
  /** pixel-space, relative to the ORIGINAL image */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  /** never sent to client */
  sourceText?: string;
}

export interface CandidateMap {
  sourceId: string;
  externalId: string;
  title: string;
  aliases: string[];
  description: string;
  imageUrl: string;
  width?: number;
  height?: number;
  mimeType: string;
  attribution: {
    author: string;
    license: string;
    licenseUrl?: string;
    sourcePageUrl: string;
  };
  /** static-dataset only */
  preauthoredRedactionRegions?: RedactionRegion[];
  /** static-dataset only */
  preauthoredHints?: [string, string];
}

export interface Hint {
  order: 1 | 2;
  text: string;
}

export interface Puzzle {
  id: string;
  createdAt: string;
  intervalStartAt: string;
  intervalSeconds: number;
  candidate: CandidateMap;
  redactionRegions: RedactionRegion[];
  redactedImageUrl: string;
  originalImageUrl: string;
  hints: [Hint, Hint];
  qa: { passed: boolean; notes?: string };
  generator: {
    mode: "mock" | "live";
    orchestratorModel: string;
    subagentModel: string;
  };
}

export type GuessOutcome = "correct" | "incorrect";

export interface GuessRecord {
  text: string;
  outcome: GuessOutcome;
  guessedAt: string;
}

export type GameStatus = "in_progress" | "won" | "lost";

export interface GuessSessionState {
  puzzleId: string;
  sessionId: string;
  guesses: GuessRecord[];
  hintsRevealed: 0 | 1 | 2;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- Client-facing views. Server state must only ever reach the client through these shapes. ----

export interface PuzzleReveal {
  title: string;
  aliases: string[];
  description: string;
  attribution: CandidateMap["attribution"];
  originalImageUrl: string;
  shareGrid: string;
}

export interface PublicSessionView {
  guessesUsed: number;
  guessesRemaining: number;
  hintsRevealed: Hint[];
  status: GameStatus;
  guessHistory: { outcome: GuessOutcome }[];
  reveal?: PuzzleReveal;
}

export interface PublicPuzzleView {
  puzzleId: string;
  redactedImageUrl: string;
  intervalStartAt: string;
  intervalSeconds: number;
  nextRotationAt: string;
  session: PublicSessionView;
}

// ---- Supplementary shared types (server-side only, never sent to the client) ----

/**
 * A text block detected by deterministic OCR (src/lib/ocr.ts). Geometry is in
 * pixel-space relative to the original image. Only the semantic classification
 * of blocks (title vs legend vs other) is an LLM call; the geometry is not.
 */
export interface OcrTextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..100, as reported by tesseract */
  confidence: number;
}
