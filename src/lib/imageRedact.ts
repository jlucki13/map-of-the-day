import sharp from "sharp";
import type { RedactionRegion } from "@/types";

export interface RedactedImage {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

// Parchment/sand tone (matches the UI's sand-300 token). Reads as a label
// deliberately covered over on the map rather than a dark hole punched through
// it, which is how a slate fill looked against the app's sand map mount.
const REDACTION_FILL = "#c9b58c";
const REDACTION_CORNER_RADIUS = 6;
/** Pad each region by this fraction of the ORIGINAL image width, on all sides. */
const PAD_FRACTION_OF_WIDTH = 0.02;
const MAX_REDACTED_WIDTH = 1600;
const MAX_ORIGINAL_WIDTH = 2000;
const REDACTED_JPEG_QUALITY = 82;
const ORIGINAL_JPEG_QUALITY = 85;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Composite opaque rounded rectangles over each region (regions are
 * pixel-space relative to the ORIGINAL image), pad each region by ~2% of
 * image width on all sides (clamped to image bounds), then resize to max
 * 1600px wide (never upscale) and re-encode as JPEG quality ~82.
 *
 * Note on orientation: this operates on the raw image buffer without calling
 * .rotate() / EXIF auto-orientation. ocr.ts also feeds tesseract the raw
 * bytes unrotated, so the region coordinates it produces (and any
 * preauthored regions, which are authored against the original file bytes)
 * stay valid against the same pixel grid used here.
 */
export async function redactImage(
  originalBytes: Buffer,
  regions: RedactionRegion[],
): Promise<RedactedImage> {
  const image = sharp(originalBytes, { failOn: "none" });
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error("imageRedact: could not read source image dimensions");
  }

  const pad = Math.round(width * PAD_FRACTION_OF_WIDTH);

  const rects: string[] = [];
  for (const region of regions) {
    if (
      !Number.isFinite(region.x) ||
      !Number.isFinite(region.y) ||
      !Number.isFinite(region.width) ||
      !Number.isFinite(region.height)
    ) {
      continue;
    }
    if (region.width <= 0 || region.height <= 0) continue;

    const x0 = clamp(region.x - pad, 0, width);
    const y0 = clamp(region.y - pad, 0, height);
    const x1 = clamp(region.x + region.width + pad, 0, width);
    const y1 = clamp(region.y + region.height + pad, 0, height);

    const rectWidth = x1 - x0;
    const rectHeight = y1 - y0;
    if (rectWidth <= 0 || rectHeight <= 0) continue;

    rects.push(
      `<rect x="${x0}" y="${y0}" width="${rectWidth}" height="${rectHeight}" rx="${REDACTION_CORNER_RADIUS}" ry="${REDACTION_CORNER_RADIUS}" fill="${REDACTION_FILL}" />`,
    );
  }

  let workingBytes = originalBytes;
  if (rects.length > 0) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}</svg>`;
    // Rasterize the SVG to an exact width x height bitmap before compositing
    // rather than handing sharp the raw SVG buffer directly — SVG
    // rasterization density/rounding can produce a bitmap a pixel or two
    // larger than the declared width/height, and sharp's composite() rejects
    // an overlay larger than the base image.
    const overlay = await sharp(Buffer.from(svg))
      .resize(width, height, { fit: "fill" })
      .png()
      .toBuffer();
    // Composite must be fully materialized to a buffer HERE, before any
    // resize. Chaining .resize() onto the same pipeline as a pending
    // .composite() call makes sharp validate the overlay's dimensions
    // against the post-resize target size rather than the original full
    // resolution, throwing "Image to composite must have same dimensions or
    // smaller" for any image larger than MAX_REDACTED_WIDTH — reproduced and
    // fixed against a real deployment. Encoding to PNG here (not JPEG) keeps
    // this an intermediate lossless step so the final downscale+encode below
    // isn't compounding two rounds of JPEG compression artifacts.
    workingBytes = await image
      .composite([{ input: overlay, left: 0, top: 0 }])
      .png()
      .toBuffer();
  }

  const { data, info } = await sharp(workingBytes, { failOn: "none" })
    .resize({
      width: Math.min(width, MAX_REDACTED_WIDTH),
      withoutEnlargement: true,
    })
    .jpeg({ quality: REDACTED_JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: data,
    contentType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}

/**
 * Normalize/re-encode the ORIGINAL image for storage: max 2000px wide
 * (never upscale), JPEG quality 85. No redaction applied.
 */
export async function normalizeOriginal(originalBytes: Buffer): Promise<RedactedImage> {
  const image = sharp(originalBytes, { failOn: "none" });
  const metadata = await image.metadata();
  const width = metadata.width;
  if (!width) {
    throw new Error("imageRedact: could not read source image dimensions");
  }

  const { data, info } = await image
    .resize({
      width: Math.min(width, MAX_ORIGINAL_WIDTH),
      withoutEnlargement: true,
    })
    .jpeg({ quality: ORIGINAL_JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: data,
    contentType: "image/jpeg",
    width: info.width,
    height: info.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
