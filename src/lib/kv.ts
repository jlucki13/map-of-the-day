/**
 * Key-value store abstraction. Two implementations:
 *  - Upstash Redis (production / any env with REST URL + TOKEN configured)
 *  - In-memory Map fallback (local dev without Redis configured)
 *
 * All server-side session/game state goes through this interface so the rest
 * of the codebase never has to know which backend is active.
 *
 * Vercel's Redis marketplace integration has, at different times/accounts,
 * provisioned this under different env var name pairs — UPSTASH_REDIS_REST_*
 * (the @upstash/redis SDK's own `Redis.fromEnv()` convention) and, currently,
 * KV_REST_API_* (Vercel's own branding for the same underlying REST API).
 * Rather than depend on a specific integration naming, check both.
 */

import { Redis } from "@upstash/redis";
import { config } from "@/lib/config";

function resolveRedisRestCredentials(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export interface KvStore {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
  /** SET NX with TTL; returns true if the lock was acquired. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Prepend value to a capped recent-list (LPUSH + LTRIM semantics). */
  pushRecent(key: string, value: string, maxLen: number): Promise<void>;
  getRecent(key: string, maxLen: number): Promise<string[]>;
  /** Atomically increments member's score in a sorted set; returns the new score. */
  zIncrBy(key: string, member: string, delta: number): Promise<number>;
  /** Top `count` members by score descending, with scores. */
  zRevRangeWithScores(
    key: string,
    count: number,
  ): Promise<{ member: string; score: number }[]>;
  /** 0-indexed rank by score descending, or null if the member isn't present. */
  zRevRank(key: string, member: string): Promise<number | null>;
  /**
   * Fixed-window rate-limit primitive: atomically increments `key` and, ONLY
   * on the increment that creates the key (i.e. the count that comes back is
   * 1), arms a `ttlSeconds` expiry on it. Later increments within the window
   * do not touch the expiry, so the window is anchored to the first hit, not
   * pushed back by every subsequent one. Returns the post-increment count.
   */
  incrWithExpiry(key: string, ttlSeconds: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Upstash implementation
// ---------------------------------------------------------------------------

class UpstashKvStore implements KvStore {
  // Typed loosely (not `any`) since the concrete Redis client type comes from
  // an optional dependency we only import when this class is instantiated.
  private client: {
    get(key: string): Promise<unknown>;
    set(key: string, value: string, opts?: Record<string, unknown>): Promise<unknown>;
    del(key: string): Promise<unknown>;
    lpush(key: string, value: string): Promise<unknown>;
    ltrim(key: string, start: number, end: number): Promise<unknown>;
    lrange(key: string, start: number, end: number): Promise<unknown>;
    // NOTE argument order: increment BEFORE member (matches @upstash/redis).
    zincrby(key: string, increment: number, member: string): Promise<number>;
    zrange(
      key: string,
      min: number,
      max: number,
      opts?: Record<string, unknown>,
    ): Promise<unknown>;
    zrevrank(key: string, member: string): Promise<number | null>;
    incr(key: string): Promise<number>;
    expire(key: string, ttlSeconds: number): Promise<unknown>;
  };

  constructor(client: UpstashKvStore["client"]) {
    this.client = client;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null || raw === undefined) return null;
    // @upstash/redis auto-deserializes JSON responses, but depending on how
    // the value was originally written it may come back as a string that
    // still needs parsing. Handle both defensively.
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Not JSON-parseable — treat as an opaque string value.
        return raw as unknown as T;
      }
    }
    return raw as T;
  }

  async setJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void> {
    const payload = JSON.stringify(value);
    if (opts?.ttlSeconds) {
      await this.client.set(key, payload, { ex: opts.ttlSeconds });
    } else {
      await this.client.set(key, payload);
    }
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, { nx: true, ex: ttlSeconds });
    return result === "OK" || result === true;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async pushRecent(key: string, value: string, maxLen: number): Promise<void> {
    await this.client.lpush(key, value);
    await this.client.ltrim(key, 0, maxLen - 1);
  }

  async getRecent(key: string, maxLen: number): Promise<string[]> {
    const raw = await this.client.lrange(key, 0, maxLen - 1);
    if (!Array.isArray(raw)) return [];
    return raw.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  }

  async zIncrBy(key: string, member: string, delta: number): Promise<number> {
    // @upstash/redis zincrby takes (key, increment, member) — increment first.
    return this.client.zincrby(key, delta, member);
  }

  async zRevRangeWithScores(
    key: string,
    count: number,
  ): Promise<{ member: string; score: number }[]> {
    if (count <= 0) return [];
    // withScores + rev => a FLAT array [member, score, member, score, ...].
    const raw = await this.client.zrange(key, 0, count - 1, {
      withScores: true,
      rev: true,
    });
    if (!Array.isArray(raw)) return [];
    const out: { member: string; score: number }[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out.push({
        member: String(raw[i]),
        // score may arrive as string or number depending on transport.
        score: Number(raw[i + 1]),
      });
    }
    return out;
  }

  async zRevRank(key: string, member: string): Promise<number | null> {
    const rank = await this.client.zrevrank(key, member);
    return rank ?? null;
  }

  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      // First hit in this window — arm the expiry. Not wrapped in the same
      // atomic op as the INCR (Upstash's REST client has no MULTI here), so
      // there's a narrow window where a crash between the two calls leaves a
      // key that never expires. Rate-limit state, not game state: the worst
      // outcome is one session staying capped a bit longer than intended,
      // which is the safe direction to fail in.
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

interface MemEntry {
  value: string;
  expiresAt: number | null; // epoch ms, null = never
}

const MEMORY_STORE_KEY = Symbol.for("map-of-the-day.kv.memoryStore");
const MEMORY_ZSET_STORE_KEY = Symbol.for("map-of-the-day.kv.memoryZsetStore");

// Sorted sets: outer key = zset key, inner Map = member -> score.
type MemZsetStore = Map<string, Map<string, number>>;

type GlobalWithStore = typeof globalThis & {
  [MEMORY_STORE_KEY]?: Map<string, MemEntry>;
  [MEMORY_ZSET_STORE_KEY]?: MemZsetStore;
};

function getGlobalMemoryStore(): Map<string, MemEntry> {
  const g = globalThis as GlobalWithStore;
  if (!g[MEMORY_STORE_KEY]) {
    g[MEMORY_STORE_KEY] = new Map<string, MemEntry>();
  }
  return g[MEMORY_STORE_KEY]!;
}

function getGlobalMemoryZsetStore(): MemZsetStore {
  const g = globalThis as GlobalWithStore;
  if (!g[MEMORY_ZSET_STORE_KEY]) {
    g[MEMORY_ZSET_STORE_KEY] = new Map<string, Map<string, number>>();
  }
  return g[MEMORY_ZSET_STORE_KEY]!;
}

let warnedAboutFallbackOnVercel = false;

function warnIfFallbackOnVercel(): void {
  if (config.isVercel && !warnedAboutFallbackOnVercel) {
    warnedAboutFallbackOnVercel = true;
    // eslint-disable-next-line no-console
    console.error(
      "\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
        "! WARNING: Using in-memory KV fallback while running on Vercel.    !\n" +
        "! Serverless invocations do NOT share memory — session/game state  !\n" +
        "! WILL be lost between requests. Set UPSTASH_REDIS_REST_URL/TOKEN  !\n" +
        "! or KV_REST_API_URL/TOKEN to fix this.                            !\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n",
    );
  }
}

class MemoryKvStore implements KvStore {
  private store: Map<string, MemEntry>;
  private zstore: MemZsetStore;

  constructor() {
    this.store = getGlobalMemoryStore();
    this.zstore = getGlobalMemoryZsetStore();
  }

  private zset(key: string): Map<string, number> {
    let set = this.zstore.get(key);
    if (!set) {
      set = new Map<string, number>();
      this.zstore.set(key, set);
    }
    return set;
  }

  /** Members sorted by score descending, ties broken by member ascending. */
  private zsortedDesc(key: string): { member: string; score: number }[] {
    const set = this.zstore.get(key);
    if (!set) return [];
    return [...set.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : a.member < b.member
            ? -1
            : a.member > b.member
              ? 1
              : 0,
      );
  }

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  private write(key: string, value: string, ttlSeconds?: number): void {
    warnIfFallbackOnVercel();
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.read(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async setJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void> {
    this.write(key, JSON.stringify(value), opts?.ttlSeconds);
  }

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.read(key);
    if (existing !== null) return false;
    this.write(key, value, ttlSeconds);
    return true;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async pushRecent(key: string, value: string, maxLen: number): Promise<void> {
    const current = this.read(key);
    let list: string[] = [];
    if (current !== null) {
      try {
        const parsed = JSON.parse(current);
        if (Array.isArray(parsed)) list = parsed as string[];
      } catch {
        list = [];
      }
    }
    list.unshift(value);
    if (list.length > maxLen) list = list.slice(0, maxLen);
    this.write(key, JSON.stringify(list));
  }

  async getRecent(key: string, maxLen: number): Promise<string[]> {
    const current = this.read(key);
    if (current === null) return [];
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) return (parsed as string[]).slice(0, maxLen);
      return [];
    } catch {
      return [];
    }
  }

  async zIncrBy(key: string, member: string, delta: number): Promise<number> {
    const set = this.zset(key);
    const next = (set.get(member) ?? 0) + delta;
    set.set(member, next);
    return next;
  }

  async zRevRangeWithScores(
    key: string,
    count: number,
  ): Promise<{ member: string; score: number }[]> {
    if (count <= 0) return [];
    return this.zsortedDesc(key).slice(0, count);
  }

  async zRevRank(key: string, member: string): Promise<number | null> {
    const set = this.zstore.get(key);
    if (!set || !set.has(member)) return null;
    const idx = this.zsortedDesc(key).findIndex((e) => e.member === member);
    return idx < 0 ? null : idx;
  }

  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    // Mirrors UpstashKvStore.incrWithExpiry: expiry is armed only on the
    // increment that creates the entry, so later hits in the window don't
    // push the reset time back. `read`/`write` already handle lazy expiry
    // (see MemEntry) so an expired counter is indistinguishable from a
    // missing one here.
    const existing = this.read(key);
    if (existing === null) {
      this.write(key, "1", ttlSeconds);
      return 1;
    }
    const next = (Number.parseInt(existing, 10) || 0) + 1;
    // Update the value in place WITHOUT touching expiresAt — a fresh
    // `write()` call would reset the TTL clock on every increment.
    const entry = this.store.get(key)!;
    entry.value = String(next);
    return next;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedStore: KvStore | null = null;

export function getKv(): KvStore {
  if (cachedStore) return cachedStore;

  const credentials = resolveRedisRestCredentials();
  if (credentials) {
    cachedStore = new UpstashKvStore(new Redis(credentials));
  } else {
    cachedStore = new MemoryKvStore();
  }

  return cachedStore;
}
