export interface HintCalloutProps {
  hints: { order: 1 | 2; text: string }[];
}

export default function HintCallout({ hints }: HintCalloutProps) {
  if (hints.length === 0) return null;

  const sorted = [...hints].sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-4">
      <ul className="space-y-2">
        {sorted.map((hint) => (
          <li key={hint.order} className="flex gap-2 text-sm text-amber-100">
            <span className="shrink-0 font-semibold text-amber-400">
              Hint {hint.order}:
            </span>
            <span>{hint.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
