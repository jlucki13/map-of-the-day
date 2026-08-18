import { alt, contentType, generateOgImage, size } from "./og-shared";

// Same card as opengraph-image.tsx (see og-shared.tsx) — Twitter/X's
// summary_large_image wants the same 1200x630 asset, so there's no reason to
// draw it twice.
export { alt, contentType, size };

export default function Image() {
  return generateOgImage();
}
