import "server-only";

const secret = () => process.env.AGENT_INTERNAL_SECRET || process.env.CV_CALLBACK_SECRET || "";

/** Fire-and-forget a command to the messaging agent (Photon or dev). */
export async function notifyAgent(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const base = process.env.AGENT_URL?.replace(/\/$/, "");
  if (!base) return { ok: false, error: "AGENT_URL is not set" };
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-secret": secret() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "agent unreachable" };
  }
}

export function agentSecretOk(header: string | null): boolean {
  const expected = secret();
  return !expected || header === expected;
}
