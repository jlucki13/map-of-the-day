export interface HintCalloutProps {
  hints: { order: 1 | 2; text: string }[];
}

export default function HintCallout({ hints }: HintCalloutProps) {
  if (hints.length === 0) return null;

  const sorted = [...hints].sort((a, b) => a.order - b.order);

  return (
    // Marginalia on the plate: sand, because hints belong to the reader's layer
    // rather than to the world or to win/lose feedback.
    <div className="settle-in rounded-control border border-sand-400/25 bg-sand-500/10 p-4">
      <ul className="space-y-2">
        {sorted.map((hint) => (
          <li key={hint.order} className="flex gap-2 text-sm text-ink-muted">
            <span className="shrink-0 font-semibold text-note">
              Hint {hint.order}
            </span>
            <span>{hint.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
