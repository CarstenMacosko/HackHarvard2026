import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Protocol, isOpen, planSchedule, type CheckIn, type RewardEvent } from "@vf/shared";
import type { ConvState } from "./conversation";
import type { DueCheckIn, LoggedMessage, ParticipantRecord, Store, StoredMedia } from "./store";

/**
 * The agent's Supabase store (schema: supabase/migrations, docs/DATABASE.md). Uses the service
 * role key, server-side only. Reads participants (by phone), protocols and the reward ledger;
 * writes agent_conversations, messages, scheduled_tasks (prompting, missed, escalated), audit_log
 * and inbound attachments in the private media bucket.
 */

const MEDIA_BUCKET = "media";
const MEDIA_PROXY = "/api/media/s/"; // the web app serves stored media through short-lived signed URLs
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

interface Saved {
  conv: ConvState;
  lastPromptedAt: Record<string, string>;
  checkInId?: string | null;
}

interface ParticipantRow {
  id: string;
  study_id: string;
  phone: string;
  display_name: string;
  preferred_time: string | null;
  timezone: string | null;
}

export function supabaseFromEnv(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** Has the participant's preferred reminder time passed today (in their time zone)? Due dates before today always count. */
export function reminderTimeReached(now: Date, dueAt: string, preferred: string | null | undefined, timezone = "America/New_York"): boolean {
  if (!preferred) return true;
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hourCycle: "h23", ...opts }).format(d);
  const day = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  if (day(new Date(dueAt)) < day(now)) return true;
  return fmt(now, { hour: "2-digit", minute: "2-digit" }) >= preferred.slice(0, 5);
}

export class SupabaseStore implements Store {
  readonly kind = "supabase";
  constructor(private readonly db: SupabaseClient) {}

  private must<T>(r: { data: unknown; error: { message: string } | null }): T {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  }

  private async protocols(studyIds: string[]): Promise<Map<string, Protocol>> {
    const rows = this.must<{ study_id: string; version: number; config: unknown }[]>(
      await this.db.from("protocols").select("study_id, version, config").in("study_id", studyIds).order("version", { ascending: false }),
    );
    const out = new Map<string, Protocol>();
    for (const r of rows) if (!out.has(r.study_id)) out.set(r.study_id, Protocol.parse(r.config));
    return out;
  }

