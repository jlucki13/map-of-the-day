/**
 * The puzzle-generation pipeline:
 *
 *   sources -> scout -> orchestrator pick -> fetch image -> ocr -> redactor
 *   -> redact -> hintsmith -> deterministic leak-check -> orchestrator QA
 *   -> persist
 *
 * The control flow is byte-identical in mock and live mode — only the
 * injected agent implementations differ (getAgentPipeline()). Candidates
 * with preauthored redaction regions / hints (the static dataset) skip the
 * OCR/redactor/hintsmith steps; that branch keys on candidate DATA, not on
 * mode, so it is exercised the same way in both modes.
 *
 * This module (and only this module's import graph) may pull in sharp and
 * tesseract.js. The interactive /api/guess route must never import it.
 */

import { getAgentPipeline } from "@/agents";
import type { AgentPipeline } from "@/agents/types";
import { config } from "@/lib/config";
import { hintLeaksAnswer } from "@/lib/guessMatch";
import { getImageStore } from "@/lib/blob";
import { getKv } from "@/lib/kv";
import { detectTextBlocks } from "@/lib/ocr";
import { normalizeOriginal, redactImage } from "@/lib/imageRedact";
import { getSources } from "@/sources";
import type { MapSource } from "@/sources/types";
import type { CandidateMap, Hint, Puzzle, RedactionRegion } from "@/types";

export const CURRENT_PUZZLE_KEY = "puzzle:current";
export const RECENT_EXTERNAL_IDS_KEY = "puzzle:recent-external-ids";

