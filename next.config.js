/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp and tesseract.js resolve native binaries / WASM assets at runtime and
  // must NOT be bundled by webpack. They are only ever imported from the
  // generation code path (src/lib/generatePuzzle.ts and below), never from the
  // interactive /api/guess route.
  serverExternalPackages: ["sharp", "tesseract.js"],

  // tesseract.js must not rely on its default CDN fetch on Vercel: the WASM
  // core ships in node_modules/tesseract.js-core and the language data is
  // vendored into ./tessdata. Both are force-included in the serverless bundle
  // for every route that can trigger puzzle generation. Without this it works
  // in `next dev` and silently breaks once deployed.
  outputFileTracingIncludes: {
    "/api/cron/generate-puzzle": [
      "./tessdata/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
    "/api/puzzle": [
      "./tessdata/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
    // opengraph-image/twitter-image read local .ttf files via
    // fs.readFile(join(process.cwd(), "public/og-fonts", ...)) at request
    // time. process.cwd() is a dynamic path, so Next's automatic trace
    // (@vercel/nft, static-analysis based) doesn't pick it up, and files
    // under public/ aren't otherwise assumed to be read via fs — same failure
    // shape as tessdata above: works in `next dev`/`next start` (which run as
    // plain Node with the real repo on disk) and 500s once deployed, because
    // the serverless function's bundle genuinely doesn't contain the fonts.
    "/opengraph-image": ["./public/og-fonts/**/*"],
    "/twitter-image": ["./public/og-fonts/**/*"],
  },
};

module.exports = nextConfig;
