"use client";

import { useActionState } from "react";
import { unlockAnswerKey } from "./actions";

/**
 * The gate. Kept deliberately plain — this is a door, not a page, and it
 * should give away nothing about what is behind it.
 */
export default function UnlockForm() {
  const [error, formAction, pending] = useActionState<string | null, FormData>(
    unlockAnswerKey,
    null,
  );

  return (
    <form
      action={formAction}
      className="mx-auto mt-24 w-full max-w-sm rounded-panel border border-hairline bg-surface p-6 shadow-plate"
    >
      <h1 className="font-display text-2xl tracking-tight text-ink">
        Answer key
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
        Private page. Enter the password to continue.
      </p>

      <label
        htmlFor="answer-key-password"
        className="mt-6 block text-sm font-semibold text-ink"
      >
        Password
      </label>
      <input
        id="answer-key-password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="mt-2 w-full rounded-control border border-sand-300 bg-surface-raised px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-ocean-600 focus:ring-2 focus:ring-focus/40"
      />

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-control border border-bad-line bg-bad-fill px-3 py-2 text-sm font-medium text-bad"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-control bg-accent px-4 py-3 text-sm font-semibold text-accent-ink shadow-plate transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:opacity-60"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
