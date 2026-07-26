export interface HintCalloutProps {
  hints: { order: 1 | 2; text: string }[];
  /** Renders without the surrounding wash, for use inside an existing panel. */
  bare?: boolean;
}

export default function HintCallout({ hints, bare = false }: HintCalloutProps) {
  if (hints.length === 0) return null;

  const sorted = [...hints].sort((a, b) => a.order - b.order);

  return (
    // Marginalia: sand, because a hint belongs to the reader's layer rather
    // than to the world or to win/lose feedback. The old version tinted the
    // *text* sand and the ground sand too, which on parchment left it at about
    // 1.2:1 — the label read, the hint itself did not.
    <div
      className={
        "settle-in " +
        (bare
          ? ""
          : "rounded-control bg-note-wash p-4 ring-1 ring-inset ring-sand-300/70")
      }
    >
      <ul className="space-y-3">
        {sorted.map((hint) => (
          <li key={hint.order}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-note">
              Hint {hint.order}
            </p>
            <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed text-ink-muted">
              {hint.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
