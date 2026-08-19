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
 * Commons categories that hold THEMATIC / choropleth map files (the "guess
 * the topic" game wants data maps, not geographic reference maps). The list is
 * weighted roughly 75% US / 25% global by including more US categories, since
 * the shuffle picks categories in random order and generation stops once
 * `limit` candidates are collected.
 *
 * NOTE: unlike the v1 geographic categories, these have NOT been verified
 * against live Commons from this environment (Wikimedia is network-blocked in
 * the build sandbox). Confirm each still exists and returns direct file
 * members (generator=categorymembers&gcmtype=file) on a preview deploy; drop
 * or replace any that come up empty. The curated static dataset is the
 * reliable fallback while these are being validated.
 */
const MAP_CATEGORIES = [
  // US-focused thematic / choropleth categories (~75% weight).
  "Choropleth maps of the United States",
  "Thematic maps of the United States",
  "Demographic maps of the United States",
  "Election maps of the United States",
  "Maps of the economy of the United States",
  "Climate maps of the United States",
  // Global thematic categories (~25% weight).
  "Choropleth maps of the world",
  "Thematic maps of the world",
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
