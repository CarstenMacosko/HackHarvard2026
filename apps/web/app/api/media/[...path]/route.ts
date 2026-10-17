import { backend, storageClient } from "@/lib/backend";
import { readMemMedia, signedUrlForStoragePath } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

function validSegments(parts: string[]): boolean {
  return parts.length >= 2 && parts.every((part) =>
    part !== "." && part !== ".." && /^[a-zA-Z0-9_.-]+$/.test(part),
  );
}

function memoryResponse(req: Request, id: string, head: boolean): Response {
  const entry = readMemMedia(id);
  if (!entry) return new Response("Media not found", { status: 404 });

  const size = entry.bytes.byteLength;
  const headers = new Headers({
    "Content-Type": entry.type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const range = req.headers.get("range");
  let start = 0;
  let end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    } else {
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size || end < 0) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(head ? null : new Uint8Array(entry.bytes.slice(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}

async function serve(req: Request, ctx: Context, head: boolean): Promise<Response> {
  const { path: parts } = await ctx.params;
  if (!validSegments(parts) || (parts[0] !== "s" && parts[0] !== "mem")) {
    return new Response("Media not found", { status: 404 });
  }
  if (parts[0] === "mem" && parts.length !== 2) return new Response("Media not found", { status: 404 });
  if (parts[0] === "s" && (parts.length < 3 || (parts[1] !== "studies" && parts[1] !== "uploads"))) {
    return new Response("Media not found", { status: 404 });
  }

  const mediaUrl = `/api/media/${parts.join("/")}`;
  // A Storage key alone must not grant access to an unrecorded private file.
  const participantId = parts[0] === "s" && parts[1] === "studies" ? parts[3] : undefined;
  const submissions = await backend().submissions(participantId ? { participantId } : {});
  if (!submissions.some((submission) => submission.media_url === mediaUrl)) {
    return new Response("Media not found", { status: 404 });
  }

  if (parts[0] === "mem") return memoryResponse(req, parts[1], head);
  if (!storageClient()) return new Response("Storage is not configured", { status: 503 });
  try {
    const signedUrl = await signedUrlForStoragePath(parts.slice(1).join("/"), 600);
    return new Response(null, {
      status: 307,
      headers: {
        Location: signedUrl,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Media could not be loaded", { status: 502 });
  }
}

export async function GET(req: Request, ctx: Context): Promise<Response> {
  return serve(req, ctx, false);
}

export async function HEAD(req: Request, ctx: Context): Promise<Response> {
  return serve(req, ctx, true);
}