  private async load(rows: ParticipantRow[]): Promise<ParticipantRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [protocols, convs, events] = await Promise.all([
      this.protocols([...new Set(rows.map((r) => r.study_id))]),
      this.db.from("agent_conversations").select("participant_id, state").in("participant_id", ids).then((r) => this.must<{ participant_id: string; state: Saved }[]>(r)),
      this.db.from("reward_events").select("id, participant_id, kind, points, reason, created_at").in("participant_id", ids).then((r) => this.must<RewardEvent[]>(r)),
    ]);
    return rows.flatMap((r) => {
      const protocol = protocols.get(r.study_id);
      if (!protocol) return [];
      const saved = convs.find((c) => c.participant_id === r.id)?.state;
      return [{
        id: r.id,
        studyId: r.study_id,
        address: r.phone,
        name: r.display_name,
        tasks: protocol.tasks,
        rewards: protocol.rewards,
        conv: saved?.conv ?? { kind: "idle" },
        acceptedAt: [],
        rewardEvents: events.filter((e) => e.participant_id === r.id),
        lastPromptedAt: saved?.lastPromptedAt ?? {},
        checkInId: saved?.checkInId ?? null,
        preferredTime: r.preferred_time,
        timezone: r.timezone,
      }];
    });
  }

  private activeParticipants(phone?: string) {
    let q = this.db.from("participants").select("id, study_id, phone, display_name, preferred_time, timezone").eq("status", "active").not("phone", "is", null);
    if (phone) q = q.eq("phone", phone);
    return q;
  }

  async byAddress(address: string) {
    const rows = this.must<ParticipantRow[]>(await this.activeParticipants(address).limit(1));
    return (await this.load(rows))[0];
  }

  async save(p: ParticipantRecord) {
    const prompted = Object.values(p.lastPromptedAt).sort().at(-1) ?? null;
    const state: Saved = { conv: p.conv, lastPromptedAt: p.lastPromptedAt, checkInId: p.checkInId ?? null };
    this.must(
      await this.db
        .from("agent_conversations")
        .upsert({ participant_id: p.id, channel: process.env.AGENT_CHANNEL ?? "dev", address: p.address, state, last_prompted_at: prompted }, { onConflict: "participant_id" }),
    );
  }

  async logMessage(m: LoggedMessage) {
    const { error } = await this.db.from("messages").insert({
      participant_id: m.participantId,
      direction: m.direction,
      channel: process.env.AGENT_CHANNEL ?? "dev",
      body: m.body,
      media_path: m.mediaPath ?? null,
      scheduled_task_id: m.checkInId ?? null,
      meta: m.meta ?? {},
    });
    if (error) console.warn(`message log failed: ${error.message}`); // never block the conversation on the log
  }

  async dueCheckIns(now: Date): Promise<DueCheckIn[]> {
    const participants = await this.load(this.must<ParticipantRow[]>(await this.activeParticipants()));
    if (!participants.length) return [];
    const tasks = this.must<CheckIn[]>(
      await this.db.from("scheduled_tasks").select("id, participant_id, task_id, due_at, window_hours, status").in("participant_id", participants.map((p) => p.id)),
    );
    // same rules as the web app (packages/shared/src/schedule.ts): expired → missed, next one created
    const missed: string[] = [];
    const create: ReturnType<typeof planSchedule>["create"] = [];
    for (const p of participants) {
      const plan = planSchedule(p.id, p.tasks, tasks.filter((t) => t.participant_id === p.id), now);
      missed.push(...plan.missed);
      create.push(...plan.create);
    }
    if (missed.length) this.must(await this.db.from("scheduled_tasks").update({ status: "missed" }).in("id", missed).in("status", ["pending", "prompted"]));
    let current = tasks.filter((t) => !missed.includes(t.id));
    if (create.length) {
      this.must(await this.db.from("scheduled_tasks").upsert(create, { onConflict: "participant_id,task_id,due_at", ignoreDuplicates: true }));
      current = this.must<CheckIn[]>(
        await this.db.from("scheduled_tasks").select("id, participant_id, task_id, due_at, window_hours, status").in("participant_id", participants.map((p) => p.id)),
      );
    }
    return current
      .filter((t) => t.status === "pending" && isOpen(t) && new Date(t.due_at) <= now)
      .flatMap((t) => {
        const participant = participants.find((p) => p.id === t.participant_id)!;
        return reminderTimeReached(now, t.due_at, participant.preferredTime, participant.timezone ?? undefined) ? [{ participant, checkInId: t.id, taskId: t.task_id, dueAt: t.due_at }] : [];
      });
  }

  async markPrompted(checkInId: string, at: Date) {
    this.must(await this.db.from("scheduled_tasks").update({ status: "prompted", prompted_at: at.toISOString() }).eq("id", checkInId).eq("status", "pending"));
  }

  async escalate(p: ParticipantRecord, taskId: string, reason: string) {
    // the web app's ingest escalates the check-in on the third unusable attempt as well; both are idempotent
    if (p.checkInId) this.must(await this.db.from("scheduled_tasks").update({ status: "escalated" }).eq("id", p.checkInId).in("status", ["pending", "prompted"]));
    this.must(await this.db.from("audit_log").insert({ actor: "agent", action: "checkin.escalated", entity: "participant", entity_id: p.id, detail: { task_id: taskId, check_in: p.checkInId ?? null, reason } }));
  }

  async storeMedia(p: ParticipantRecord, url: string, contentType: string): Promise<StoredMedia> {
    let bytes: Uint8Array;
    let type = contentType;
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not download the attachment (${res.status})`);
      bytes = new Uint8Array(await res.arrayBuffer());
      type = (res.headers.get("content-type") ?? contentType).split(";")[0];
    } else {
      bytes = new Uint8Array(await readFile(url)); // dev adapter: a local file
    }
    const ext = EXT[type] ?? (extname(url).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin");
    const path = `studies/${p.studyId}/${p.id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
    this.must(await this.db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: false }));
    const signed = this.must<{ signedUrl: string }>(await this.db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600));
    return { analyzeUrl: signed.signedUrl, mediaUrl: MEDIA_PROXY + path };
  }
}
