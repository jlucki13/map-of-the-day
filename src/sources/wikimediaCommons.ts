import type { CandidateMap } from "@/types";
import type { MapSource } from "@/sources/types";
import { config } from "@/lib/config";

/**
 * Free, keyless Wikimedia Commons source. Pulls raster map images out of a
 * rotating set of real Commons categories via the categorymembers generator.
 *
 * Every request MUST send the configured User-Agent — Wikimedia policy
 * requires an honest UA with contact info, and unauthenticated/anonymous
 * traffic without one gets rate-limited or blocked.
 */

const API_ENDPOINT = "https://commons.wikimedia.org/w/api.php";

/**
 * Real, verified Commons categories (existence + file counts confirmed
 * against the live site) that directly hold raster map files via
 * generator=categorymembers&gcmtype=file. Rotated/shuffled per call so
 * repeated generations don't hammer the same category.
 */
const MAP_CATEGORIES = [
  "Old maps of Paris",
  "Old maps of London",
  "Old maps of the Roman Empire",
  "Old maps of Japan",
  "Old maps of Italy",
  "Old maps of San Francisco",
  "Old maps of Africa",
  "Old maps of Australia",
];

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12MB
const MAX_WIDTH_PX = 6000;
const RASTER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface CommonsImageInfo {
  url?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

interface CommonsPage {
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsQueryResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "File:Some_Old_Map_1878.jpg" -> "Some Old Map 1878" */
function cleanTitle(rawTitle: string): string {
  const withoutPrefix = rawTitle.replace(/^File:/, "");
  const withoutExt = withoutPrefix.replace(/\.[a-zA-Z0-9]+$/, "");
  return withoutExt.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function buildCategoryUrl(category: string, limit: number): string {
  const params = new URLSearchParams({
    action: "query",
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "file",
    gcmlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    format: "json",
  });
  return `${API_ENDPOINT}?${params.toString()}`;
}

async function fetchCommonsJson(url: string): Promise<CommonsQueryResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": config.wikimediaUserAgent },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Wikimedia Commons API returned ${res.status}`);
    }
    return (await res.json()) as CommonsQueryResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePage(page: CommonsPage): CandidateMap | null {
  const rawTitle = page.title;
  if (!rawTitle || !rawTitle.startsWith("File:")) return null;

  const imageinfo = page.imageinfo?.[0];
  if (!imageinfo) return null;

  const mime = imageinfo.mime;
  if (!mime || !RASTER_MIME_TYPES.has(mime)) return null;

  const width = imageinfo.width;
  const height = imageinfo.height;
  if (!width || !height) return null;
  if (width > MAX_WIDTH_PX) return null;

  const size = imageinfo.size;
  if (typeof size === "number" && size > MAX_FILE_BYTES) return null;

  const imageUrl = imageinfo.url;
  const sourcePageUrl = imageinfo.descriptionurl;
  if (!imageUrl || !sourcePageUrl) return null;

  const extmetadata = imageinfo.extmetadata ?? {};
  const licenseShortName = extmetadata.LicenseShortName?.value;
  if (!licenseShortName) return null;

  const artistRaw = extmetadata.Artist?.value;
  const author = artistRaw ? stripHtml(artistRaw) : "";
  if (!author) return null;

  const descriptionRaw = extmetadata.ImageDescription?.value;
  const description = descriptionRaw ? stripHtml(descriptionRaw) : "";
  if (!description) return null;

  const title = cleanTitle(rawTitle);
  if (!title) return null;

  const licenseUrl = extmetadata.LicenseUrl?.value;

  return {
    sourceId: "wikimedia-commons",
    externalId: rawTitle,
    title,
    aliases: [],
    description,
    imageUrl,
    width,
    height,
    mimeType: mime,
    attribution: {
      author,
      license: licenseShortName,
      ...(licenseUrl ? { licenseUrl } : {}),
      sourcePageUrl,
    },
  };
}

export const wikimediaCommons: MapSource = {
  id: "wikimedia-commons",

  async listCandidates({ limit, excludeExternalIds }): Promise<CandidateMap[]> {
    if (limit <= 0) return [];

    const excluded = new Set(excludeExternalIds);
    const seen = new Set<string>();
    const results: CandidateMap[] = [];
    const categories = shuffle(MAP_CATEGORIES);
    const perCategoryFetchLimit = Math.min(50, Math.max(limit * 3, 15));

    for (const category of categories) {
      if (results.length >= limit) break;

      let response: CommonsQueryResponse;
      try {
        response = await fetchCommonsJson(
          buildCategoryUrl(category, perCategoryFetchLimit),
        );
      } catch {
        // Network/API failure for this category — try the next one.
        continue;
      }

      const pages = response.query?.pages;
      if (!pages) continue;

      const pageList = shuffle(Object.values(pages));

      for (const page of pageList) {
        if (results.length >= limit) break;

        try {
          const candidate = parsePage(page);
          if (!candidate) continue;
          if (excluded.has(candidate.externalId)) continue;
          if (seen.has(candidate.externalId)) continue;

          seen.add(candidate.externalId);
          results.push(candidate);
        } catch {
          // Never let one bad page abort the whole listing.
          continue;
        }
      }
    }

    return results.slice(0, limit);
  },
};
