import { NextResponse } from "next/server";
import { z } from "zod";
import { setNickname } from "@/lib/leaderboard";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NICKNAME_MIN = 1;
const NICKNAME_MAX = 24;

const bodySchema = z.object({
  nickname: z.string().min(1).max(200),
});

// Strip C0/C1 control characters (incl. newlines, tabs, DEL).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * POST /api/leaderboard/nickname — body { nickname }. Trims, strips control
 * characters, enforces 1-24 chars. No profanity/uniqueness filter (out of
 * scope). Identity is the existing sid cookie.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const cleaned = body.nickname.replace(CONTROL_CHARS, "").trim();
  if (cleaned.length < NICKNAME_MIN || cleaned.length > NICKNAME_MAX) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const record = await setNickname(sessionId, cleaned);

  return NextResponse.json({ nickname: record.nickname });
}
