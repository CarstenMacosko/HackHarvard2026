import "server-only";
import {
  createComputer,
  getComputer,
  getComputerByName,
  MANAGED_COMPUTER_MAX_RETRIES,
  restartComputer,
  type Computer,
} from "@factory/droid-sdk";

/**
 * Run Droid on a Factory managed computer (e2b) via the HTTP Sessions API.
 *
 * WebSocket relay auth requires a user JWT and rejects FACTORY_API_KEY
 * (`relay_unauthorized`). The Sessions REST API accepts the API key and is
 * what works on Vercel.
 */

const POLL_MS = 2_000;
const TURN_TIMEOUT_MS = 240_000;
const DEFAULT_COMPUTER_NAME = "vf-streamcare-draft";
const DEFAULT_REMOTE_USER = "ubuntu";
const DEFAULT_API_BASE = "https://api.factory.ai";
const SESSION_CWD = "/tmp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function factoryBaseUrl(): string {
  return process.env.FACTORY_API_BASE_URL?.trim() || DEFAULT_API_BASE;
}

function computerName(): string {
  return process.env.FACTORY_COMPUTER_NAME?.trim() || DEFAULT_COMPUTER_NAME;
}

function remoteUser(): string {
  return process.env.FACTORY_COMPUTER_REMOTE_USER?.trim() || DEFAULT_REMOTE_USER;
}

function isNotFoundError(error: unknown): boolean {
  const code = (error as { code?: number } | null)?.code;
  if (code === 404) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /\b404\b|not found/i.test(msg);
}

async function factoryApi<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${factoryBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Factory API ${method} ${path} returned non-JSON (${res.status})`);
    }
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json && typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : text.slice(0, 240) || res.statusText;
    throw new Error(`Factory API ${method} ${path} failed (${res.status}): ${message}`);
  }
  return json as T;
}

async function getOrCreateComputer(apiKey: string): Promise<Computer> {
  const name = computerName();
  const baseUrl = factoryBaseUrl();
  try {
    return await getComputerByName({ apiKey, name, baseUrl });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return await createComputer({
      apiKey,
      name,
      remoteUser: remoteUser(),
      provider: "e2b",
      baseUrl,
    });
  }
}

async function waitUntilActive(apiKey: string, computerId: string): Promise<Computer> {
  const baseUrl = factoryBaseUrl();
  let latest = await getComputer({ apiKey, computerId, baseUrl });
  for (let attempt = 0; attempt < MANAGED_COMPUTER_MAX_RETRIES; attempt++) {
    if (latest.status === "active" && latest.relayClientUrl) return latest;
    if (latest.status === "error") {
      throw new Error(`Factory managed computer ${computerId} entered error state`);
    }
    await sleep(POLL_MS);
    latest = await getComputer({ apiKey, computerId, baseUrl });
  }
  throw new Error(
    `Timed out waiting for Factory managed computer ${computerId} (status=${latest.status ?? "unknown"})`,
  );
}

/** Ensure a named e2b computer exists and is active. */
export async function ensureManagedComputer(apiKey: string): Promise<Computer> {
  const existing = await getOrCreateComputer(apiKey);
  if (existing.status === "active" && existing.relayClientUrl) return existing;
  const baseUrl = factoryBaseUrl();
  await restartComputer({ apiKey, computerId: existing.id, baseUrl });
  return waitUntilActive(apiKey, existing.id);
}

type SessionRow = {
  sessionId: string;
  status: "idle" | "pending" | "running" | string;
  messageCount: number;
  computerId?: string;
};

type SessionMessage = {
  id?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string } | string>;
  parentId?: string;
  seq?: number;
};

function extractText(message: SessionMessage): string {
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .join("")
    .trim();
}

/**
 * Run a single prompt on a Factory managed computer via HTTP Sessions API.
 * Polls until the session returns to idle with an assistant reply.
 */
export async function runPromptOnManagedComputer(prompt: string, apiKey: string): Promise<string> {
  const computer = await ensureManagedComputer(apiKey);

  const session = await factoryApi<SessionRow>(apiKey, "POST", "/api/v0/sessions", {
    computerId: computer.id,
    cwd: SESSION_CWD,
  });
  if (!session?.sessionId) throw new Error("Factory Sessions API did not return a sessionId");

  const sessionPath = `/api/v0/sessions/${encodeURIComponent(session.sessionId)}`;
  try {
    const sent = await factoryApi<{ messageId: string; status: string }>(apiKey, "POST", `${sessionPath}/messages`, {
      text: prompt,
    });
    if (!sent?.messageId) throw new Error("Factory Sessions API did not accept the prompt");

    const deadline = Date.now() + TURN_TIMEOUT_MS;
    let lastStatus = session.status;
    let idleWithoutReply = 0;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const [state, page] = await Promise.all([
        factoryApi<SessionRow>(apiKey, "GET", sessionPath),
        factoryApi<{ messages: SessionMessage[] }>(apiKey, "GET", `${sessionPath}/messages?limit=50`),
      ]);
      lastStatus = state.status;
      const messages = page.messages ?? [];

      // Prefer the assistant turn that replies to our user message.
      const tied = messages
        .filter((m) => m.role === "assistant" && m.parentId === sent.messageId)
        .map(extractText)
        .filter(Boolean);
      const allAssistant = messages.filter((m) => m.role === "assistant").map(extractText).filter(Boolean);
      const text = (tied.length ? tied : allAssistant).join("\n").trim();

      if (text && (state.status === "idle" || tied.length > 0)) {
        return text;
      }

      if (state.status === "idle") {
        idleWithoutReply += 1;
        // Allow a couple of idle polls for late message persistence.
        if (idleWithoutReply >= 3) {
          throw new Error(
            `Managed computer session went idle without an assistant reply (messages=${messages.length}, count=${state.messageCount})`,
          );
        }
      } else {
        idleWithoutReply = 0;
      }
    }
    throw new Error(`Managed computer turn timed out after ${TURN_TIMEOUT_MS / 1000}s (last status=${lastStatus})`);
  } finally {
    await factoryApi(apiKey, "DELETE", sessionPath).catch(() => {
      /* best-effort cleanup */
    });
  }
}

export function managedComputerLabel(): string {
  return `managed-computer:${computerName()}`;
}
