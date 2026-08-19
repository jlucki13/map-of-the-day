/**
 * Tests for nickname aggregation on the all-time leaderboard.
 *
 * Run with `npm test`. These exercise the real lib against the in-memory KV
 * fallback (no Redis env vars set), so they cover the actual read path the API
 * route uses rather than a re-implementation of it.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  getLeaderboardView,
  getViewerStanding,
  nicknameGroupKey,
  recordGameFinished,
  setNickname,
} from "@/lib/leaderboard";

// The in-memory KV hangs its maps off globalThis under these well-known
// symbols. Clearing them IN PLACE (rather than reassigning) matters: getKv()
// caches a store instance that captured the map references at construction.
const MEMORY_STORE_KEY = Symbol.for("map-of-the-day.kv.memoryStore");
const MEMORY_ZSET_STORE_KEY = Symbol.for("map-of-the-day.kv.memoryZsetStore");

function resetKv(): void {
  const g = globalThis as unknown as Record<
    symbol,
    Map<string, unknown> | undefined
  >;
  g[MEMORY_STORE_KEY] ??= new Map();
  g[MEMORY_ZSET_STORE_KEY] ??= new Map();
  g[MEMORY_STORE_KEY]!.clear();
  g[MEMORY_ZSET_STORE_KEY]!.clear();
}

/** One win worth `points`, recorded against `sid`. */
async function win(sid: string, points: number): Promise<void> {
  await recordGameFinished(sid, true, points);
}

async function winAs(
  sid: string,
  nickname: string,
  points: number,
): Promise<void> {
  await win(sid, points);
  await setNickname(sid, nickname);
}

beforeEach(() => {
  assert.equal(
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    undefined,
    "tests must run against the in-memory KV, not a real Redis",
  );
  resetKv();
});

describe("nicknameGroupKey", () => {
  it("folds case, surrounding and internal whitespace", () => {
    const key = nicknameGroupKey("Jordan 2");
    assert.equal(nicknameGroupKey("jordan 2"), key);
    assert.equal(nicknameGroupKey("  JORDAN   2 "), key);
  });

  it("folds Unicode composition differences", () => {
    // Composed vs. decomposed "José" — visually identical to the player
    // who typed it, different bytes on the wire.
    const composed = "José";
    const decomposed = "José";
    assert.notEqual(composed, decomposed, "the fixtures must actually differ");
    assert.equal(nicknameGroupKey(composed), nicknameGroupKey(decomposed));
  });

  it("folds a non-breaking space like an ordinary one", () => {
    assert.equal(
      nicknameGroupKey("Jordan 2"),
      nicknameGroupKey("Jordan 2"),
    );
  });

  it("keeps genuinely different names apart", () => {
    assert.notEqual(nicknameGroupKey("Jordan 2"), nicknameGroupKey("Jordan 3"));
  });
});

