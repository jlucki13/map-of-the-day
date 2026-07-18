import type { CandidateMap } from "@/types";
import type { MapSource } from "@/sources/types";
import staticMapsJson from "@/data/static-maps.json";

/**
 * Hand-curated fallback dataset. Always available with zero network calls —
 * this is what powers mock mode and what live mode falls back to when the
 * live source comes up empty (rate-limited, category miss, etc).
 */

// JSON module imports are structurally typed by TS, not nominally — cast
// through unknown and then sanity-filter at runtime so a malformed entry in
// the data file can't silently produce a broken CandidateMap.
const rawStaticMaps = staticMapsJson as unknown as CandidateMap[];

function isSaneCandidate(entry: unknown): entry is CandidateMap {
  if (!entry || typeof entry !== "object") return false;
  const c = entry as Partial<CandidateMap>;
  return (
    typeof c.sourceId === "string" &&
    c.sourceId.length > 0 &&
    typeof c.externalId === "string" &&
    c.externalId.length > 0 &&
    typeof c.title === "string" &&
    c.title.length > 0 &&
    Array.isArray(c.aliases) &&
    typeof c.description === "string" &&
    c.description.length > 0 &&
    typeof c.imageUrl === "string" &&
    c.imageUrl.length > 0 &&
    typeof c.mimeType === "string" &&
    c.mimeType.length > 0 &&
    !!c.attribution &&
    typeof c.attribution.author === "string" &&
    typeof c.attribution.license === "string" &&
    typeof c.attribution.sourcePageUrl === "string"
  );
}

const staticMaps: CandidateMap[] = rawStaticMaps.filter(isSaneCandidate);

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const staticDataset: MapSource = {
  id: "static-dataset",

  async listCandidates({ limit, excludeExternalIds }): Promise<CandidateMap[]> {
    if (limit <= 0) return [];

    const excluded = new Set(excludeExternalIds);
    let pool = staticMaps.filter((m) => !excluded.has(m.externalId));

    // Repeats beat no puzzle: if excluding recently-used entries would leave
    // nothing to serve (the static dataset is small), ignore the dedupe
    // window entirely rather than returning zero candidates.
    if (pool.length === 0) {
      pool = staticMaps;
    }

    return shuffle(pool).slice(0, limit);
  },
};
