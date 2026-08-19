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
  /**
   * Local/testing-only escape hatch. Real rotation is a fixed daily reveal
   * time (see rotationSchedule.ts — 8 PM America/New_York, not configurable
   * via env, since "the puzzle changes at a specific clock time every night"
   * is the actual product requirement, not a tunable). Set this to revert to
   * a plain "N seconds after generation" interval instead, so a dev server
   * doesn't have to wait for a real wall-clock boundary to see a new puzzle.
   * Unset (0 = disabled) in any real deployment. This deliberately has a
   * different name from the old PUZZLE_INTERVAL_SECONDS var so a value still
   * sitting in a deployment's env from before this change is silently inert
   * rather than silently still controlling production rotation.
   */
  puzzleRotationOverrideSeconds: intFromEnv(
    "PUZZLE_ROTATION_OVERRIDE_SECONDS",
    0,
  ),

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

  /**
   * Absolute origin used as metadataBase for OG/Twitter image URLs, so social
   * crawlers (which don't share a browser's notion of "relative") get a real
   * URL rather than a localhost one.
   *
   * Preference order:
   *  1. SITE_URL — an explicit custom domain, set once and forget. Also the
   *     only option that's stable if a per-deployment protection setting or
   *     something else makes Vercel's own URLs unreliable for an outside
   *     crawler to fetch.
   *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's own "stable alias for
   *     whatever is currently in Production" variable. Deliberately preferred
   *     over VERCEL_URL: that one is per-DEPLOYMENT (a fresh random hash every
   *     push, e.g. map-of-the-qlo71hb3b-<team>.vercel.app) rather than
   *     per-PROJECT, so a socially-shared link built from it goes stale the
   *     next time anything is deployed — and those hashed URLs are commonly
   *     still gated by Deployment Protection even once the real production
   *     alias has been made public, which is exactly what broke this once.
   *  3. VERCEL_URL — last-resort fallback for contexts where neither of the
   *     above is set (e.g. a Preview deployment, which has no stable alias by
   *     definition).
   *  4. undefined, so Next's own localhost default applies in plain local dev.
   */
  siteUrl: process.env.SITE_URL
    ? process.env.SITE_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : undefined,
} as const;

/**
 * Live mode = a real Anthropic key is present. Everything keys off this:
 * agent factory (mock vs live agents), source registry (static-only in mock
 * mode). Mock mode must work with zero external services.
 */
export function isLiveMode(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
