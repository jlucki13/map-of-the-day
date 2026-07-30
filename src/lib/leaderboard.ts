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
 *
 * IDENTITY vs. DISPLAY. The sid is the *storage* identity: it is a per-browser
 * cookie, so one human who plays in a second browser, an incognito window, or
 * after clearing cookies owns several sids and therefore several sorted-set
 * members. The nickname is the *display* identity, and it is the one players
 * reason about — they expect "all my points, under my name".
 *
 * So the sorted set stays per-sid (it is durable and correct, and rewriting it
 * to re-key on nickname could only ever lose points), and the public view is
 * aggregated by normalised nickname at READ time. Nothing is migrated, nothing
 * is destroyed, and a player who returns on a new device simply reclaims their
 * name and their totals merge again on the next read.
 */

import { getKv } from "@/lib/kv";
import type { PublicLeaderboardEntry, PublicLeaderboardView } from "@/types";

const LEADERBOARD_KEY = "leaderboard:alltime";
const playerKey = (sid: string) => `player:${sid}`;

/**
 * How many sorted-set members one read may examine.
 *
 * The old code over-fetched `limit * 3` because unnamed players occupy high
 * slots. Merging breaks that arithmetic in a new way: N sids can collapse into
 * far fewer rows (in the worst case every member shares one nickname and the
 * whole set becomes a SINGLE row), so no small multiple of `limit` is a safe
 * bound any more. Rather than guess a multiplier, scan a fixed ceiling that
 * comfortably exceeds the realistic player count of a daily guessing game.
 *
 * The real cost is min(this, actual member count) — a game with 12 players
 * reads 12 records, not 500. See getLeaderboardView for what happens if a
 * board ever genuinely exceeds this.
 */
const MAX_SCANNED_MEMBERS = 500;

/** Player records are read in parallel batches of this size (see loadPlayerRecords). */
const RECORD_LOAD_CONCURRENCY = 25;

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

// ---------------------------------------------------------------------------
// Nickname aggregation
// ---------------------------------------------------------------------------

/**
 * The grouping key for a nickname. Two spellings that produce the same key are
 * treated as the same player.
 *
 * - NFC first, so a composed "é" and a decomposed "e + U+0301" — which look
 *   identical and are indistinguishable to the player who typed them — key the
 *   same.
 * - Whitespace: trimmed, and internal runs collapsed to one space. JS `\s`
 *   already covers NBSP and the other Unicode spaces, so "Jordan 2" and
 *   "Jordan  2" fold into "jordan 2".
 * - Case-folded LAST, with an EXPLICIT locale. `toLocaleLowerCase()` with no
 *   argument follows the host's default locale, which would make the grouping
 *   depend on the server's environment — under tr-TR, "I" lowercases to "ı"
 *   and "Jordan" vs "JORDAN" would stop merging. Pinning the locale keeps the
 *   key deterministic wherever this runs.
 *
 * Server-side only. This key never crosses the wire.
 */
export function nicknameGroupKey(nickname: string): string {
  return nickname
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

/** A blank/whitespace-only nickname counts as "no nickname". */
function displayableNickname(record: PlayerRecord | null): string | null {
  const raw = record?.nickname;
  if (typeof raw !== "string") return null;
  return raw.trim().length > 0 ? raw : null;
}

interface MergedGroup {
  key: string;
  /** Display spelling: the highest-scoring member's, ties broken by string order. */
  nickname: string;
  totalScore: number;
  gamesWon: number;
  /** Score of the member that donated the display spelling. */
  representativeScore: number;
  /** Server-side only — the sids folded into this row. Never serialised. */
  sids: Set<string>;
  /** 1-based, assigned after sorting. */
  rank: number;
}

type ScoredMember = { member: string; score: number };

/**
 * Reads player records for many sids without turning the per-row lookup into a
 * long serial chain. The old loop awaited one getJson per row inside a `for`,
 * which was tolerable only because it stopped after `limit` rows; merging has
 * to look at every scanned row before it knows how many rows result, so the
 * reads run in bounded-concurrency batches instead. Still O(members) reads —
 * linear, never quadratic — but ceil(members / 25) round trips rather than one
 * per member.
 */
async function loadPlayerRecords(
  sids: string[],
): Promise<Map<string, PlayerRecord | null>> {
  const kv = getKv();
  const unique = [...new Set(sids)];
  const out = new Map<string, PlayerRecord | null>();
  for (let i = 0; i < unique.length; i += RECORD_LOAD_CONCURRENCY) {
    const batch = unique.slice(i, i + RECORD_LOAD_CONCURRENCY);
    const records = await Promise.all(
      batch.map((sid) => kv.getJson<PlayerRecord>(playerKey(sid))),
    );
    batch.forEach((sid, idx) => out.set(sid, records[idx] ?? null));
  }
  return out;
}

/**
 * Folds per-sid rows into one row per nickname and ranks them 1..N.
 *
 * Unnamed members are dropped here (the "no nickname = hidden" rule) — they
 * keep their points in the sorted set, they just do not get a public row.
 */
function mergeByNickname(
  rows: ScoredMember[],
  records: Map<string, PlayerRecord | null>,
): MergedGroup[] {
  const groups = new Map<string, MergedGroup>();

  for (const row of rows) {
    const record = records.get(row.member) ?? null;
    const nickname = displayableNickname(record);
    if (!nickname) continue;

    const key = nicknameGroupKey(nickname);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        nickname,
        totalScore: row.score,
        gamesWon: record?.gamesWon ?? 0,
        representativeScore: row.score,
        sids: new Set([row.member]),
        rank: 0,
      });
      continue;
    }

    existing.totalScore += row.score;
    existing.gamesWon += record?.gamesWon ?? 0;
    existing.sids.add(row.member);
    // Deterministic display spelling: highest-scoring member wins, and equal
    // scores are broken by string order rather than by scan order, so the
    // rendered capitalisation cannot flicker between requests.
    if (
      row.score > existing.representativeScore ||
      (row.score === existing.representativeScore &&
        nickname < existing.nickname)
    ) {
      existing.nickname = nickname;
      existing.representativeScore = row.score;
    }
  }

  const ranked = [...groups.values()].sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.gamesWon - a.gamesWon ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  ranked.forEach((group, idx) => {
    group.rank = idx + 1;
  });
  return ranked;
}

