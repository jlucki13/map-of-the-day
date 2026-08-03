"use client";

import { useMemo, useState } from "react";

export interface AnswerKeyEntry {
  id: string;
  scope: "us" | "world";
  title: string;
  aliases: string[];
  hints: string[];
  description: string;
  imageUrl: string;
}

type ScopeFilter = "all" | "us" | "world";

/**
 * The key itself: every map, what it is, and everything a player can type to
 * be marked right. Filtering is client-side because the whole set is 45 rows
 * and already in hand — a round trip per keystroke would be slower and buy
 * nothing.
 */
export default function AnswerKeyList({
  entries,
}: {
  entries: AnswerKeyEntry[];
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (scope !== "all" && e.scope !== scope) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [entries, query, scope]);

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, id, or accepted answer"
          aria-label="Filter maps"
          className="min-w-0 flex-1 rounded-control border border-sand-300 bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-ocean-600 focus:ring-2 focus:ring-focus/40"
        />

        <div className="flex gap-1.5">
          {(["all", "us", "world"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={
                "rounded-control border px-3 py-2 text-sm font-semibold transition " +
                (scope === s
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-sand-300 bg-surface text-ink-muted hover:border-ocean-600 hover:text-ink")
              }
            >
              {s === "all" ? "All" : s === "us" ? "US" : "World"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-subtle">
        Showing {visible.length} of {entries.length}.
      </p>

      <ol className="mt-6 grid gap-6 lg:grid-cols-2">
        {visible.map((e) => (
          <li
            key={e.id}
            className="overflow-hidden rounded-panel border border-hairline bg-surface shadow-plate"
          >
            {/* The unredacted render, which is the fastest way to recognise
                which map a row is talking about. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={e.imageUrl}
              alt=""
              loading="lazy"
              className="block w-full border-b border-hairline bg-white"
            />

            <div className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl leading-tight tracking-tight text-ink">
                  {e.title}
                </h2>
                <span className="shrink-0 rounded-chip border border-hairline px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
                  {e.scope}
                </span>
              </div>

              <p className="mt-1 font-mono text-[11px] text-ink-subtle">
                {e.id}
              </p>

              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Also accepted
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {e.aliases.map((a) => (
                  <li
                    key={a}
                    className="rounded-chip border border-good-line bg-good-fill px-2 py-1 text-[12.5px] text-ink"
                  >
                    {a}
                  </li>
                ))}
              </ul>

              <details className="mt-4 border-t border-hairline pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Hints &amp; description
                </summary>
                <ol className="mt-3 space-y-2">
                  {e.hints.map((h, i) => (
                    <li
                      key={i}
                      className="rounded-control border-l-2 border-note bg-note-fill px-3 py-2 text-[13px] leading-relaxed text-ink"
                    >
                      <span className="font-semibold">Hint {i + 1}. </span>
                      {h}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                  {e.description}
                </p>
              </details>
            </div>
          </li>
        ))}
      </ol>

      {visible.length === 0 && (
        <p className="mt-10 text-center text-sm text-ink-subtle">
          Nothing matches that filter.
        </p>
      )}
    </>
  );
}
