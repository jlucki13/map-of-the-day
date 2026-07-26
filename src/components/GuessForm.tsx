"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

export interface GuessFormProps {
  disabled: boolean;
  submitting: boolean;
  error?: string | null;
  onSubmit: (guess: string) => void;
}

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
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-stretch gap-2">
        <label htmlFor="guess-input" className="sr-only">
          What is this map measuring?
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
          aria-describedby={error ? "guess-form-error" : undefined}
          className="flex-1 rounded-control border border-hairline bg-surface-raised px-4 py-2.5 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle/80 hover:border-ocean-700 focus:border-ocean-600 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isDisabled || value.trim().length === 0}
          className="shrink-0 rounded-control bg-accent px-5 py-2.5 text-base font-semibold text-accent-ink transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:bg-ocean-700/25 disabled:text-ink-subtle"
        >
          {submitting ? "Checking…" : "Guess"}
        </button>
      </div>
      {error && (
        <p
          id="guess-form-error"
          role="alert"
          className="mt-2 text-sm font-medium text-negative"
        >
          {error}
        </p>
      )}
    </form>
  );
}
