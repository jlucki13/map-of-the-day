/**
 * httpOnly session-cookie helpers for Route Handlers.
 *
 * Guess correctness and per-visitor progress live SERVER-SIDE ONLY, keyed by
 * this cookie's random id — the client never sees or controls game state
 * beyond what publicViews.ts exposes.
 */

import { cookies } from "next/headers";
import { getKv } from "@/lib/kv";
import { newSessionState } from "@/lib/gameState";
import type { GuessSessionState } from "@/types";

export const SESSION_COOKIE = "motd_session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // ~1 year
const SESSION_STATE_TTL_SECONDS = 60 * 60 * 24 * 7; // ~7 days

/**
 * Reads the session cookie; if absent, generates a new id via
 * crypto.randomUUID() and sets it (httpOnly, sameSite lax, path "/",
 * ~1 year maxAge, secure in production).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return sessionId;
}

export function sessionKey(puzzleId: string, sessionId: string): string {
  return `session:${puzzleId}:${sessionId}`;
}

/**
 * Loads session state from kv. If none exists, returns a fresh in-memory
 * state via newSessionState (NOT yet saved — the caller is responsible for
 * persisting it, e.g. after the first mutation, or immediately if the route
 * needs it to exist right away).
 */
export async function loadSession(
  puzzleId: string,
  sessionId: string,
): Promise<{ state: GuessSessionState; isNew: boolean }> {
  const kv = getKv();
  const key = sessionKey(puzzleId, sessionId);
  const existing = await kv.getJson<GuessSessionState>(key);
  if (existing) {
    return { state: existing, isNew: false };
  }
  return { state: newSessionState(puzzleId, sessionId), isNew: true };
}

export async function saveSession(state: GuessSessionState): Promise<void> {
  const kv = getKv();
  const key = sessionKey(state.puzzleId, state.sessionId);
  await kv.setJson(key, state, { ttlSeconds: SESSION_STATE_TTL_SECONDS });
}
