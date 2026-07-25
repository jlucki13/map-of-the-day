"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components";
import type { PublicLeaderboardView } from "@/types";

export default function LeaderboardPage() {
  const [view, setView] = useState<PublicLeaderboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/leaderboard?limit=50", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`leaderboard fetch failed (${res.status})`);
        const data = (await res.json()) as PublicLeaderboardView;
        if (!cancelled) setView(data);
      } catch {
        if (!cancelled)
          setError("Couldn't load the leaderboard. Refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = view?.entries ?? [];
  const you = view?.you ?? null;
  // Whether the viewer's own row is already visible in the top list.
  const youInList =
    you !== null && entries.some((e) => e.rank === you.rank);

  return (
    <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 px-4 py-8">
      <Nav active="leaderboard" />

      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-ink-subtle">
          All-time points across every map. Win in fewer guesses to climb.
        </p>
      </div>

      {loading && (
        <div
          role="status"
          className="flex h-48 items-center justify-center rounded-panel border border-hairline bg-surface text-sm text-ink-subtle shadow-plate"
        >
          Loading leaderboard&hellip;
        </div>
      )}

      {!loading && error && (
        <div className="rounded-panel border border-clay-700/60 bg-clay-900 p-5 text-clay-300 shadow-plate">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {entries.length === 0 && !you && (
            <div className="rounded-panel border border-hairline bg-surface p-8 text-center text-sm text-ink-muted shadow-plate">
              No scores yet. Win a round, claim a nickname, and this board is
              yours.
            </div>
          )}

          {(entries.length > 0 || you) && (
            <div className="overflow-x-auto rounded-panel border border-hairline bg-surface shadow-plate">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-[0.12em] text-ink-subtle">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-4 py-3 text-right font-medium">Score</th>
                    <th className="px-4 py-3 text-right font-medium">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline/60">
                  {entries.map((e) => {
                    const isYou = you !== null && e.rank === you.rank;
                    return (
                      <tr
                        key={e.rank}
                        className={isYou ? "bg-land-700/20" : undefined}
                      >
                        <td className="px-4 py-3 font-mono tabular-nums text-ink-subtle">
                          {e.rank}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {e.nickname}
                          {isYou && (
                            <span className="ml-2 rounded-chip bg-land-600/30 px-1.5 py-0.5 text-xs font-normal text-land-300">
                              you
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-sand-200">
                          {e.totalScore}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-subtle">
                          {e.gamesWon}
                        </td>
                      </tr>
                    );
                  })}

                  {you && !youInList && (
                    <tr className="bg-land-700/20">
                      <td className="px-4 py-3 font-mono tabular-nums text-ink-subtle">
                        {you.rank}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {you.nickname || "You (unnamed)"}
                        <span className="ml-2 rounded-chip bg-land-600/30 px-1.5 py-0.5 text-xs font-normal text-land-300">
                          you
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-sand-200">
                        {you.totalScore}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-subtle">
                        {you.gamesWon}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {you && !you.nickname && (
            <p className="text-sm text-ink-muted">
              You have {you.totalScore}{" "}
              {you.totalScore === 1 ? "point" : "points"} but no nickname yet.
              Win a round and set one to appear on the public board.
            </p>
          )}
        </>
      )}
    </main>
  );
}
