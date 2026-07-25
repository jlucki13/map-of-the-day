/**
 * Env-derived constants. This is the single place environment variables are
 * read for tunable behavior, so tests and local runs can reason about them.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MAX_GUESSES = 5;

export const config = {
  /** How long one puzzle stays live. Default 24h; shorten locally for testing. */
  intervalSeconds: intFromEnv("PUZZLE_INTERVAL_SECONDS", 24 * 60 * 60),

  /** setNX lock TTL guarding background regeneration (seconds). */
  generationLockTtlSeconds: intFromEnv("GENERATION_LOCK_TTL_SECONDS", 180),

  /**
   * Dedupe window is COUNT-based (last N used external ids), not day-based —
   * a day-based window exhausts the ~10-entry static dataset immediately when
   * the interval is shortened for local testing.
   */
  dedupeWindowSize: intFromEnv("DEDUPE_WINDOW_SIZE", 20),

  /** Max raw candidates fetched from a source per generation run. */
  maxCandidatesPerGeneration: intFromEnv("MAX_CANDIDATES_PER_GENERATION", 12),

  /**
   * A busy map can produce dozens of OCR text blocks — pre-filter to the
   * largest-N by area before the Redactor's vision call.
   */
  maxOcrBlocksForRedactor: intFromEnv("MAX_OCR_BLOCKS_FOR_REDACTOR", 12),

  /**
   * Honest User-Agent with contact info is required by Wikimedia policy.
   * Override with WIKIMEDIA_USER_AGENT once deployed under a real URL.
   */
  wikimediaUserAgent:
    process.env.WIKIMEDIA_USER_AGENT ??
    "MapOfTheDayBot/0.1 (https://github.com/map-of-the-day; jlucki1219@gmail.com)",

  /** Bearer secret guarding /api/cron/generate-puzzle. */
  cronSecret: process.env.CRON_SECRET,

  /** True when running on Vercel (used to loudly warn about dev fallbacks). */
  isVercel: !!process.env.VERCEL,
} as const;

/**
 * Live mode = a real Anthropic key is present. Everything keys off this:
 * agent factory (mock vs live agents), source registry (static-only in mock
 * mode). Mock mode must work with zero external services.
 */
export function isLiveMode(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
