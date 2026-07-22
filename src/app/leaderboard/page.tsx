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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <Nav active="leaderboard" />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Leaderboard
        </h1>
        <p className="text-sm text-slate-400">
          All-time points across every map. Win in fewer guesses to climb.
        </p>
      </div>

      {loading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400">
          Loading leaderboard&hellip;
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-5 text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {entries.length === 0 && !you && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
              No scores yet. Be the first to win a round and claim a nickname!
            </div>
          )}

          {(entries.length > 0 || you) && (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Player</th>
                    <th className="px-4 py-3 text-right font-medium">Score</th>
                    <th className="px-4 py-3 text-right font-medium">Wins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {entries.map((e) => {
                    const isYou = you !== null && e.rank === you.rank;
                    return (
                      <tr
                        key={e.rank}
                        className={
                          isYou ? "bg-emerald-950/30" : "bg-slate-950/40"
                        }
                      >
                        <td className="px-4 py-3 tabular-nums text-slate-400">
                          {e.rank}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          {e.nickname}
                          {isYou && (
                            <span className="ml-2 text-xs font-normal text-emerald-300">
                              you
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                          {e.totalScore}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                          {e.gamesWon}
                        </td>
                      </tr>
                    );
                  })}

                  {you && !youInList && (
                    <tr className="bg-emerald-950/30">
                      <td className="px-4 py-3 tabular-nums text-slate-400">
                        {you.rank}
                      </td>
                      <td className="px-4 py-3 font-medium text-white">
                        {you.nickname || "You (unnamed)"}
                        <span className="ml-2 text-xs font-normal text-emerald-300">
                          you
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                        {you.totalScore}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {you.gamesWon}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {you && !you.nickname && (
            <p className="text-sm text-slate-400">
              You have {you.totalScore}{" "}
              {you.totalScore === 1 ? "point" : "points"} but no nickname yet —
              win a round and set one to appear on the public board.
            </p>
          )}
        </>
      )}
    </main>
  );
}