async function fetchImageBytes(candidate: CandidateMap): Promise<Buffer> {
  // Root-relative URLs point at our own self-hosted generated maps under
  // public/generated-maps/ — resolve them against the deployment's base URL so
  // the same fetch path works in dev, on Vercel, and in mock mode.
  const imageUrl = candidate.imageUrl.startsWith("/")
    ? `${config.publicBaseUrl}${candidate.imageUrl}`
    : candidate.imageUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(imageUrl, {
      headers: { "User-Agent": config.wikimediaUserAgent },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `image fetch failed with ${response.status} for ${imageUrl}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function resolveRedactionRegions(
  pipeline: AgentPipeline,
  candidate: CandidateMap,
  originalBytes: Buffer,
  visionBytes: Buffer,
  visionMediaType: string,
): Promise<RedactionRegion[]> {
  // Static-dataset entries carry hand-authored, pixel-accurate regions and
  // skip OCR + the redactor entirely.
  if (
    candidate.preauthoredRedactionRegions &&
    candidate.preauthoredRedactionRegions.length > 0
  ) {
    return candidate.preauthoredRedactionRegions;
  }

  const allBlocks = await detectTextBlocks(originalBytes);
  // Busy maps can produce dozens of blocks — pre-filter to the largest-N by
  // area (detectTextBlocks already sorts by area desc) before the vision call.
  const blocks = allBlocks.slice(0, config.maxOcrBlocksForRedactor);

  return pipeline.redactor.classifyTextBlocks({
    candidate,
    // The redactor only CLASSIFIES blocks; the image is advisory context, so
    // the resized/normalized rendition keeps the vision payload small while
    // the block geometry stays in original-image pixel space.
    imageBase64: visionBytes.toString("base64"),
    imageMediaType: visionMediaType,
    blocks,
  });
}

async function resolveHints(
  pipeline: AgentPipeline,
  candidate: CandidateMap,
): Promise<[Hint, Hint]> {
  if (candidate.preauthoredHints) {
    const [h1, h2] = candidate.preauthoredHints;
    return [
      { order: 1, text: h1 },
      { order: 2, text: h2 },
    ];
  }
  return pipeline.hintsmith.writeHints(candidate);
}

async function attemptFromSource(
  pipeline: AgentPipeline,
  source: MapSource,
  excludeExternalIds: string[],
): Promise<Puzzle> {
  const candidates = await source.listCandidates({
    limit: config.maxCandidatesPerGeneration,
    excludeExternalIds,
  });
  if (candidates.length === 0) {
    throw new Error(`generatePuzzle: source "${source.id}" returned no candidates`);
  }

  const assessments = await pipeline.scout.assessCandidates(candidates);
  const picked = await pipeline.orchestrator.pickCandidate({
    candidates,
    assessments,
  });
  if (!picked) {
    throw new Error(
      `generatePuzzle: orchestrator rejected all candidates from "${source.id}"`,
    );
  }

  // Merge scout-proposed aliases into the candidate (deduped, minus the title).
  const assessment = assessments.find((a) => a.externalId === picked.externalId);
  const mergedAliases = [
    ...new Set(
      [...picked.aliases, ...(assessment?.proposedAliases ?? [])].filter(
        (a) => a.trim().length > 0 && a.trim() !== picked.title,
      ),
    ),
  ];
  const candidate: CandidateMap = { ...picked, aliases: mergedAliases };

  const originalBytes = await fetchImageBytes(candidate);
  const normalized = await normalizeOriginal(originalBytes);

  const regions = await resolveRedactionRegions(
    pipeline,
    candidate,
    originalBytes,
    normalized.bytes,
    normalized.contentType,
  );

  const redacted = await redactImage(originalBytes, regions);
  const hints = await resolveHints(pipeline, candidate);

  // Deterministic leak check — runs regardless of what any LLM concluded.
  for (const hint of hints) {
    if (hintLeaksAnswer(hint.text, candidate.title, candidate.aliases)) {
      throw new Error(
        `generatePuzzle: hint ${hint.order} leaks the answer for "${candidate.externalId}"`,
      );
    }
  }

  // Second, independent safety net: the orchestrator sees only what a player
  // would see (redacted image + hints) and judges leaks/playability.
  const qa = await pipeline.orchestrator.finalQa({
    candidate,
    redactedImageBase64: redacted.bytes.toString("base64"),
    imageMediaType: redacted.contentType,
    hints,
  });
  if (!qa.passed) {
    throw new Error(
      `generatePuzzle: final QA failed for "${candidate.externalId}": ${qa.notes ?? "no notes"}`,
    );
  }

  // ---- Persist ----
  const kv = getKv();
  const imageStore = getImageStore();
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const [redactedUpload, originalUpload] = await Promise.all([
    imageStore.putImage(`puzzles/${id}/redacted.jpg`, redacted.bytes, redacted.contentType),
    imageStore.putImage(`puzzles/${id}/original.jpg`, normalized.bytes, normalized.contentType),
  ]);

  const puzzle: Puzzle = {
    id,
    createdAt: nowIso,
    intervalStartAt: nowIso,
    intervalSeconds: config.intervalSeconds,
    candidate,
    redactionRegions: regions,
    redactedImageUrl: redactedUpload.url,
    originalImageUrl: originalUpload.url,
    hints,
    qa: { passed: true, notes: qa.notes },
    generator: {
      mode: pipeline.mode,
      orchestratorModel: pipeline.orchestratorModel,
      subagentModel: pipeline.subagentModel,
    },
  };

  const previous = await kv.getJson<Puzzle>(CURRENT_PUZZLE_KEY);
  await kv.setJson(CURRENT_PUZZLE_KEY, puzzle);
  await kv.pushRecent(
    RECENT_EXTERNAL_IDS_KEY,
    candidate.externalId,
    config.dedupeWindowSize,
  );

  // Old puzzles' images are deleted right after a new puzzle publishes, to
  // keep storage bounded. (Remove this if a "past puzzles" browse feature is
  // ever added.)
  if (previous && previous.id !== puzzle.id) {
    await Promise.all([
      imageStore.deleteImage(previous.redactedImageUrl),
      imageStore.deleteImage(previous.originalImageUrl),
    ]);
  }

  return puzzle;
}

/**
 * Generate and persist a new current puzzle. Tries each registered source in
 * order (live: Wikimedia first, static dataset as automatic fallback; mock:
 * static only) — a failure at ANY stage for one source falls through to the
 * next rather than failing the whole run.
 */
export async function generatePuzzle(): Promise<Puzzle> {
  const pipeline = getAgentPipeline();
  const kv = getKv();
  const recent = await kv.getRecent(
    RECENT_EXTERNAL_IDS_KEY,
    config.dedupeWindowSize,
  );

  const sources = getSources();
  let lastError: unknown = new Error("generatePuzzle: no sources registered");

  for (const source of sources) {
    try {
      return await attemptFromSource(pipeline, source, recent);
    } catch (err) {
      lastError = err;
      console.error(
        `generatePuzzle: source "${source.id}" failed, trying next:`,
        err,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`generatePuzzle: all sources failed: ${String(lastError)}`);
}
