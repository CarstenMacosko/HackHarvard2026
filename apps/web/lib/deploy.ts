import "server-only";

/** True on Vercel or any NODE_ENV=production host (not local `next dev`). */
export function isHostedDeploy(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

/**
 * In-memory demo is for local `npm run dev` only.
 * On Vercel every serverless instance has its own empty memory — using demo there
 * causes redirect loops (demo-continue) and writes that never stick.
 */
export function allowInMemoryDemo(): boolean {
  return !isHostedDeploy();
}

/** Session cookies must be Secure on HTTPS (Vercel) or browsers may drop them. */
export function sessionCookieOptions(maxAgeSeconds = 90 * 24 * 60 * 60) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHostedDeploy(),
    maxAge: maxAgeSeconds,
  };
}
