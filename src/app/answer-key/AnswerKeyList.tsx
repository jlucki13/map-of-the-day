"use client";

import { useMemo, useState } from "react";

export interface RedactionBox {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnswerKeyEntry {
  id: string;
  scope: "us" | "world";
  /** Which cartographic form the generator drew this with. */
  form: string;
  title: string;
  aliases: string[];
  hints: string[];
  description: string;
  imageUrl: string;
  width: number;
  height: number;
  regions: RedactionBox[];
}

type ScopeFilter = "all" | "us" | "world";

/** Reads better than the raw spec key, which is what lands in the JSON. */
const FORM_LABEL: Record<string, string> = {
  choropleth: "Choropleth",
  diverging: "Diverging",
  classed: "Classed",
  symbol: "Graduated symbol",
  "point-symbol": "Symbol at coordinates",
  dot: "Dot density",
  categorical: "Class map",
  tilegrid: "Tile grid",
  points: "Point map",
  flow: "Flow",
  bivariate: "Bivariate",
  cartogram: "Cartogram",
  dorling: "Dorling",
  spike: "Spike",
  composition: "Composition",
  surface: "Surface",
};

const formLabel = (f: string) => FORM_LABEL[f] ?? f;

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
  const [form, setForm] = useState<string>("all");
  /**
   * Swap every card to the covered version. Rather than shipping a second set
   * of images, this draws the stored redaction rectangles over the original at
   * the coordinates the server will actually use — so what you see here is
   * literally the geometry the player gets, and a bad region shows up as a
   * misplaced box rather than staying invisible until someone plays the round.
   */
  const [covered, setCovered] = useState(false);

  // Form counts drive the filter row, so it only ever offers forms that exist.
  const forms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.form, (counts.get(e.form) ?? 0) + 1);
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (scope !== "all" && e.scope !== scope) return false;
      if (form !== "all" && e.form !== form) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.form.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [entries, query, scope, form]);

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

      {/* Form filter. Doubles as a census of the set: the counts are the
          quickest way to see that one form has quietly taken over. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setForm("all")}
          aria-pressed={form === "all"}
          className={
            "rounded-chip border px-2 py-1 text-xs font-semibold transition " +
            (form === "all"
              ? "border-accent bg-accent text-accent-ink"
              : "border-hairline bg-surface text-ink-muted hover:border-ocean-600 hover:text-ink")
          }
        >
          All forms
        </button>
        {forms.map(([f, n]) => (
          <button
            key={f}
            type="button"
            onClick={() => setForm(f)}
            aria-pressed={form === f}
            className={
              "rounded-chip border px-2 py-1 text-xs transition " +
              (form === f
                ? "border-accent bg-accent font-semibold text-accent-ink"
                : "border-hairline bg-surface text-ink-muted hover:border-ocean-600 hover:text-ink")
            }
          >
            {formLabel(f)}{" "}
            <span className="font-mono tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-subtle">
          Showing {visible.length} of {entries.length}
          {form === "all" ? "" : ` · ${formLabel(form)}`}.
        </p>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={covered}
            onChange={(e) => setCovered(e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          Show what players see
        </label>
      </div>

      <ol className="mt-6 grid gap-6 lg:grid-cols-2">
        {visible.map((e) => (
          <li
            key={e.id}
            className="overflow-hidden rounded-panel border border-hairline bg-surface shadow-plate"
          >
            {/* The unredacted render, which is the fastest way to recognise
                which map a row is talking about — with the covered version
                available over the top of it. */}
            <div className="relative border-b border-hairline bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.imageUrl}
                alt=""
                loading="lazy"
                className="block w-full"
              />
              {covered &&
                e.width > 0 &&
                e.height > 0 &&
                e.regions.map((r, i) => (
                  <div
                    key={i}
                    // Positioned in percentages off the render's own pixel
                    // dimensions, so the boxes stay correct at any card width.
                    style={{
                      position: "absolute",
                      left: `${(r.x / e.width) * 100}%`,
                      top: `${(r.y / e.height) * 100}%`,
                      width: `${(r.width / e.width) * 100}%`,
                      height: `${(r.height / e.height) * 100}%`,
                      // The parchment the real redactor paints with.
                      backgroundColor: "#c9b58c",
                    }}
                  />
                ))}
            </div>

            <div className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl leading-tight tracking-tight text-ink">
                  {e.title}
                </h2>
                <span className="shrink-0 rounded-chip border border-hairline px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
                  {e.scope}
                </span>
              </div>

              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-subtle">
                <span>{e.id}</span>
                <span aria-hidden="true">·</span>
                <span className="rounded-chip bg-sand-100 px-1.5 py-0.5 not-italic">
                  {formLabel(e.form)}
                </span>
                {/* Two regions means the legend names its own classes and gets
                    covered too — worth seeing at a glance, since that is the
                    difference between a fair class map and one that hands the
                    answer over. */}
                {e.regions.length > 1 && (
                  <span className="rounded-chip bg-note-fill px-1.5 py-0.5 text-note">
                    legend covered
                  </span>
                )}
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
