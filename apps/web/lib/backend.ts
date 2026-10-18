import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CvModel as CvModelSchema, Protocol, isOpen, type Observation, type RewardEvent, type SchedulePlan } from "@vf/shared";
import { demoFreshSession, demoState, persistDemoState } from "./demo-data";
import type {
  AuditEntry,
  CaptureRecord,
  CaptureResult,
  CvModel,
  DraftRecord,
  DroidJob,
  Message,
  ObservationNote,
  Participant,
  PortalUser,
  Redemption,
  Review,
  ScheduledTask,
  Study,
  Submission,
} from "./types";

/**
 * Storage backend. With NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set it talks to
 * Supabase (schema: supabase/migrations, documented in docs/DATABASE.md); otherwise it uses the
 * empty in-memory store in demo-data.ts (mutations last until the server restarts).
 * Both implementations keep the same semantics. Server-only: the service role key bypasses RLS.
 */
export interface Backend {
  mode: "supabase" | "demo";
  studies(): Promise<Study[]>;
  participants(f?: { studyId?: string; id?: string; inviteCode?: string; phone?: string }): Promise<Participant[]>;
  observations(f?: { participantId?: string; studyId?: string; status?: Observation["review_status"]; id?: string }): Promise<Observation[]>;
  submissions(f?: { participantId?: string; studyId?: string; id?: string }): Promise<Submission[]>;
  scheduledTasks(participantIds?: string[]): Promise<ScheduledTask[]>;
  rewardEvents(participantId?: string): Promise<RewardEvent[]>;
  redemptions(participantId: string): Promise<Redemption[]>;
  models(f?: { id?: string }): Promise<CvModel[]>;
  audit(f?: { entityId?: string; limit?: number }): Promise<AuditEntry[]>;
  reviews(observationId: string): Promise<Review[]>;
  messages(participantId: string, limit?: number): Promise<Message[]>;
  drafts(f?: { id?: string }): Promise<DraftRecord[]>;
  droidJobs(limit?: number): Promise<DroidJob[]>;

  /** Everything one capture writes, atomically; repeats of the same capture change nothing. */
  recordCapture(c: CaptureRecord): Promise<CaptureResult>;
  /** Mark expired check-ins missed and create the next ones (insert-if-absent). */
  applySchedule(plan: SchedulePlan): Promise<void>;
  updateScheduledTask(id: string, patch: Partial<ScheduledTask>): Promise<void>;
  updateObservation(id: string, patch: Partial<Observation>): Promise<void>;
  insertReview(r: Omit<Review, "id" | "created_at">): Promise<void>;
  insertRewardEvents(e: RewardEvent[]): Promise<void>;
  insertRedemption(r: Redemption): Promise<void>;
  insertParticipant(p: Participant): Promise<void>;
  /** One check-in (insert-if-absent on participant, task and due time). */
  insertScheduledTask(t: ScheduledTask): Promise<void>;
  updateParticipant(id: string, patch: Partial<Participant>): Promise<void>;
  /** A study and its first protocol version (New study form, or an approved builder draft). */
  insertStudy(s: Study): Promise<void>;
  /**
   * Hard-delete a study and all tied product data (participants, captures, rewards, drafts for that study).
   * Created modules / droid jobs are kept so generated CV modules stay usable.
   */
  deleteStudy(studyId: string): Promise<void>;
  insertDraft(d: DraftRecord): Promise<void>;
  updateDraft(id: string, patch: Partial<DraftRecord>): Promise<void>;
  insertDroidJob(j: DroidJob): Promise<void>;
  updateDroidJob(id: string, patch: Partial<DroidJob>): Promise<void>;
  insertModel(m: CvModel): Promise<void>;
  updateModel(id: string, patch: Partial<CvModel>): Promise<void>;
  insertAudit(a: Omit<AuditEntry, "id" | "created_at">): Promise<void>;
  portalUsers(f?: { id?: string; email?: string }): Promise<PortalUser[]>;
  insertPortalUser(u: PortalUser): Promise<void>;
  observationNotes(observationId: string): Promise<ObservationNote[]>;
  insertObservationNote(n: ObservationNote): Promise<void>;
  health(): Promise<Health>;
}

export interface Health {
  ok: boolean;
  tables: { name: string; rows: number | null; error?: string }[];
  bucket: { ok: boolean; detail: string };
}

/** Thrown for constraint violations the caller can explain (e.g. a phone number already enrolled). */
export class ConflictError extends Error {}

