"use client";

import { useEffect, useRef, useState } from "react";

export interface CountdownTimerProps {
  /** ISO timestamp of the next puzzle rotation. */
  nextRotationAt: string;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

function remainingFields(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    { value: pad(Math.floor(totalSeconds / 3600)), unit: "hr" },
    { value: pad(Math.floor((totalSeconds % 3600) / 60)), unit: "min" },
    { value: pad(totalSeconds % 60), unit: "sec" },
  ];
}

/**
 * The clock at the foot of the rail, read as an instrument: three labelled
 * fields rather than one run-together string, so the eye can land on "hours"
 * without parsing colons.
 */
/**
 * Once expired, keep nudging the parent to refetch every 5s rather than
 * firing once and going silent. A single shot isn't enough: the server can
 * legitimately still be serving the outgoing puzzle for a moment after its
 * own clock says it's expired (the lazy-regeneration path deliberately
 * returns the stale puzzle immediately and finishes the real regeneration in
 * the background — see ensureFreshPuzzle.ts). A caller whose first refetch
 * lands in that gap would otherwise get a `nextRotationAt` identical to what
 * it already had, this component would never re-subscribe, and the player
 * would be stuck on a dead "New map ready" screen until they manually
 * reload. This case is not rare: it's exactly what the first visitor after
 * each night's fixed reveal time hits.
 */
const RETRY_INTERVAL_MS = 5000;

export default function CountdownTimer({
  nextRotationAt,
  onExpire,
}: CountdownTimerProps) {
  // Render a stable placeholder until mounted to avoid a hydration mismatch
  // (the server and client would otherwise compute different remaining times).
  const [mounted, setMounted] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const nextRetryAtRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    nextRetryAtRef.current = null;

    const target = new Date(nextRotationAt).getTime();

    const tick = () => {
      const remaining = target - Date.now();
      setRemainingMs(remaining);
      if (remaining > 0) return;

      const now = Date.now();
      if (nextRetryAtRef.current === null || now >= nextRetryAtRef.current) {
        nextRetryAtRef.current = now + RETRY_INTERVAL_MS;
        onExpire?.();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // onExpire deliberately excluded: parents pass inline closures, and
    // re-subscribing every render would reset the interval each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRotationAt]);

  const expired = mounted && remainingMs !== null && remainingMs <= 0;
  const fields =
    mounted && remainingMs !== null
      ? remainingFields(remainingMs)
      : [
          { value: "--", unit: "hr" },
          { value: "--", unit: "min" },
          { value: "--", unit: "sec" },
        ];

  return (
    <div role="timer" aria-live="off" aria-label="Time until the next map">
      {expired ? (
        <p className="text-sm font-semibold text-good">New map ready</p>
      ) : (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Next map in
          </p>
          <div className="mt-1.5 flex items-baseline gap-3">
            {fields.map(({ value, unit }) => (
              <span key={unit} className="flex items-baseline gap-1">
                <span className="font-mono text-lg font-medium tabular-nums text-ink">
                  {value}
                </span>
                <span className="text-[11px] text-ink-subtle">{unit}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
