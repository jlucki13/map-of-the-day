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
          Guess the place
        </label>
        <input
          id="guess-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Where is this?"
          value={value}
          disabled={isDisabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "guess-form-error" : undefined}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-base text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isDisabled || value.trim().length === 0}
          className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {submitting ? "Guessing…" : "Guess"}
        </button>
      </div>
      {error && (
        <p id="guess-form-error" role="alert" className="mt-2 text-sm font-medium text-amber-400">
          {error}
        </p>
      )}
    </form>
  );
}