describe("getLeaderboardView", () => {
  it("collapses one nickname held by several sessions into a single row", async () => {
    // The exact shape from the bug report: "Jordan 2" came back in three
    // different browsers and so owns three session ids.
    await winAs("sid-j1", "Jordan 1", 5);
    await winAs("sid-j3", "Jordan 3", 2);
    await winAs("sid-j2a", "Jordan 2", 2);
    await winAs("sid-j2b", "Jordan 2", 1);
    await winAs("sid-j2c", "Jordan 2", 1);

    const { entries } = await getLeaderboardView(null, 50);

    assert.deepEqual(
      entries.map((e) => [e.rank, e.nickname, e.totalScore, e.gamesWon]),
      [
        [1, "Jordan 1", 5, 1],
        [2, "Jordan 2", 4, 3],
        [3, "Jordan 3", 2, 1],
      ],
    );
  });

  it("merges spellings that differ only by case, and displays the highest scorer's", async () => {
    await winAs("sid-a", "Jordan 2", 5);
    await winAs("sid-b", "jordan 2", 3);
    await winAs("sid-c", "JORDAN  2", 1);

    const { entries } = await getLeaderboardView(null, 50);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].nickname, "Jordan 2");
    assert.equal(entries[0].totalScore, 9);
    assert.equal(entries[0].gamesWon, 3);
  });

  it("picks the same display spelling on every read", async () => {
    // Equal scores: the representative must be chosen by a total order, not by
    // whatever order the store happened to return, or the casing flickers.
    await winAs("sid-a", "ZEBRA", 4);
    await winAs("sid-b", "Zebra", 4);
    await winAs("sid-c", "zebra", 4);

    const first = await getLeaderboardView(null, 50);
    const second = await getLeaderboardView(null, 50);
    assert.deepEqual(first.entries, second.entries);
    assert.equal(first.entries.length, 1);
  });

  it("gives a viewer inside a merged group the group's total and rank", async () => {
    await winAs("sid-j1", "Jordan 1", 5);
    await winAs("sid-j3", "Jordan 3", 2);
    await winAs("sid-j2a", "Jordan 2", 2);
    await winAs("sid-j2b", "Jordan 2", 1);
    await winAs("sid-j2c", "Jordan 2", 1);

    // The viewer holds the 1-point sliver, not the whole group.
    const { entries, you } = await getLeaderboardView("sid-j2b", 50);

    assert.ok(you);
    assert.equal(you.nickname, "Jordan 2");
    assert.equal(you.totalScore, 4, "must be the group's total, not the sliver");
    assert.equal(you.gamesWon, 3);
    assert.equal(you.rank, 2);

    // The badge must land on exactly one row, and that row must agree with
    // `you` field for field.
    const flagged = entries.filter((e) => e.isViewer);
    assert.equal(flagged.length, 1);
    assert.deepEqual(flagged[0], you);
  });

  it("keeps a viewer with no nickname off the board but still shows their standing", async () => {
    await winAs("sid-ada", "Ada", 5);
    await win("sid-anon", 3); // won, never claimed a name

    const { entries, you } = await getLeaderboardView("sid-anon", 50);

    assert.deepEqual(
      entries.map((e) => e.nickname),
      ["Ada"],
      "unnamed players stay hidden",
    );
    assert.equal(
      entries.some((e) => e.isViewer),
      false,
      "an unnamed viewer has no row to badge",
    );
    assert.ok(you);
    assert.equal(you.nickname, "");
    assert.equal(you.totalScore, 3, "their points are still visible to them");
    assert.equal(you.gamesWon, 1);
    assert.equal(you.rank, 2, "where they would land once they claim a name");
  });

  it("returns no standing for a viewer who has never scored", async () => {
    await winAs("sid-ada", "Ada", 5);
    const { you } = await getLeaderboardView("sid-stranger", 50);
    assert.equal(you, null);
  });

  it("merges a viewer's older session in once they reuse the name", async () => {
    // The whole point of the fix: same human, second browser, same name.
    await winAs("sid-old", "Jordan 2", 6);
    await winAs("sid-new", "jordan 2", 2);

    const { entries, you } = await getLeaderboardView("sid-new", 50);
    assert.equal(entries.length, 1);
    assert.ok(you);
    assert.equal(you.totalScore, 8);
    assert.equal(you.rank, 1);
    assert.deepEqual(entries[0], you);
  });

  it("ranks named rows 1..N contiguously when unnamed players outscore them", async () => {
    // Unnamed high scorers occupy the top of the sorted set; the visible board
    // must still be a gapless 1..N of named rows.
    for (let i = 0; i < 25; i++) await win(`sid-anon-${i}`, 1000 + i);
    await winAs("sid-a", "Ada", 7);
    await winAs("sid-b", "Bo", 5);
    await winAs("sid-c", "Cy", 3);

    const { entries } = await getLeaderboardView(null, 50);
    assert.deepEqual(
      entries.map((e) => [e.rank, e.nickname]),
      [
        [1, "Ada"],
        [2, "Bo"],
        [3, "Cy"],
      ],
    );
  });

  it("still fills `limit` rows when hundreds of sessions collapse into one name", async () => {
    // 200 sessions share one name and hold the whole top of the sorted set.
    // Merging turns all 200 into ONE row, so filling a 5-row page means
    // scanning well past any small multiple of `limit` — the case the old
    // `limit * 3` over-fetch could not cover.
    for (let i = 0; i < 200; i++) await winAs(`sid-crowd-${i}`, "Crowd", 10);
    for (const name of ["Ada", "Bo", "Cy", "Di", "Ed", "Fi"]) {
      await winAs(`sid-${name}`, name, 1);
    }

    const { entries } = await getLeaderboardView(null, 5);

    assert.equal(entries.length, 5, "the page must not come up short");
    assert.deepEqual(
      entries.map((e) => e.rank),
      [1, 2, 3, 4, 5],
    );
    assert.equal(entries[0].nickname, "Crowd");
    assert.equal(entries[0].totalScore, 2000);
    assert.equal(entries[0].gamesWon, 200);
    assert.deepEqual(
      entries.slice(1).map((e) => e.nickname),
      ["Ada", "Bo", "Cy", "Di"],
    );
  });

  it("honours limit and never returns more rows than asked for", async () => {
    for (const name of ["Ada", "Bo", "Cy"]) await winAs(`sid-${name}`, name, 3);
    const { entries } = await getLeaderboardView(null, 2);
    assert.equal(entries.length, 2);
  });

  it("never leaks a session id into the serialized view", async () => {
    await winAs("sid-j2a", "Jordan 2", 2);
    await winAs("sid-j2b", "Jordan 2", 1);
    await win("sid-anon", 9);

    const view = await getLeaderboardView("sid-j2b", 50);
    const json = JSON.stringify(view);

    for (const sid of ["sid-j2a", "sid-j2b", "sid-anon"]) {
      assert.equal(json.includes(sid), false, `${sid} leaked into the view`);
    }
    // And no stray internals rode along on the entry shape.
    assert.deepEqual(Object.keys(view.entries[0]).sort(), [
      "gamesWon",
      "isViewer",
      "nickname",
      "rank",
      "totalScore",
    ]);
  });
});

describe("getViewerStanding", () => {
  it("reports the merged group's total, not the caller's own session score", async () => {
    await winAs("sid-j1", "Jordan 1", 5);
    await winAs("sid-j2a", "Jordan 2", 2);
    await winAs("sid-j2b", "Jordan 2", 1);
    await winAs("sid-j2c", "Jordan 2", 1);

    const standing = await getViewerStanding("sid-j2b");
    assert.ok(standing);
    assert.equal(standing.nickname, "Jordan 2");
    assert.equal(standing.totalScore, 4);
    assert.equal(standing.rank, 2);
  });

  it("reports an unnamed winner with a blank nickname so the client can prompt", async () => {
    await win("sid-anon", 4);
    const standing = await getViewerStanding("sid-anon");
    assert.ok(standing);
    assert.equal(standing.nickname, "");
    assert.equal(standing.totalScore, 4);
  });
});
