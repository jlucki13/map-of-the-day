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
  },
};

module.exports = nextConfig;