export const TABLES = [
  "studies", "protocols", "participants", "scheduled_tasks", "submissions", "observations", "reviews", "reward_events", "redemptions",
  "cv_models", "workflow_drafts", "droid_jobs", "agent_conversations", "messages", "audit_log", "portal_users", "observation_notes",
] as const;
export const MEDIA_BUCKET = "media";

const byTime = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);
const now = () => new Date().toISOString();
const sameCode = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
/** Non-objective / trained-head outputs we no longer show in reviews, charts or exports. */
const HIDDEN_MEASUREMENTS = new Set([
  "severity_score",
  "eczema_likelihood",
  "psoriasis_likelihood",
  "scaling_likelihood",
  "tapping_score",
  "rest_tremor_score",
]);
const withoutHiddenMeasurements = (o: Observation): Observation => ({
  ...o,
  measurements: o.measurements.filter((m) => !HIDDEN_MEASUREMENTS.has(m.name)),
});

const demoBackend: Backend = {
  mode: "demo",
  studies: async () => demoState().studies,
  participants: async (f = {}) =>
    demoState().participants.filter(
      (p) => (!f.studyId || p.study_id === f.studyId) && (!f.id || p.id === f.id) && (!f.inviteCode || sameCode(p.invite_code, f.inviteCode)) && (!f.phone || p.phone === f.phone),
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
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at))
      .map(withoutHiddenMeasurements),
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
  reviews: async (oid) => demoState().reviews.filter((r) => r.observation_id === oid).sort(byTime),
  messages: async (pid, limit = 200) => demoState().messages.filter((m) => m.participant_id === pid).sort(byTime).slice(-limit),
  drafts: async (f = {}) => demoState().drafts.filter((d) => !f.id || d.id === f.id).sort(byTime).reverse(),
  droidJobs: async (limit = 20) => [...demoState().droidJobs].sort(byTime).reverse().slice(0, limit),

  recordCapture: async (c) => {
    const s = demoState();
    let observation_inserted = false;
    if (c.observation && !s.observations.some((o) => o.id === c.observation!.id)) {
      s.observations.push({ ...c.observation, review_status: "pending", reviewer: null, reviewed_at: null, review_note: null });
      observation_inserted = true;
    }
    if (!s.submissions.some((x) => x.id === c.submission.id)) s.submissions.push(c.submission);
    const fresh = c.reward_events.filter((e) => !s.rewardEvents.some((x) => x.id === e.id));
    s.rewardEvents.push(...fresh);
    let scheduled_task_updated = false;
    const t = c.scheduled_task && s.scheduledTasks.find((x) => x.id === c.scheduled_task!.id);
    if (t && isOpen(t)) {
      t.status = c.scheduled_task!.status;
      t.completed_at = c.scheduled_task!.completed_at ?? t.completed_at;
      scheduled_task_updated = true;
    }
    if (c.next_task) insertCheckIns([c.next_task]);
    s.audit.push({ ...c.audit, id: `aud_${Date.now().toString(36)}_${s.audit.length}`, created_at: now() });
    persistDemoState();
    return { observation_inserted, scheduled_task_updated, rewards_inserted: fresh.length };
  },
  applySchedule: async (plan) => {
    for (const t of demoState().scheduledTasks) if (plan.missed.includes(t.id) && isOpen(t)) t.status = "missed";
    insertCheckIns(plan.create);
    persistDemoState();
  },
  updateScheduledTask: async (id, patch) => {
    const t = demoState().scheduledTasks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    persistDemoState();
  },
  updateObservation: async (id, patch) => {
    const o = demoState().observations.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
    persistDemoState();
  },
  insertReview: async (r) => {
    demoState().reviews.push({ ...r, id: crypto.randomUUID(), created_at: now() });
    persistDemoState();
  },
  insertRewardEvents: async (e) => {
    const s = demoState();
    s.rewardEvents.push(...e.filter((x) => !s.rewardEvents.some((y) => y.id === x.id)));
    persistDemoState();
  },
  insertRedemption: async (r) => {
    demoState().redemptions.push(r);
    persistDemoState();
  },
  insertParticipant: async (p) => {
    const s = demoState();
    if (s.participants.some((x) => x.id === p.id || sameCode(x.invite_code, p.invite_code))) throw new ConflictError("That participant or invite code already exists.");
    s.participants.push(p);
    persistDemoState();
  },
  insertScheduledTask: async (t) => {
    const s = demoState();
    if (!s.scheduledTasks.some((x) => x.participant_id === t.participant_id && x.task_id === t.task_id && x.due_at === t.due_at)) s.scheduledTasks.push(t);
    persistDemoState();
  },
  updateParticipant: async (id, patch) => {
    const s = demoState();
    if (patch.phone && s.participants.some((x) => x.id !== id && x.phone === patch.phone)) throw new ConflictError("That phone number is already enrolled.");
    const p = s.participants.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    persistDemoState();
  },
  insertStudy: async (study) => {
    const s = demoState();
    if (s.studies.some((x) => x.id === study.id)) throw new ConflictError("That study already exists.");
    s.studies.push(study);
    persistDemoState();
  },
  deleteStudy: async (studyId) => {
    const s = demoState();
    const pids = new Set(s.participants.filter((p) => p.study_id === studyId).map((p) => p.id));
    const oids = new Set(s.observations.filter((o) => o.study_id === studyId || pids.has(o.participant_id)).map((o) => o.id));
    s.studies = s.studies.filter((x) => x.id !== studyId);
    s.participants = s.participants.filter((p) => p.study_id !== studyId);
    s.observations = s.observations.filter((o) => !oids.has(o.id));
    s.submissions = s.submissions.filter((x) => x.study_id !== studyId && !pids.has(x.participant_id));
    s.scheduledTasks = s.scheduledTasks.filter((t) => !pids.has(t.participant_id));
    s.rewardEvents = s.rewardEvents.filter((e) => !pids.has(e.participant_id));
    s.redemptions = s.redemptions.filter((r) => !pids.has(r.participant_id));
    s.reviews = s.reviews.filter((r) => !oids.has(r.observation_id));
    s.observationNotes = s.observationNotes.filter((n) => !oids.has(n.observation_id));
    s.messages = s.messages.filter((m) => !m.participant_id || !pids.has(m.participant_id));
    s.drafts = s.drafts.filter((d) => d.study_id !== studyId);
    s.models = s.models.filter((m) => m.study_id !== studyId);
    // Keep droid_jobs / created modules — reusable after study delete.
    s.audit = s.audit.filter((a) => a.entity_id !== studyId && !(a.entity === "study" && a.entity_id === studyId));
    persistDemoState();
  },
  insertDraft: async (d) => {
    demoState().drafts.push(d);
    persistDemoState();
  },
  updateDraft: async (id, patch) => {
    const d = demoState().drafts.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
    persistDemoState();
  },
  insertDroidJob: async (j) => {
    demoState().droidJobs.push(j);
    persistDemoState();
  },
  updateDroidJob: async (id, patch) => {
    const j = demoState().droidJobs.find((x) => x.id === id);
    if (j) Object.assign(j, patch, { updated_at: now() });
    persistDemoState();
  },
  insertModel: async (m) => {
    demoState().models.push(m);
    persistDemoState();
  },
  updateModel: async (id, patch) => {
    const m = demoState().models.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    persistDemoState();
  },
  insertAudit: async (a) => {
    const s = demoState();
    s.audit.push({ ...a, id: `aud_${Date.now().toString(36)}_${s.audit.length}`, created_at: now() });
    persistDemoState();
  },
  portalUsers: async (f = {}) =>
    demoState().portalUsers.filter(
      (u) => (!f.id || u.id === f.id) && (!f.email || u.email.toLowerCase() === f.email.toLowerCase()),
    ),
  insertPortalUser: async (u) => {
    const s = demoState();
    if (s.portalUsers.some((x) => x.email.toLowerCase() === u.email.toLowerCase())) throw new ConflictError("Email already registered.");
    s.portalUsers.push(u);
    persistDemoState();
  },
  observationNotes: async (observationId) =>
    demoState().observationNotes.filter((n) => n.observation_id === observationId).sort(byTime),
  insertObservationNote: async (n) => {
    demoState().observationNotes.push(n);
    persistDemoState();
  },
  health: async () => ({ ok: true, tables: [], bucket: { ok: true, detail: "persisted demo (.data/demo-state.json)" } }),
};