function toEntry(group: MergedGroup, isViewer: boolean): PublicLeaderboardEntry {
  // Explicit field list, not a spread: `sids` and `key` must not leak.
  const entry: PublicLeaderboardEntry = {
    rank: group.rank,
    nickname: group.nickname,
    totalScore: group.totalScore,
    gamesWon: group.gamesWon,
  };
  if (isViewer) entry.isViewer = true;
  return entry;
}

/**
 * One scan, one snapshot. Both `entries` and `you` are derived from the same
 * read so they cannot disagree — the UI decides which row to badge by matching
 * them, so computing them from two independent reads is how you get a missing
 * badge or a duplicated row.
 */
async function buildSnapshot(viewerSid: string | null): Promise<{
  groups: MergedGroup[];
  viewer: ScoredMember | null;
  records: Map<string, PlayerRecord | null>;
}> {
  const kv = getKv();
  const rows = await kv.zRevRangeWithScores(
    LEADERBOARD_KEY,
    MAX_SCANNED_MEMBERS,
  );

  let viewer = viewerSid
    ? (rows.find((row) => row.member === viewerSid) ?? null)
    : null;

  // The viewer may sit below the scan window on a very large board. Their own
  // standing must never silently vanish, so pull their row in directly.
  if (viewerSid && !viewer) {
    const rank = await kv.zRevRank(LEADERBOARD_KEY, viewerSid);
    if (rank !== null) {
      const upTo = await kv.zRevRangeWithScores(LEADERBOARD_KEY, rank + 1);
      const own = upTo[rank];
      if (own) {
        viewer = own;
        rows.push(own);
      }
    }
  }

  const records = await loadPlayerRecords(rows.map((row) => row.member));
  return { groups: mergeByNickname(rows, records), viewer, records };
}

/**
 * The full client-facing leaderboard: the top `limit` merged rows plus the
 * caller's own standing.
 *
 * Ranking is over merged rows, so a player holding three sids under one name
 * gets ONE row carrying the summed score — which is what the player means by
 * "my points". `you` is looked up by sid but reported as the *group's* rank
 * and total, so a viewer whose sid is one sliver of a merged row sees the
 * combined figure and the badge lands on that merged row.
 *
 * Scan bound: at most MAX_SCANNED_MEMBERS (500) sorted-set members are
 * examined per read. Honest limits — if a board ever exceeds 500 members,
 * (a) members below the cut cannot appear, and (b) a merged row loses the
 * contribution of any of its sids that fell below the cut, so its total reads
 * low. The viewer's own row is exempt (fetched by rank above) so nobody loses
 * sight of their own score. `limit` rows can also still come up short if more
 * than 500 members collapse into fewer than `limit` names — an unavoidable
 * consequence of read-time aggregation over a bounded scan. At that scale the
 * fix is a nickname->sids index maintained on write, not a bigger scan.
 */
export async function getLeaderboardView(
  viewerSid: string | null,
  limit: number,
): Promise<PublicLeaderboardView> {
  const { groups, viewer, records } = await buildSnapshot(viewerSid);

  const viewerGroup =
    viewerSid && viewer
      ? (groups.find((group) => group.sids.has(viewerSid)) ?? null)
      : null;

  const entries = groups
    .slice(0, Math.max(0, limit))
    .map((group) => toEntry(group, group === viewerGroup));

  let you: PublicLeaderboardEntry | null = null;
  if (viewerGroup) {
    // Byte-identical to the row in `entries` when it is visible.
    you = toEntry(viewerGroup, true);
  } else if (viewer) {
    // Has points but no nickname yet: still hidden from the public board, but
    // they must be able to see what they have banked. The rank is where they
    // WOULD land once they claim a name.
    const record = viewerSid ? (records.get(viewerSid) ?? null) : null;
    you = {
      rank:
        groups.filter((group) => group.totalScore > viewer.score).length + 1,
      nickname: "",
      totalScore: viewer.score,
      gamesWon: record?.gamesWon ?? 0,
      isViewer: true,
    };
  }

  return { entries, you };
}

/**
 * Top merged rows by total score descending. Thin wrapper over
 * getLeaderboardView for callers with no viewer in hand.
 */
export async function getLeaderboard(
  limit: number,
): Promise<PublicLeaderboardEntry[]> {
  const { entries } = await getLeaderboardView(null, limit);
  return entries;
}

/**
 * The viewer's own standing — their merged group's rank and total, not their
 * single sid's sliver. Returns null if the sid has no score entry yet.
 * Nickname is null-safe (blank until they set one, but the row is still
 * surfaced so a pre-nickname winner sees their points).
 */
export async function getViewerStanding(
  sid: string,
): Promise<PublicLeaderboardEntry | null> {
  const { you } = await getLeaderboardView(sid, 0);
  return you;
}
