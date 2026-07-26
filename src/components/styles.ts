/**
 * The two button recipes and the one link recipe the app uses, in one place.
 *
 * They were previously re-typed inline in six components, which is how the nav
 * button, the reveal toggle and the copy button drifted into three slightly
 * different paddings and two different hover colours.
 */

/**
 * Filled primary. Type is --accent-ink on --accent: 8.9:1.
 *
 * Disabled is an outline, not a tan fill: a filled sand button introduced a
 * third control colour and still read as "press me". An outline reads as
 * "not yet", and ink-subtle on the raised surface is 8.5:1, so it stays
 * legible rather than being greyed into a guess.
 */
export const primaryAction =
  "rounded-control bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-plate transition duration-150 hover:bg-accent-hover active:translate-y-px disabled:cursor-not-allowed disabled:border disabled:border-sand-300 disabled:bg-surface-raised disabled:text-ink-subtle disabled:shadow-none";

/** Outlined secondary, for anything that is not the round's main action. */
export const secondaryAction =
  "rounded-control border border-sand-300 bg-surface px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-ocean-600 hover:bg-surface-raised hover:text-ink";

/** Same idea, one step smaller, for controls that hang off a panel. */
export const quietAction =
  "rounded-control border border-sand-300 bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 hover:border-ocean-600 hover:bg-surface-raised hover:text-ink";

export const inlineLink =
  "font-medium text-ink-muted underline decoration-sand-400 underline-offset-[3px] transition-colors duration-150 hover:text-ink hover:decoration-ocean-600";