function insertCheckIns(rows: CaptureRecord["next_task"][]) {
  const s = demoState();
  for (const r of rows) {
    if (!r || s.scheduledTasks.some((t) => t.participant_id === r.participant_id && t.task_id === r.task_id && t.due_at === r.due_at)) continue;
    s.scheduledTasks.push({ ...r, id: crypto.randomUUID(), status: "pending", completed_at: null });
  }
}

type Result = { data: unknown; error: { message: string; code?: string } | null };

function supabaseBackend(db: SupabaseClient): Backend {
  const must = <T,>(r: Result): T => {
    if (r.error) {
      if (r.error.code === "23505") throw new ConflictError(r.error.message); // unique_violation
      throw new Error(r.error.message);
    }
    return r.data as T;
  };
  // PostgREST returns at most 1000 rows per request: page through every list read
  const PAGE = 1000;
  const all = async <T,>(query: () => { range(from: number, to: number): PromiseLike<Result> }): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = must<T[]>(await query().range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  };

  return {
    mode: "supabase",
    async studies() {
      const rows = await all<
        Omit<Study, "protocol"> & { owner_portal_user_id?: string | null; protocols: { version: number; config: unknown }[] }
      >(() =>
        db
          .from("studies")
          .select("id, name, condition, status, owner_portal_user_id, protocols(version, config)")
          .order("created_at")
          .order("id"),
      );
      return rows
        .filter((s) => s.protocols.length)
        .map((s) => {
          const latest = [...s.protocols].sort((a, b) => b.version - a.version)[0];
          return {
            id: s.id,
            name: s.name,
            condition: s.condition,
            status: s.status,
            owner_portal_user_id: s.owner_portal_user_id ?? null,
            protocol: Protocol.parse(latest.config),
          };
        });
    },
    async participants(f = {}) {
      return all<Participant>(() => {
        let q = db.from("participants").select("id, study_id, display_name, phone, invite_code, status, enrolled_at, preferred_time, consented_at").order("id");
        if (f.studyId) q = q.eq("study_id", f.studyId);
        if (f.id) q = q.eq("id", f.id);
        if (f.phone) q = q.eq("phone", f.phone);
        // codes are stored upper-case (enforced in 0004), so a typed code matches exactly
        if (f.inviteCode) q = q.eq("invite_code", f.inviteCode.trim().toUpperCase());
        return q;
      });
    },
    async observations(f = {}) {
      return (await all<Observation>(() => {
        let q = db.from("observations").select("*").order("captured_at").order("id");
        if (f.participantId) q = q.eq("participant_id", f.participantId);
        if (f.studyId) q = q.eq("study_id", f.studyId);
        if (f.status) q = q.eq("review_status", f.status);
        if (f.id) q = q.eq("id", f.id);
        return q;
      })).map(withoutHiddenMeasurements);
    },
    async submissions(f = {}) {
      return all<Submission>(() => {
        let q = db
          .from("submissions")
          .select("id, participant_id, study_id, task_id, scheduled_task_id, attempt, source, media_type, media_url, analysis_runtime, quality, accepted, observation_id, escalated, created_at")
          .order("created_at")
          .order("id");
        if (f.participantId) q = q.eq("participant_id", f.participantId);
        if (f.studyId) q = q.eq("study_id", f.studyId);
        if (f.id) q = q.eq("id", f.id);
        return q;
      });
    },
    async scheduledTasks(ids) {
      if (ids && !ids.length) return [];
      return all<ScheduledTask>(() => {
        let q = db.from("scheduled_tasks").select("id, participant_id, task_id, due_at, window_hours, status, completed_at, prompted_at").order("due_at").order("id");
        if (ids) q = q.in("participant_id", ids);
        return q;
      });
    },
    async rewardEvents(pid) {
      return all<RewardEvent>(() => {
        let q = db.from("reward_events").select("id, participant_id, kind, points, reason, created_at").order("created_at").order("id");
        if (pid) q = q.eq("participant_id", pid);
        return q;
      });
    },
    async redemptions(pid) {
      return all<Redemption>(() => db.from("redemptions").select("*").eq("participant_id", pid).order("created_at").order("id"));
    },
    async models(f = {}) {
      const rows = (
        await all<unknown>(() => {
          let q = db.from("cv_models").select("*").order("created_at").order("id");
          if (f.id) q = q.eq("id", f.id);
          return q;
        })
      ).map((m) => CvModelSchema.parse(m));
      // Trained-head / pretrained registry listings are no longer surfaced; keep DB rows
      // (e.g. Droid-generated module metadata) only.
      return rows;
    },
    async audit(f = {}) {
      const query = () => {
        let q = db.from("audit_log").select("*").order("created_at", { ascending: false }).order("id", { ascending: false });
        if (f.entityId) q = q.eq("entity_id", f.entityId);
        return q;
      };
      const rows = f.limit ? must<(AuditEntry & { id: number })[]>(await query().limit(f.limit)) : await all<AuditEntry & { id: number }>(query);
      return rows.map((a) => ({ ...a, id: String(a.id) }));
    },
    async reviews(oid) {
      return all<Review>(() => db.from("reviews").select("*").eq("observation_id", oid).order("created_at").order("id"));
    },
    async messages(pid, limit = 200) {
      const rows = must<Message[]>(await db.from("messages").select("*").eq("participant_id", pid).order("created_at", { ascending: false }).limit(limit));
      return rows.reverse();
    },
    async drafts(f = {}) {
      return all<DraftRecord>(() => {
        let q = db.from("workflow_drafts").select("*").order("created_at", { ascending: false }).order("id");
        if (f.id) q = q.eq("id", f.id);
        return q;
      });
    },
    async droidJobs(limit = 20) {
      return must<DroidJob[]>(await db.from("droid_jobs").select("*").order("created_at", { ascending: false }).limit(limit));
    },

    async recordCapture(c) {
      return must<CaptureResult>(await db.rpc("record_capture", { payload: c }));
    },
    async applySchedule(plan) {
      if (plan.missed.length) must(await db.from("scheduled_tasks").update({ status: "missed" }).in("id", plan.missed).in("status", ["pending", "prompted"]));
      if (plan.create.length) must(await db.from("scheduled_tasks").upsert(plan.create, { onConflict: "participant_id,task_id,due_at", ignoreDuplicates: true }));
    },
    async updateScheduledTask(id, patch) {
      must(await db.from("scheduled_tasks").update(patch).eq("id", id));
    },
    async updateObservation(id, patch) {
      must(await db.from("observations").update(patch).eq("id", id));
    },
    async insertReview(r) {
      must(await db.from("reviews").insert(r));
    },
    async insertRewardEvents(e) {
      if (e.length) must(await db.from("reward_events").upsert(e, { onConflict: "id", ignoreDuplicates: true }));
    },
    async insertRedemption(r) {
      must(await db.from("redemptions").insert(r));
    },
    async insertParticipant(p) {
      must(await db.from("participants").insert(p));
    },
    async insertScheduledTask(t) {
      must(await db.from("scheduled_tasks").upsert(t, { onConflict: "participant_id,task_id,due_at", ignoreDuplicates: true }));
    },
    async updateParticipant(id, patch) {
      must(await db.from("participants").update(patch).eq("id", id));
    },
    async insertStudy(s) {
      must(
        await db.from("studies").insert({
          id: s.id,
          name: s.name,
          condition: s.condition,
          status: s.status,
          owner_portal_user_id: s.owner_portal_user_id ?? null,
        }),
      );
      const res = await db.from("protocols").insert({ study_id: s.id, version: s.protocol.version, config: s.protocol });
      if (res.error) {
        await db.from("studies").delete().eq("id", s.id); // no study without a protocol
        must(res);
      }
    },
    async deleteStudy(studyId) {
      // Cascades remove participants, protocols, observations, submissions, etc.
      // Leave droid_jobs (created modules) intact. Clear study-scoped drafts/models explicitly.
      await db.from("workflow_drafts").delete().eq("study_id", studyId);
      await db.from("cv_models").delete().eq("study_id", studyId);
      must(await db.from("studies").delete().eq("id", studyId));
      try {
        const sb = db;
        const prefix = `studies/${studyId.replace(/[^\w-]/g, "_")}/`;
        const listed = await sb.storage.from(MEDIA_BUCKET).list(prefix.slice(0, -1));
        // Best-effort: remove top-level participant folders under this study.
        const { data: roots } = await sb.storage.from(MEDIA_BUCKET).list(`studies/${studyId.replace(/[^\w-]/g, "_")}`);
        if (roots?.length) {
          for (const entry of roots) {
            const base = `studies/${studyId.replace(/[^\w-]/g, "_")}/${entry.name}`;
            const { data: files } = await sb.storage.from(MEDIA_BUCKET).list(base, { limit: 1000 });
            if (files?.length) {
              await sb.storage.from(MEDIA_BUCKET).remove(files.map((f) => `${base}/${f.name}`));
            }
          }
        }
        void listed;
      } catch {
        /* media cleanup is best-effort for the demo */
      }
    },
    async insertDraft(d) {
      must(await db.from("workflow_drafts").insert(d));
    },
    async updateDraft(id, patch) {
      must(await db.from("workflow_drafts").update(patch).eq("id", id));
    },
    async insertDroidJob(j) {
      // timestamps come from the database
      must(await db.from("droid_jobs").insert({ ...j, created_at: undefined, updated_at: undefined }));
    },
    async updateDroidJob(id, patch) {
      must(await db.from("droid_jobs").update(patch).eq("id", id));
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
    async portalUsers(f = {}) {
      return all<PortalUser>(() => {
        let q = db.from("portal_users").select("*").order("created_at").order("id");
        if (f.id) q = q.eq("id", f.id);
        if (f.email) q = q.eq("email", f.email.toLowerCase());
        return q;
      });
    },
    async insertPortalUser(u) {
      must(await db.from("portal_users").insert({ ...u, email: u.email.toLowerCase() }));
    },
    async observationNotes(observationId) {
      return all<ObservationNote>(() =>
        db.from("observation_notes").select("*").eq("observation_id", observationId).order("created_at").order("id"),
      );
    },
    async insertObservationNote(n) {
      must(await db.from("observation_notes").insert(n));
    },
    async health() {
      const tables = await Promise.all(
        TABLES.map(async (name) => {
          const { count, error } = await db.from(name).select("*", { count: "exact", head: true });
          return error ? { name, rows: null, error: error.message } : { name, rows: count ?? 0 };
        }),
      );
      const b = await db.storage.getBucket(MEDIA_BUCKET);
      const bucket = b.error
        ? { ok: false, detail: b.error.message }
        : { ok: !b.data.public, detail: `${b.data.public ? "PUBLIC (should be private)" : "private"}, max ${Math.round((b.data.file_size_limit ?? 0) / 1048576)} MB` };
      return { ok: tables.every((t) => !t.error) && bucket.ok, tables, bucket };
    },
  };
}

function loadRootEnvOnce() {
  // Same pattern as live-keys: Next may not have loaded repo-root .env.local yet.
  const g = globalThis as typeof globalThis & { __vfRootEnvLoaded?: boolean };
  if (g.__vfRootEnvLoaded) return;
  g.__vfRootEnvLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync, readFileSync } = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const candidates = [
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), "..", ".env.local"),
      path.resolve(process.cwd(), "../..", ".env.local"),
      // When cwd is apps/web, also resolve from this file → repo root.
      path.resolve(__dirname, "../../../.env.local"),
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      for (const raw of readFileSync(file, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
      }
      break;
    }
  } catch {
    /* ignore */
  }
}

