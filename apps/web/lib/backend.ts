import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Protocol, type Observation, type RewardEvent } from "@vf/shared";
import * as demo from "./demo-data";
import type { Participant, Redemption, ScheduledTask, Study } from "./types";

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
  scheduledTasks(participantIds?: string[]): Promise<ScheduledTask[]>;
  rewardEvents(participantId?: string): Promise<RewardEvent[]>;
  redemptions(participantId: string): Promise<Redemption[]>;
  updateObservation(id: string, patch: Partial<Observation>): Promise<void>;
  insertObservation(o: Observation): Promise<void>;
  insertRewardEvents(e: RewardEvent[]): Promise<void>;
  insertRedemption(r: Redemption): Promise<void>;
  insertParticipant(p: Participant): Promise<void>;
  updateParticipant(id: string, patch: Partial<Participant>): Promise<void>;
}

const demoBackend: Backend = {
  mode: "demo",
  studies: async () => demo.studies,
  participants: async (f = {}) =>
    demo.participants.filter(
      (p) => (!f.studyId || p.study_id === f.studyId) && (!f.id || p.id === f.id) && (!f.inviteCode || p.invite_code.toUpperCase() === f.inviteCode.toUpperCase()),
    ),
  observations: async (f = {}) =>
    demo.observations
      .filter(
        (o) =>
          (!f.participantId || o.participant_id === f.participantId) &&
          (!f.studyId || o.study_id === f.studyId) &&
          (!f.status || o.review_status === f.status) &&
          (!f.id || o.id === f.id),
      )
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
  scheduledTasks: async (ids) => demo.scheduledTasks.filter((t) => !ids || ids.includes(t.participant_id)),
  rewardEvents: async (pid) => demo.rewardEvents.filter((e) => !pid || e.participant_id === pid),
  redemptions: async (pid) => demo.redemptions.filter((r) => r.participant_id === pid),
  updateObservation: async (id, patch) => {
    const o = demo.observations.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  },
  insertObservation: async (o) => {
    demo.observations.push(o);
  },
  insertRewardEvents: async (e) => {
    demo.rewardEvents.push(...e);
  },
  insertRedemption: async (r) => {
    demo.redemptions.push(r);
  },
  insertParticipant: async (p) => {
    demo.participants.push(p);
  },
  updateParticipant: async (id, patch) => {
    const p = demo.participants.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
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
      if (f.inviteCode) q = q.ilike("invite_code", f.inviteCode);
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
    async scheduledTasks(ids) {
      let q = db.from("scheduled_tasks").select("id, participant_id, task_id, due_at, status");
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
    async updateObservation(id, patch) {
      must(await db.from("observations").update(patch).eq("id", id));
    },
    async insertObservation(o) {
      must(await db.from("observations").upsert(o));
    },
    async insertRewardEvents(e) {
      must(await db.from("reward_events").upsert(e));
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
