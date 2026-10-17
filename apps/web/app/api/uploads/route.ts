import { NextResponse } from "next/server";
import { z } from "zod";
import { createUploadTarget } from "@/lib/media";
import { currentParticipantId } from "@/lib/session";

/**
 * Where should the browser put a large file? With Supabase Storage: a signed direct-upload
 * target (bypasses the ~4.5 MB serverless body limit). Without it: inline upload only.
 */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

const Body = z.object({ extension: z.string().regex(/^[a-z0-9]{1,5}$/i) });

export async function POST(req: Request) {
  await currentParticipantId();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const target = await createUploadTarget(parsed.data.extension);
  return NextResponse.json(target ? { mode: "signed", ...target } : { mode: "inline", max_bytes: INLINE_LIMIT_BYTES });
}
