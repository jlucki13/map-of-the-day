/**
 * Staleness check + regeneration orchestration, shared by GET /api/puzzle
 * (trigger "lazy") and the cron route (trigger "cron").
 *
 * Vercel Hobby cron is daily-only with no delivery guarantee, so the cron is
 * only ever a convenience trigger. The real rotation mechanism is the lazy
 * path: every GET /api/puzzle checks staleness; if stale it serves the
 * existing (slightly stale) puzzle immediately and kicks off regeneration in
 * the background, guarded by a short-TTL setNX lock so concurrent requests
 * don't double-generate. Only a true cold start (no puzzle exists at all)
 * blocks on synchronous generation. This makes short test intervals work
 * without depending on Vercel's cron granularity at all.
 */

import { after } from "next/server";
import { config } from "@/lib/config";
import {
  CURRENT_PUZZLE_KEY,
  generatePuzzle,
} from "@/lib/generatePuzzle";
import { getKv } from "@/lib/kv";
import type { Puzzle } from "@/types";

export const GENERATION_LOCK_KEY = "puzzle:generation-lock";

export type EnsureTrigger = "lazy" | "cron";

export interface EnsureFreshPuzzleResult {
  puzzle: Puzzle;
  /** True when the returned puzzle is past its interval (regen may be underway). */
  stale: boolean;
  /** True when THIS call started a regeneration (sync or background). */
  regenerationStarted: boolean;
}

export function isStale(puzzle: Puzzle, now: Date = new Date()): boolean {
  const expiresAt =
    new Date(puzzle.intervalStartAt).getTime() + puzzle.intervalSeconds * 1000;
  return now.getTime() >= expiresAt;
}

export async function getCurrentPuzzle(): Promise<Puzzle | null> {
  return getKv().getJson<Puzzle>(CURRENT_PUZZLE_KEY);
}

/** Generate under the setNX lock; always releases the lock. */
async function generateWithLock(): Promise<Puzzle | null> {
  const kv = getKv();
  const acquired = await kv.setNx(
    GENERATION_LOCK_KEY,
    new Date().toISOString(),
    config.generationLockTtlSeconds,
  );
  if (!acquired) return null;

  try {
    return await generatePuzzle();
  } finally {
    try {
      await kv.del(GENERATION_LOCK_KEY);
    } catch {
      // Lock has a TTL; failing to delete it just delays the next attempt.
    }
  }
}

const COLD_START_POLL_ATTEMPTS = 15;
const COLD_START_POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureFreshPuzzle(
  trigger: EnsureTrigger,
): Promise<EnsureFreshPuzzleResult> {
  const existing = await getCurrentPuzzle();

  // ---- Cold start: no puzzle exists at all — the one case that blocks. ----
  if (!existing) {
    const generated = await generateWithLock();
    if (generated) {
      return { puzzle: generated, stale: false, regenerationStarted: true };
    }
    // Someone else holds the lock — poll for their result.
    for (let i = 0; i < COLD_START_POLL_ATTEMPTS; i++) {
      await sleep(COLD_START_POLL_INTERVAL_MS);
      const puzzle = await getCurrentPuzzle();
      if (puzzle) {
        return { puzzle, stale: false, regenerationStarted: false };
      }
    }
    throw new Error(
      "ensureFreshPuzzle: cold start — another generation is in progress but no puzzle appeared in time",
    );
  }

  // ---- Fresh: nothing to do. ----
  if (!isStale(existing)) {
    return { puzzle: existing, stale: false, regenerationStarted: false };
  }

  // ---- Stale + cron trigger: regenerate synchronously (cron can block). ----
  if (trigger === "cron") {
    const generated = await generateWithLock();
    if (generated) {
      return { puzzle: generated, stale: false, regenerationStarted: true };
    }
    // Lock contention: someone else is already regenerating.
    return { puzzle: existing, stale: true, regenerationStarted: false };
  }

  // ---- Stale + lazy trigger: serve stale now, regenerate in the background.
  const kv = getKv();
  const acquired = await kv.setNx(
    GENERATION_LOCK_KEY,
    new Date().toISOString(),
    config.generationLockTtlSeconds,
  );
  if (acquired) {
    // after() defers the work until the response has been sent, and (on
    // Vercel) keeps the function alive until it settles — the request that
    // notices staleness doesn't pay the generation latency.
    after(async () => {
      try {
        await generatePuzzle();
      } catch (err) {
        console.error("ensureFreshPuzzle: background regeneration failed:", err);
      } finally {
        try {
          await kv.del(GENERATION_LOCK_KEY);
        } catch {
          // TTL will clear it.
        }
      }
    });
    return { puzzle: existing, stale: true, regenerationStarted: true };
  }

  return { puzzle: existing, stale: true, regenerationStarted: false };
}
