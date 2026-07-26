"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const isDisabled = disabled || submitting;

  function submit() {
    const trimmed = value.trim();
    if (isDisabled) return;
    // An empty submit is not an error, it is an unfinished thought: send the
    // player back to the field rather than greying out the only way forward.
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
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
      <label
        htmlFor="guess-input"
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted"
      >
        Name the topic
      </label>
      {/* The rail is unboxed ruled type, so this is the one solid control on
          the spread: paper white against the parchment, with a full ring. */}
      <div className="flex items-stretch gap-2">
        <input
          ref={inputRef}
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
          className="min-w-0 flex-1 rounded-control bg-surface px-3.5 py-3 text-base text-ink shadow-[inset_0_1px_2px_rgb(var(--ocean-950)/0.07)] outline-none ring-1 ring-inset ring-sand-300 transition duration-150 placeholder:text-ink-subtle/70 hover:ring-ocean-600/60 focus:ring-2 focus:ring-ocean-600 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          /* Deliberately not disabled on an empty field. Greying it out at
             rest made the page's one primary action look permanently
             unavailable on arrival. It only dims while a guess is in flight. */
          disabled={isDisabled}
          className="shrink-0 rounded-control bg-accent px-5 text-base font-semibold text-accent-ink transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-wait disabled:bg-ocean-700/40"
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
