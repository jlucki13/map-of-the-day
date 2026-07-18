import path from "path";
import { createWorker, PSM } from "tesseract.js";
import type { OcrTextBlock } from "@/types";

// tesseract.js resolves `corePath`/`workerPath`/`langPath` at runtime, not
// import time, so these must be absolute filesystem paths rather than bare
// module specifiers. process.cwd() is the Next.js project root both in `next
// dev` and in the deployed serverless function (see next.config.js, which
// force-includes ./tessdata/** and ./node_modules/tesseract.js-core/** in the
// trace for the routes that call into this module).
const TESSDATA_DIR = path.join(process.cwd(), "tessdata");
const CORE_PATH = path.join(process.cwd(), "node_modules", "tesseract.js-core");
const WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js",
);

/** Blocks whose recognized text is empty/whitespace or below this confidence are dropped. */
const MIN_CONFIDENCE = 40;

/**
 * Run tesseract.js on the image bytes and return per-block text geometry
 * (pixel-space, original image coordinates), sorted by area descending.
 * Filters out empty/whitespace text and confidence < ~40.
 *
 * Note on orientation: this reads the raw image bytes as-is (no EXIF
 * auto-rotation). imageRedact.ts also processes the raw buffer without
 * auto-rotating, so the bbox coordinates produced here line up with the
 * pixel grid that redaction compositing operates on.
 */
export async function detectTextBlocks(imageBytes: Buffer): Promise<OcrTextBlock[]> {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker("eng", undefined, {
      langPath: TESSDATA_DIR,
      corePath: CORE_PATH,
      workerPath: WORKER_PATH,
      // The vendored eng.traineddata (tessdata_fast) is uncompressed; the
      // tesseract.js default assumes a gzip-compressed *.traineddata.gz and
      // will try to gunzip it (and/or look for a ".gz" suffix) unless told
      // otherwise.
      gzip: false,
      // Never persist a traineddata cache copy — the deployed filesystem is
      // read-only outside of /tmp, and we always ship the language data
      // ourselves anyway.
      cacheMethod: "none",
    });

    // Tesseract's default page segmentation mode (AUTO) assumes a fairly
    // uniform document layout and, verified empirically against synthetic
    // map-like fixtures, can fail to segment disconnected text regions at
    // all (e.g. a title band and a legend box separated by a large
    // non-text map body) — silently returning zero blocks for exactly the
    // regions this function most needs to find. SPARSE_TEXT is designed
    // for "find as much text as possible in no particular order," which
    // matches a map's scattered-labels-plus-title-plus-legend layout far
    // better than the automatic default.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });

    const { data } = await worker.recognize(imageBytes, {}, { blocks: true });

    const blocks = data.blocks ?? [];
    const results: OcrTextBlock[] = [];
    for (const block of blocks) {
      const text = block.text?.trim() ?? "";
      if (text.length === 0) continue;
      if (block.confidence < MIN_CONFIDENCE) continue;

      const { x0, y0, x1, y1 } = block.bbox;
      const width = x1 - x0;
      const height = y1 - y0;
      if (width <= 0 || height <= 0) continue;

      results.push({
        text,
        x: x0,
        y: y0,
        width,
        height,
        confidence: block.confidence,
      });
    }

    results.sort((a, b) => b.width * b.height - a.width * a.height);
    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ocr: ${message}`, { cause: err });
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
