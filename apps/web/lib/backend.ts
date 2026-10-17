import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CvModel as CvModelSchema, Protocol, type Observation, type RewardEvent } from "@vf/shared";
import { demoState } from "./demo-data";
import type { AuditEntry, CvModel, Participant, Redemption, ScheduledTask, Study, Submission } from "./types";

/**
 * Storage backend. With NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set it talks to
 * Supabase; otherwise it uses the in-memory synthetic dataset in demo-data.ts (mutations last
 * until the server restarts). Server-only: the service role key bypasses RLS.
 */
export interface Backend {
  mode: "supabase" | "demo";
  studies(): Promise<Study[]>;
  participants(f?: { studyId?: string; id?: string; inviteCode?: string }): Promise<Participant[]>;
  observations(f?: { participantId?: string; studyId?: string; status?: Observation["review_status"]; id?: string }): Promise<Observation[]>;
  submissions(f?: { participantId?: string; studyId?: string; id?: string }): Promise<Submission[]>;
  scheduledTasks(participantIds?: string[]): Promise<ScheduledTask[]>;
  rewardEvents(participantId?: string): Promise<RewardEvent[]>;
  redemptions(participantId: string): Promise<Redemption[]>;
  models(f?: { id?: string }): Promise<CvModel[]>;
  audit(f?: { entityId?: string; limit?: number }): Promise<AuditEntry[]>;
  updateObservation(id: string, patch: Partial<Observation>): Promise<void>;
  insertObservation(o: Observation): Promise<void>;
  insertSubmission(s: Submission): Promise<void>;
  updateScheduledTask(id: string, patch: Partial<ScheduledTask>): Promise<void>;
  insertRewardEvents(e: RewardEvent[]): Promise<void>;
  insertRedemption(r: Redemption): Promise<void>;
  insertParticipant(p: Participant): Promise<void>;
  updateParticipant(id: string, patch: Partial<Participant>): Promise<void>;
  insertModel(m: CvModel): Promise<void>;
  updateModel(id: string, patch: Partial<CvModel>): Promise<void>;
  insertAudit(a: Omit<AuditEntry, "id" | "created_at">): Promise<void>;
}

const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);

const demoBackend: Backend = {
  mode: "demo",
  studies: async () => demoState().studies,
  participants: async (f = {}) =>
    demoState().participants.filter(
      (p) => (!f.studyId || p.study_id === f.studyId) && (!f.id || p.id === f.id) && (!f.inviteCode || p.invite_code.toUpperCase() === f.inviteCode.trim().toUpperCase()),
    ),
  observations: async (f = {}) =>
    demoState()
      .observations.filter(
        (o) =>
          (!f.participantId || o.participant_id === f.participantId) &&
          (!f.studyId || o.study_id === f.studyId) &&
          (!f.status || o.review_status === f.status) &&
          (!f.id || o.id === f.id),
      )
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
  submissions: async (f = {}) =>
    demoState()
      .submissions.filter((s) => (!f.participantId || s.participant_id === f.participantId) && (!f.studyId || s.study_id === f.studyId) && (!f.id || s.id === f.id))
      .sort(byTime),
  scheduledTasks: async (ids) => demoState().scheduledTasks.filter((t) => !ids || ids.includes(t.participant_id)),
  rewardEvents: async (pid) => demoState().rewardEvents.filter((e) => !pid || e.participant_id === pid),
  redemptions: async (pid) => demoState().redemptions.filter((r) => r.participant_id === pid),
  models: async (f = {}) => demoState().models.filter((m) => !f.id || m.id === f.id),
  audit: async (f = {}) => {
    const rows = demoState().audit.filter((a) => !f.entityId || a.entity_id === f.entityId).sort(byTime).reverse();
    return f.limit ? rows.slice(0, f.limit) : rows;
  },
  updateObservation: async (id, patch) => {
    const o = demoState().observations.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  },
  insertObservation: async (o) => {
    demoState().observations.push(o);
  },
  insertSubmission: async (s) => {
    demoState().submissions.push(s);
  },
  updateScheduledTask: async (id, patch) => {
    const t = demoState().scheduledTasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  },
  insertRewardEvents: async (e) => {
    demoState().rewardEvents.push(...e);
  },
  insertRedemption: async (r) => {
    demoState().redemptions.push(r);
  },
  insertParticipant: async (p) => {
    demoState().participants.push(p);
  },
  updateParticipant: async (id, patch) => {
    const p = demoState().participants.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  },
  insertModel: async (m) => {
    demoState().models.push(m);
  },
  updateModel: async (id, patch) => {
    const m = demoState().models.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  },
  insertAudit: async (a) => {
    const s = demoState();
    s.audit.push({ ...a, id: `aud_${Date.now().toString(36)}_${s.audit.length}`, created_at: new Date().toISOString() });
  },
};

