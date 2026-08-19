"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { inlineLink } from "./styles";
import type { PublicLeaderboardEntry, PublicLeaderboardView } from "@/types";

/** Enough to stand beside the round's own rail without scrolling. */
const TOP_N = 5;

export interface LeaderboardRailProps {
  /**
   * Change this value to force a refetch — the panel otherwise loads once and
   * sits still. The game page bumps it when a round finishes (a score may
   * have just posted) or a nickname gets claimed (the viewer's row may only
   * now be visible).
   */
  refreshSignal?: number | string;
  className?: string;
}

/**
 * One standing, set the same way the full leaderboard page sets it — rank,
 * name, win count, score — just tighter, since this copy has to share a desk
 * with the map and the round's own instrument panel.
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
        "flex items-baseline gap-3 py-2.5 " + (isYou ? "bg-good-fill" : "")
      }
    >
      <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-subtle">
        {entry.rank}
      </span>

      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
        {entry.nickname || "You"}
        {isYou && (
          <span className="ml-1.5 rounded-chip border border-good-line px-1 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-[0.1em] text-good">
            You
          </span>
        )}
      </span>

      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">
        {entry.totalScore}
      </span>
    </li>
  );
}

/**
 * The all-time leaderboard, shrunk to a summary panel that stands beside (or,
 * where there isn't room, below) the round. Same opaque-panel treatment as
 * the round's own rail: the globe runs strong behind this layout, so nothing
 * here is ever set directly over it.
 */
export default function LeaderboardRail({
  refreshSignal,
  className = "",
}: LeaderboardRailProps) {
  const [view, setView] = useState<PublicLeaderboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/leaderboard?limit=${TOP_N}`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw new Error(`leaderboard fetch failed (${res.status})`);
        const data = (await res.json()) as PublicLeaderboardView;
        if (!cancelled) setView(data);
      } catch {
        if (!cancelled) setError("Couldn't load standings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const entries = view?.entries ?? [];
  const you = view?.you ?? null;
  // Trust the server's flag rather than matching you.rank against a row's
  // rank: ranks tie, and a viewer with points but no nickname is deliberately
  // absent from `entries` while still holding a rank that some *other* named
  // player also occupies — rank-matching badges that stranger as "You".
  const youInList = entries.some((e) => e.isViewer);

  return (
    <div
      className={
        "rounded-panel border border-hairline bg-surface p-5 shadow-plate " +
        className
      }
    >
      <p className="rail-marker">
        <span>Leaderboard</span>
      </p>

      <div className="mt-3">
        {loading && (
          <ul aria-hidden="true" className="space-y-2">
            {Array.from({ length: TOP_N }).map((_, i) => (
              <li key={i} className="skeleton h-8 w-full rounded-chip" />
            ))}
            <span className="sr-only" role="status">
              Loading the leaderboard
            </span>
          </ul>
        )}

        {!loading && error && (
          <p className="text-sm leading-relaxed text-ink-subtle">{error}</p>
        )}

        {!loading && !error && entries.length === 0 && !you && (
          <p className="text-sm leading-relaxed text-ink-subtle">
            Nobody has claimed a place yet. Win a round to take the first spot.
          </p>
        )}

        {!loading && !error && (entries.length > 0 || you) && (
          <ol className="divide-y divide-hairline/70">
            {entries.map((e) => (
              <StandingRow key={e.rank} entry={e} isYou={e.isViewer === true} />
            ))}
            {you && !youInList && <StandingRow entry={you} isYou />}
          </ol>
        )}
      </div>

      <Link
        href="/leaderboard"
        className={`${inlineLink} mt-4 inline-block text-xs`}
      >
        View full leaderboard
      </Link>
    </div>
  );
}
