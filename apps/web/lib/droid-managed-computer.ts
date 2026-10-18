import "server-only";
import { randomUUID } from "node:crypto";
import {
  AutonomyLevel,
  createComputer,
  createWebSocketDaemonClient,
  convertNotificationToStreamMessage,
  DaemonSessionController,
  DroidEvent,
  DroidMessageType,
  getComputer,
  getComputerByName,
  MachineType,
  MANAGED_COMPUTER_MAX_RETRIES,
  MACHINE_TYPE_WEBSOCKET_OVERRIDES,
  MultiSessionStateManager,
  restartComputer,
  SDK_VERSION,
  SessionPlatform,
  ToolConfirmationOutcome,
  type Computer,
  type PendingAskUserRequest,
  type PendingPermission,
} from "@factory/droid-sdk";

const POLL_MS = 2_000;
const TURN_TIMEOUT_MS = 240_000;
const DEFAULT_COMPUTER_NAME = "vf-streamcare-draft";
const DEFAULT_REMOTE_USER = "ubuntu";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function factoryBaseUrl(): string | undefined {
  const u = process.env.FACTORY_API_BASE_URL?.trim();
  return u || undefined;
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

/**
 * Ensure a named e2b computer exists, wake it if needed, and return it with an
 * active relayClientUrl.
 */
export async function ensureManagedComputer(apiKey: string): Promise<Computer> {
  const existing = await getOrCreateComputer(apiKey);
  if (existing.status === "active" && existing.relayClientUrl) return existing;

  const baseUrl = factoryBaseUrl();
  // Cold-start / hibernation wake — required before relay connect.
  await restartComputer({ apiKey, computerId: existing.id, baseUrl });
  return waitUntilActive(apiKey, existing.id);
}

/** Session cwd on the managed sandbox — /tmp always exists; we only need text output. */
const SESSION_CWD = "/tmp";

/**
 * Run a single prompt on a Factory managed computer (e2b) via the daemon relay.
 *
 * Uses computer machineType + relay handshake (API key as relay access token) and
 * daemon.authenticate with the API-key credential shape. Collects assistant text
 * until agent_turn_completed. Auto-rejects tool/ask-user prompts so the model
 * returns text (same intent as local `autoRejectPermissionRequests`).
 */
export async function runPromptOnManagedComputer(prompt: string, apiKey: string): Promise<string> {
  const computer = await ensureManagedComputer(apiKey);
  if (!computer.relayClientUrl) {
    throw new Error("Managed computer is active but missing relayClientUrl");
  }

  const wsOverrides = MACHINE_TYPE_WEBSOCKET_OVERRIDES[MachineType.Computer] ?? {};
  const baseUrl = factoryBaseUrl();

  // Bypass createWebSocketDaemonClientFromConfig's API-key rejection for relay:
  // pass the key as the relay access-token string, and use { apiKey } for daemon auth.
  const daemonClient = createWebSocketDaemonClient({
    machineType: MachineType.Computer,
    providerType: computer.providerType,
    getAccessToken: async () => apiKey,
  });

  const controller = new DaemonSessionController({
    sessionStateManager: new MultiSessionStateManager(),
    daemonClient,
    config: {
      machineId: computer.id,
      machineType: MachineType.Computer,
      isManaged: true,
      providerType: computer.providerType,
      url: computer.relayClientUrl,
      clientType: "sdk",
      sdk: { language: "typescript", version: SDK_VERSION },
      getCredential: async () => ({ apiKey }),
      ensureRunning: async () => {
        const current = await getComputer({ apiKey, computerId: computer.id, baseUrl });
        if (current.status === "active" && current.relayClientUrl) {
          return { wasRestarted: false };
        }
        await restartComputer({ apiKey, computerId: computer.id, baseUrl });
        await waitUntilActive(apiKey, computer.id);
        return { wasRestarted: true };
      },
      connectionTimeoutMs: wsOverrides.connectionTimeoutMs ?? 45_000,
      requestTimeout: 180_000,
      maxPollAttempts: MANAGED_COMPUTER_MAX_RETRIES,
      maxReconnectAttempts: 3,
      reconnectInterval: wsOverrides.initialRetryDelayMs ?? 2_000,
      maxReconnectDelay: wsOverrides.maxRetryDelayMs ?? 10_000,
      reconnectBackoffFactor: 1.5,
      supportsTerminalRestoreOnLoad: false,
    },
  });

  await controller.attemptInitialConnection();

  const sessionId = randomUUID();
  const turnId = randomUUID();
  const assistantChunks: string[] = [];
  let turnFailure: Error | null = null;
  let settleTurn: (() => void) | null = null;
  const turnDone = new Promise<void>((resolve) => {
    settleTurn = resolve;
  });

  const onPermission = (permission: PendingPermission) => {
    void controller
      .respondToPermission({
        permissionId: permission.requestId,
        sessionId: permission.sessionId,
        selectedOption: ToolConfirmationOutcome.Cancel,
      })
      .catch(() => {
        /* best-effort reject */
      });
  };

  const onAskUser = (request: PendingAskUserRequest) => {
    void controller
      .respondToAskUser({
        requestId: request.requestId,
        sessionId: request.sessionId,
        result: { cancelled: true, answers: [] },
      })
      .catch(() => {
        /* best-effort cancel */
      });
  };

  const onNotification = (params: { sessionId: string; notification: unknown }) => {
    if (params.sessionId !== sessionId) return;
    const inner = params.notification as {
      type?: string;
      turnId?: string;
      reason?: string;
    };

    if (inner.type === "agent_turn_completed") {
      if (inner.turnId !== undefined && inner.turnId !== turnId) return;
      if (inner.reason === "cancelled" || inner.reason === "permission_rejected") {
        // Still return any assistant text we collected (mirrors local auto-reject).
      } else if (inner.reason && inner.reason !== "completed" && inner.reason !== "spec_handoff") {
        turnFailure = new Error(`Managed computer turn ended: ${inner.reason}`);
      }
      settleTurn?.();
      return;
    }

    const converted = convertNotificationToStreamMessage(params.notification);
    if (converted == null) return;
    const messages = Array.isArray(converted) ? converted : [converted];
    for (const msg of messages) {
      if (msg.type === DroidMessageType.Assistant && typeof (msg as { text?: string }).text === "string") {
        const text = (msg as { text: string }).text.trim();
        if (text) assistantChunks.push(text);
      }
      if (msg.type === DroidMessageType.Error) {
        turnFailure = new Error((msg as { message: string }).message || "Droid stream error");
      }
    }
  };

  controller.on(DroidEvent.PermissionRequested, onPermission);
  controller.on(DroidEvent.AskUserRequested, onAskUser);
  controller.on(DroidEvent.SessionNotification, onNotification);

  try {
    // SessionOrigin.Sdk ("sdk") is not re-exported from the package entrypoint.
    await controller.initializeSession({
      sessionId,
      machineId: "local",
      cwd: SESSION_CWD,
      token: apiKey,
      autonomyLevel: AutonomyLevel.Off,
      sessionOriginHint: "sdk",
      sessionSource: {
        platform: SessionPlatform.Api,
        delegationSessionId: sessionId,
      },
    } as Parameters<DaemonSessionController["initializeSession"]>[0]);

    await controller.addUserMessage(sessionId, {
      messageId: turnId,
      text: prompt,
    });

    let timedOut = false;
    await Promise.race([
      turnDone,
      sleep(TURN_TIMEOUT_MS).then(() => {
        timedOut = true;
      }),
    ]);
    if (timedOut) {
      throw new Error(`Managed computer turn timed out after ${TURN_TIMEOUT_MS / 1000}s`);
    }
    if (turnFailure) throw turnFailure;

    const text = assistantChunks.join("\n").trim();
    if (!text) {
      throw new Error("Managed computer returned no assistant text");
    }
    return text;
  } finally {
    controller.off(DroidEvent.PermissionRequested, onPermission);
    controller.off(DroidEvent.AskUserRequested, onAskUser);
    controller.off(DroidEvent.SessionNotification, onNotification);
    await controller.closeSession(sessionId).catch(() => {
      /* session may already be closed */
    });
    controller.disconnect();
  }
}

export function managedComputerLabel(): string {
  return `managed-computer:${computerName()}`;
}