function supabaseBackend(db: SupabaseClient): Backend {
  const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  return {
    mode: "supabase",
    async studies() {
      const rows = must(await db.from("studies").select("id, name, condition, status, protocols(version, config)"));
      return (rows as Array<Omit<Study, "protocol"> & { protocols: { version: number; config: unknown }[] }>).map((s) => {
        const latest = [...s.protocols].sort((a, b) => b.version - a.version)[0];
        return { id: s.id, name: s.name, condition: s.condition, status: s.status, protocol: Protocol.parse(latest?.config) };
      });
    },
    async participants(f = {}) {
      let q = db.from("participants").select("id, study_id, display_name, phone, invite_code, status, enrolled_at, preferred_time");
      if (f.studyId) q = q.eq("study_id", f.studyId);
      if (f.id) q = q.eq("id", f.id);
      if (f.inviteCode) q = q.ilike("invite_code", f.inviteCode.trim());
      return must(await q) as Participant[];
    },
    async observations(f = {}) {
      let q = db.from("observations").select("*").order("captured_at");
      if (f.participantId) q = q.eq("participant_id", f.participantId);
      if (f.studyId) q = q.eq("study_id", f.studyId);
      if (f.status) q = q.eq("review_status", f.status);
      if (f.id) q = q.eq("id", f.id);
      return must(await q) as Observation[];
    },
    async submissions(f = {}) {
      let q = db
        .from("submissions")
        .select("id, participant_id, study_id, task_id, scheduled_task_id, attempt, source, media_type, media_url, analysis_runtime, quality, accepted, observation_id, escalated, created_at")
        .order("created_at");
      if (f.participantId) q = q.eq("participant_id", f.participantId);
      if (f.studyId) q = q.eq("study_id", f.studyId);
      if (f.id) q = q.eq("id", f.id);
      return must(await q) as Submission[];
    },
    async scheduledTasks(ids) {
      let q = db.from("scheduled_tasks").select("id, participant_id, task_id, due_at, window_hours, status, completed_at");
      if (ids) q = q.in("participant_id", ids);
      return must(await q) as ScheduledTask[];
    },
    async rewardEvents(pid) {
      let q = db.from("reward_events").select("*").order("created_at");
      if (pid) q = q.eq("participant_id", pid);
      return must(await q) as RewardEvent[];
    },
    async redemptions(pid) {
      return must(await db.from("redemptions").select("*").eq("participant_id", pid).order("created_at")) as Redemption[];
    },
    async models(f = {}) {
      let q = db.from("cv_models").select("*").order("created_at");
      if (f.id) q = q.eq("id", f.id);
      return (must(await q) as unknown[]).map((m) => CvModelSchema.parse(m));
    },
    async audit(f = {}) {
      let q = db.from("audit_log").select("*").order("created_at", { ascending: false });
      if (f.entityId) q = q.eq("entity_id", f.entityId);
      if (f.limit) q = q.limit(f.limit);
      return (must(await q) as (AuditEntry & { id: number })[]).map((a) => ({ ...a, id: String(a.id) }));
    },
    async updateObservation(id, patch) {
      must(await db.from("observations").update(patch).eq("id", id));
    },
    async insertObservation(o) {
      must(await db.from("observations").upsert(o));
    },
    async insertSubmission(s) {
      must(await db.from("submissions").insert(s));
    },
    async updateScheduledTask(id, patch) {
      must(await db.from("scheduled_tasks").update(patch).eq("id", id));
    },
    async insertRewardEvents(e) {
      if (e.length) must(await db.from("reward_events").upsert(e));
    },
    async insertRedemption(r) {
      must(await db.from("redemptions").insert(r));
    },
    async insertParticipant(p) {
      must(await db.from("participants").insert(p));
    },
    async updateParticipant(id, patch) {
      must(await db.from("participants").update(patch).eq("id", id));
    },
    async insertModel(m) {
      must(await db.from("cv_models").insert(m));
    },
    async updateModel(id, patch) {
      must(await db.from("cv_models").update(patch).eq("id", id));
    },
    async insertAudit(a) {
      must(await db.from("audit_log").insert(a));
    },
  };
}

let cached: Backend | undefined;
export function backend(): Backend {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? supabaseBackend(createClient(url, key, { auth: { persistSession: false } })) : demoBackend;
  return cached;
}

/** Admin client for Storage (signed upload/download URLs); null in demo mode. */
export function storageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
