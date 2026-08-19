/** @type {import('tailwindcss').Config} */

/**
 * Every colour below points at a custom property defined in
 * src/app/globals.css, kept as RGB channels so Tailwind's opacity modifiers
 * (bg-surface/70, border-hairline/60) keep working off a single source of truth.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const ramp = (name, stops) =>
  Object.fromEntries(stops.map((stop) => [stop, token(`${name}-${stop}`)]));

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: ramp("ocean", [200, 300, 400, 500, 600, 700, 800, 850, 900, 950]),
        sand: ramp("sand", [50, 100, 200, 300, 400, 500, 600]),
        land: ramp("land", [300, 400, 500, 600, 700, 800]),
        clay: ramp("clay", [300, 400, 500, 700, 900]),

        // Semantic roles. Prefer these in components; reach for a ramp step
        // only when one specific tint is the point.
        canvas: token("canvas"),
        surface: token("surface"),
        "surface-raised": token("surface-raised"),
        hairline: token("hairline"),
        ink: token("ink"),
        "ink-muted": token("ink-muted"),
        "ink-subtle": token("ink-subtle"),
        accent: token("accent"),
        "accent-hover": token("accent-hover"),
        "accent-ink": token("accent-ink"),

        // Feedback. Use these rather than a raw land-/clay- step so the
        // light-surface contrast decisions live in one place.
        good: token("good"),
        "good-fill": token("good-fill"),
        "good-line": token("good-line"),
        bad: token("bad"),
        "bad-fill": token("bad-fill"),
        "bad-line": token("bad-line"),
        note: token("note"),
        "note-fill": token("note-fill"),
        "note-line": token("note-line"),
      },
      fontFamily: {
        // No webfonts: the app must run with zero network access, so these are
        // locally available faces only.
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Used only for the wordmark and the revealed answer: the engraved
        // title block of an atlas plate.
        display: [
          "Iowan Old Style",
          "Palatino Linotype",
          "Palatino",
          "Book Antiqua",
          "Georgia",
          "serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        // Shape system: 4px chips, 10px controls, 16px panels.
        chip: "4px",
        control: "10px",
        panel: "16px",
      },
      boxShadow: {
        // Two shadows only, both tinted with the page's own ocean rather than
        // black: a contact edge that says "this sheet rests on the paper", and
        // a wider fall-off that says how far off it is. The old values carried
        // near-opaque ocean-950 and read as soot on parchment.
        plate:
          "0 1px 2px rgb(var(--ocean-950) / 0.05), 0 10px 24px -14px rgb(var(--ocean-950) / 0.22)",
        lifted:
          "0 1px 3px rgb(var(--ocean-950) / 0.07), 0 22px 48px -22px rgb(var(--ocean-950) / 0.34)",
      },
      transitionTimingFunction: {
        settle: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
