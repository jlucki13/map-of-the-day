"use client";

import { useEffect, useRef, useState } from "react";

export interface CountdownTimerProps {
  /** ISO timestamp of the next puzzle rotation. */
  nextRotationAt: string;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function CountdownTimer({
  nextRotationAt,
  onExpire,
}: CountdownTimerProps) {
  // Render a stable placeholder until mounted to avoid a hydration mismatch
  // (the server and client would otherwise compute different remaining times).
  const [mounted, setMounted] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    expiredRef.current = false;

    const target = new Date(nextRotationAt).getTime();

    const tick = () => {
      const remaining = target - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
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

  return (
    <div
      className="text-xs text-ink-subtle"
      role="timer"
      aria-live="off"
      aria-label="Time until the next map"
    >
      {expired ? (
        <span className="font-medium text-positive">
          New map available&hellip;
        </span>
      ) : (
        <>
          Next map in{" "}
          <span className="font-mono tabular-nums text-ink-muted">
            {mounted && remainingMs !== null
              ? formatRemaining(remainingMs)
              : "--:--:--"}
          </span>
        </>
      )}
    </div>
  );
}
