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

  const cell = "px-3 py-3 sm:px-4";

  return (
    <>
      {/* The globe belongs to the shell, not to one route: without it here the
          leaderboard read as a different product. */}
      <GlobeBackground />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-4xl flex-col px-5 pb-8 pt-6 sm:px-8">
        <Nav active="leaderboard" />

        {/* One heavy rule closes the headline and opens the table; the earlier
            version stacked its own rule 25px above the table's, which read as
            a mistake rather than a masthead. */}
        <header className="mt-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b-2 border-ink/85 pb-4">
          <h1 className="font-display text-[32px] leading-[1.08] tracking-tight text-ink sm:text-[44px]">
            Standings
          </h1>
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
            All-time points &middot; fewer guesses climb faster
          </p>
        </header>

        <div className="flex-1">
          {loading && (
            <div
              role="status"
              className="flex h-48 items-center justify-center text-sm text-ink-subtle"
            >
              Loading standings&hellip;
            </div>
          )}

          {!loading && error && (
            <div role="alert" className="mt-6 border-b-2 border-negative pb-4">
              <p className="font-display text-xl text-negative">
                The board didn&apos;t load
              </p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
                {error}
              </p>
            </div>
          )}

          {!loading && !error && (
            <>
              {entries.length === 0 && !you && (
                <div className="border-b-2 border-ink/85 pb-14 pt-16 text-center">
                  <p className="font-display text-2xl text-ink">
                    Nobody has scored yet
                  </p>
                  <p className="mx-auto mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-muted">
                    Win a round, claim a nickname, and this column is yours to
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
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-ink/85 text-[11px] uppercase tracking-[0.14em] text-ink-muted">
                        <th className={`${cell} py-2 font-semibold`}>#</th>
                        <th className={`${cell} py-2 font-semibold`}>Player</th>
                        <th className={`${cell} py-2 text-right font-semibold`}>
                          Score
                        </th>
                        <th className={`${cell} py-2 text-right font-semibold`}>
                          Wins
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => {
                        const isYou = you !== null && e.rank === you.rank;
                        return (
                          <tr
                            key={e.rank}
                            className={
                              "border-b border-hairline " +
                              (isYou ? "bg-positive-wash" : "")
                            }
                          >
                            <td
                              className={`${cell} font-mono tabular-nums text-ink-subtle`}
                            >
                              {e.rank}
                            </td>
                            <td className={`${cell} font-medium text-ink`}>
                              {e.nickname}
                              {isYou && (
                                <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-positive">
                                  you
                                </span>
                              )}
                            </td>
                            <td
                              className={`${cell} text-right font-mono text-base font-semibold tabular-nums text-ink`}
                            >
                              {e.totalScore}
                            </td>
                            <td
                              className={`${cell} text-right font-mono tabular-nums text-ink-subtle`}
                            >
                              {e.gamesWon}
                            </td>
                          </tr>
                        );
                      })}

                      {you && !youInList && (
                        <tr className="border-b border-hairline bg-positive-wash">
                          <td
                            className={`${cell} font-mono tabular-nums text-ink-subtle`}
                          >
                            {you.rank}
                          </td>
                          <td className={`${cell} font-medium text-ink`}>
                            {you.nickname || "You (unnamed)"}
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-positive">
                              you
                            </span>
                          </td>
                          <td
                            className={`${cell} text-right font-mono text-base font-semibold tabular-nums text-ink`}
                          >
                            {you.totalScore}
                          </td>
                          <td
                            className={`${cell} text-right font-mono tabular-nums text-ink-subtle`}
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
                <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-ink-muted">
                  You have {you.totalScore}{" "}
                  {you.totalScore === 1 ? "point" : "points"} but no nickname
                  yet. Win a round and set one to appear on the public board.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="mt-12 border-t border-hairline pt-4 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          Points are banked per browser session until you claim a name
        </footer>
      </main>
    </>
  );
}
