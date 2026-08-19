import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Shared social-card generator, used by both opengraph-image.tsx and
 * twitter-image.tsx (Next's metadata-route conventions each need their own
 * default export, but there is no reason to draw the card twice). 1200x630 is
 * the OG standard and also satisfies Twitter's summary_large_image.
 *
 * The scene is a smaller, static echo of GlobeBackground (see globals.css's
 * .globe block): a shaded ocean disc, a limb fade, a few land-toned patches
 * standing in for GlobeBackground's drifting coastline, and one faint
 * meridian arc. At card size the real component's texture mask and rotating
 * graticule would just be noise, so this keeps the idea — "a lit globe,
 * lightly cropped, standing to the right of the words" — without the detail
 * that only reads at full viewport size.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Map of the Day — a daily map with its title and legend hidden";

// Atlas palette (see src/app/globals.css :root). Duplicated as literal hex
// here because ImageResponse renders outside the app's CSS/Tailwind pipeline
// and can't resolve custom properties.
const color = {
  canvas: "#f7f1e3",
  paper: "#fffdf7",
  sand200: "#ded0b2",
  sand400: "#b99c66",
  sand600: "#8a6c37",
  ocean950: "#061523",
  ocean800: "#123852",
  ocean700: "#1a4d6d",
  ocean600: "#24688e",
  ocean500: "#2f86b0",
  ocean400: "#57a6cc",
  ocean300: "#8cc6e2",
  ocean200: "#c3e2f0",
  land300: "#9ad3b3",
  land500: "#2f9066",
  land700: "#1b5c40",
  good: "#1b5c40",
};

// Fonts live in public/og-fonts rather than being imported as a webpack asset
// (e.g. `new URL('./font.ttf', import.meta.url)`): that route bundles the
// font and hands back a `/_next/static/media/...` URL, which has no origin
// to resolve against during `next build`'s static prerender pass and breaks
// the build. Reading straight off disk relative to process.cwd() works in
// both dev and the prerendered build, and `public/` ships as-is on Vercel
// with no extra output-tracing config (unlike the tessdata assets in
// next.config.js, which live outside `public/` and need it).
async function loadFonts() {
  const fontDir = join(process.cwd(), "public", "og-fonts");
  const [bold, semibold] = await Promise.all([
    readFile(join(fontDir, "EBGaramond-Bold.ttf")),
    readFile(join(fontDir, "EBGaramond-SemiBold.ttf")),
  ]);
  return [
    { name: "EB Garamond", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "EB Garamond", data: semibold, weight: 600 as const, style: "normal" as const },
  ];
}

// A handful of organic, differently-shaded patches over the globe disc: a
// nod to the game's actual subject (a choropleth) rather than a literal,
// geographically-accurate coastline, which would be illegible at this scale
// anyway. Four-value border-radius (no elliptical slash syntax) keeps every
// shape inside what Satori reliably supports.
const patches: Array<{
  top: number;
  left: number;
  w: number;
  h: number;
  radius: string;
  fill: string;
  opacity: number;
  rotate?: number;
}> = [
  { top: 40, left: 30, w: 150, h: 120, radius: "62% 38% 55% 45%", fill: color.land700, opacity: 0.88 },
  { top: 150, left: 190, w: 120, h: 150, radius: "45% 55% 40% 60%", fill: color.land500, opacity: 0.85, rotate: -8 },
  { top: 250, left: 60, w: 110, h: 90, radius: "55% 45% 60% 40%", fill: color.land300, opacity: 0.85 },
  { top: 40, left: 210, w: 90, h: 80, radius: "50% 50% 40% 60%", fill: color.land300, opacity: 0.75, rotate: 6 },
  { top: 300, left: 220, w: 70, h: 70, radius: "50% 50% 45% 55%", fill: color.land700, opacity: 0.8 },
];

export async function generateOgImage() {
  const fonts = await loadFonts();
  const globeSize = 520;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: color.canvas,
          backgroundImage: `radial-gradient(120% 120% at 8% -10%, ${color.paper} 0%, ${color.canvas} 62%)`,
          fontFamily: "EB Garamond",
        }}
      >
        {/* Globe: cropped off the right edge, echoing the desktop layout's
            "standing to the right of the work" placement. */}
        <div
          style={{
            position: "absolute",
            top: 55,
            left: 1200 - globeSize * 0.62,
            width: globeSize,
            height: globeSize,
            display: "flex",
            borderRadius: "50%",
            overflow: "hidden",
            backgroundImage: `radial-gradient(circle at 34% 28%, ${color.ocean200} 0%, ${color.ocean300} 34%, ${color.ocean400} 64%, ${color.ocean500} 92%)`,
            boxShadow: `inset 0 0 0 2px ${color.ocean600}4d`,
          }}
        >
          {/* Land / choropleth patches */}
          {patches.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: p.top,
                left: p.left,
                width: p.w,
                height: p.h,
                display: "flex",
                borderRadius: p.radius,
                backgroundColor: p.fill,
                opacity: p.opacity,
                ...(p.rotate ? { transform: `rotate(${p.rotate}deg)` } : {}),
              }}
            />
          ))}

          {/* Single faint meridian, same move as icon.svg: one curve reads as
              a sphere, a second reads as a crosshair. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              marginLeft: -1,
              width: globeSize * 0.62,
              height: globeSize,
              display: "flex",
              borderRadius: "50%",
              border: `2px solid ${color.paper}`,
              opacity: 0.32,
            }}
          />

          {/* Limb shading */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              borderRadius: "50%",
              boxShadow: `inset -30px -34px 90px 6px ${color.ocean700}99, inset 0 0 40px 6px ${color.ocean600}55`,
            }}
          />
        </div>

        {/* Word mark + copy */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            height: "100%",
            padding: "0 0 0 84px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: "sans-serif",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: color.sand600,
            }}
          >
            <span
              style={{
                display: "flex",
                width: 34,
                height: 1,
                backgroundColor: color.sand400,
              }}
            />
            Daily Map Puzzle
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -1,
              whiteSpace: "nowrap",
              color: color.ocean950,
            }}
          >
            Map of the Day
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 34,
              fontWeight: 600,
              lineHeight: 1.35,
              color: color.ocean800,
              maxWidth: 660,
            }}
          >
            Title and legend hidden — guess what it&apos;s measuring.
            Five tries, once a day.
          </div>

          {/* Five guess pips, echoing GuessPips.tsx: an honest nod to the
              scoring mechanic without spelling out rules on a share card. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 40,
            }}
          >
            {[true, false, false, false, false].map((filled, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  backgroundColor: filled ? color.good : "transparent",
                  border: filled ? "none" : `2px solid ${color.sand400}`,
                }}
              />
            ))}
            <div
              style={{
                display: "flex",
                marginLeft: 6,
                fontFamily: "sans-serif",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 1,
                color: color.ocean700,
              }}
            >
              5 guesses, once a day
            </div>
          </div>
        </div>

        {/* Outer plate edge, matching the app's thin hairline-on-paper feel */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            border: `1px solid ${color.sand200}`,
          }}
        />
      </div>
    ),
    { ...size, fonts },
  );
}
