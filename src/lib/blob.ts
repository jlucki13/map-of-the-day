/**
 * Image byte storage abstraction. Two implementations:
 *  - Vercel Blob (production / any env with BLOB_READ_WRITE_TOKEN)
 *  - Disk fallback under <cwd>/public/dev-blob (local dev)
 *
 * Used to store redacted + original puzzle map images.
 */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

export interface ImageStore {
  /** pathname like "puzzles/<id>/redacted.jpg"; returns a publicly fetchable URL */
  putImage(pathname: string, bytes: Buffer, contentType: string): Promise<{ url: string }>;
  /** Best-effort delete by URL; never throws. */
  deleteImage(url: string): Promise<void>;
}

function hasBlobEnv(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// ---------------------------------------------------------------------------
// Vercel Blob implementation
// ---------------------------------------------------------------------------

class VercelBlobImageStore implements ImageStore {
  async putImage(
    pathname: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<{ url: string }> {
    const { put } = await import("@vercel/blob");
    const result = await put(pathname, bytes, {
      access: "public",
      // Puzzle ids are UUIDs, so pathnames never collide — no random suffix
      // needed, and overwrites can't occur in practice.
      addRandomSuffix: false,
      contentType,
    });
    return { url: result.url };
  }

  async deleteImage(url: string): Promise<void> {
    try {
      const { del } = await import("@vercel/blob");
      await del(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("VercelBlobImageStore.deleteImage failed (ignored):", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Disk fallback
// ---------------------------------------------------------------------------

const DEV_BLOB_URL_PREFIX = "/dev-blob/";

function devBlobRoot(): string {
  return path.join(process.cwd(), "public", "dev-blob");
}

class DiskImageStore implements ImageStore {
  async putImage(
    pathname: string,
    bytes: Buffer,
    _contentType: string,
  ): Promise<{ url: string }> {
    if (config.isVercel) {
      // Fail fast with a clear, actionable message instead of attempting a
      // write that's guaranteed to fail — Vercel's function filesystem is
      // read-only outside /tmp, and even a successful /tmp write wouldn't be
      // publicly fetchable, so there's no useful degraded behavior here.
      // Verified against a real deployment: without this check, the write
      // below throws a raw ENOENT ("mkdir '/var/task/public'") that gives no
      // hint the actual problem is a missing BLOB_READ_WRITE_TOKEN.
      throw new Error(
        "ImageStore: BLOB_READ_WRITE_TOKEN is not set. The disk-based " +
          "fallback only works in local dev — connect Vercel Blob to this " +
          "project (Storage tab) and redeploy.",
      );
    }
    const normalized = pathname.replace(/^\/+/, "");
    const filePath = path.join(devBlobRoot(), normalized);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    return { url: `${DEV_BLOB_URL_PREFIX}${normalized}` };
  }

  async deleteImage(url: string): Promise<void> {
    try {
      if (!url.startsWith(DEV_BLOB_URL_PREFIX)) return;
      const relative = url.slice(DEV_BLOB_URL_PREFIX.length);
      const filePath = path.join(devBlobRoot(), relative);
      await unlink(filePath);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("DiskImageStore.deleteImage failed (ignored):", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cachedStore: ImageStore | null = null;

export function getImageStore(): ImageStore {
  if (cachedStore) return cachedStore;
  cachedStore = hasBlobEnv() ? new VercelBlobImageStore() : new DiskImageStore();
  return cachedStore;
}
