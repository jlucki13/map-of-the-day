/**
 * Pre-renders the world's landmasses into a tileable SVG used as a CSS mask by
 * the decorative <GlobeBackground /> component.
 *
 * The vertical axis uses sin(latitude) (a Lambert cylindrical equal-area
 * mapping) rather than a plain equirectangular latitude, because that is
 * exactly how an orthographic sphere places latitude along its central
 * meridian. Longitude stays linear: the residual horizontal error is hidden by
 * the radial limb fade the component applies near the edges of the disc.
 *
 * Output: public/globe-land.svg  (black land silhouettes on transparent,
 * viewBox 1024x512, seamless across the antimeridian so it can `repeat-x`).
 *
 * Run: node scripts/generate-globe-texture.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { geoPath, geoProjection } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WIDTH = 1024;
const HEIGHT = 512;
// Islands smaller than this (in output px²) are dropped: at background opacity
// they read as noise and they dominate the file size.
const MIN_AREA = 14;

const topo = require("world-atlas/land-110m.json");
// land-110m wraps a single MultiPolygon feature in a GeometryCollection.
const land = feature(topo, topo.objects.land).features[0];

const raw = (lambda, phi) => [
  (lambda * WIDTH) / (2 * Math.PI),
  Math.sin(phi) * (HEIGHT / 2),
];
const projection = geoProjection(raw)
  .scale(1)
  .translate([WIDTH / 2, HEIGHT / 2]);

const pathBuilder = geoPath(projection);

/** Shoelace area of a projected ring, in output px². */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i += 1) {
    const a = projection(ring[i]);
    const b = projection(ring[(i + 1) % n]);
    if (!a || !b) return Infinity; // keep anything we cannot measure
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

const polygons = [];
for (const geometry of land.geometry.coordinates) {
  // land-110m is a MultiPolygon: each entry is [outerRing, ...holes].
  const [outer, ...holes] = geometry;
  if (ringArea(outer) < MIN_AREA) continue;
  polygons.push([outer, ...holes.filter((h) => ringArea(h) >= MIN_AREA)]);
}

const d = pathBuilder({
  type: "MultiPolygon",
  coordinates: polygons,
})
  // One decimal is well under a rendered pixel at every size we draw at.
  .replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="none"><path d="${d}" fill="#000"/></svg>\n`;

const out = path.join(root, "public", "globe-land.svg");
writeFileSync(out, svg);
console.log(
  `wrote ${path.relative(root, out)} (${polygons.length} landmasses, ${(
    svg.length / 1024
  ).toFixed(1)} kB)`,
);
