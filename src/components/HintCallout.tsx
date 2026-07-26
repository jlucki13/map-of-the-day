export interface HintCalloutProps {
  hints: { order: 1 | 2; text: string }[];
}

/**
 * Marginalia in the rail: sand, because a hint belongs to the reader's layer
 * rather than to the world or to win/lose feedback.
 *
 * Each hint is its own slip with a left rule, so a second hint reads as a
 * second note rather than a second bullet. The fill is opaque: the previous
 * 10%-alpha wash let the rotating globe drift underneath the one paragraph the
 * player most needs to read.
 */
export default function HintCallout({ hints }: HintCalloutProps) {
  if (hints.length === 0) return null;

  const sorted = [...hints].sort((a, b) => a.order - b.order);

  return (
    <ul className="space-y-2.5">
      {sorted.map((hint) => (
        <li
          key={hint.order}
          className="settle-in rounded-r-control border-l-2 border-note bg-note-fill px-3.5 py-3"
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-note">
            Hint {hint.order}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {hint.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
