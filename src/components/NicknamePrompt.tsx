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
      if (res.status === 429) {
        setError("Slow down a little — take a short break and try again.");
        return;
      }
      if (!res.ok) {
        setError("Couldn't save that name. Try another.");
        return;
      }
      const data = (await res.json()) as { nickname: string };
      onSaved(data.nickname);
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label
        htmlFor="nickname-input"
        className="block text-sm font-semibold text-ink"
      >
        Claim your {points} {points === 1 ? "point" : "points"}
      </label>
      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
        Pick a name and your score joins the all-time board.
      </p>
      <input
        id="nickname-input"
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={24}
        placeholder="Your nickname"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? "nickname-error" : undefined}
        className="mt-2.5 block w-full rounded-control border border-sand-300 bg-surface-raised px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle/70 hover:border-ocean-600 focus:border-ocean-600"
      />
      <button
        type="submit"
        disabled={submitting || nickname.trim().length === 0}
        className="mt-2 w-full rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-plate transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:border disabled:border-sand-300 disabled:bg-surface-raised disabled:text-ink-subtle disabled:shadow-none"
      >
        {submitting ? "Saving…" : "Save"}
      </button>
      {error && (
        <p id="nickname-error" role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