function jwtRole(key: string): string | null {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

function supabaseEnv(): { url: string; key: string } | null {
  loadRootEnvOnce();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const role = jwtRole(key);
  // New sb_secret_… keys are fine; JWTs must be service_role (anon key cannot write with RLS on).
  if (role && role !== "service_role") {
    console.error(
      `[backend] SUPABASE_SERVICE_ROLE_KEY has JWT role="${role}" — expected "service_role". ` +
        `Using the anon/publishable key here blocks all writes under RLS.`,
    );
    return null;
  }
  return { url, key };
}

let cached: Backend | undefined;
export function backend(): Backend {
  if (cached) return cached;
  const env = supabaseEnv();
  const hosted = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

  // Prefer Supabase whenever keys are present. VF_DEMO_FRESH only forces empty in-memory
  // when Supabase is not configured (so `dev:refresh` does not mute a live project).
  if (!env && demoFreshSession()) {
    cached = demoBackend;
    console.info("[backend] mode=demo (VF_DEMO_FRESH — empty session; not writing .data/demo-state.json)");
    return cached;
  }

  if (!env && hosted) {
    console.error(
      "[backend] mode=demo on a hosted deploy — writes will NOT persist and sessions will break. " +
        "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY " +
        "in Vercel → Project → Settings → Environment Variables (Production + Preview), then redeploy.",
    );
  }

  cached = env ? supabaseBackend(createClient(env.url, env.key, { auth: { persistSession: false } })) : demoBackend;
  console.info(`[backend] mode=${cached.mode}${env ? ` url=${env.url}` : ""}${hosted ? " hosted=1" : ""}`);
  return cached;
}

/** Admin client for Storage (signed upload/download URLs); null in demo mode. */
export function storageClient(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.key, { auth: { persistSession: false } });
}
