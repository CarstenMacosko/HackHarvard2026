"use client";

import { createClient } from "@supabase/supabase-js";

export interface UploadPlan {
  file?: Blob;
  filename?: string;
  mediaPath?: string;
  kind: "original" | "poster";
}

/**
 * Decide how a video reaches storage: straight to Supabase Storage via a signed upload URL
 * (no size limit), inline through the API when small enough, otherwise only a still frame
 * (the analysis already ran on-device, so the full clip never needs to leave the phone).
 */
export async function planVideoUpload(file: File, poster: Blob): Promise<UploadPlan> {
  const extension = (file.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
  let target: { mode: "signed"; path: string; token: string } | { mode: "inline"; max_bytes: number } = { mode: "inline", max_bytes: 4 * 1024 * 1024 };
  try {
    const res = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extension }) });
    if (res.ok) target = await res.json();
  } catch {
    /* fall back to inline */
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (target.mode === "signed" && url && anon) {
    const { error } = await createClient(url, anon).storage.from("media").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || "video/mp4" });
    if (!error) return { mediaPath: target.path, kind: "original" };
  }
  const limit = target.mode === "inline" ? target.max_bytes : 4 * 1024 * 1024;
  if (file.size <= limit) return { file, filename: file.name || `capture.${extension}`, kind: "original" };
  return { file: poster, filename: "poster.jpg", kind: "poster" };
}
