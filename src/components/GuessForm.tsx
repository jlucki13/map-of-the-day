"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

export interface GuessFormProps {
  disabled: boolean;
  submitting: boolean;
  error?: string | null;
  onSubmit: (guess: string) => void;
}

/**
 * The rail's one control. It stacks rather than sitting in a row: at the rail's
 * width a side-by-side field and button leaves the field too short to hold a
 * phrase like "share of electricity from wind", and the phrase is the answer.
 */
export default function GuessForm({
  disabled,
  submitting,
  error,
  onSubmit,
}: GuessFormProps) {
  const [value, setValue] = useState("");

  const isDisabled = disabled || submitting;

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || isDisabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor="guess-input"
        className="block text-sm font-semibold text-ink"
      >
        Your guess
      </label>

      <input
        id="guess-input"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="e.g. average rainfall"
        value={value}
        disabled={isDisabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? "guess-form-error" : "guess-form-helper"}
        className="mt-2 block w-full rounded-control border border-sand-300 bg-surface-raised px-3.5 py-3 text-[17px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle/70 hover:border-ocean-600 focus:border-ocean-600 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={isDisabled || value.trim().length === 0}
        className="mt-2 w-full rounded-control bg-accent px-5 py-3 text-[15px] font-semibold text-accent-ink shadow-plate transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:border disabled:border-sand-300 disabled:bg-surface-raised disabled:text-ink-subtle disabled:shadow-none"
      >
        {submitting ? "Checking…" : "Submit guess"}
      </button>

      {error ? (
        <p
          id="guess-form-error"
          role="alert"
          className="mt-2.5 text-sm font-medium text-bad"
        >
          {error}
        </p>
      ) : (
        <p id="guess-form-helper" className="mt-2.5 text-sm text-ink-subtle">
          Name the topic, not the place.
        </p>
      )}
    </form>
  );
}
