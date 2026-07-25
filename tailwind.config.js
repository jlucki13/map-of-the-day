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
        // Panels sit on the ocean, so depth is offset plus blur in the canvas
        // colour, never a black halo.
        plate: "0 18px 44px -24px rgb(var(--ocean-950) / 0.9)",
        lifted: "0 24px 60px -20px rgb(var(--ocean-950) / 0.95)",
      },
      transitionTimingFunction: {
        settle: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
