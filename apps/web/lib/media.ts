import "server-only";
import { randomUUID } from "node:crypto";
import { MEDIA_BUCKET, storageClient } from "./backend";

/**
 * Participant media. With Supabase configured, files go to the private `media` bucket and are
 * served through short-lived signed URLs. In demo mode they are kept in server memory (bounded),
 * which is enough for a live demo but not durable.
 */

const BUCKET = MEDIA_BUCKET;
const MEM_LIMIT_BYTES = 150 * 1024 * 1024;

interface MemEntry {
  bytes: Uint8Array;
  type: string;
}
const g = globalThis as typeof globalThis & { __vfMedia?: Map<string, MemEntry> };
const mem = (g.__vfMedia ??= new Map());

export const MEDIA_PREFIX_MEM = "/api/media/mem/";
export const MEDIA_PREFIX_STORAGE = "/api/media/s/";

/** Whose capture a file is: objects live under studies/<study>/<participant>/ (services/agent uses the same layout). */
export interface MediaOwner {
  id: string;
  study_id: string;
}

const safe = (s: string) => s.replace(/[^\w-]/g, "_");

function storagePath(owner: MediaOwner, ext: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `studies/${safe(owner.study_id)}/${safe(owner.id)}/${month}/${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin"}`;
}

/** A path a browser sent back after a signed upload: it must be this participant's own capture. */
export function isOwnMediaPath(path: string, owner: MediaOwner): boolean {
  return path.startsWith(`studies/${safe(owner.study_id)}/${safe(owner.id)}/`) && /^[\w\-./]+$/.test(path) && !path.includes("..");
}

export async function saveMedia(bytes: Uint8Array, contentType: string, ext: string, owner: MediaOwner): Promise<string> {
  const sb = storageClient();
  if (sb) {
    const path = storagePath(owner, ext);
    const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`media upload failed: ${error.message}`);
    return MEDIA_PREFIX_STORAGE + path;
  }
  const id = `${randomUUID()}.${ext}`;
  mem.set(id, { bytes, type: contentType });
  let total = [...mem.values()].reduce((s, e) => s + e.bytes.byteLength, 0);
  for (const key of mem.keys()) {
    if (total <= MEM_LIMIT_BYTES) break;
    total -= mem.get(key)!.bytes.byteLength;
    mem.delete(key);
  }
  return MEDIA_PREFIX_MEM + id;
}

export function readMemMedia(id: string): MemEntry | undefined {
  return mem.get(id);
}

/** Direct-to-storage upload target for files too large to pass through a serverless function. */
export async function createUploadTarget(ext: string, owner: MediaOwner): Promise<{ path: string; token: string; mediaUrl: string } | null> {
  const sb = storageClient();
  if (!sb) return null;
  const path = storagePath(owner, ext);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`could not create upload URL: ${error?.message}`);
  return { path, token: data.token, mediaUrl: MEDIA_PREFIX_STORAGE + path };
}

/** Absolute, time-limited URL the CV service (or a browser) can fetch. */
export async function signedUrlForStoragePath(path: string, seconds = 3600): Promise<string> {
  const sb = storageClient();
  if (!sb) throw new Error("storage not configured");
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`could not sign media URL: ${error?.message}`);
  return data.signedUrl;
}

export function storagePathFromMediaUrl(url: string | null): string | null {
  return url?.startsWith(MEDIA_PREFIX_STORAGE) ? url.slice(MEDIA_PREFIX_STORAGE.length) : null;
}
