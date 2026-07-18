/**
 * Key-value store abstraction. Two implementations:
 *  - Upstash Redis (production / any env with UPSTASH_REDIS_REST_URL + TOKEN)
 *  - In-memory Map fallback (local dev without Upstash configured)
 *
 * All server-side session/game state goes through this interface so the rest
 * of the codebase never has to know which backend is active.
 */

import { Redis } from "@upstash/redis";
import { config } from "@/lib/config";

export interface KvStore {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
  /** SET NX with TTL; returns true if the lock was acquired. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Prepend value to a capped recent-list (LPUSH + LTRIM semantics). */
  pushRecent(key: string, value: string, maxLen: number): Promise<void>;
  getRecent(key: string, maxLen: number): Promise<string[]>;
}

function hasUpstashEnv(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
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
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

interface MemEntry {
  value: string;
  expiresAt: number | null; // epoch ms, null = never
}

const MEMORY_STORE_KEY = Symbol.for("map-of-the-day.kv.memoryStore");

type GlobalWithStore = typeof globalThis & {
  [MEMORY_STORE_KEY]?: Map<string, MemEntry>;
};

function getGlobalMemoryStore(): Map<string, MemEntry> {
  const g = globalThis as GlobalWithStore;
  if (!g[MEMORY_STORE_KEY]) {
    g[MEMORY_STORE_KEY] = new Map<string, MemEntry>();
  }
  return g[MEMORY_STORE_KEY]!;
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
        "! WILL be lost between requests. Set UPSTASH_REDIS_REST_URL and    !\n" +
        "! UPSTASH_REDIS_REST_TOKEN to fix this.                            !\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n",
    );
  }
}

class MemoryKvStore implements KvStore {
  private store: Map<string, MemEntry>;

  constructor() {
    this.store = getGlobalMemoryStore();
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
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedStore: KvStore | null = null;

export function getKv(): KvStore {
  if (cachedStore) return cachedStore;

  if (hasUpstashEnv()) {
    cachedStore = new UpstashKvStore(Redis.fromEnv());
  } else {
    cachedStore = new MemoryKvStore();
  }

  return cachedStore;
}
