/**
 * Session-keyed fixed-window rate limiting for the public write endpoints
 * (POST /api/guess, POST /api/leaderboard/nickname).
 *
 * Keyed on the motd_session cookie (see session.ts), not IP. This app runs
 * on Vercel where client IP can be shared or proxied unreliably, and the
 * session cookie is already the identity the rest of the app uses for game
 * state and the leaderboard — an anonymous caller gets one minted the same
 * way loadSession/setNickname already do, then is limited on it like anyone
 * else.
 *
 * Fixed window (INCR, EXPIRE only on the increment that creates the key)
 * rather than sliding window: this threat model is "stop a scripted hammer",
 * not "shape traffic to the second", and a fixed window is the primitive
 * kv.ts can offer identically over both the Upstash and in-memory backends.
 * See KvStore.incrWithExpiry in kv.ts.
 *
 * Fails OPEN: if the KV check itself throws (e.g. a network blip against
 * Upstash), the request is let through and the error is logged rather than
 * turned into a hard failure. An infra hiccup breaking the rate limiter must
 * not mean "the game is broken for a legitimate player" — same spirit as the
 * best-effort KV resilience notes in leaderboard.ts, applied to a different
 * failure mode (a check that can't run, vs. a mirror write that can't land).
 */

import { getKv } from "@/lib/kv";

export type RateLimitKind = "guess" | "nickname";

interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

const POLICIES: Record<RateLimitKind, RateLimitPolicy> = {
  // A real player submits at most MAX_GUESSES (5) guesses per puzzle,
  // roughly once a day. A legitimate burst can run a bit higher than that,
  // though — a judge 503 doesn't consume a guess and the client auto-retries
  // it, a stale_puzzle 409 makes the client resubmit against the new puzzle,
  // and a fast typist may re-fire a few times while fixing a typo. 20 per 10
  // minutes comfortably absorbs all of that while stopping a scripted loop.
  guess: { limit: 20, windowSeconds: 10 * 60 },
  // A nickname is set once per player, essentially ever, from one small
  // inline form. 5/hour absorbs "typo, try again" a few times over without
  // leaving room for the endpoint to be hammered.
  nickname: { limit: 5, windowSeconds: 60 * 60 },
};

function rateLimitKey(kind: RateLimitKind, sessionId: string): string {
  return `ratelimit:${kind}:${sessionId}`;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when !allowed. */
  retryAfterSeconds: number;
}

/**
 * Returns whether `sessionId` may proceed under `kind`'s policy, and
 * increments its counter for this call regardless of the outcome (a request
 * that gets rejected still counts against the window, same as a normal hit —
 * otherwise a client could retry indefinitely at the boundary for free).
 *
 * Fails open (`allowed: true`) if the KV backend throws.
 */
export async function checkRateLimit(
  kind: RateLimitKind,
  sessionId: string,
): Promise<RateLimitResult> {
  const policy = POLICIES[kind];
  try {
    const kv = getKv();
    const count = await kv.incrWithExpiry(
      rateLimitKey(kind, sessionId),
      policy.windowSeconds,
    );
    if (count > policy.limit) {
      return { allowed: false, retryAfterSeconds: policy.windowSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error(
      `rateLimit: KV check failed for kind="${kind}" (failing open):`,
      err,
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
