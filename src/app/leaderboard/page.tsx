"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobeBackground, Nav } from "@/components";
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

  const rowCell = "px-4 py-3 sm:px-5";

  return (
    <>
      {/* The globe belongs to the shell, not to one route: without it here the
          leaderboard read as a different product. */}
      <GlobeBackground />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-10 pt-7 sm:px-6">
        <Nav active="leaderboard" />

        <header className="mt-7">
          <h1 className="font-display text-[30px] leading-[1.15] tracking-tight text-ink sm:text-[34px]">
            Leaderboard
          </h1>
          <p className="mt-2 max-w-[52ch] text-[15px] text-ink-subtle">
            All-time points across every map. Win in fewer guesses to climb.
          </p>
        </header>

        <div className="mb-14 mt-8">
          {loading && (
            <div
              role="status"
              className="flex h-48 items-center justify-center rounded-panel bg-surface text-sm text-ink-subtle shadow-plate ring-1 ring-sand-300/70"
            >
              Loading leaderboard&hellip;
            </div>
          )}

          {!loading && error && (
            <div
              role="alert"
              className="rounded-panel bg-negative-wash p-6 shadow-plate ring-1 ring-negative/25"
            >
              <p className="font-display text-lg text-negative">
                The board didn&apos;t load
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {error}
              </p>
            </div>
          )}

          {!loading && !error && (
            <>
              {entries.length === 0 && !you && (
                <div className="rounded-panel bg-surface px-6 py-12 text-center shadow-plate ring-1 ring-sand-300/70">
                  <p className="font-display text-xl text-ink">
                    Nobody has scored yet
                  </p>
                  <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-ink-muted">
                    Win a round, claim a nickname, and this board is yours to
                    open.
                  </p>
                  <Link
                    href="/"
                    className="mt-6 inline-block rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition duration-150 hover:bg-accent-hover active:translate-y-px"
                  >
                    Play today&apos;s map
                  </Link>
                </div>
              )}

              {(entries.length > 0 || you) && (
                <div className="overflow-x-auto rounded-panel bg-surface shadow-plate ring-1 ring-sand-300/70">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-hairline text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
                      <tr>
                        <th className={`${rowCell} py-2.5 font-semibold`}>#</th>
                        <th className={`${rowCell} py-2.5 font-semibold`}>
                          Player
                        </th>
                        <th
                          className={`${rowCell} py-2.5 text-right font-semibold`}
                        >
                          Score
                        </th>
                        <th
                          className={`${rowCell} py-2.5 text-right font-semibold`}
                        >
                          Wins
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline/70">
                      {entries.map((e) => {
                        const isYou = you !== null && e.rank === you.rank;
                        return (
                          <tr
                            key={e.rank}
                            className={isYou ? "bg-positive-wash" : undefined}
                          >
                            <td
                              className={`${rowCell} font-mono tabular-nums text-ink-subtle`}
                            >
                              {e.rank}
                            </td>
                            <td className={`${rowCell} font-medium text-ink`}>
                              {e.nickname}
                              {isYou && (
                                <span className="ml-2 rounded-chip bg-positive/12 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-positive">
                                  you
                                </span>
                              )}
                            </td>
                            <td
                              className={`${rowCell} text-right font-mono text-base font-semibold tabular-nums text-ink`}
                            >
                              {e.totalScore}
                            </td>
                            <td
                              className={`${rowCell} text-right font-mono tabular-nums text-ink-subtle`}
                            >
                              {e.gamesWon}
                            </td>
                          </tr>
                        );
                      })}

                      {you && !youInList && (
                        <tr className="bg-positive-wash">
                          <td
                            className={`${rowCell} font-mono tabular-nums text-ink-subtle`}
                          >
                            {you.rank}
                          </td>
                          <td className={`${rowCell} font-medium text-ink`}>
                            {you.nickname || "You (unnamed)"}
                            <span className="ml-2 rounded-chip bg-positive/12 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-positive">
                              you
                            </span>
                          </td>
                          <td
                            className={`${rowCell} text-right font-mono text-base font-semibold tabular-nums text-ink`}
                          >
                            {you.totalScore}
                          </td>
                          <td
                            className={`${rowCell} text-right font-mono tabular-nums text-ink-subtle`}
                          >
                            {you.gamesWon}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {you && !you.nickname && (
                <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
                  You have {you.totalScore}{" "}
                  {you.totalScore === 1 ? "point" : "points"} but no nickname
                  yet. Win a round and set one to appear on the public board.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="mt-auto border-t border-hairline pt-5 text-xs text-ink-subtle">
          <p>Points are banked per browser session until you claim a name.</p>
        </footer>
      </main>
    </>
  );
}
