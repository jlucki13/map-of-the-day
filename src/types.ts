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
  /**
   * static-dataset only: which cartographic form the generator drew this with
   * (choropleth, spike, surface, ...). Recorded for the private answer-key
   * page; the game itself never branches on it.
   */
  form?: string;
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
  /**
   * Present only on the exact response where a win was just recorded. Points
   * are server-computed from the winning guess number; hasNickname tells the
   * client whether to prompt for a leaderboard name.
   */
  scoreAwarded?: { points: number; hasNickname: boolean };
}

// ---- Leaderboard client-facing views ----

/**
 * One row of the public board. A row is one NICKNAME, not one session: a
 * player who has played from several browsers holds several server-side ids,
 * and their scores are summed into a single row here (see src/lib/leaderboard).
 * Consequently `rank` is a rank among merged rows and is contiguous 1..N.
 *
 * Nothing that identifies a session may be added to this shape.
 */
export interface PublicLeaderboardEntry {
  rank: number;
  nickname: string;
  totalScore: number;
  gamesWon: number;
  /**
   * True on the caller's own row (both inside `entries` and on `you`).
   * Optional and purely a rendering convenience — it says "this is you" to the
   * person who already knows they are themselves, and reveals nothing about
   * anyone else. Prefer it over comparing `you.rank` to an entry's rank: a
   * viewer who has points but has not claimed a nickname is absent from
   * `entries`, yet their provisional `rank` can coincide with a real row's.
   */
  isViewer?: boolean;
}

export interface PublicLeaderboardView {
  entries: PublicLeaderboardEntry[];
  you: PublicLeaderboardEntry | null;
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
