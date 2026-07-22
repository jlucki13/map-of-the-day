"use client";

import { useState } from "react";

export interface NicknamePromptProps {
  points: number;
  /** Called with the saved nickname once the POST succeeds. */
  onSaved: (nickname: string) => void;
}

/**
 * Inline nickname-capture form shown inside ResultBanner after a win when the
 * player has no leaderboard name yet. Their points are already banked
 * server-side under their session id; this just attaches a display name.
 */
export default function NicknamePrompt({
  points,
  onSaved,
}: NicknamePromptProps) {
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leaderboard/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      if (!res.ok) {
        setError("Couldn't save that name — try another.");
        return;
      }
      const data = (await res.json()) as { nickname: string };
      onSaved(data.nickname);
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-sm font-semibold text-emerald-200">
        You scored {points} {points === 1 ? "point" : "points"}! Save it to the
        leaderboard:
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={24}
          placeholder="Your nickname"
          aria-label="Nickname"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || nickname.trim().length === 0}
          className="rounded-lg border border-emerald-700 bg-emerald-900/60 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  );
}
