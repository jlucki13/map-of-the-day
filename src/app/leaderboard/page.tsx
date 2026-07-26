"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlobeBackground, Nav } from "@/components";
import { primaryAction } from "@/components/styles";
import type { PublicLeaderboardEntry, PublicLeaderboardView } from "@/types";

/**
 * One standing, as a ruled row. The board is a list of people, not a
 * spreadsheet, so it is set as ruled lines with a big tabular score at the end
 * rather than a four-column table with a header band.
 */
function StandingRow({
  entry,
  isYou,
}: {
  entry: PublicLeaderboardEntry;
  isYou: boolean;
}) {
  return (
    <li
      className={
        "flex items-baseline gap-4 px-4 py-3.5 sm:px-5 " +
        (isYou ? "bg-good-fill" : "")
      }
    >
      <span className="w-7 shrink-0 font-mono text-sm tabular-nums text-ink-subtle">
        {entry.rank}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">
          {entry.nickname || "You (unnamed)"}
          {isYou && (
            <span className="ml-2 rounded-chip border border-good-line px-1.5 py-0.5 align-middle text-[10.5px] font-semibold uppercase tracking-[0.1em] text-good">
              You
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-ink-subtle">
          {entry.gamesWon} {entry.gamesWon === 1 ? "win" : "wins"}
        </span>
      </span>

      <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-ink">
        {entry.totalScore}
      </span>
    </li>
  );
}

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
  const youInList = you !== null && entries.some((e) => e.rank === you.rank);

  return (
    <>
      {/* The same globe stands behind both pages. Without it the leaderboard
          read as a different site. */}
      <GlobeBackground />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[76rem] flex-col px-4 pb-12 pt-5 sm:px-8">
        <Nav active="leaderboard" />

        <div className="mt-4 border-t border-hairline pt-7 sm:pt-8">
          {/* Same rule as the game page: running text keeps to the left half,
              where the paper is clean, and the panel takes the right, where the
              globe stands. */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
            <div className="lg:pt-1">
              <h1 className="font-display text-[30px] leading-[1.15] tracking-tight text-ink sm:text-[36px]">
                All-time leaderboard
              </h1>
              <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-muted">
                Points from every map you have solved. A first-guess win is
                worth ten, a fifth-guess win is worth one, so the board rewards
                reading the map rather than grinding it.
              </p>
              {you && !you.nickname && (
                <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-ink-subtle">
                  You have {you.totalScore}{" "}
                  {you.totalScore === 1 ? "point" : "points"} but no nickname
                  yet. Win a round and set one to appear here.
                </p>
              )}
            </div>

            <div>
              {loading && (
                <div className="overflow-hidden rounded-panel border border-hairline">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="skeleton h-[66px] w-full" />
                  ))}
                  <span className="sr-only" role="status">
                    Loading the leaderboard
                  </span>
                </div>
              )}

              {!loading && error && (
                <div className="rounded-panel border border-bad-line bg-bad-fill p-6 text-sm font-medium text-bad">
                  {error}
                </div>
              )}

              {!loading && !error && entries.length === 0 && !you && (
                <div className="rounded-panel border border-hairline bg-surface px-6 py-12 text-center shadow-plate">
                  <h2 className="font-display text-xl text-ink">
                    Nobody has claimed a place yet
                  </h2>
                  <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-ink-subtle">
                    Solve today&apos;s map, pick a nickname, and the first row
                    on this board is yours.
                  </p>
                  <Link
                    href="/"
                    className={`${primaryAction} mt-6 inline-block`}
                  >
                    Play today&apos;s map
                  </Link>
                </div>
              )}

              {!loading && !error && (entries.length > 0 || you) && (
                <ol className="divide-y divide-hairline/70 overflow-hidden rounded-panel border border-hairline bg-surface shadow-plate">
                  {entries.map((e) => (
                    <StandingRow
                      key={e.rank}
                      entry={e}
                      isYou={you !== null && e.rank === you.rank}
                    />
                  ))}
                  {you && !youInList && (
                    <StandingRow entry={you} isYou />
                  )}
                </ol>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-auto pt-14 text-xs text-ink-subtle">
          Scores are kept against this browser&apos;s session.
        </footer>
      </main>
    </>
  );
}
