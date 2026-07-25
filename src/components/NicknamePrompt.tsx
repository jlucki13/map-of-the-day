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
    <form onSubmit={submit} className="space-y-2">
      <label
        htmlFor="nickname-input"
        className="block text-sm font-medium text-ink-muted"
      >
        Claim your {points} {points === 1 ? "point" : "points"} on the
        leaderboard
      </label>
      <div className="flex gap-2">
        <input
          id="nickname-input"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={24}
          placeholder="Your nickname"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "nickname-error" : undefined}
          className="min-w-0 flex-1 rounded-control border border-hairline bg-surface-raised px-3 py-2 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle/80 hover:border-ocean-700 focus:border-ocean-600"
        />
        <button
          type="submit"
          disabled={submitting || nickname.trim().length === 0}
          className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:bg-ocean-700/25 disabled:text-ink-subtle"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p id="nickname-error" role="alert" className="text-xs text-clay-300">
          {error}
        </p>
      )}
    </form>
  );
}
