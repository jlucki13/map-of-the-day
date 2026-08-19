/**
 * Access control for /answer-key, the private page that lists every puzzle's
 * solution.
 *
 * Design notes, because this is the one page whose whole job is to leak what
 * the rest of the app works to hide:
 *
 * - It FAILS CLOSED. With no ANSWER_KEY_PASSWORD configured the page is
 *   unreachable rather than open — the opposite of how the app treats a
 *   missing ANTHROPIC_API_KEY (which degrades to mock mode). A misconfigured
 *   deploy must not publish the answers.
 * - The cookie never holds the password. It holds an HMAC of a fixed label
 *   keyed by the password, so a stolen cookie doesn't reveal the secret, and
 *   a cookie can't be forged without it.
 * - Comparisons are timing-safe.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ANSWER_KEY_COOKIE = "motd_answer_key";

/** ~30 days. Long enough not to be a nuisance, short enough to expire. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function configuredPassword(): string | null {
  const raw = process.env.ANSWER_KEY_PASSWORD;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the page is configured at all. When false, it 404s. */
export function isAnswerKeyEnabled(): boolean {
  return configuredPassword() !== null;
}

/**
 * The cookie value proving a successful login: HMAC(password, label). Derived
 * rather than random so it needs no server-side session store — this page has
 * exactly one user and nothing worth persisting.
 */
function expectedToken(password: string): string {
  return createHmac("sha256", password)
    .update("motd:answer-key:v1")
    .digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function passwordMatches(candidate: string): boolean {
  const password = configuredPassword();
  if (!password) return false;
  return safeEquals(candidate, password);
}

export async function isUnlocked(): Promise<boolean> {
  const password = configuredPassword();
  if (!password) return false;
  const cookie = (await cookies()).get(ANSWER_KEY_COOKIE)?.value;
  if (!cookie) return false;
  return safeEquals(cookie, expectedToken(password));
}

export async function grantAccess(): Promise<void> {
  const password = configuredPassword();
  if (!password) return;
  (await cookies()).set(ANSWER_KEY_COOKIE, expectedToken(password), {
    httpOnly: true,
    sameSite: "lax",
    path: "/answer-key",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function revokeAccess(): Promise<void> {
  (await cookies()).delete({ name: ANSWER_KEY_COOKIE, path: "/answer-key" });
}
