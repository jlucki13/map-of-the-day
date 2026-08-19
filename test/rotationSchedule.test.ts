/**
 * Tests for the fixed-daily-reveal (8 PM America/New_York) scheduling math.
 * DST is the whole reason this module exists rather than a one-line offset
 * constant, so the cases here deliberately include both sides of both annual
 * transitions, not just an arbitrary weekday.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  etCalendarDateLabel,
  isStale,
  nextDailyRevealInstant,
} from "@/lib/rotationSchedule";
import type { Puzzle } from "@/types";

// Only the fields isStale actually reads matter here.
function fakePuzzle(overrides: Partial<Puzzle>): Puzzle {
  return { nextRotationAt: "2025-01-01T00:00:00.000Z", ...overrides } as Puzzle;
}

describe("nextDailyRevealInstant", () => {
  it("resolves to 01:00 UTC next day in EST (UTC-5)", () => {
    // Jan 15 2025 is deep in standard time. 8 PM EST = 01:00 UTC Jan 16.
    const after = new Date("2025-01-15T12:00:00Z");
    const next = nextDailyRevealInstant(after);
    assert.equal(next.toISOString(), "2025-01-16T01:00:00.000Z");
  });

  it("resolves to 00:00 UTC same day in EDT (UTC-4)", () => {
    // Jul 15 2025 is deep in daylight time. 8 PM EDT = 00:00 UTC Jul 16.
    const after = new Date("2025-07-15T12:00:00Z");
    const next = nextDailyRevealInstant(after);
    assert.equal(next.toISOString(), "2025-07-16T00:00:00.000Z");
  });

  it("rolls to tomorrow when today's slot has already passed", () => {
    // 9 PM EST Jan 15 -> today's 8 PM slot is behind us.
    const after = new Date("2025-01-16T02:00:00Z"); // 21:00 EST Jan 15
    const next = nextDailyRevealInstant(after);
    assert.equal(next.toISOString(), "2025-01-17T01:00:00.000Z");
  });

  it("rolls to tomorrow at the exact instant of today's slot (no repeat)", () => {
    const exactSlot = new Date("2025-01-16T01:00:00.000Z");
    const next = nextDailyRevealInstant(exactSlot);
    assert.equal(next.toISOString(), "2025-01-17T01:00:00.000Z");
  });

  it("picks tonight's slot when generation happens hours before it", () => {
    // 9 AM EST Jan 15 -> tonight's 8 PM slot is still ahead.
    const after = new Date("2025-01-15T14:00:00Z");
    const next = nextDailyRevealInstant(after);
    assert.equal(next.toISOString(), "2025-01-16T01:00:00.000Z");
  });

  it("crosses the spring-forward transition correctly (2025-03-09)", () => {
    // Clocks skip 2 AM -> 3 AM EST->EDT on Mar 9 2025. A puzzle generated the
    // morning of Mar 9 (still EST) should still target that same evening's
    // slot, now in EDT (00:00 UTC Mar 10, not 01:00).
    const morningOfChange = new Date("2025-03-09T10:00:00Z"); // 05:00 EST
    const next = nextDailyRevealInstant(morningOfChange);
    assert.equal(next.toISOString(), "2025-03-10T00:00:00.000Z");
  });

  it("crosses the fall-back transition correctly (2025-11-02)", () => {
    // Clocks fall back 2 AM -> 1 AM EDT->EST on Nov 2 2025. A puzzle
    // generated that morning (still EDT) should target that evening's slot,
    // now in EST (01:00 UTC Nov 3, not 00:00).
    const morningOfChange = new Date("2025-11-02T10:00:00Z"); // 06:00 EDT
    const next = nextDailyRevealInstant(morningOfChange);
    assert.equal(next.toISOString(), "2025-11-03T01:00:00.000Z");
  });

  it("never returns an instant at or before `after`, across a full year", () => {
    // Coarse sweep rather than exhaustive per-second, but enough to catch a
    // sign error or an off-by-one in the day-rollover logic anywhere across
    // both DST transitions.
    const start = new Date("2025-01-01T00:00:00Z").getTime();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    for (let t = start; t < start + 366 * 24 * 60 * 60 * 1000; t += threeHoursMs) {
      const after = new Date(t);
      const next = nextDailyRevealInstant(after);
      assert.ok(
        next.getTime() > after.getTime(),
        `expected ${next.toISOString()} to be after ${after.toISOString()}`,
      );
      // And never more than ~24h + a couple hours away, or a rollover bug
      // sending it a month ahead would slip through unnoticed.
      assert.ok(
        next.getTime() - after.getTime() <= 28 * 60 * 60 * 1000,
        `${next.toISOString()} is implausibly far from ${after.toISOString()}`,
      );
    }
  });
});

describe("etCalendarDateLabel", () => {
  it("reads the ET calendar date, not the UTC one, near the boundary", () => {
    // 01:00 UTC Jan 16 is 20:00 EST Jan 15 -- still "the 15th" in ET, even
    // though the UTC date has already rolled to the 16th.
    assert.equal(
      etCalendarDateLabel(new Date("2025-01-16T01:00:00.000Z")),
      "2025-01-15",
    );
  });

  it("agrees with the UTC date well away from midnight", () => {
    assert.equal(
      etCalendarDateLabel(new Date("2025-07-15T18:00:00.000Z")), // 14:00 EDT
      "2025-07-15",
    );
  });
});

describe("isStale", () => {
  it("is not stale before nextRotationAt", () => {
    const puzzle = fakePuzzle({ nextRotationAt: "2025-06-01T00:00:00.000Z" });
    const now = new Date("2025-05-31T23:59:59.000Z");
    assert.equal(isStale(puzzle, now), false);
  });

  it("is stale at and after nextRotationAt", () => {
    const puzzle = fakePuzzle({ nextRotationAt: "2025-06-01T00:00:00.000Z" });
    assert.equal(isStale(puzzle, new Date("2025-06-01T00:00:00.000Z")), true);
    assert.equal(isStale(puzzle, new Date("2025-06-01T00:00:01.000Z")), true);
  });

  it("treats a missing nextRotationAt (pre-migration record) as stale", () => {
    // A record persisted before this field existed (the old shape carried
    // intervalStartAt/intervalSeconds instead). Without the guard in
    // isStale, new Date(undefined).getTime() is NaN, and `now >= NaN` is
    // always false in JS — the old record would look permanently fresh
    // rather than rotating in under the new schedule.
    const puzzle = fakePuzzle({});
    delete (puzzle as Partial<Puzzle>).nextRotationAt;
    assert.equal(isStale(puzzle, new Date()), true);
  });

  it("treats an unparseable nextRotationAt as stale", () => {
    const puzzle = fakePuzzle({ nextRotationAt: "not a date" });
    assert.equal(isStale(puzzle, new Date()), true);
  });
});
