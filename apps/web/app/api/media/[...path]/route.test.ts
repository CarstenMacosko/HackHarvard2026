import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  submissions: vi.fn(),
  storageClient: vi.fn(),
  readMemMedia: vi.fn(),
  signedUrlForStoragePath: vi.fn(),
}));

vi.mock("@/lib/backend", () => ({
  backend: () => ({ submissions: mock.submissions }),
  storageClient: mock.storageClient,
}));
vi.mock("@/lib/media", () => ({
  readMemMedia: mock.readMemMedia,
  signedUrlForStoragePath: mock.signedUrlForStoragePath,
}));

import { GET, HEAD } from "./route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (path: string[], headers?: HeadersInit) => new Request(`http://localhost/api/media/${path.join("/")}`, { headers });

describe("GET /api/media/[...path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.storageClient.mockReturnValue({});
  });

  it("redirects a recorded Supabase video to a short-lived signed URL", async () => {
    const path = ["s", "studies", "study1", "patient1", "2026-10", "clip.mp4"];
    mock.submissions.mockResolvedValue([{ media_url: `/api/media/${path.join("/")}` }]);
    mock.signedUrlForStoragePath.mockResolvedValue("https://storage.example/signed-video");
    const result = await GET(request(path), context(path));
    expect(result.status).toBe(307);
    expect(result.headers.get("location")).toBe("https://storage.example/signed-video");
    expect(mock.submissions).toHaveBeenCalledWith({ participantId: "patient1" });
    expect(mock.signedUrlForStoragePath).toHaveBeenCalledWith("studies/study1/patient1/2026-10/clip.mp4", 600);
  });

  it("does not sign an unrecorded Storage object", async () => {
    const path = ["s", "studies", "study1", "patient1", "2026-10", "clip.mp4"];
    mock.submissions.mockResolvedValue([]);
    expect((await GET(request(path), context(path))).status).toBe(404);
    expect(mock.signedUrlForStoragePath).not.toHaveBeenCalled();
  });

  it("serves byte ranges from demo memory for video seeking", async () => {
    const path = ["mem", "clip.mp4"];
    mock.submissions.mockResolvedValue([{ media_url: "/api/media/mem/clip.mp4" }]);
    mock.readMemMedia.mockReturnValue({ bytes: new TextEncoder().encode("0123456789"), type: "video/mp4" });
    const result = await GET(request(path, { Range: "bytes=2-5" }), context(path));
    expect(result.status).toBe(206);
    expect(result.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await result.text()).toBe("2345");
    const head = await HEAD(request(path), context(path));
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("10");
  });

  it("rejects traversal segments", async () => {
    const path = ["s", "studies", "..", "private"];
    expect((await GET(request(path), context(path))).status).toBe(404);
    expect(mock.submissions).not.toHaveBeenCalled();
  });
});
