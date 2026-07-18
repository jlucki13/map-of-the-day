import type { CandidateMap } from "@/types";

/**
 * A pluggable provider of candidate maps. New sources can be added later
 * without touching the generation pipeline.
 */
export interface MapSource {
  /** Stable identifier, e.g. "wikimedia-commons" or "static-dataset". */
  id: string;

  /**
   * Return up to `limit` candidate maps, excluding any whose externalId is in
   * `excludeExternalIds` (the recent-use dedupe window). Implementations must
   * only return raster images (jpg/png/webp) with complete
   * license/author/description metadata.
   */
  listCandidates(options: {
    limit: number;
    excludeExternalIds: string[];
  }): Promise<CandidateMap[]>;
}
