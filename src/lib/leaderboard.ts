/**
 * Leaderboard data layer. Encapsulates key naming and the two-store split so
 * routes stay thin.
 *
 * Sorted set `leaderboard:alltime` (member = sid, score = cumulative points)
 * is the source of truth for scoring and ranking. A per-player JSON record
 * (`player:<sid>`) is a best-effort mirror holding the nickname and counters.
 * If the record write fails after the sorted-set write succeeds, the score is
 * still correct — an acceptable risk at this scale, not worth a distributed
 * transaction. Raw sid values are never exposed to the client; only
 * nickname/rank/score cross the boundary (via the Public* view types).
 */

import { getKv } from "@/lib/kv";
import type { PublicLeaderboardEntry } from "@/types";

const LEADERBOARD_KEY = "leaderboard:alltime";
const playerKey = (sid: string) => `player:${sid}`;

export interface PlayerRecord {
  nickname: string | null;
  gamesWon: number;
  gamesPlayed: number;
  updatedAt: string;
}

function emptyRecord(): PlayerRecord {
  return {
    nickname: null,
    gamesWon: 0,
    gamesPlayed: 0,
    updatedAt: new Date().toISOString(),
  };
}

async function loadPlayer(sid: string): Promise<PlayerRecord> {
  const kv = getKv();
  const existing = await kv.getJson<PlayerRecord>(playerKey(sid));
  return existing ?? emptyRecord();
}

async function savePlayer(sid: string, record: PlayerRecord): Promise<void> {
  const kv = getKv();
  await kv.setJson(playerKey(sid), record);
}

/**
 * Called from POST /api/guess on every game-over transition (won or lost).
 * On a win, `points` > 0 accrues to the sorted set; on a loss `points` is 0
 * and only the counters move. Always updates gamesPlayed; gamesWon only on a
 * win.
 */
export async function recordGameFinished(
  sid: string,
  won: boolean,
  points: number,
): Promise<void> {
  const kv = getKv();
  if (won && points > 0) {
    // Source of truth first: even if the counter write below fails, the score
    // is durable and correct.
    await kv.zIncrBy(LEADERBOARD_KEY, sid, points);
  } else if (won) {
    // A win worth 0 points still needs a sorted-set presence so the player
    // has a rank/standing. Increment by 0 to ensure membership.
    await kv.zIncrBy(LEADERBOARD_KEY, sid, 0);
  }

  const record = await loadPlayer(sid);
  record.gamesPlayed += 1;
  if (won) record.gamesWon += 1;
  record.updatedAt = new Date().toISOString();
  await savePlayer(sid, record);
}

export async function setNickname(
  sid: string,
  nickname: string,
): Promise<PlayerRecord> {
  const record = await loadPlayer(sid);
  record.nickname = nickname;
  record.updatedAt = new Date().toISOString();
  await savePlayer(sid, record);
  return record;
}

/**
 * Top players by score descending. Only players WITH a nickname are included
 * in the public list — pre-nickname winners still accrue score but are hidden
 * until they claim a name (avoids "Anonymous" polluting the board without ever
 * losing anyone's points). Because named and unnamed players are interleaved
 * in the sorted set, we over-fetch and filter, then re-rank the visible names
 * 1..N so the displayed ranks are contiguous.
 */
export async function getLeaderboard(
  limit: number,
): Promise<PublicLeaderboardEntry[]> {
  const kv = getKv();
  // Over-fetch to tolerate unnamed players occupying high slots.
  const fetchCount = Math.max(limit * 3, limit + 20);
  const rows = await kv.zRevRangeWithScores(LEADERBOARD_KEY, fetchCount);

  const entries: PublicLeaderboardEntry[] = [];
  for (const row of rows) {
    if (entries.length >= limit) break;
    const record = await kv.getJson<PlayerRecord>(playerKey(row.member));
    if (!record?.nickname) continue;
    entries.push({
      rank: entries.length + 1,
      nickname: record.nickname,
      totalScore: row.score,
      gamesWon: record.gamesWon,
    });
  }
  return entries;
}

/**
 * The viewer's own standing, using their true sorted-set rank (works even
 * outside the top N). Returns null if the sid has no score entry yet. The
 * rank reflects position among ALL players (named or not), matching the
 * sorted set; nickname is null-safe (shown blank until they set one, but the
 * `you` row is still surfaced so a pre-nickname winner sees their points).
 */
export async function getViewerStanding(
  sid: string,
): Promise<PublicLeaderboardEntry | null> {
  const kv = getKv();
  const rank = await kv.zRevRank(LEADERBOARD_KEY, sid);
  if (rank === null) return null;

  // Fetch enough to locate this sid's score. zRevRank gives the 0-indexed
  // position; fetch up to and including it to read the score back.
  const rows = await kv.zRevRangeWithScores(LEADERBOARD_KEY, rank + 1);
  const own = rows[rank];
  const totalScore = own ? own.score : 0;

  const record = await kv.getJson<PlayerRecord>(playerKey(sid));
  return {
    rank: rank + 1,
    nickname: record?.nickname ?? "",
    totalScore,
    gamesWon: record?.gamesWon ?? 0,
  };
}
