/**
 * Fixed-daily-reveal scheduling: puzzles rotate at PUZZLE_REVEAL_HOUR local
 * time in PUZZLE_REVEAL_TIMEZONE every day, not N seconds after generation.
 *
 * This is deliberately its own small module with pure, `now`-parameterized
 * functions: staleness and countdown logic both reduce to "compare against a
 * stored instant," and the one genuinely fiddly part — converting a wall-clock
 * time in a DST-observing zone to a UTC instant — is isolated and unit-tested
 * here rather than smeared across the callers.
 */

import { config } from "@/lib/config";
import type { Puzzle } from "@/types";

export const PUZZLE_REVEAL_TIMEZONE = "America/New_York";
/** 24-hour clock: 20 = 8:00 PM. */
export const PUZZLE_REVEAL_HOUR = 20;

/**
 * The UTC instant corresponding to a wall-clock time in `timeZone`, correct
 * across a DST boundary.
 *
 * There's no way to convert a local time to UTC without knowing that zone's
 * offset on that specific date (it isn't constant — that's the whole
 * complication `Intl` exists to solve), so this uses the standard
 * guess-and-correct trick: treat the wall-clock fields as if they were UTC to
 * get a first-pass instant, ask Intl what that instant reads as when
 * displayed in `timeZone`, and shift by the difference. The shift is exact
 * because a timezone's offset is piecewise constant — it only changes at a
 * DST transition, and this function is never asked to resolve an instant
 * that falls inside one (8 PM is nowhere near the ~2 AM transitions the US
 * uses).
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(guessUtcMs).map((p) => [p.type, p.value]),
  );
  const readAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  // guessUtcMs read as `timeZone` shows readAsUtcMs's wall-clock fields; the
  // gap between them is exactly that zone's UTC offset at this instant.
  return new Date(guessUtcMs + (guessUtcMs - readAsUtcMs));
}

/** `instant`'s calendar date in `timeZone`, as {year, month, day} (1-indexed month). */
function zonedDateParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/**
 * The next PUZZLE_REVEAL_HOUR:00:00 in PUZZLE_REVEAL_TIMEZONE strictly after
 * `after`. "Strictly after" matters at the boundary itself: a puzzle whose
 * own nextRotationAt instant IS `after` must roll to tomorrow's slot, not
 * repeat today's (which has, by definition, just happened).
 */
export function nextDailyRevealInstant(
  after: Date,
  timeZone: string = PUZZLE_REVEAL_TIMEZONE,
  hour: number = PUZZLE_REVEAL_HOUR,
): Date {
  const { year, month, day } = zonedDateParts(after, timeZone);
  const todaysSlot = zonedTimeToUtc(year, month, day, hour, 0, 0, timeZone);
  if (todaysSlot.getTime() > after.getTime()) {
    return todaysSlot;
  }
  // Date.UTC normalizes an out-of-range day (e.g. day 32) into the next
  // month on its own, so incrementing the day unconditionally is safe even
  // at a month/year boundary.
  return zonedTimeToUtc(year, month, day + 1, hour, 0, 0, timeZone);
}

/**
 * The single entry point callers should use: the real fixed daily schedule,
 * unless a local/testing override is configured (see config.ts), in which
 * case rotation reverts to a plain "N seconds after generation" interval —
 * so a dev server doesn't need to wait for a real clock-time boundary to see
 * the next puzzle.
 */
export function computeNextRotation(after: Date): Date {
  const overrideSeconds = config.puzzleRotationOverrideSeconds;
  if (overrideSeconds > 0) {
    return new Date(after.getTime() + overrideSeconds * 1000);
  }
  return nextDailyRevealInstant(after);
}

/** `instant`'s calendar date in PUZZLE_REVEAL_TIMEZONE, as "YYYY-MM-DD". */
export function etCalendarDateLabel(instant: Date): string {
  const { year, month, day } = zonedDateParts(instant, PUZZLE_REVEAL_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Pure staleness check, kept in this module (rather than ensureFreshPuzzle.ts,
 * which imports next/server's `after` and so can't be loaded outside a real
 * Next.js context) specifically so it stays unit-testable with plain
 * `node --test`.
 */
export function isStale(puzzle: Puzzle, now: Date = new Date()): boolean {
  const expiresAt = new Date(puzzle.nextRotationAt).getTime();
  // A puzzle stored under the pre-nextRotationAt shape (from before this
  // field existed) has no valid value here — new Date(undefined).getTime()
  // is NaN, and `now >= NaN` is always false in JS, which would make an old
  // record look permanently fresh and get stuck serving forever instead of
  // rotating in under the new schedule on its very next check. Treat
  // missing/invalid as stale rather than eternally fresh.
  if (!Number.isFinite(expiresAt)) return true;
  return now.getTime() >= expiresAt;
}
