import type { CSSProperties } from "react";

/**
 * Decorative rotating globe that sits behind the game.
 *
 * Three layers, all CSS (see the globe block in src/app/globals.css):
 *
 *  1. a shaded disc, lit from the upper left;
 *  2. the world's landmasses drifting east past a faded limb, drawn by masking
 *     a colour with the pre-rendered public/globe-land.svg texture;
 *  3. a graticule of real 3D circles turning about the polar axis.
 *
 * Six meridian circles give twelve meridians (a circle is two of them), because
 * a circle rotated about the polar axis projects to exactly the ellipse an
 * orthographic meridian draws. Parallels are circles scaled by cos(latitude)
 * and lifted by sin(latitude), laid flat with rotateX(90deg).
 *
 * Two animated transforms in total, no JavaScript, no React re-renders, and no
 * network requests beyond the local SVG mask. Motion stops entirely under
 * prefers-reduced-motion.
 */

const MERIDIANS = [0, 30, 60, 90, 120, 150];

const PARALLELS = [
  { latScale: 0.5, latOffset: -0.433 }, // 60N
  { latScale: 0.866, latOffset: -0.25 }, // 30N
  { latScale: 1, latOffset: 0 }, // equator
  { latScale: 0.866, latOffset: 0.25 }, // 30S
  { latScale: 0.5, latOffset: 0.433 }, // 60S
];

export default function GlobeBackground() {
  return (
    <div className="globe-layer" aria-hidden="true">
      <div className="globe">
        <div className="globe__skin">
          <div className="globe__land" />
        </div>

        <div className="globe__frame">
          <div className="globe__grid">
            {MERIDIANS.map((deg) => (
              <span
                key={deg}
                className="globe__meridian"
                style={{ "--meridian": `${deg}deg` } as CSSProperties}
              />
            ))}
            {PARALLELS.map(({ latScale, latOffset }) => (
              <span
                key={latOffset}
                className="globe__parallel"
                style={
                  {
                    "--lat-scale": latScale,
                    "--lat-offset": latOffset,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>

        <div className="globe__shade" />
      </div>
    </div>
  );
}
