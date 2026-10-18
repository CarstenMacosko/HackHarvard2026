import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { backend } from "./backend";
import { PARTICIPANT_COOKIE } from "./session";
import type { PortalUser, PortalUserRole } from "./types";

export const RESEARCHER_COOKIE = "vf_researcher";
const SESSION_DAYS = 90;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function makePasswordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${hashPassword(password, salt)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(hashPassword(password, salt), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function newId(role: PortalUserRole) {
  return `${role}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  role: PortalUserRole;
  inviteCode?: string;
}): Promise<{ ok: true; user: PortalUser } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const displayName = input.displayName.trim();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  if (!displayName) return { ok: false, error: "Enter your name." };

  const db = backend();
  const existing = await db.portalUsers({ email });
  if (existing[0]) return { ok: false, error: "An account with that email already exists. Sign in instead." };

  let participantId: string | null = null;
  if (input.role === "participant") {
    const code = input.inviteCode?.trim();
    if (!code) return { ok: false, error: "Participants need a study invite code to sign up." };
    const [p] = await db.participants({ inviteCode: code });
    if (!p) return { ok: false, error: "Invite code not found." };
    if (p.status !== "invited" && p.status !== "active") {
      return { ok: false, error: `This invitation is ${p.status}.` };
    }
    participantId = p.id;
    if (p.status === "invited") {
      const now = new Date().toISOString();
      await db.updateParticipant(p.id, {
        status: "active",
        display_name: displayName,
        consented_at: now,
        enrolled_at: now,
      });
      await db.insertAudit({
        actor: p.id,
        action: "participant.enrolled",
        entity: "participant",
        entity_id: p.id,
        detail: { via: "sign_up", email },
      });
    }
  }

  const user: PortalUser = {
    id: newId(input.role),
    email,
    password_hash: makePasswordHash(password),
    role: input.role,
    display_name: displayName,
    participant_id: participantId,
    created_at: new Date().toISOString(),
  };
  await db.insertPortalUser(user);
  await setSessionCookies(user);
  return { ok: true, user: { ...user, password_hash: "" } };
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: PortalUser } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const [user] = await backend().portalUsers({ email });
  if (!user || !verifyPassword(input.password, user.password_hash)) {
    return { ok: false, error: "Email or password is incorrect." };
  }
  await setSessionCookies(user);
  return { ok: true, user: { ...user, password_hash: "" } };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(RESEARCHER_COOKIE);
  jar.delete(PARTICIPANT_COOKIE);
}

async function setSessionCookies(user: PortalUser) {
  const jar = await cookies();
  // One portal at a time — clear the other role so switching requires a fresh sign-in.
  jar.delete(RESEARCHER_COOKIE);
  jar.delete(PARTICIPANT_COOKIE);
  const opts = { path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: SESSION_DAYS * 24 * 60 * 60 };
  if (user.role === "researcher") {
    jar.set(RESEARCHER_COOKIE, user.id, opts);
  } else if (user.participant_id) {
    jar.set(PARTICIPANT_COOKIE, user.participant_id, opts);
  }
}

export async function currentResearcher(): Promise<PortalUser | null> {
  const id = (await cookies()).get(RESEARCHER_COOKIE)?.value;
  if (!id) return null;
  const [user] = await backend().portalUsers({ id });
  return user ?? null;
}

export async function requireResearcher(): Promise<PortalUser> {
  const user = await currentResearcher();
  if (!user || user.role !== "researcher") {
    throw new Error("UNAUTHORIZED_RESEARCHER");
  }
  return user;
}

export function researcherDisplayName(user: PortalUser | null): string {
  return user?.display_name ?? "Demo clinician";
}

/** Hackathon shortcut: ensure a local demo researcher session without a password form. */
export async function continueAsDemoResearcher(): Promise<void> {
  const db = backend();
  const email = "demo.researcher@visualfollowup.local";
  let [user] = await db.portalUsers({ email });
  if (!user) {
    user = {
      id: "researcher_demo",
      email,
      password_hash: makePasswordHash("demo-only"),
      role: "researcher",
      display_name: "Demo clinician",
      participant_id: null,
      created_at: new Date().toISOString(),
    };
    try {
      await db.insertPortalUser(user);
    } catch {
      [user] = await db.portalUsers({ email });
    }
  }
  if (user) await setSessionCookies(user);
}

/** Opaque token for CSRF-ish form posts (not a secret). */
export function formToken(): string {
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 16);
}
